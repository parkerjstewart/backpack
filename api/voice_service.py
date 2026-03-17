from __future__ import annotations

import asyncio
import base64
import io
import queue as _queue
import re
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger

from api.voice_contract import VoiceContextPayload, VoiceServerEvent
from backpack.ai.models import model_manager
from backpack.domain.module import ChatSession
from backpack.graphs.chat import graph as chat_graph
from backpack.graphs.tutor import tutor_graph
from backpack.utils.token_stream import drain_token_queue
from backpack.utils.voice_text import format_for_voice


@dataclass
class ConnectionVoiceState:
    context: Optional[VoiceContextPayload] = None
    audio_chunks: list[bytes] = field(default_factory=list)
    audio_mime_type: str = "audio/webm"


def _extract_interrupt_data(result: dict[str, Any]) -> Optional[dict[str, Any]]:
    interrupts = result.get("__interrupt__")
    if interrupts and len(interrupts) > 0:
        return interrupts[0].value
    return None


def _iter_text_deltas(text: str, chunk_size: int = 32) -> list[str]:
    if not text:
        return []
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


_SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?])\s+')
# Abbreviations that should NOT trigger sentence splits
_ABBREV_RE = re.compile(r'\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.\s*$', re.IGNORECASE)


def _split_into_sentences(text: str, min_length: int = 60) -> list[str]:
    """Split text into sentence groups for streaming TTS.

    Short fragments are merged with the next sentence to avoid many tiny
    TTS calls.  Returns [text] unchanged if splitting produces only one part.
    """
    if not text:
        return []
    parts = _SENTENCE_SPLIT_RE.split(text.strip())
    result: list[str] = []
    buffer = ""
    for part in parts:
        buffer = f"{buffer} {part}".strip() if buffer else part
        # Don't split after common abbreviations
        if len(buffer) >= min_length and not _ABBREV_RE.search(buffer):
            result.append(buffer)
            buffer = ""
    if buffer:
        result.append(buffer)
    return result if result else [text]



class VoiceService:
    """Orchestrates STT -> existing chat/tutor flow -> TTS for voice turns."""

    async def set_context(
        self, state: ConnectionVoiceState, payload: dict[str, Any]
    ) -> list[VoiceServerEvent]:
        state.context = VoiceContextPayload.model_validate(payload)
        return [VoiceServerEvent(type="ready", payload={"surface": state.context.surface})]

    async def start_turn(self, state: ConnectionVoiceState) -> list[VoiceServerEvent]:
        state.audio_chunks = []
        state.audio_mime_type = "audio/webm"
        return []

    async def add_audio_chunk(
        self, state: ConnectionVoiceState, payload: dict[str, Any]
    ) -> list[VoiceServerEvent]:
        encoded = str(payload.get("audio_base64", ""))
        if not encoded:
            return []
        try:
            state.audio_chunks.append(base64.b64decode(encoded))
            mime_type = payload.get("mime_type")
            if isinstance(mime_type, str) and mime_type.strip():
                state.audio_mime_type = mime_type.strip()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(f"Invalid audio chunk ignored: {exc}")
        return []

    async def cancel_turn(self, state: ConnectionVoiceState) -> list[VoiceServerEvent]:
        state.audio_chunks = []
        state.audio_mime_type = "audio/webm"
        return []

    async def stream_end_turn(
        self, state: ConnectionVoiceState, payload: dict[str, Any] | None = None
    ) -> AsyncIterator[VoiceServerEvent]:
        if not state.context:
            yield VoiceServerEvent(
                type="error", payload={"message": "Missing context before end_turn"}
            )
            return

        audio_bytes = b"".join(state.audio_chunks)
        state.audio_chunks = []
        if not audio_bytes:
            yield VoiceServerEvent(type="error", payload={"message": "No audio provided"})
            return

        whiteboard_png: Optional[str] = (payload or {}).get("whiteboard_png") or None

        transcript = await self._transcribe(audio_bytes, state.audio_mime_type)
        if not transcript:
            yield VoiceServerEvent(
                type="error",
                payload={"message": "Could not transcribe audio. Please try again."},
            )
            return

        # Emit transcript immediately so the user sees their utterance in chat before decode.
        yield VoiceServerEvent(type="final_transcript", payload={"text": transcript})
        yield VoiceServerEvent(type="assistant_thinking", payload={"status": "start"})

        async for event in self._dispatch_to_agent_streaming(state.context, transcript, whiteboard_png):
            yield event

    async def _dispatch_to_agent_streaming(
        self, context: VoiceContextPayload, text: str, whiteboard_png: Optional[str] = None
    ) -> AsyncIterator[VoiceServerEvent]:
        if context.surface == "tutor":
            async for event in self._stream_tutor(context, text, whiteboard_png):
                yield event
        else:
            assistant_text = await self._run_module_chat(context, text)
            display_text, speech_text = format_for_voice(assistant_text)
            yield VoiceServerEvent(type="assistant_thinking", payload={"status": "end"})
            for delta in _iter_text_deltas(display_text):
                yield VoiceServerEvent(type="assistant_text_delta", payload={"text": delta})
            final_payload: dict[str, Any] = {"text": display_text}
            yield VoiceServerEvent(type="assistant_text_final", payload=final_payload)
            async for audio_event in self._emit_audio_sentences(speech_text):
                yield audio_event

    async def _stream_tutor(
        self, context: VoiceContextPayload, text: str, whiteboard_png: Optional[str] = None
    ) -> AsyncIterator[VoiceServerEvent]:
        session_id = context.session_id
        from langgraph.types import Command

        token_queue: _queue.Queue = _queue.Queue()
        config = {"configurable": {"thread_id": session_id, "token_queue": token_queue}}

        current_state = tutor_graph.get_state(config=RunnableConfig(**{"configurable": {"thread_id": session_id}}))
        if not current_state or not current_state.values:
            raise ValueError("Tutor session not found")

        resume_value: str | dict = {"text": text, "whiteboard_png": whiteboard_png} if whiteboard_png else text

        loop = asyncio.get_event_loop()
        graph_task = asyncio.ensure_future(
            loop.run_in_executor(None, tutor_graph.invoke, Command(resume=resume_value), config)
        )

        yield VoiceServerEvent(type="assistant_thinking", payload={"status": "end"})

        display_text = ""
        async for token in drain_token_queue(token_queue, graph_task, session_id):
            display_text += token
            yield VoiceServerEvent(type="assistant_text_delta", payload={"text": token})

        result = await graph_task
        interrupt_data = _extract_interrupt_data(result)
        artifact_content: Optional[str] = None
        image_url: Optional[str] = None
        artifacts_raw: list = []
        highlighted_artifact_id: Optional[str] = None
        if interrupt_data:
            # Use the cleaned message from interrupt_data as the authoritative text
            display_text = str(interrupt_data.get("message", display_text)).strip()
            # Support new artifact_content field; fall back to legacy supplement
            artifact_content = (
                interrupt_data.get("artifact_content")
                or interrupt_data.get("supplement")
                or None
            )
            image_url = interrupt_data.get("image_url") or None
            artifacts_raw = interrupt_data.get("artifacts", []) or []
            highlighted_artifact_id = interrupt_data.get("highlighted_artifact_id") or None
            logger.info(
                f"voice [{session_id}]: interrupt_data resolved | "
                f"message_len={len(display_text)} | artifact={'yes' if artifact_content else 'no'} | "
                f"artifacts={len(artifacts_raw)}"
            )

        _, speech_text = format_for_voice(display_text)
        final_payload: dict[str, Any] = {"text": display_text}
        if artifact_content:
            final_payload["artifact_content"] = artifact_content
        if image_url:
            final_payload["image_url"] = image_url
        if artifacts_raw:
            final_payload["artifacts"] = artifacts_raw
        if highlighted_artifact_id:
            final_payload["highlighted_artifact_id"] = highlighted_artifact_id
        yield VoiceServerEvent(type="assistant_text_final", payload=final_payload)

        async for audio_event in self._emit_audio_sentences(speech_text):
            yield audio_event

    async def _emit_audio_sentences(self, speech_text: str) -> AsyncIterator[VoiceServerEvent]:
        """Synthesize speech_text sentence-by-sentence and stream each clip immediately.

        Each sentence produces its own assistant_audio_chunk(s) + assistant_audio_end
        so the frontend can start playback before the full response is synthesized.
        """
        sentences = _split_into_sentences(speech_text)
        for sentence in sentences:
            audio_output = await self._synthesize(sentence)
            if not audio_output:
                continue
            for i in range(0, len(audio_output), 16_000):
                chunk = audio_output[i : i + 16_000]
                yield VoiceServerEvent(
                    type="assistant_audio_chunk",
                    payload={
                        "audio_base64": base64.b64encode(chunk).decode("ascii"),
                        "mime_type": "audio/mpeg",
                    },
                )
            yield VoiceServerEvent(type="assistant_audio_end", payload={})

    async def end_turn(self, state: ConnectionVoiceState) -> list[VoiceServerEvent]:
        events: list[VoiceServerEvent] = []
        async for event in self.stream_end_turn(state):
            events.append(event)
        return events

    async def _run_module_chat(self, context: VoiceContextPayload, text: str) -> str:
        full_session_id = (
            context.session_id
            if context.session_id.startswith("chat_session:")
            else f"chat_session:{context.session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise ValueError("Module chat session not found")

        model_override = context.model_override or getattr(session, "model_override", None)
        current_state = chat_graph.get_state(
            config=RunnableConfig(configurable={"thread_id": context.session_id})
        )
        state_values = current_state.values if current_state else {}
        state_values["messages"] = state_values.get("messages", [])
        state_values["context"] = context.module_context or {"sources": [], "notes": []}
        state_values["model_override"] = model_override
        state_values["messages"].append(HumanMessage(content=text))

        result = chat_graph.invoke(
            input=state_values,  # type: ignore[arg-type]
            config=RunnableConfig(
                configurable={
                    "thread_id": context.session_id,
                    "model_id": model_override,
                }
            ),
        )

        for msg in reversed(result.get("messages", [])):
            if isinstance(msg, AIMessage) or (
                hasattr(msg, "type") and getattr(msg, "type", "") == "ai"
            ):
                return str(getattr(msg, "content", "")).strip()
        return "I do not have a response yet."

    @staticmethod
    def _extension_from_mime(mime_type: str) -> str:
        normalized = mime_type.split(";")[0].strip().lower()
        if normalized in {"audio/webm"}:
            return ".webm"
        if normalized in {"audio/mp4", "audio/m4a"}:
            return ".m4a"
        if normalized in {"audio/mpeg", "audio/mp3"}:
            return ".mp3"
        if normalized in {"audio/wav", "audio/x-wav"}:
            return ".wav"
        return ".webm"

    async def _transcribe(self, audio_bytes: bytes, mime_type: str) -> str:
        model = await model_manager.get_speech_to_text()
        if not model:
            return ""

        extension = self._extension_from_mime(mime_type)

        class _NamedBytesIO(io.BytesIO):
            name: str

        def make_file() -> io.BytesIO:
            file_obj = _NamedBytesIO(audio_bytes)
            file_obj.name = f"voice_input{extension}"
            return file_obj

        candidates = [
            ("atranscribe", {"audio_file": make_file()}),
            ("transcribe", {"audio_file": make_file()}),
            ("transcribe", {"audio_file": make_file(), "language": "en"}),
            ("transcribe_bytes", {"audio_bytes": audio_bytes}),
            ("transcribe_audio", {"audio_bytes": audio_bytes}),
            ("transcribe", {"audio_bytes": audio_bytes}),
            ("transcribe", {"audio": audio_bytes}),
            ("invoke", {"audio_bytes": audio_bytes}),
        ]
        for method_name, kwargs in candidates:
            method = getattr(model, method_name, None)
            if not callable(method):
                continue
            try:
                result = method(**kwargs)
                if hasattr(result, "__await__"):
                    result = await result
                text = self._extract_text(result)
                if text:
                    return text
            except Exception as exc:
                logger.debug(
                    "STT attempt failed with method={} kwargs={}: {}",
                    method_name,
                    list(kwargs.keys()),
                    exc,
                )
                continue
        return ""

    async def _synthesize(self, text: str) -> bytes:
        if not text.strip():
            return b""
        model = await model_manager.get_text_to_speech()
        if not model:
            return b""
        candidates = [
            ("agenerate_speech", {"text": text}),
            ("generate_speech", {"text": text}),
            ("synthesize", {"text": text}),
            ("generate_audio", {"text": text}),
            ("speak", {"text": text}),
            ("invoke", {"text": text}),
        ]
        for method_name, kwargs in candidates:
            method = getattr(model, method_name, None)
            if not callable(method):
                continue
            try:
                result = method(**kwargs)
                if hasattr(result, "__await__"):
                    result = await result
                audio = self._extract_audio(result)
                if audio:
                    return audio
            except Exception:
                continue
        return b""

    @staticmethod
    def _extract_text(result: Any) -> str:
        if isinstance(result, str):
            return result.strip()
        if isinstance(result, dict):
            for key in ("text", "transcript", "content"):
                value = result.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return ""
        value = getattr(result, "text", None) or getattr(result, "transcript", None)
        if isinstance(value, str):
            return value.strip()
        return ""

    @staticmethod
    def _extract_audio(result: Any) -> bytes:
        if isinstance(result, (bytes, bytearray)):
            return bytes(result)
        if isinstance(result, str):
            try:
                return base64.b64decode(result)
            except Exception:
                return b""
        if isinstance(result, dict):
            value = (
                result.get("audio")
                or result.get("audio_bytes")
                or result.get("audio_data")
                or result.get("data")
            )
            if isinstance(value, (bytes, bytearray)):
                return bytes(value)
            if isinstance(value, str):
                try:
                    return base64.b64decode(value)
                except Exception:
                    return b""
            return b""
        value = (
            getattr(result, "audio", None)
            or getattr(result, "audio_bytes", None)
            or getattr(result, "audio_data", None)
        )
        if isinstance(value, (bytes, bytearray)):
            return bytes(value)
        return b""

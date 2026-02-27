from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from pydantic import ValidationError

from api.voice_contract import VoiceClientEvent, VoiceServerEvent
from api.voice_service import ConnectionVoiceState, VoiceService

router = APIRouter()
voice_service = VoiceService()


def _extract_token(websocket: WebSocket) -> str:
    auth_header = websocket.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return websocket.query_params.get("token", "")


@router.websocket("/voice/realtime")
async def realtime_voice(websocket: WebSocket):
    token = _extract_token(websocket)
    if not token.startswith("user:"):
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await websocket.accept()
    state = ConnectionVoiceState()

    try:
        while True:
            raw = await websocket.receive_json()
            try:
                event = VoiceClientEvent.model_validate(raw)
            except ValidationError as exc:
                await websocket.send_json(
                    VoiceServerEvent(
                        type="error",
                        payload={"message": f"Invalid event payload: {exc.errors()}"},
                    ).model_dump()
                )
                continue

            response_events: list[VoiceServerEvent] = []
            if event.type == "context":
                response_events = await voice_service.set_context(
                    state, event.payload or {}
                )
            elif event.type == "start_turn":
                response_events = await voice_service.start_turn(state)
            elif event.type == "audio_chunk":
                response_events = await voice_service.add_audio_chunk(
                    state, event.payload or {}
                )
            elif event.type == "cancel_turn":
                response_events = await voice_service.cancel_turn(state)
            elif event.type == "end_turn":
                async for response_event in voice_service.stream_end_turn(state, event.payload or {}):
                    await websocket.send_json(response_event.model_dump())
                continue

            for response_event in response_events:
                await websocket.send_json(response_event.model_dump())
    except WebSocketDisconnect:
        logger.info("Voice websocket disconnected")
    except Exception as exc:  # pragma: no cover - defensive
        logger.error(f"Voice websocket failed: {exc}")
        try:
            await websocket.send_json(
                VoiceServerEvent(type="error", payload={"message": str(exc)}).model_dump()
            )
        except Exception:
            pass

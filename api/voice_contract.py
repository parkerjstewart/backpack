"""Shared voice event models for websocket communication."""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


VoiceSurface = Literal["tutor", "module"]


class VoiceContextPayload(BaseModel):
    surface: VoiceSurface = Field(..., description="Which chat surface the turn belongs to")
    session_id: str = Field(..., description="Tutor or module chat session id")
    module_id: Optional[str] = Field(None, description="Module id for tutor/module flows")
    model_override: Optional[str] = Field(None, description="Optional model override")
    module_context: Optional[Dict[str, Any]] = Field(
        None, description="Built module context for module chat"
    )


class VoiceClientEvent(BaseModel):
    type: Literal["context", "start_turn", "audio_chunk", "end_turn", "cancel_turn"]
    payload: Optional[dict[str, Any]] = None


class VoiceServerEvent(BaseModel):
    type: Literal[
        "ready",
        "partial_transcript",
        "final_transcript",
        "assistant_thinking",
        "assistant_text_delta",
        "assistant_text_final",
        "assistant_audio_chunk",
        "assistant_audio_end",
        "error",
    ]
    payload: dict[str, Any]

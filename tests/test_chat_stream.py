import json
from types import SimpleNamespace

import pytest

from api.routers import chat as chat_router


@pytest.mark.asyncio
async def test_stream_module_chat_response_emits_complete(monkeypatch):
    async def fake_run(_request):
        return {
            "messages": [
                SimpleNamespace(type="human", content="hi"),
                SimpleNamespace(type="ai", content="hello there"),
            ]
        }

    monkeypatch.setattr(chat_router, "_run_module_chat_execution", fake_run)

    request = chat_router.ExecuteChatRequest(
        session_id="chat_session:test",
        message="hi",
        context={"sources": [], "notes": []},
    )
    chunks = []
    async for chunk in chat_router.stream_module_chat_response(request):
        chunks.append(chunk)

    decoded = "".join(chunks).strip().split("\n\n")
    assert any('"type": "user_message"' in line for line in decoded)
    assert any('"type": "complete"' in line for line in decoded)

    ai_events = [
        json.loads(line.replace("data: ", "")) for line in decoded if '"type": "ai_message"' in line
    ]
    assert "".join(event["content"] for event in ai_events) == "hello there"

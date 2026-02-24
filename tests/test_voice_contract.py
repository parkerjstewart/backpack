import pytest
from pydantic import ValidationError

from api.voice_contract import VoiceClientEvent, VoiceContextPayload


def test_voice_context_payload_validates_surface():
    payload = VoiceContextPayload(surface="module", session_id="chat_session:abc")
    assert payload.surface == "module"


def test_voice_client_event_requires_known_type():
    with pytest.raises(ValidationError):
        VoiceClientEvent(type="unknown", payload={})

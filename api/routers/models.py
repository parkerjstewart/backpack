import os

from esperanto import AIFactory
from fastapi import APIRouter, HTTPException
from loguru import logger

from api.models import ProviderAvailabilityResponse

router = APIRouter()


def _check_openai_compatible_support(mode: str) -> bool:
    """
    Check if OpenAI-compatible provider is available for a specific mode.

    Args:
        mode: One of 'LLM', 'EMBEDDING', 'STT', 'TTS'

    Returns:
        bool: True if either generic or mode-specific env var is set
    """
    generic = os.environ.get("OPENAI_COMPATIBLE_BASE_URL") is not None
    specific = os.environ.get(f"OPENAI_COMPATIBLE_BASE_URL_{mode}") is not None
    return generic or specific


def _check_azure_support(mode: str) -> bool:
    """
    Check if Azure OpenAI provider is available for a specific mode.

    Args:
        mode: One of 'LLM', 'EMBEDDING', 'STT', 'TTS'

    Returns:
        bool: True if either generic or mode-specific env vars are set
    """
    # Check generic configuration (applies to all modes)
    generic = (
        os.environ.get("AZURE_OPENAI_API_KEY") is not None
        and os.environ.get("AZURE_OPENAI_ENDPOINT") is not None
        and os.environ.get("AZURE_OPENAI_API_VERSION") is not None
    )

    # Check mode-specific configuration (takes precedence)
    specific = (
        os.environ.get(f"AZURE_OPENAI_API_KEY_{mode}") is not None
        and os.environ.get(f"AZURE_OPENAI_ENDPOINT_{mode}") is not None
        and os.environ.get(f"AZURE_OPENAI_API_VERSION_{mode}") is not None
    )

    return generic or specific


@router.get("/models/providers", response_model=ProviderAvailabilityResponse)
async def get_provider_availability():
    """Get provider availability based on environment variables."""
    try:
        # Check which providers have API keys configured
        provider_status = {
            "ollama": os.environ.get("OLLAMA_API_BASE") is not None,
            "openai": os.environ.get("OPENAI_API_KEY") is not None,
            "groq": os.environ.get("GROQ_API_KEY") is not None,
            "xai": os.environ.get("XAI_API_KEY") is not None,
            "vertex": (
                os.environ.get("VERTEX_PROJECT") is not None
                and os.environ.get("VERTEX_LOCATION") is not None
                and os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") is not None
            ),
            "google": (
                os.environ.get("GOOGLE_API_KEY") is not None
                or os.environ.get("GEMINI_API_KEY") is not None
            ),
            "openrouter": os.environ.get("OPENROUTER_API_KEY") is not None,
            "anthropic": os.environ.get("ANTHROPIC_API_KEY") is not None,
            "elevenlabs": os.environ.get("ELEVENLABS_API_KEY") is not None,
            "voyage": os.environ.get("VOYAGE_API_KEY") is not None,
            "azure": (
                _check_azure_support("LLM")
                or _check_azure_support("EMBEDDING")
                or _check_azure_support("STT")
                or _check_azure_support("TTS")
            ),
            "mistral": os.environ.get("MISTRAL_API_KEY") is not None,
            "deepseek": os.environ.get("DEEPSEEK_API_KEY") is not None,
            "openai-compatible": (
                _check_openai_compatible_support("LLM")
                or _check_openai_compatible_support("EMBEDDING")
                or _check_openai_compatible_support("STT")
                or _check_openai_compatible_support("TTS")
            ),
        }

        available_providers = [k for k, v in provider_status.items() if v]
        unavailable_providers = [k for k, v in provider_status.items() if not v]

        # Get supported model types from Esperanto
        esperanto_available = AIFactory.get_available_providers()

        # Build supported types mapping only for available providers
        supported_types: dict[str, list[str]] = {}
        for provider in available_providers:
            supported_types[provider] = []

            # Map Esperanto model types to our environment variable modes
            mode_mapping = {
                "language": "LLM",
                "embedding": "EMBEDDING",
                "speech_to_text": "STT",
                "text_to_speech": "TTS",
            }

            # Special handling for openai-compatible to check mode-specific availability
            if provider == "openai-compatible":
                for model_type, mode in mode_mapping.items():
                    if (
                        model_type in esperanto_available
                        and provider in esperanto_available[model_type]
                    ):
                        if _check_openai_compatible_support(mode):
                            supported_types[provider].append(model_type)
            # Special handling for azure to check mode-specific availability
            elif provider == "azure":
                for model_type, mode in mode_mapping.items():
                    if (
                        model_type in esperanto_available
                        and provider in esperanto_available[model_type]
                    ):
                        if _check_azure_support(mode):
                            supported_types[provider].append(model_type)
            else:
                # Standard provider detection
                for model_type, providers in esperanto_available.items():
                    if provider in providers:
                        supported_types[provider].append(model_type)

        return ProviderAvailabilityResponse(
            available=available_providers,
            unavailable=unavailable_providers,
            supported_types=supported_types,
        )
    except Exception as e:
        logger.error(f"Error checking provider availability: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error checking provider availability: {str(e)}"
        )

import os
from dataclasses import dataclass
from typing import Optional, Union

from esperanto import (
    AIFactory,
    EmbeddingModel,
    LanguageModel,
    SpeechToTextModel,
    TextToSpeechModel,
)
from loguru import logger

ModelType = Union[LanguageModel, EmbeddingModel, SpeechToTextModel, TextToSpeechModel]


@dataclass
class ModelConfig:
    """Model configuration from environment variables with sensible defaults."""

    # Sensible defaults if env vars not set
    DEFAULT_CHAT = "openai/gpt-4o"
    DEFAULT_EMBEDDING = "openai/text-embedding-3-small"
    DEFAULT_LARGE_CONTEXT = "anthropic/claude-sonnet-4-20250514"
    DEFAULT_TTS = "openai/tts-1"
    DEFAULT_STT = "openai/whisper-1"

    default_chat_model: str
    default_transformation_model: Optional[str]
    large_context_model: str
    default_embedding_model: str
    default_tts_model: str
    default_stt_model: str
    default_tools_model: Optional[str]

    @classmethod
    def get_config(cls) -> "ModelConfig":
        """Load model configuration from environment variables."""
        return cls(
            default_chat_model=os.getenv("DEFAULT_CHAT_MODEL", cls.DEFAULT_CHAT),
            default_transformation_model=os.getenv("DEFAULT_TRANSFORMATION_MODEL")
            or None,
            large_context_model=os.getenv(
                "LARGE_CONTEXT_MODEL", cls.DEFAULT_LARGE_CONTEXT
            ),
            default_embedding_model=os.getenv(
                "DEFAULT_EMBEDDING_MODEL", cls.DEFAULT_EMBEDDING
            ),
            default_tts_model=os.getenv("DEFAULT_TTS_MODEL", cls.DEFAULT_TTS),
            default_stt_model=os.getenv("DEFAULT_STT_MODEL", cls.DEFAULT_STT),
            default_tools_model=os.getenv("DEFAULT_TOOLS_MODEL") or None,
        )

    def get_provider_and_model(self, model_spec: str) -> tuple[str, str]:
        """Parse a model spec in 'provider/model-name' format."""
        if "/" not in model_spec:
            raise ValueError(
                f"Invalid model spec '{model_spec}'. Expected format: 'provider/model-name'"
            )
        provider, model_name = model_spec.split("/", 1)
        return provider, model_name


class ModelManager:
    """Manages AI model provisioning using environment-based configuration."""

    def __init__(self):
        self._config: Optional[ModelConfig] = None

    def _get_config(self) -> ModelConfig:
        """Get or load the model configuration."""
        if self._config is None:
            self._config = ModelConfig.get_config()
        return self._config

    def refresh_config(self) -> None:
        """Force refresh of configuration from environment variables."""
        self._config = ModelConfig.get_config()

    async def get_model(
        self, model_spec: str, model_type: str = "language", **kwargs
    ) -> Optional[ModelType]:
        """
        Get a model by spec (format: provider/model-name).

        Args:
            model_spec: Model specification in 'provider/model-name' format
            model_type: Type of model ('language', 'embedding', 'speech_to_text', 'text_to_speech')
            **kwargs: Additional arguments passed to AIFactory

        Returns:
            The instantiated model, or None if model_spec is empty
        """
        if not model_spec:
            return None

        config = self._get_config()
        provider, model_name = config.get_provider_and_model(model_spec)

        logger.debug(f"Creating {model_type} model: {provider}/{model_name}")

        # Create model based on type (Esperanto will cache the instance)
        if model_type == "language":
            return AIFactory.create_language(
                model_name=model_name,
                provider=provider,
                config=kwargs,
            )
        elif model_type == "embedding":
            return AIFactory.create_embedding(
                model_name=model_name,
                provider=provider,
                config=kwargs,
            )
        elif model_type == "speech_to_text":
            return AIFactory.create_speech_to_text(
                model_name=model_name,
                provider=provider,
                config=kwargs,
            )
        elif model_type == "text_to_speech":
            return AIFactory.create_text_to_speech(
                model_name=model_name,
                provider=provider,
                config=kwargs,
            )
        else:
            raise ValueError(f"Invalid model type: {model_type}")

    def get_defaults(self) -> ModelConfig:
        """Get the default models configuration from environment."""
        return self._get_config()

    async def get_speech_to_text(self, **kwargs) -> Optional[SpeechToTextModel]:
        """Get the default speech-to-text model."""
        config = self._get_config()
        model_spec = config.default_stt_model
        if not model_spec:
            return None
        model = await self.get_model(model_spec, model_type="speech_to_text", **kwargs)
        assert model is None or isinstance(model, SpeechToTextModel), (
            f"Expected SpeechToTextModel but got {type(model)}"
        )
        return model

    async def get_text_to_speech(self, **kwargs) -> Optional[TextToSpeechModel]:
        """Get the default text-to-speech model."""
        config = self._get_config()
        model_spec = config.default_tts_model
        if not model_spec:
            return None
        model = await self.get_model(model_spec, model_type="text_to_speech", **kwargs)
        assert model is None or isinstance(model, TextToSpeechModel), (
            f"Expected TextToSpeechModel but got {type(model)}"
        )
        return model

    async def get_embedding_model(self, **kwargs) -> Optional[EmbeddingModel]:
        """Get the default embedding model."""
        config = self._get_config()
        model_spec = config.default_embedding_model
        if not model_spec:
            return None
        model = await self.get_model(model_spec, model_type="embedding", **kwargs)
        assert model is None or isinstance(model, EmbeddingModel), (
            f"Expected EmbeddingModel but got {type(model)}"
        )
        return model

    async def get_default_model(self, model_type: str, **kwargs) -> Optional[ModelType]:
        """
        Get the default model for a specific type.

        Args:
            model_type: The type of model to retrieve (e.g., 'chat', 'embedding', etc.)
            **kwargs: Additional arguments to pass to the model constructor
        """
        config = self._get_config()
        model_spec: Optional[str] = None
        actual_model_type = "language"  # Default Esperanto model type

        if model_type == "chat":
            model_spec = config.default_chat_model
        elif model_type == "transformation":
            model_spec = config.default_transformation_model or config.default_chat_model
        elif model_type == "tools":
            model_spec = config.default_tools_model or config.default_chat_model
        elif model_type == "embedding":
            model_spec = config.default_embedding_model
            actual_model_type = "embedding"
        elif model_type == "text_to_speech":
            model_spec = config.default_tts_model
            actual_model_type = "text_to_speech"
        elif model_type == "speech_to_text":
            model_spec = config.default_stt_model
            actual_model_type = "speech_to_text"
        elif model_type == "large_context":
            model_spec = config.large_context_model

        if not model_spec:
            return None

        return await self.get_model(model_spec, model_type=actual_model_type, **kwargs)


model_manager = ModelManager()

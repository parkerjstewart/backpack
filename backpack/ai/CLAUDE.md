# AI Module

Model configuration, provisioning, and management for multi-provider AI integration via Esperanto.

## Purpose

Centralizes AI model lifecycle: environment-based configuration for default models, and factory for instantiating LLM/embedding/speech models at runtime with intelligent fallback logic.

## Architecture Overview

**Environment-based configuration**:
1. **ModelConfig** (dataclass): Reads model defaults from environment variables with sensible fallbacks
2. **ModelManager**: Factory for provisioning models using `provider/model-name` format strings

All models use Esperanto library as provider abstraction (OpenAI, Anthropic, Google, Groq, Ollama, Mistral, DeepSeek, xAI, OpenRouter).

```
Environment Variables (.env)
         ↓
   ModelConfig.get_config()
         ↓
   ModelManager.get_defaults() / get_model()
         ↓
   AIFactory.create_* (Esperanto)
```

## Component Catalog

### models.py

#### ModelConfig (dataclass)
- Reads model configuration from environment variables
- **Fields** (all `provider/model-name` format):
  - `default_chat_model`: Chat and general language tasks
  - `default_transformation_model`: Content transformations (falls back to chat)
  - `large_context_model`: Large context handling (>105k tokens)
  - `default_embedding_model`: Semantic search embeddings
  - `default_tts_model`: Text-to-speech for podcasts
  - `default_stt_model`: Speech-to-text for audio processing
  - `default_tools_model`: Function calling (falls back to chat)
- **Sensible defaults** if env vars not set:
  - Chat: `openai/gpt-4o`
  - Embedding: `openai/text-embedding-3-small`
  - Large context: `anthropic/claude-sonnet-4-20250514`
  - TTS: `openai/tts-1`
  - STT: `openai/whisper-1`
- `get_config()`: Class method to load configuration from environment
- `get_provider_and_model()`: Parses `provider/model-name` format string

#### ModelManager
- Stateless factory for instantiating AI models from environment config
- `get_model(model_spec, model_type)`: Creates model via AIFactory from `provider/model-name` spec
- `get_defaults()`: Returns ModelConfig instance from environment
- `get_default_model(model_type)`: Smart lookup (e.g., "chat" → default_chat_model, "transformation" → default_transformation_model with fallback to chat)
- `get_speech_to_text()`, `get_text_to_speech()`, `get_embedding_model()`: Type-specific convenience methods with assertions
- `refresh_config()`: Force reload from environment (useful for tests)
- **Global instance**: `model_manager` singleton exported for use throughout app

### provision.py

#### provision_langchain_model()
- Factory for LangGraph nodes needing LLM provisioning
- **Smart fallback logic**:
  - If tokens > 105,000: Use `large_context_model`
  - Elif `model_id` specified: Use specific model
  - Else: Use default model for type (e.g., "chat", "transformation")
- Returns LangChain-compatible model via `.to_langchain()`
- Logs model selection decision

## Environment Variables

Configure model defaults in `.env`:

```bash
# Chat and general language tasks (default: openai/gpt-4o)
DEFAULT_CHAT_MODEL=openai/gpt-4o

# Transformations - uses chat model if not set
DEFAULT_TRANSFORMATION_MODEL=

# Large context handling >105k tokens (default: anthropic/claude-sonnet-4-20250514)
LARGE_CONTEXT_MODEL=anthropic/claude-sonnet-4-20250514

# Embeddings for semantic search (default: openai/text-embedding-3-small)
DEFAULT_EMBEDDING_MODEL=openai/text-embedding-3-small

# Speech-to-text for audio (default: openai/whisper-1)
DEFAULT_STT_MODEL=openai/whisper-1

# Text-to-speech for podcasts (default: openai/tts-1)
DEFAULT_TTS_MODEL=openai/tts-1

# Tools/function calling - uses chat model if not set
DEFAULT_TOOLS_MODEL=
```

## Common Patterns

- **Model spec format**: All models specified as `provider/model-name` strings (e.g., `openai/gpt-4o`, `anthropic/claude-sonnet-4-20250514`)
- **Provider abstraction**: Esperanto handles provider differences; ModelManager parses spec and delegates to AIFactory
- **Lazy config loading**: ModelConfig loaded on first access, cached in ModelManager instance
- **Config override**: provision_langchain_model() accepts kwargs passed to AIFactory.create_* methods
- **Token-based selection**: provision_langchain_model() detects large contexts and upgrades model automatically
- **Type assertions**: get_speech_to_text(), get_embedding_model() assert returned type (safety check)
- **Fallback chain**: "transformation" and "tools" types fall back to default_chat_model if not explicitly set

## Key Dependencies

- `esperanto`: AIFactory.create_language(), create_embedding(), create_speech_to_text(), create_text_to_speech()
- `loguru`: Logging for model selection decisions
- `os`: Environment variable reading

## Important Quirks & Gotchas

- **Token counting rough estimate**: provision_langchain_model() uses token_count() which estimates via cl100k_base encoding (may differ 5-10% from actual model)
- **Large context threshold hard-coded**: 105,000 token threshold for large_context_model upgrade (not configurable)
- **Config cached after first load**: ModelManager caches ModelConfig; use `refresh_config()` to reload after env changes
- **Type-specific getters use assertions**: get_speech_to_text() asserts isinstance (catches misconfiguration early)
- **Invalid model spec raises ValueError**: ModelManager.get_model() raises if spec doesn't contain `/`
- **Esperanto caching**: Actual model instances cached by Esperanto (not by ModelManager); ModelManager stateless
- **Empty string vs None**: Empty env vars are treated as None (falls back to default)
- **kwargs passed through**: provision_langchain_model() passes kwargs to AIFactory but doesn't validate what's accepted

## How to Extend

1. **Add new model type**: Add field to ModelConfig, add handling in ModelManager.get_default_model(), add env var
2. **Change fallback logic**: Modify ModelManager.get_default_model() fallback chain or provision_langchain_model() token threshold
3. **Add model validation**: Extend get_model() to validate provider/model exists before creating

## Usage Example

```python
from backpack.ai.models import model_manager

# Get default chat model
chat_model = await model_manager.get_default_model("chat")

# Get model by spec (provider/model-name format)
custom_model = await model_manager.get_model("anthropic/claude-sonnet-4-20250514")

# Get embedding model with config override
embedding_model = await model_manager.get_embedding_model(temperature=0.1)

# Get configuration to inspect defaults
config = model_manager.get_defaults()
print(config.default_chat_model)  # "openai/gpt-4o"

# Provision model for LangGraph (auto-detects large context)
from backpack.ai.provision import provision_langchain_model
langchain_model = await provision_langchain_model(
    content=long_text,
    model_id=None,  # Use default
    default_type="chat",
    temperature=0.7
)
```

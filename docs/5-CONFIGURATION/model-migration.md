# Migrating to Environment-Based Model Configuration

This guide helps you migrate from the old database-based model configuration (UI-based) to the new environment variable-based configuration.

## What Changed

Previously, AI models were configured through the **Models** page in the UI:
- Models were stored in the database
- Default models were selected via dropdowns
- Per-session model overrides were available in chat

Now, models are configured via **environment variables**:
- Simpler deployment and management
- Configuration as code (version controllable)
- Consistent behavior across restarts

## Migration Steps

### Step 1: Note Your Current Configuration

Before updating, note your current model settings from the old Models page:

- **Default Chat Model**: Which model you used for chat
- **Default Transformation Model**: Which model for transformations  
- **Large Context Model**: Which model for large content (>105k tokens)
- **Default Embedding Model**: Which model for semantic search
- **Default TTS Model**: Which model for text-to-speech (podcasts)
- **Default STT Model**: Which model for speech-to-text (audio sources)

### Step 2: Add Environment Variables

Add the following to your `.env` file (or `docker-compose.yml` environment section):

```bash
# Chat and general language tasks
# Format: provider/model-name
DEFAULT_CHAT_MODEL=openai/gpt-4o

# Transformations (optional - uses chat model if not set)
# DEFAULT_TRANSFORMATION_MODEL=openai/gpt-4o

# Large context handling (used for content >105k tokens)
LARGE_CONTEXT_MODEL=anthropic/claude-sonnet-4-20250514

# Embeddings for semantic search
DEFAULT_EMBEDDING_MODEL=openai/text-embedding-3-small

# Speech-to-text for audio processing
DEFAULT_STT_MODEL=openai/whisper-1

# Text-to-speech for podcasts
DEFAULT_TTS_MODEL=openai/tts-1

# Tools/function calling (optional - uses chat model if not set)
# DEFAULT_TOOLS_MODEL=openai/gpt-4o
```

### Step 3: Restart Services

After updating your environment configuration:

```bash
# Docker Compose
docker compose restart api

# Or restart all services
docker compose down && docker compose up -d
```

### Step 4: Verify Configuration

The API will use the configured models automatically. You can verify by:

1. Starting a chat session - it will use `DEFAULT_CHAT_MODEL`
2. Running a transformation - it will use `DEFAULT_TRANSFORMATION_MODEL` (or chat model)
3. Processing an audio file - it will use `DEFAULT_STT_MODEL`

## Model Format

All model environment variables use the `provider/model-name` format:

| Provider | Example Models |
|----------|----------------|
| `openai` | `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/text-embedding-3-small` |
| `anthropic` | `anthropic/claude-sonnet-4-20250514`, `anthropic/claude-3-5-haiku-20241022` |
| `google` | `google/gemini-1.5-pro`, `google/gemini-1.5-flash` |
| `groq` | `groq/llama-3.1-70b-versatile` |
| `ollama` | `ollama/llama3`, `ollama/mistral` |
| `mistral` | `mistral/mistral-large-latest` |
| `deepseek` | `deepseek/deepseek-chat` |
| `xai` | `xai/grok-2` |

## Defaults If Not Set

If you don't set an environment variable, these defaults are used:

| Variable | Default Value |
|----------|---------------|
| `DEFAULT_CHAT_MODEL` | `openai/gpt-4o` |
| `DEFAULT_TRANSFORMATION_MODEL` | Uses `DEFAULT_CHAT_MODEL` |
| `LARGE_CONTEXT_MODEL` | `anthropic/claude-sonnet-4-20250514` |
| `DEFAULT_EMBEDDING_MODEL` | `openai/text-embedding-3-small` |
| `DEFAULT_STT_MODEL` | `openai/whisper-1` |
| `DEFAULT_TTS_MODEL` | `openai/tts-1` |
| `DEFAULT_TOOLS_MODEL` | Uses `DEFAULT_CHAT_MODEL` |

## Podcast Episode Profiles

Podcast episode and speaker profiles still allow per-profile model configuration. When creating or editing profiles, you can now type the provider and model names directly (instead of selecting from dropdowns).

**Example episode profile settings:**
- Outline Provider: `openai`
- Outline Model: `gpt-4o`
- Transcript Provider: `anthropic`  
- Transcript Model: `claude-sonnet-4-20250514`

**Example speaker profile settings:**
- TTS Provider: `openai`
- TTS Model: `tts-1`

## Removed Features

The following features have been removed:

1. **Models Page**: The `/models` page in the UI no longer exists
2. **Model Selection Dropdowns**: Chat and transformation UIs no longer have model selectors
3. **Per-Session Model Override**: Chat sessions use the environment-configured default

## Troubleshooting

### "Model not found" errors

Ensure your model specification uses the correct format: `provider/model-name`

```bash
# Correct
DEFAULT_CHAT_MODEL=openai/gpt-4o

# Incorrect (missing provider)
DEFAULT_CHAT_MODEL=gpt-4o
```

### "Invalid API key" errors

Ensure you have the corresponding API key configured for your chosen provider:

```bash
# If using OpenAI models
OPENAI_API_KEY=sk-...

# If using Anthropic models
ANTHROPIC_API_KEY=sk-ant-...
```

### Changes not taking effect

Environment variables are read at startup. After changing `.env`:

```bash
docker compose restart api
```

## Questions?

See the [Environment Reference](environment-reference.md) for the complete list of configuration options.

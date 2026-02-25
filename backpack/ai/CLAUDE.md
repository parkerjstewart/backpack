# AI Module

Model configuration, provisioning, and management for multi-provider AI integration via Esperanto.

## Files

| File | Purpose |
|------|---------|
| `models.py` | `ModelConfig` (env-based defaults), `ModelManager` (factory), global `model_manager` instance |
| `provision.py` | `provision_langchain_model()` — smart model selection with large-context auto-upgrade |
| `__init__.py` | Module docstring only |

---

## How Model Selection Works

This is the most important thing to understand. There are two distinct paths for getting AI models:

### Path 1: `provision_langchain_model()` — Used by all LangGraph nodes

Returns a **LangChain-compatible** model (via `.to_langchain()`). This is what graphs use.

```
provision_langchain_model(content, model_id, default_type, **kwargs)
                              │         │            │
                              ▼         │            │
                    token_count(content) │            │
                              │         │            │
                    ┌─────────▼─────────┘            │
                    │                                 │
            tokens > 105,000?                         │
            ┌───Yes──┘──No───┐                        │
            ▼                ▼                        │
    large_context_model   model_id provided?          │
                          ┌──Yes──┘──No──┐            │
                          ▼              ▼            │
                   use model_id    get_default_model(default_type)
                                         │
                                  ┌──────▼──────┐
                                  │ Fallback:   │
                                  │ "chat" → default_chat_model
                                  │ "transformation" → default_transformation_model OR default_chat_model
                                  │ "tools" → default_tools_model OR default_chat_model
                                  │ "large_context" → large_context_model
                                  └─────────────┘
```

**Critical**: The 105k token threshold is **hard-coded** and takes priority over any explicit `model_id`. Large content always gets `large_context_model`.

### Path 2: `model_manager` methods — Used by API routes, utils, commands

Returns **Esperanto model objects** directly (not LangChain). Used for embeddings, speech, and model availability checks.

```python
model_manager.get_embedding_model()    # → EmbeddingModel (for vector embeddings)
model_manager.get_speech_to_text()     # → SpeechToTextModel (for audio extraction)
model_manager.get_text_to_speech()     # → TextToSpeechModel (for podcasts)
model_manager.get_defaults()           # → ModelConfig (for inspecting config)
model_manager.get_model(spec, type)    # → any model type by spec string
```

---

## Model Override Cascade (API → Graph → Provisioning)

When a user selects a specific model in the UI, it flows through:

```
API Request (model_override field)
    ↓
Graph State (model_override: Optional[str])
    ↓
Graph Node picks model_id:
    model_id = config["configurable"]["model_id"] or state["model_override"]
    ↓
provision_langchain_model(content, model_id, default_type)
    ↓
Resolution (see flowchart above)
```

**In graph nodes** (chat.py, tutor.py, source_chat.py, etc.):
```python
model_id = config.get("configurable", {}).get("model_id") or state.get("model_override")
model = await provision_langchain_model(content, model_id, "chat", max_tokens=8192)
```

**In async graph nodes** (ask.py, module.py):
```python
model_id = config.get("configurable", {}).get("model_id")
model = await provision_langchain_model(content, model_id, "chat")
```

---

## ModelConfig — Environment Variable Mapping

All models use `provider/model-name` format (e.g., `openai/gpt-4o`).

| Env Var | ModelConfig Field | Default | Used For |
|---------|------------------|---------|----------|
| `DEFAULT_CHAT_MODEL` | `default_chat_model` | `openai/gpt-4o` | Chat, general LLM tasks |
| `DEFAULT_TRANSFORMATION_MODEL` | `default_transformation_model` | *None* (falls back to chat) | Source transformations |
| `LARGE_CONTEXT_MODEL` | `large_context_model` | `anthropic/claude-sonnet-4-20250514` | Auto-selected when >105k tokens |
| `DEFAULT_EMBEDDING_MODEL` | `default_embedding_model` | `openai/text-embedding-3-small` | Semantic search, vectorization |
| `DEFAULT_TTS_MODEL` | `default_tts_model` | `openai/tts-1` | Podcast generation |
| `DEFAULT_STT_MODEL` | `default_stt_model` | `openai/whisper-1` | Audio content extraction |
| `DEFAULT_TOOLS_MODEL` | `default_tools_model` | *None* (falls back to chat) | Function calling |

**Empty string env vars** are treated as `None` (trigger fallback to default).

---

## Where Each Export Is Used

### `provision_langchain_model` (from `backpack.ai.provision`)

Used by **every LangGraph workflow** that calls an LLM:

| File | `default_type` | Purpose |
|------|----------------|---------|
| `graphs/chat.py` | `"chat"` | General chat responses |
| `graphs/source_chat.py` | `"chat"` | Source-focused chat |
| `graphs/tutor.py` | `"chat"` | Socratic tutoring (questions, evaluation, responses) |
| `graphs/ask.py` | `"chat"` | Search strategy, extraction, synthesis (3 calls) |
| `graphs/transformation.py` | `"transformation"` | Content transformations |
| `graphs/module.py` | `"chat"` | Module name, overview, learning goals generation |
| `graphs/prompt.py` | `"chat"` | Generic prompt execution |

### `model_manager` (from `backpack.ai.models`)

| File | Method | Purpose |
|------|--------|---------|
| `utils/embedding.py` | `get_embedding_model()` | Batch embedding generation |
| `api/routers/embedding.py` | `get_embedding_model()` | Check if embedding model available |
| `api/routers/search.py` | `get_embedding_model()` | Validate before vector search |
| `commands/embedding_commands.py` | `get_defaults()` | Get STT model for audio extraction |

### `ModelManager` class (from `backpack.ai.models`)

| File | Purpose |
|------|---------|
| `graphs/source.py` | Instantiates fresh `ModelManager()` to get STT config for content-core extraction |

---

## Esperanto Library

Esperanto is the provider abstraction layer. ModelManager delegates all model creation to it.

**Factory methods**:
- `AIFactory.create_language(model_name, provider, config)` → `LanguageModel`
- `AIFactory.create_embedding(model_name, provider, config)` → `EmbeddingModel`
- `AIFactory.create_speech_to_text(model_name, provider, config)` → `SpeechToTextModel`
- `AIFactory.create_text_to_speech(model_name, provider, config)` → `TextToSpeechModel`

**LangChain bridge**: `LanguageModel.to_langchain()` returns `BaseChatModel` for use in LangGraph nodes.

**Supported providers**: OpenAI, Anthropic, Google, Groq, Ollama, Mistral, DeepSeek, xAI, OpenRouter, Voyage AI, Azure OpenAI, OpenAI-compatible endpoints.

**Caching**: Esperanto caches model instances internally — ModelManager itself is stateless (only caches config).

---

## Quirks & Gotchas

- **Large context always wins**: If content exceeds 105k tokens, `provision_langchain_model` uses `large_context_model` even if an explicit `model_id` is provided
- **Token counting uses o200k_base**: `token_count()` from `backpack.utils.token_utils` estimates via tiktoken's `o200k_base` encoding — may differ from actual model tokenizer
- **Config cached after first load**: `ModelManager._config` is lazy-loaded once; call `refresh_config()` after env changes (mainly for tests)
- **Type assertions on convenience methods**: `get_embedding_model()`, `get_speech_to_text()`, `get_text_to_speech()` assert the returned type — catches provider misconfiguration early
- **Invalid model spec raises ValueError**: Any spec without `/` separator raises immediately
- **source.py creates its own ModelManager**: Unlike other files that use the global `model_manager`, `source.py` instantiates `ModelManager()` directly to get STT config for content-core
- **kwargs pass-through**: Both `get_model()` and `provision_langchain_model()` forward `**kwargs` to AIFactory (e.g., `temperature`, `max_tokens`) without validation

## How to Extend

1. **Add new model type**: Add field to `ModelConfig`, add case in `ModelManager.get_default_model()`, add env var to `.env.example`
2. **Change large context threshold**: Modify the `105_000` constant in `provision.py` (line 21)
3. **Add new provider**: Just use its Esperanto provider name in the model spec — no code changes needed

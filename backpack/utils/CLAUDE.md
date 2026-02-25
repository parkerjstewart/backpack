# Utils Module

Stateless utility functions for context building, text chunking, embedding generation, token counting, text cleaning, and version management.

## Files

```
utils/
├── __init__.py            # Re-exports all public functions
├── context_builder.py     # ContextBuilder — assembles LLM context from module/source data
├── chunking.py            # Content-type aware text splitting for embeddings
├── embedding.py           # Embedding generation with chunking + mean pooling
├── text_utils.py          # Thinking tag extraction, text cleaning
├── token_utils.py         # Token counting via tiktoken
└── version_utils.py       # GitHub version fetching, version comparison
```

All functions can be imported from `backpack.utils` directly or from their submodule.

---

## context_builder.py

Assembles context (sources, notes, insights) for LLM calls with token budgeting.

### Classes

**ContextItem** (dataclass):
- `id: str`, `type: "source"|"note"|"insight"`, `content: Dict`, `priority: int`, `token_count: Optional[int]`
- Token count auto-calculated in `__post_init__` via `token_count(str(content))`

**ContextConfig** (dataclass):
- `sources: Dict[source_id, inclusion_level]` — `"insights"`, `"full content"`, or `"not in"`
- `notes: Dict[note_id, inclusion_level]` — `"full content"` or `"not in"`
- `include_insights: bool` (default True)
- `include_notes: bool` (default True)
- `max_tokens: Optional[int]`
- `priority_weights: Dict[str, int]` — defaults: `{"source": 100, "note": 50, "insight": 75}`

**ContextBuilder**:
- Init via `**kwargs`: `source_id`, `module_id`, `include_insights`, `include_notes`, `max_tokens`, `context_config`
- `await build()` → returns dict with `sources`, `notes`, `insights`, `total_tokens`, `total_items`, `metadata`

### How build() Works

1. If `source_id` set → fetch source, add to items (with insights if configured)
2. If `module_id` set → fetch module's sources and notes, add each
3. Deduplicate by ID
4. Sort by priority (highest first)
5. If `max_tokens` set → pop lowest-priority items until under budget
6. Group items by type, return formatted dict

### Source Inclusion Levels

- `"insights"` — source summary (short context) + all SourceInsight records
- `"full content"` — source with full_text (long context) + insights
- `"not in"` — excluded entirely

### Convenience Functions

```python
await build_module_context(module_id, context_config=None, max_tokens=None)
await build_source_context(source_id, include_insights=True, max_tokens=None)
await build_mixed_context(source_ids=None, note_ids=None, module_id=None, max_tokens=None)
```

### Dependencies
- `backpack.domain.module.Module`, `Source`, `Note`
- `backpack.exceptions.DatabaseOperationError`, `NotFoundError`
- `.token_utils.token_count`

---

## chunking.py

Content-type aware text splitting. Used by embedding.py to chunk large content before embedding.

### Constants
- `CHUNK_SIZE = 1500` characters
- `CHUNK_OVERLAP = 225` characters (15%)
- `HIGH_CONFIDENCE_THRESHOLD = 0.8`

### ContentType Enum
`HTML`, `MARKDOWN`, `PLAIN`

### Detection Strategy

`detect_content_type(text, file_path)`:
1. Try file extension first (`_EXTENSION_TO_CONTENT_TYPE` mapping — covers .html, .md, .py, .json, etc.)
2. If no extension or generic → use heuristic scoring (samples first 5000 chars)
3. High-confidence heuristics (>= 0.8) can override PLAIN extension detection

Heuristic scoring:
- **HTML**: DOCTYPE, `<html>`, structural tags, header tags, closing tags → up to 1.0
- **Markdown**: `#` headers, `[text](url)` links, code fences, lists, bold/italic, blockquotes → up to 1.0

### Splitting

`chunk_text(text, content_type=None, file_path=None)` → `List[str]`:
- Short text (<= CHUNK_SIZE): returns as-is
- HTML: `HTMLHeaderTextSplitter` (h1/h2/h3) → secondary chunking if oversized
- Markdown: `MarkdownHeaderTextSplitter` (#/##/###, strip_headers=False) → secondary chunking
- Plain: `RecursiveCharacterTextSplitter` with separators `["\n\n", "\n", ". ", ", ", " ", ""]`

All chunks guaranteed <= CHUNK_SIZE via `_apply_secondary_chunking()`.

### Dependencies
- `langchain_text_splitters`: HTMLHeaderTextSplitter, MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

---

## embedding.py

Embedding generation with automatic chunking and mean pooling for large content.

### Functions

**`generate_embedding(text, content_type=None, file_path=None)`** → `List[float]`:
- Short text (<= CHUNK_SIZE): embed directly via single API call
- Long text: chunk_text() → generate_embeddings() → mean_pool_embeddings()
- Raises ValueError for empty text

**`generate_embeddings(texts)`** → `List[List[float]]`:
- Batch embedding in a single API call
- Auto-batches to stay under 200k token limit per batch
- Uses `model_manager.get_embedding_model()` from `backpack.ai.models`

**`mean_pool_embeddings(embeddings)`** → `List[float]`:
- Algorithm: normalize each → element-wise mean → normalize result
- Single embedding: just normalizes and returns
- Uses numpy for vector operations

### Dependencies
- `backpack.ai.models.model_manager`
- `.chunking.chunk_text`, `.chunking.CHUNK_SIZE`
- `.token_utils.token_count`
- `numpy`

---

## text_utils.py

Text cleaning and AI response processing. Extracted to its own file to avoid circular imports.

### Functions

**`clean_thinking_content(content)`** → `str`:
- Removes `<think>...</think>` blocks from LLM output, returns cleaned text
- Used throughout graphs (chat.py, tutor.py, ask.py, transformation.py)

**`parse_thinking_content(content)`** → `Tuple[str, str]`:
- Returns `(thinking_content, cleaned_content)` separately
- Handles malformed output: content without opening `<think>` but with `</think>` (e.g., Nemotron models)
- Large content (>100KB): bypasses parsing, returns content as-is
- Non-string input: returns `("", str(content))`

**`remove_non_ascii(text)`** → `str`: Strips non-ASCII characters

**`remove_non_printable(text)`** → `str`:
- Replaces Unicode whitespace with regular space
- Replaces unusual line terminators with `\n`
- Removes control characters (keeps `\n` and `\t`)
- Replaces non-breaking spaces
- Strips non-word/non-punctuation characters

### Compiled Patterns
- `THINK_PATTERN` — `<think>(.*?)</think>` (re.DOTALL)
- `THINK_PATTERN_NO_OPEN` — `^(.*?)</think>` (re.DOTALL) for malformed output

---

## token_utils.py

Token counting for LLM context window management.

### Functions

**`token_count(input_string)`** → `int`:
- Uses tiktoken `o200k_base` encoding (GPT-4o tokenizer)
- Fallback if tiktoken not installed: `word_count * 1.3`
- Sets `TIKTOKEN_CACHE_DIR` env var before import to persist encoder cache

**`token_cost(token_count, cost_per_million=0.150)`** → `float`:
- Simple cost calculation: `cost_per_million * (token_count / 1_000_000)`

### Note
tiktoken is imported lazily inside `token_count()` to handle the optional dependency case.

---

## version_utils.py

Version management for update checking.

### Functions

**`get_version_from_github(repo_url, branch="main")`** → `str`:
- Fetches `pyproject.toml` from GitHub raw content URL
- Parses version from `tool.poetry.version` or `project.version`
- Sync version using `requests` (10s timeout)

**`get_version_from_github_async(repo_url, branch="main")`** → `str`:
- Same as above but async using `httpx`

**`get_installed_version(package_name)`** → `str`:
- Uses `importlib.metadata.version()`

**`compare_versions(v1, v2)`** → `int`:
- Returns -1, 0, or 1
- Uses `packaging.version.parse` for proper semver comparison

### Dependencies
- `requests`, `httpx`, `tomli`, `packaging`

---

## Quirks & Gotchas

1. **ContextBuilder uses kwargs, not methods**: No `add_source()` / `add_note()` public API — pass `source_id` or `module_id` to constructor, call `build()`
2. **Token count is estimate**: `o200k_base` may differ 5-10% from actual model tokenizer
3. **Truncation drops whole items**: `truncate_to_fit()` removes lowest-priority items entirely (no partial truncation)
4. **Chunk size chosen for Ollama**: 1500 chars fits within Ollama embedding model context limits
5. **Heuristic detection samples 5000 chars**: Won't detect format shifts later in document
6. **HTML/Markdown splitters produce Documents**: Converted to strings via `.page_content`; secondary chunking applied if oversized
7. **Embedding batch limit**: 200k tokens per batch, not configurable
8. **Circular import guard**: `context_builder.py` imports from `backpack.domain.module` — domain modules must not import from utils
9. **Thinking content in large files**: >100KB content skips `<think>` parsing entirely for performance
10. **Version fetch uses raw GitHub URLs**: Will fail for private repos

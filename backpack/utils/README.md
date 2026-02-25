# Utils

Utility functions and helpers for context building, text processing, chunking, embedding, tokenization, and versioning.

## Module Overview

Six stateless utilities, each importable independently:

| File | Purpose |
|---|---|
| `context_builder.py` | Assemble LLM context from sources, notes, and insights with token budgeting |
| `chunking.py` | Content-type-aware text chunking for embedding operations |
| `embedding.py` | Embedding generation with automatic chunking and mean pooling |
| `text_utils.py` | Text cleaning and `<think>` tag extraction |
| `token_utils.py` | Token counting via `o200k_base` encoding (tiktoken) |
| `version_utils.py` | Semantic version parsing, comparison, and GitHub version fetching |

## ContextBuilder

Builds prioritized, token-budgeted context from sources, notes, and insights. Delegates to domain models (`Source`, `Module`, `Note` from `backpack.domain.module`) for data access.

### Basic Usage

```python
from backpack.utils.context_builder import ContextBuilder, ContextConfig

# Module context
builder = ContextBuilder(module_id="module:123")
context = await builder.build()

# Single source with insights
builder = ContextBuilder(
    source_id="source:456",
    include_insights=True,
    max_tokens=2000
)
context = await builder.build()
```

### Convenience Functions

```python
from backpack.utils.context_builder import (
    build_module_context,
    build_source_context,
    build_mixed_context
)

context = await build_module_context(module_id="module:123", max_tokens=5000)
context = await build_source_context(source_id="source:456", include_insights=True)
context = await build_mixed_context(
    source_ids=["source:1", "source:2"],
    note_ids=["note:1", "note:2"],
    max_tokens=3000
)
```

### Advanced Configuration

```python
from backpack.utils.context_builder import ContextConfig

config = ContextConfig(
    sources={
        "source:doc1": "insights",
        "source:doc2": "full content",
        "source:doc3": "not in"  # Exclude
    },
    notes={
        "note:summary": "full content",
        "note:draft": "not in"  # Exclude
    },
    include_insights=True,
    max_tokens=3000,
    priority_weights={
        "source": 120,
        "note": 80,
        "insight": 100
    }
)

builder = ContextBuilder(module_id="module:project", context_config=config)
context = await builder.build()
```

### Output Format

```python
{
    "sources": [...],
    "notes": [...],
    "insights": [...],
    "total_tokens": 1234,
    "total_items": 10,
    "module_id": "module:123",
    "metadata": {
        "source_count": 5,
        "note_count": 3,
        "insight_count": 2,
        "config": {
            "include_insights": True,
            "include_notes": True,
            "max_tokens": 2000
        }
    }
}
```

### Key Behaviors

- Token counting is automatic (`ContextItem.__post_init__` calls `token_count()`)
- Higher-priority items are included first; lowest-priority items are dropped when `max_tokens` is exceeded
- Default priority weights: source=100, note=50, insight=75
- Accepts `**kwargs` for extensibility (accessible via `builder.params`)

## Chunking

Content-type-aware text splitting for embedding pipelines.

```python
from backpack.utils.chunking import chunk_text, detect_content_type, ContentType

# Auto-detect and chunk
chunks = chunk_text(long_text, file_path="document.md")

# Explicit content type
chunks = chunk_text(html_content, content_type=ContentType.HTML)
```

- `ContentType` enum: `HTML`, `MARKDOWN`, `PLAIN`
- `CHUNK_SIZE = 1500` characters, `CHUNK_OVERLAP = 225` (15%)
- Detection order: file extension first, then content heuristics (override at confidence >= 0.8)
- Uses LangChain splitters: `HTMLHeaderTextSplitter`, `MarkdownHeaderTextSplitter`, `RecursiveCharacterTextSplitter`
- Secondary chunking ensures no chunk exceeds `CHUNK_SIZE`

## Embedding

Unified embedding generation with automatic chunking and mean pooling for large content.

```python
from backpack.utils.embedding import generate_embedding, generate_embeddings

# Single text (handles chunking + mean pooling automatically)
embedding = await generate_embedding(long_text)

# Batch embedding
embeddings = await generate_embeddings(["text1", "text2", "text3"])
```

- Short text (<= `CHUNK_SIZE`): embedded directly
- Long text: chunked, each chunk embedded, results combined via normalized mean pooling
- Uses `model_manager.get_embedding_model()` from `backpack.ai.models`
- Raises `ValueError` for empty/whitespace-only text

## Text Utils

```python
from backpack.utils.text_utils import (
    remove_non_ascii,
    remove_non_printable,
    parse_thinking_content,
    clean_thinking_content
)

clean = remove_non_ascii(text)
clean = remove_non_printable(text)
thinking, content = parse_thinking_content(ai_response)
content = clean_thinking_content(ai_response)
```

- `parse_thinking_content` extracts `<think>` blocks; handles malformed output (missing opening tag)
- Content > 100KB bypasses thinking extraction for performance

## Token Utils

```python
from backpack.utils.token_utils import token_count, token_cost

tokens = token_count("some text")
cost = token_cost(tokens, cost_per_million=0.150)
```

- Uses `o200k_base` encoding via tiktoken
- Falls back to word-count estimation (words x 1.3) if tiktoken is unavailable

## Version Utils

```python
from backpack.utils.version_utils import (
    compare_versions,
    get_installed_version,
    get_version_from_github
)

result = compare_versions("1.2.0", "1.3.0")  # -1
version = get_installed_version("pytest")
version = get_version_from_github("https://github.com/owner/repo")
```

- `compare_versions` returns -1, 0, or 1
- Both sync (`get_version_from_github`) and async (`get_version_from_github_async`) GitHub fetchers available
- Parses `pyproject.toml` from GitHub raw content for version info

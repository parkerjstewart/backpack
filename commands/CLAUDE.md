# Commands Module

Async command handlers for long-running operations via the `surreal-commands` job queue. Located at the project root (`commands/`), not inside `backpack/`.

## Command Inventory

| Command | File | Retry | Purpose |
|---------|------|-------|---------|
| `embed_note` | `embedding_commands.py` | 5×, exp jitter 1–60s | Embed single note (auto-chunks + mean pools) |
| `embed_insight` | `embedding_commands.py` | 5×, exp jitter 1–60s | Embed single source insight |
| `embed_source` | `embedding_commands.py` | 5×, exp jitter 1–60s | Chunk source → batch embed → bulk insert |
| `rebuild_embeddings` | `embedding_commands.py` | None (coordinator) | Submit embed_* jobs for all content; returns immediately |
| `process_source` | `source_commands.py` | 15×, exp jitter 1–120s | Run source_graph pipeline (extract → save → transform) |
| `generate_podcast` | `podcast_commands.py` | None | Generate podcast via podcast-creator library |
| `process_text` | `example_commands.py` | None | Test fixture (uppercase, lowercase, reverse) |
| `analyze_data` | `example_commands.py` | None | Test fixture (numeric aggregations) |

---

## How Commands Work

### Execution Flow

```
Domain Model / API Router
    ↓
submit_command("backpack", "embed_source", {"source_id": "source:123"})
    ↓  returns command_id immediately (fire-and-forget)
surreal-commands creates SurrealDB record (status="new")
    ↓
Worker process (surreal-commands-worker via LIVE query)
    ├─ Sets status="running"
    ├─ Executes command function
    ├─ Retries on configured exceptions (exponential backoff)
    └─ Sets status="completed" or "failed" with result
    ↓
Frontend polls GET /commands/jobs/{command_id} for status
```

### Registration

Commands must be **imported** before the worker starts or before `submit_command()` is called:
- `debug_worker.py`: `import commands` before starting worker
- `api/main.py`: `import commands  # noqa: F401` at module level
- `api/command_service.py`: Dynamically imports command modules before submitting

### Who Submits What

| Submitter | Command | Trigger |
|-----------|---------|---------|
| `Note.save()` | `embed_note` | Every note save (auto) |
| `Source.vectorize()` | `embed_source` | Manual call after source processing |
| `Source.add_insight()` | `embed_insight` | Every insight creation (auto) |
| `api/routers/sources.py` | `process_source` | Source upload/URL submission |
| `api/routers/embedding_rebuild.py` | `rebuild_embeddings` | Admin rebuild request |
| `api/podcast_service.py` | `generate_podcast` | Podcast generation request |

---

## Command Details

### embed_source_command

The most complex embedding command. Handles full source vectorization:

1. Load `Source` by ID
2. Delete existing `source_embedding` records (idempotent re-embed)
3. Detect content type from file extension or heuristics (HTML/Markdown/plain)
4. Chunk text via `chunk_text()` (1500 char chunks, 225 overlap)
5. Generate all embeddings in single API call via `generate_embeddings()`
6. Bulk insert into `source_embedding` table in batches of 100

**Input**: `EmbedSourceInput(source_id: str)`
**Output**: `EmbedSourceOutput(success, source_id, chunks_created, processing_time, error_message)`

### embed_note_command / embed_insight_command

Simpler single-item embedding:

1. Load Note/SourceInsight by ID
2. Generate embedding via `generate_embedding()` — auto-chunks large content and mean pools
3. UPSERT embedding directly into the record

Both use `ContentType.MARKDOWN` for chunking strategy.

### rebuild_embeddings_command

Coordinator that submits individual embed_* jobs:

1. Collect items by mode (`"existing"` = items with embeddings, `"all"` = all content)
2. Validate embedding model is configured
3. Submit `embed_source`, `embed_note`, `embed_insight` commands for each item
4. Return immediately with `jobs_submitted` count — actual work is async

**No retry** — this is a coordinator, individual jobs have their own retry logic.

### process_source_command

Runs the full source ingestion pipeline:

1. Load Transformation objects from IDs
2. Update source record with command reference for tracking
3. Execute `source_graph.ainvoke()` with content_state, modules, transformations, embed flag
4. Return metrics (embedded_chunks, insights_created)

**15 max attempts** with up to 120s backoff — handles deep queues and SurrealDB v2 transaction conflicts.

### generate_podcast_command

1. Load EpisodeProfile and SpeakerProfile from DB by name
2. Generate briefing from profile template + optional suffix
3. Create PodcastEpisode record with profile snapshots
4. Call `podcast_creator.create_podcast()`
5. Update episode with audio file path, transcript, outline

---

## Patterns

### Pydantic I/O

Every command uses `CommandInput`/`CommandOutput` subclasses:

```python
class EmbedSourceInput(CommandInput):
    source_id: str

class EmbedSourceOutput(CommandOutput):
    success: bool
    source_id: str
    chunks_created: int
    processing_time: float
    error_message: Optional[str] = None
```

### Error Handling Convention

```python
@command("embed_source", app="backpack", retry={...})
async def embed_source_command(input_data: EmbedSourceInput) -> EmbedSourceOutput:
    try:
        # ... do work ...
        return EmbedSourceOutput(success=True, ...)
    except (RuntimeError, ConnectionError, TimeoutError):
        raise  # Re-raise for automatic retry
    except Exception as e:
        return EmbedSourceOutput(success=False, error_message=str(e))  # Permanent failure
```

**Rule**: Re-raise transient errors (`RuntimeError`, `ConnectionError`, `TimeoutError`) for retry. Catch everything else and return failure output.

### full_model_dump()

Utility duplicated in each command file. Recursively converts Pydantic models to dicts for DB/API serialization. Handles nested models, lists, and dicts.

### Status Tracking

Domain models store the command ID for polling:
- `Source.command` field → set after `process_source` or `embed_source` submission
- `PodcastEpisode.command` field → set during `generate_podcast` execution
- Poll via `Source.get_status()` / `Source.get_processing_progress()` / `PodcastEpisode.get_job_status()`

---

## Key Dependencies

- `surreal_commands`: `@command` decorator, `submit_command()`, `get_command_status()`, `execute_command_sync()`, `CommandInput`/`CommandOutput`
- `backpack.domain.module`: Source, Note, SourceInsight (domain models)
- `backpack.domain.transformation`: Transformation (for process_source)
- `backpack.utils.embedding`: `generate_embedding()`, `generate_embeddings()` (embedding API calls)
- `backpack.utils.chunking`: `chunk_text()`, `detect_content_type()`, `ContentType`
- `backpack.database.repository`: `repo_query`, `repo_insert`, `repo_upsert`, `ensure_record_id`
- `backpack.graphs.source`: `source_graph` (for process_source pipeline)
- `backpack.podcasts.models`: EpisodeProfile, SpeakerProfile, PodcastEpisode
- `podcast_creator`: External podcast generation library
- `loguru`: Logging throughout

## Quirks & Gotchas

- **App name is `"backpack"`**: All `@command` decorators and `submit_command()` calls use `app="backpack"` (not `"open_notebook"`)
- **process_source has aggressive retry**: 15 attempts, 120s max wait — SurrealDB v2 transaction conflicts can be frequent under load
- **rebuild_embeddings returns job counts, not results**: Actual embedding happens async in individual commands
- **embed_source deletes before inserting**: Existing embeddings are wiped for idempotent re-embedding
- **Podcast profiles loaded by name**: Must exist in DB; failure raises exception (no fallback)
- **full_model_dump() is duplicated**: Same utility function defined in 3 separate command files
- **Example commands have delay_seconds**: For testing async behavior; not production commands
- **Commands must be imported before use**: Worker and API both `import commands` at startup to populate the registry

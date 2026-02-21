# Backpack Core Package

The `backpack` package is the Python backend core. It contains domain models, LangGraph workflows, AI provisioning, database operations, and utilities.

## Package Structure

```
backpack/
├── config.py          # Path configuration (data dirs, uploads, checkpoints)
├── exceptions.py      # Exception hierarchy (BackpackError base)
├── ai/                # AI model provisioning via Esperanto
├── database/          # SurrealDB async repository + migrations
├── domain/            # Data models (Course, Module, Source, Note, User, etc.)
├── graphs/            # LangGraph workflows (chat, tutor, ask, source, etc.)
├── podcasts/          # Podcast models (SpeakerProfile, EpisodeProfile, PodcastEpisode)
└── utils/             # Context building, chunking, embedding, token counting
```

See sub-module CLAUDE.md files for detailed patterns:
- [ai/CLAUDE.md](ai/CLAUDE.md) — Model provisioning, Esperanto, fallback logic
- [database/CLAUDE.md](database/CLAUDE.md) — SurrealDB repo functions, migrations
- [domain/CLAUDE.md](domain/CLAUDE.md) — Base classes, model hierarchy, relationships
- [graphs/CLAUDE.md](graphs/CLAUDE.md) — Workflow design, state machines, interrupt pattern
- [podcasts/CLAUDE.md](podcasts/CLAUDE.md) — Podcast generation models
- [utils/CLAUDE.md](utils/CLAUDE.md) — Context builder, chunking, embedding, text/token utils

---

## config.py

Centralized path configuration. All directories auto-create on import.

| Constant | Default | Purpose |
|----------|---------|---------|
| `DATA_FOLDER` | `./data` | Root data directory |
| `LANGGRAPH_CHECKPOINT_FILE` | `./data/sqlite-db/checkpoints.sqlite` | LangGraph state persistence |
| `UPLOADS_FOLDER` | `./data/uploads` | Uploaded file storage |
| `AVATARS_FOLDER` | `./data/avatars` | User avatar images |
| `TIKTOKEN_CACHE_DIR` | `./data/tiktoken-cache` | Token encoder cache |

## exceptions.py

All inherit from `BackpackError`:
- `DatabaseOperationError`, `InvalidInputError`, `NotFoundError`
- `AuthenticationError`, `ConfigurationError`, `ExternalServiceError`
- `RateLimitError`, `FileOperationError`, `NetworkError`
- `UnsupportedTypeException`, `NoTranscriptFound`

---

## Domain Model Hierarchy

```
User
Course
  └── Module (via course field)
        ├── LearningGoal (via module field)
        ├── Source (via reference edge)
        │     ├── SourceInsight
        │     └── SourceEmbedding
        ├── Note (via artifact edge)
        └── ChatSession (via refers_to edge)

Standalone:
  CourseMembership, Invitation, Transformation, DefaultPrompts,
  ContentSettings, SpeakerProfile, EpisodeProfile, PodcastEpisode, Asset
```

### Base Classes (domain/base.py)

**ObjectModel** — Base for all mutable records:
- `table_name: ClassVar[str]` — SurrealDB table
- `nullable_fields: ClassVar[set[str]]` — Fields allowed to be None
- `save()` — Create or update; auto-manages `created`/`updated` timestamps
- `delete()` — Remove by ID
- `get(id)` — Polymorphic fetch; resolves subclass from `table:id` prefix
- `get_all(order_by)` — Fetch all records
- `relate(relationship, target_id, data)` — Create graph edge
- `_prepare_save_data()` — Hook for custom serialization before DB write

**RecordModel** — Singleton configuration (e.g., ContentSettings, DefaultPrompts):
- `get_instance()` — Get or load from DB
- `update()` / `patch()` — Upsert to DB
- Uses `__new__()` to enforce single instance

### Key Models

**User** (`course.py`): email (normalized), name, role (student/instructor/admin), avatar_url. Methods: `get_by_email()`, `get_courses()`.

**Course** (`course.py`): title, description, instructor_id, archived. Methods: `get_modules()`, `get_members(role)`, `get_students_needing_attention()`, `add_member()`, `remove_member()`, `get_student_module_mastery()`.

**Module** (`module.py`): name, description, overview, course (ref), order, archived. Methods: `get_learning_goals()`, `get_sources()`, `get_notes()`, `get_chat_sessions()`.

**LearningGoal** (`module.py`): module (ref), description, takeaways, competencies, order.

**Source** (`module.py`): asset (Asset), title, topics, full_text, command (ref to job). Key methods:
- `vectorize()` — Fire-and-forget: submits `embed_source` command, returns command_id
- `add_insight(type, content)` — Creates SourceInsight, submits `embed_insight` command
- `get_status()` / `get_processing_progress()` — Query job status
- `get_context(context_size)` — Returns summary ("short") or full text ("long")
- `add_to_module(module_id)` — Creates `reference` edge
- `delete()` — Cleans up file + embeddings + insights + DB record

**Note** (`module.py`): title, note_type (human/ai), content. `save()` overrides to submit `embed_note` command after save. `add_to_module()` creates `artifact` edge.

**ChatSession** (`module.py`): title, model_override. `relate_to_module()` / `relate_to_source()` create `refers_to` edges.

**Invitation** (`invitation.py`): token, course_id, email, role, status, expires_at. Methods: `accept(user_id)` creates membership, `get_by_token()`, `get_pending_for_course()`.

### RecordID Handling Pattern

All model fields referencing other records follow this pattern:
1. Stored as `RecordID` in SurrealDB
2. Parsed to string on load via `field_validator(mode="before")`
3. Coerced back to `RecordID` on save via `_prepare_save_data()`

### SurrealDB Relationships (graph edges)

| Edge Type | From | To | Usage |
|-----------|------|------|-------|
| `reference` | Source | Module | Source belongs to module |
| `artifact` | Module | Note | Note belongs to module |
| `refers_to` | ChatSession | Module or Source | Chat scoped to module/source |
| `course_membership` | User | Course | Enrollment with role (student/instructor/ta) |

### Fire-and-Forget Embedding Pattern

Embedding is NOT automatic on `save()`. Instead:
1. `Note.save()` → calls `super().save()` then `submit_command("embed_note", id)`
2. `Source.vectorize()` → submits `embed_source` command, returns command_id
3. `Source.add_insight()` → submits `embed_insight` command
4. Commands processed asynchronously by the worker via surreal-commands

### Search Functions (module.py)

- `text_search(keyword, results, source=True, note=True)` — Full-text via `fn::text_search()` SurrealQL function
- `vector_search(keyword, results, source=True, note=True, minimum_score=0.2)` — Generates embedding for query, calls `fn::vector_search()`

---

## LangGraph Workflows (graphs/)

All workflows in `backpack/graphs/`. Common patterns:
- State defined as TypedDict with reducers
- Nodes are sync functions (async ops use `asyncio.new_event_loop()` workaround)
- Model provisioning via `provision_langchain_model()` from config
- Prompt templating via `ai_prompter.Prompter` with Jinja2
- Checkpointing via shared SqliteSaver at `LANGGRAPH_CHECKPOINT_FILE`
- Extended thinking content cleaned via `clean_thinking_content()`

| Workflow | File | Purpose | Key Pattern |
|----------|------|---------|-------------|
| Chat | `chat.py` | Module-scoped conversation | SqliteSaver checkpointing, thread_id = session ID |
| Source Chat | `source_chat.py` | Source-scoped conversation | ContextBuilder with insights, tracks context_indicators |
| Ask | `ask.py` | Search + synthesis | Structured output for strategy, parallel `Send()` fan-out |
| Source | `source.py` | Content ingestion | Extract → save → fan-out transformations → embed |
| Transformation | `transformation.py` | Apply transformation prompt | Token-aware chunking (90k max), recursive merge |
| Prompt | `prompt.py` | Generic prompt chain | Async node, optional output parser |
| Tutor | `tutor.py` | Socratic tutoring | Interrupt-based dialogue, goal progression |
| Tools | `tools.py` | Shared tool definitions | `get_current_timestamp()` |

### Tutor Workflow (tutor.py) — Most Complex

9-node state machine with interrupt-based human-in-the-loop:

```
initialize_session → select_next_goal → generate_starter_questions
    → present_question [INTERRUPT] → evaluate_and_route
        → socratic_response [INTERRUPT] → (loop back to evaluate)
        → advance_to_next_question → (loop or mark_goal_complete)
    → mark_goal_complete → (select_next_goal or generate_summary) → END
```

**State** (`TutorState`): messages, module context, learning goals, goal_progress, current_goal_id, current_question, understanding_trajectory, latest_evaluation.

**Models** (`tutor_models.py`): `StarterQuestion`, `GeneratedQuestions`, `EvaluationResult`, `GoalSelection`, `UnderstandingPoint`, `GoalProgress`, `SessionSummary`.

**Interrupt pattern**: `interrupt()` pauses graph, returns data in `__interrupt__`. API renders to client. Student responds via `Command(resume=answer)`. Graph resumes from pause point.

### Async/Sync Bridging

LangGraph nodes are sync, but many operations (DB, AI) are async:
```python
new_loop = asyncio.new_event_loop()
try:
    asyncio.set_event_loop(new_loop)
    result = new_loop.run_until_complete(async_operation())
finally:
    new_loop.close()
```
This is fragile — be careful adding new async calls in graph nodes.

---

## AI Provisioning (ai/)

### ModelConfig (ai/models.py)

Reads defaults from environment variables in `provider/model-name` format:

| Config Field | Env Var | Default |
|-------------|---------|---------|
| `default_chat_model` | `DEFAULT_CHAT_MODEL` | `openai/gpt-4o` |
| `large_context_model` | `LARGE_CONTEXT_MODEL` | `anthropic/claude-sonnet-4-20250514` |
| `default_embedding_model` | `DEFAULT_EMBEDDING_MODEL` | `openai/text-embedding-3-small` |
| `default_transformation_model` | `DEFAULT_TRANSFORMATION_MODEL` | Falls back to chat |
| `default_tts_model` | `DEFAULT_TTS_MODEL` | `openai/tts-1` |
| `default_stt_model` | `DEFAULT_STT_MODEL` | `openai/whisper-1` |
| `default_tools_model` | `DEFAULT_TOOLS_MODEL` | Falls back to chat |

### ModelManager (ai/models.py)

Factory for model provisioning via Esperanto:
- `get_model(spec, model_type)` — Get model by provider/name spec
- `get_default_model(model_type)` — Get default with fallback chain
- `get_embedding_model()`, `get_speech_to_text()`, `get_text_to_speech()`
- `refresh_config()` — Force reload from environment
- Global singleton: `model_manager`

### provision_langchain_model() (ai/provision.py)

Smart model selection for LangGraph:
- If tokens > 105,000 → use `large_context_model`
- Elif `model_id` specified → use that model
- Else → use default for type
- Returns LangChain-compatible model via `.to_langchain()`

---

## Database (database/)

### Repository Functions (repository.py)

All async, each opens/closes its own connection (no pooling):

| Function | Purpose |
|----------|---------|
| `repo_query(query, vars)` | Execute SurrealQL with parameters |
| `repo_create(table, data)` | Insert with auto-timestamps |
| `repo_insert(table, data_list)` | Bulk insert |
| `repo_upsert(table, id, data)` | Create-or-update with MERGE |
| `repo_update(table, id, data)` | Update with auto-timestamp |
| `repo_delete(record_id)` | Delete by RecordID |
| `repo_relate(source, relationship, target)` | Create graph edge |

Helpers: `parse_record_ids(obj)` recursively converts RecordID to string. `ensure_record_id(value)` coerces to RecordID.

### Migrations (async_migrate.py)

`AsyncMigrationManager` loads hard-coded migration files from `backpack/database/migrations/` (currently 1-17 registered, 18 exists on disk). Runs on API startup via lifespan. Version tracked in `_sbl_migrations` table. Adding a new migration requires both creating the `.surrealql` file AND adding the `AsyncMigration.from_file()` line in `async_migrate.py` — files are not auto-discovered.

---

## Utilities (utils/)

| Module | Key Functions |
|--------|---------------|
| `context_builder.py` | `ContextBuilder` — assembles context from sources/notes/insights with token budgeting |
| `chunking.py` | `chunk_text()` — content-type aware splitting (HTML/Markdown/plain), 1500 char chunks |
| `embedding.py` | `generate_embedding()` — chunk → embed → mean pool for long text |
| `text_utils.py` | `clean_thinking_content()` — strip `<think>` tags; `remove_non_printable()` |
| `token_utils.py` | `token_count()` — tiktoken `o200k_base` encoding (fallback: words * 1.3) |
| `version_utils.py` | `get_version_from_github()`, `compare_versions()` |

---

## Quirks & Gotchas

1. **Embedding is not automatic on Source.save()** — must call `vectorize()` explicitly; Note.save() does auto-embed
2. **Async loop workaround in graph nodes** — fragile `asyncio.new_event_loop()` pattern; don't nest
3. **105k token threshold is hard-coded** — not configurable; triggers large_context_model upgrade
4. **No connection pooling** — each `repo_*` call opens/closes connection; fine for HTTP, slow for bulk
5. **Polymorphic get() needs subclass imported** — `ObjectModel.get("source:xxx")` fails if Source not imported
6. **Hard-coded migration list** — adding migration requires updating `async_migrate.py` code
7. **Profile snapshots** — podcast episode/speaker profiles stored as dicts, not references; updates don't affect past episodes
8. **SqliteSaver shared** — all LangGraph workflows use same checkpoint file
9. **Config cached** — `ModelManager` caches `ModelConfig`; call `refresh_config()` after env changes
10. **Tutor interrupt flow** — graph pauses at `interrupt()`, API must handle `Command(resume=...)` to continue
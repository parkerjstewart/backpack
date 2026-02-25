# Domain Module

Core data models with async SurrealDB persistence, auto-embedding, graph relationships, and polymorphic fetching.

## Model Hierarchy

```
ObjectModel (base.py)              ← Mutable records with auto-increment IDs
├── User (course.py)
├── Course (course.py)
├── CourseMembership (course.py)
├── Module (module.py)
├── LearningGoal (module.py)
├── Source (module.py)
├── SourceEmbedding (module.py)
├── SourceInsight (module.py)
├── Note (module.py)
├── ChatSession (module.py)
├── Invitation (invitation.py)
├── Transformation (transformation.py)
├── SpeakerProfile (podcasts/models.py)
├── EpisodeProfile (podcasts/models.py)
└── PodcastEpisode (podcasts/models.py)

RecordModel (base.py)              ← Singletons with fixed IDs
├── ContentSettings (content_settings.py)
└── DefaultPrompts (transformation.py)

Asset (module.py)                  ← Pydantic BaseModel value object (not persisted)
```

## Files

| File | Models | Purpose |
|------|--------|---------|
| `base.py` | ObjectModel, RecordModel | Base classes with CRUD, relationships, polymorphic get |
| `course.py` | User, Course, CourseMembership | Users, courses, enrollment, student progress tracking |
| `module.py` | Module, LearningGoal, Source, SourceInsight, SourceEmbedding, Note, ChatSession, Asset + search functions | Core learning objects and content |
| `invitation.py` | Invitation | Email-based course invitations with token auth |
| `content_settings.py` | ContentSettings | Singleton for processing engine preferences |
| `transformation.py` | Transformation, DefaultPrompts | Reusable AI transformation prompts |

---

## Base Classes (base.py)

### ObjectModel

Base for all mutable database records.

**Fields**: `id` (auto-assigned), `created` (auto ISO string), `updated` (auto ISO string)

**Class variables subclasses must set**:
- `table_name: ClassVar[str]` — SurrealDB table name
- `nullable_fields: ClassVar[set[str]]` — Fields allowed to be None in database (default empty)

**Key methods**:
- `async save()` — Create or update; auto-sets timestamps; calls `_prepare_save_data()` for serialization
- `async delete()` — Remove by ID
- `async relate(relationship, target_id, data={})` — Create graph edge
- `@classmethod async get(id)` — **Polymorphic**: resolves correct subclass from table prefix in ID string
- `@classmethod async get_all(order_by=None)` — Fetch all from table
- `_prepare_save_data()` — Override hook for custom serialization (e.g., coercing strings to RecordID)

**Polymorphic get()**: `ObjectModel.get("source:123")` returns a `Source` instance. Searches all imported subclasses by `table_name`. **Fails if the subclass hasn't been imported yet.**

### RecordModel

Singleton pattern for configuration records with a fixed `record_id`.

**Class variables**: `record_id: ClassVar[str]`, `_instances: ClassVar[Dict]`

**Key methods**:
- `@classmethod async get_instance()` — Get or create singleton, lazy-load from DB
- `async update()` — Upsert to database
- `async patch(model_dict)` — Partial update from dict
- `@classmethod clear_instance()` — Reset singleton (for tests)

---

## Course & User Models (course.py)

### User
`table_name = "user"`

| Field | Type | Notes |
|-------|------|-------|
| `email` | `str` | Normalized lowercase, unique |
| `name` | `Optional[str]` | Display name |
| `role` | `str` | `"student"` / `"instructor"` / `"admin"` |
| `external_id` | `Optional[str]` | External auth provider ID |
| `avatar_url` | `Optional[str]` | Profile image |

**Methods**: `get_by_email(email)`, `get_courses()` (via course_membership edges)

### Course
`table_name = "course"`

| Field | Type | Notes |
|-------|------|-------|
| `title` | `str` | Required, non-empty |
| `description` | `Optional[str]` | |
| `instructor_id` | `Optional[str]` | Parsed from RecordID on load, coerced back on save |
| `archived` | `bool` | Default False |

**Methods**:
- `get_modules()` — ORDER BY order ASC
- `get_members(role=None)`, `get_students()`, `get_teaching_team()`
- `get_students_needing_attention()` — Complex SurrealQL: groups by student, counts struggling goals
- `get_student_module_mastery(user_id)` — Joins learning goals + student_progress
- `add_member(user_id, role)` — Upsert course_membership edge
- `remove_member(user_id)`

### CourseMembership
`table_name = "course_membership"` — Edge record with `role` and `enrolled_at`. Usually created via `RELATE` edges, not standalone.

---

## Module & Content Models (module.py)

### Module
`table_name = "module"`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `str` | Required, non-empty |
| `description` | `str` | |
| `overview` | `Optional[str]` | AI-generated overview |
| `course` | `Optional[str]` | RecordID parsed to string |
| `order` | `int` | Sort order within course |
| `archived` | `Optional[bool]` | Default False |

**Methods**:
- `get_learning_goals()` — ORDER BY order ASC
- `get_sources()` — Via `reference` edges; **omits full_text** for performance
- `get_notes()` — Via `artifact` edges; **omits content + embedding**
- `get_chat_sessions()` — Via `refers_to` edges

### LearningGoal
`table_name = "learning_goal"`

| Field | Type | Notes |
|-------|------|-------|
| `module` | `str` | Required, RecordID parsed to string |
| `description` | `str` | Required, non-empty, action-verb statement |
| `takeaways` | `str` | Key concepts (bullet points) |
| `competencies` | `str` | Demonstrable skills (bullet points) |
| `order` | `int` | Sort order within module |

### Source
`table_name = "source"`

| Field | Type | Notes |
|-------|------|-------|
| `asset` | `Optional[Asset]` | File path or URL |
| `title` | `Optional[str]` | |
| `topics` | `Optional[List[str]]` | Extracted topics |
| `full_text` | `Optional[str]` | Full extracted content |
| `command` | `Optional[RecordID]` | surreal-commands job reference |

**Key methods**:
- `vectorize()` → `str` — Fire-and-forget `embed_source` command; returns command_id
- `get_status()`, `get_processing_progress()` — Track embedding job
- `get_insights()` → `List[SourceInsight]`
- `add_insight(insight_type, content)` — Creates insight + auto-submits `embed_insight` command
- `get_context(context_size="short"|"long")` — short: id/title/insights; long: adds full_text
- `add_to_module(module_id)` — Creates `reference` edge
- `get_embedded_chunks()` → `int` — Count of source_embedding records
- `delete()` — Cascading: deletes file, embeddings, insights, then record
- `@classmethod get_sources(source_ids)` — Batch fetch, skip missing

### Note
`table_name = "note"`

| Field | Type | Notes |
|-------|------|-------|
| `title` | `Optional[str]` | |
| `note_type` | `Optional[Literal["human", "ai"]]` | |
| `content` | `Optional[str]` | Rejects empty string (None OK) |

**Key methods**:
- `save()` — Auto-submits `embed_note` command after save (fire-and-forget)
- `add_to_module(module_id)` — Creates `artifact` edge
- `get_context(context_size)` — **SYNC** (not async); short truncates content to 100 chars

### SourceInsight
`table_name = "source_insight"` — Fields: `insight_type`, `content`. Methods: `get_source()`, `save_as_note(module_id)`

### SourceEmbedding
`table_name = "source_embedding"` — Fields: `content` (chunk text). Methods: `get_source()`

### ChatSession
`table_name = "chat_session"` — `nullable_fields = {"model_override"}`. Fields: `title`, `model_override`. Methods: `relate_to_module()`, `relate_to_source()` (both create `refers_to` edges)

### Asset
Pydantic `BaseModel` (NOT ObjectModel). Value object with `file_path` and `url` fields. Embedded in Source.

### Search Functions (module-level)

```python
async def text_search(keyword, results, source=True, note=True) -> List[Dict]
async def vector_search(keyword, results, source=True, note=True, minimum_score=0.2) -> List[Dict]
```

`vector_search` generates an embedding for the query via `generate_embedding()`, then calls `fn::vector_search()` SurrealQL function. Both raise `InvalidInputError` for empty keywords.

---

## Invitation Model (invitation.py)

`table_name = "invitation"`, `nullable_fields = {"invited_by"}`

| Field | Type | Notes |
|-------|------|-------|
| `token` | `str` | UUID, auto-generated on save |
| `course_id` | `Optional[str]` | RecordID parsed to string |
| `email` | `str` | Normalized lowercase |
| `name` | `str` | |
| `role` | `str` | Default `"student"` |
| `status` | `str` | `pending` / `accepted` / `declined` / `cancelled` / `expired` |
| `invited_by` | `Optional[str]` | RecordID parsed to string |
| `expires_at` | `Optional[datetime]` | Default: 30 days from creation |

**Methods**: `accept(user_id)` (checks expiry, creates/updates membership), `decline()`, `cancel()`, `get_by_token(token)`, `get_pending_for_course(course_id)`, `get_by_email_and_course(email, course_id)`

---

## Configuration Models

### ContentSettings (content_settings.py)
RecordModel singleton (`record_id = "backpack:content_settings"`).

| Field | Type | Default |
|-------|------|---------|
| `default_content_processing_engine_doc` | `Literal["auto","docling","simple"]` | `"auto"` |
| `default_content_processing_engine_url` | `Literal["auto","firecrawl","jina","simple"]` | `"auto"` |
| `default_embedding_option` | `Literal["ask","always","never"]` | `"ask"` |
| `auto_delete_files` | `Literal["yes","no"]` | `"yes"` |
| `youtube_preferred_languages` | `List[str]` | `[en, pt, es, de, nl, en-GB, fr, hi, ja]` |

### Transformation (transformation.py)
`table_name = "transformation"`. Fields: `name`, `title`, `description`, `prompt` (Jinja2 template), `apply_default`.

**Fixed IDs** (from migration 17): `DENSE_SUMMARY`, `ANALYZE_PAPER`, `KEY_INSIGHTS`, `REFLECTIONS`, `TABLE_OF_CONTENTS`, `SIMPLE_SUMMARY` — accessible as `Transformation.DENSE_SUMMARY` etc.

### DefaultPrompts (transformation.py)
RecordModel singleton (`record_id = "backpack:default_prompts"`). Single field: `transformation_instructions`.

---

## SurrealDB Graph Relationships

| Edge Type | From → To | Created By | Purpose |
|-----------|-----------|------------|---------|
| `reference` | Source → Module | `source.add_to_module()` | Source belongs to module |
| `artifact` | Module → Note | `note.add_to_module()` | Note belongs to module |
| `refers_to` | ChatSession → Module/Source | `session.relate_to_module/source()` | Chat scoped to context |
| `course_membership` | User → Course | `course.add_member()` | Enrollment with role |

---

## RecordID Handling Pattern

This is a recurring pattern across all models with foreign key references:

1. **On load**: `@field_validator("field", mode="before")` parses SurrealDB `RecordID` objects to plain strings
2. **In Python**: Fields stored as `str` (e.g., `"module:abc123"`)
3. **On save**: `_prepare_save_data()` coerces strings back to `RecordID` format for database

Affected fields: `Course.instructor_id`, `Module.course`, `LearningGoal.module`, `Source.command`, `Invitation.course_id`, `Invitation.invited_by`

---

## Embedding Behavior (Critical)

Different models handle embedding differently:

| Model | When Embedded | Mechanism | Blocking? |
|-------|--------------|-----------|-----------|
| Source | Manual: `source.vectorize()` | `embed_source` command | No (fire-and-forget) |
| Note | Auto on `save()` | `embed_note` command | No (fire-and-forget) |
| SourceInsight | Auto on `source.add_insight()` | `embed_insight` command | No (fire-and-forget) |

**Source.save() does NOT auto-embed.** You must call `source.vectorize()` explicitly after saving. This is intentional — source content may still be processing when save occurs.

---

## Important Quirks

- **Polymorphic get() requires import**: `ObjectModel.get("source:123")` searches subclasses by `table_name`. If `Source` hasn't been imported in the current module, resolution fails with `InvalidInputError`
- **Note.get_context() is SYNC**: The only domain method that's not async. All others require `await`
- **Module.get_sources() omits full_text**: Returns sources without `full_text` field for performance. Fetch individually with `Source.get(id)` for full content
- **Module.get_notes() omits content + embedding**: Same pattern — lightweight list fetch
- **Source.delete() cascades manually**: Deletes uploaded file, all embeddings, all insights, then the record itself
- **RecordModel singleton in _instances**: `ContentSettings()` returns cached instance after first call. Use `clear_instance()` in tests
- **Invitation.accept() is transactional**: Checks pending status, checks expiry (auto-sets expired), creates membership, updates status — all in sequence
- **Transformation fixed IDs**: `Transformation.DENSE_SUMMARY` etc. are class-level constants matching migration-seeded records

## Key Dependencies

- `backpack.database.repository`: `repo_create`, `repo_query`, `repo_update`, `repo_delete`, `repo_relate`, `repo_upsert`
- `surrealdb`: `RecordID` type for graph relationships
- `pydantic`: BaseModel, field_validator, ConfigDict
- `surreal_commands`: `submit_command()`, `get_command_status()` for async jobs
- `backpack.utils.embedding`: `generate_embedding()` (used by `vector_search`)
- `loguru`: Logging

# Database Module

SurrealDB abstraction layer: async CRUD repository, graph relationships, and schema migration system.

## Files

| File | Purpose |
|------|---------|
| `repository.py` | Async CRUD operations, graph relationships, RecordID utilities |
| `async_migrate.py` | Migration system: load, execute, version-track `.surrealql` files |
| `migrate.py` | Sync wrapper around AsyncMigrationManager (backward compat) |
| `migrations/` | 18 `.surrealql` migration files (17 registered in code) |

---

## Repository Layer (repository.py)

### Connection Management

```
db_connection() → AsyncContextManager[AsyncSurreal]
  ├── Open AsyncSurreal(url)
  ├── Sign in with SURREAL_USER / SURREAL_PASSWORD
  ├── Select SURREAL_NAMESPACE / SURREAL_DATABASE
  ├── Yield connection
  └── Auto-close on exit
```

**Each `repo_*` call opens and closes its own connection.** No pooling — designed for HTTP request-scoped operations.

### CRUD Functions

| Function | Purpose | Auto-timestamps | Notes |
|----------|---------|-----------------|-------|
| `repo_query(sql, vars)` | Raw SurrealQL execution | No | Most common (~60 uses). Auto-parses RecordIDs to strings |
| `repo_create(table, data)` | Insert new record | `created` + `updated` | Removes any existing `id` field |
| `repo_insert(table, data_list, ignore_duplicates)` | Bulk insert | No | `ignore_duplicates` silently skips "already contains" errors |
| `repo_upsert(table, id, data, add_timestamp)` | Create-or-update (MERGE) | Optional `updated` | Used by RecordModel singletons |
| `repo_update(table, id, data)` | Update existing | `updated` | Accepts `table:id` or full RecordID format |
| `repo_delete(record_id)` | Delete record | No | Accepts string or RecordID |
| `repo_relate(source, rel, target, data)` | Create graph edge | No | `RELATE source->rel->target CONTENT data` |

### Utility Functions

- **`parse_record_ids(obj)`** — Recursively converts SurrealDB `RecordID` objects to strings. Deep-traverses dicts and lists. Called automatically by `repo_query`.
- **`ensure_record_id(value)`** — Coerces string or RecordID to `RecordID` type via `RecordID.parse()`. Used extensively in domain models for query parameters.

### Environment Variables

| Env Var | Default | Purpose |
|---------|---------|---------|
| `SURREAL_URL` | `ws://localhost:8000/rpc` | WebSocket connection URL |
| `SURREAL_ADDRESS` | `localhost` | Fallback if URL not set |
| `SURREAL_PORT` | `8000` | Fallback if URL not set |
| `SURREAL_USER` | *(required)* | Database username |
| `SURREAL_PASSWORD` | *(required)* | Database password |
| `SURREAL_PASS` | *(legacy fallback)* | Deprecated alias for password |
| `SURREAL_NAMESPACE` | *(required)* | SurrealDB namespace |
| `SURREAL_DATABASE` | *(required)* | SurrealDB database name |

---

## Migration System (async_migrate.py)

### How It Works

1. **API startup** (`api/main.py` lifespan) creates `AsyncMigrationManager`
2. Manager loads 17 hard-coded migration files from `migrations/` directory
3. Queries `_sbl_migrations` table for current version
4. Runs all pending migrations sequentially, bumping version after each
5. If any migration fails, API startup fails (fail-fast)

### Classes

**`AsyncMigration`** — Single migration wrapper:
- `from_file(path)` — Load `.surrealql` file, strip comments (`--` lines)
- `run(bump=True)` — Execute SQL, then `bump_version()` or `lower_version()`

**`AsyncMigrationRunner`** — Sequences migrations:
- `run_all()` — Execute all pending from current version
- `run_one_up()` / `run_one_down()` — Single step up or rollback

**`AsyncMigrationManager`** — Orchestrator:
- `__init__()` — Hard-codes loading of migrations 1–17 (up + down files)
- `get_current_version()` → `int`
- `needs_migration()` → `bool`
- `run_migration_up()` — Run all pending with logging

### Version Tracking

Stored in `_sbl_migrations` table:
- `bump_version()` — INSERT record with version number + `applied_at` timestamp
- `lower_version()` — DELETE latest record (rollback)
- `get_latest_version()` — Returns 0 if table doesn't exist (clean bootstrap)

### Migration Files

**18 files exist on disk, 17 registered in code.** Migration 18 must be manually added to `async_migrate.py` to take effect.

| Migration | Size | What It Does |
|-----------|------|-------------|
| 1 | 7.3 KB | Initial schema: source, note, embeddings, search functions, indexes |
| 2 | 72 B | Add `note_type` field |
| 3 | 5.0 KB | Chat sessions, improved vector_search + text_search functions |
| 4 | 4.9 KB | Further text_search and vector_search refinements |
| 5 | 10.2 KB | Transformations table + default prompts (analyze paper, key insights, etc.) |
| 6–9 | Various | Incremental schema enhancements |
| 10–12 | Various | Course/module schema, major updates |
| 13 | 1.6 KB | Learning goals table refinement |
| 14–16 | Various | Field additions/refinements |
| 17 | 1.8 KB | Add transformation fields + Jinja2 prompt templates |
| 18 | 211 B | Remove `mastery_criteria` from learning_goal (**NOT REGISTERED**) |

**To register migration 18**: Add `AsyncMigration.from_file(...)` entries for both up and down files in `AsyncMigrationManager.__init__()`.

### Sync Wrapper (migrate.py)

`MigrationManager` — Wraps `AsyncMigrationManager` with `asyncio.run()` for legacy callers. Same interface: `get_current_version()`, `needs_migration`, `run_migration_up()`.

---

## SurrealDB Schema Overview

### Tables

| Table | Type | Key Fields |
|-------|------|-----------|
| `user` | Record | email, name, role, external_id, avatar_url |
| `course` | Record | title, description, instructor_id, archived |
| `module` | Record | name, description, course (ref), overview, order, archived |
| `learning_goal` | Record | module (ref), description, takeaways, competencies, order |
| `source` | Record | asset, title, topics, full_text, command (job ref) |
| `source_embedding` | Record | source (ref), content, embedding (float[]), order |
| `source_insight` | Record | source (ref), insight_type, content, embedding |
| `note` | Record | title, note_type, content, embedding |
| `chat_session` | Record | title, model_override |
| `transformation` | Record | name, title, description, prompt, apply_default |
| `invitation` | Record | token, course_id, email, role, status, expires_at |

### Graph Edges

| Edge Table | From → To | Created By |
|------------|-----------|------------|
| `reference` | Source → Module | `source.add_to_module()` |
| `artifact` | Module → Note | `note.add_to_module()` |
| `refers_to` | ChatSession → Module/Source | `session.relate_to_module/source()` |
| `course_membership` | User → Course | `course.add_member()` |

### Built-in Functions

| Function | Purpose | Used By |
|----------|---------|---------|
| `fn::text_search(keyword, limit, source, note)` | BM25 full-text search with highlighting | `domain/module.py: text_search()` |
| `fn::vector_search(embedding, limit, source, note, min_score)` | Cosine similarity on embeddings | `domain/module.py: vector_search()` |

### Indexes

Full-text search indexes on: `source.title`, `source.full_text`, `note.title`, `note.content`, `source_embedding.content`, `source_insight.content`

---

## Common SurrealQL Patterns

### Traversing relationships (used heavily in domain models)

```sql
-- Get sources for a module via reference edges (omit large fields)
SELECT * OMIT source.full_text FROM (
    SELECT in AS source FROM reference WHERE out = $id FETCH source
) ORDER BY source.updated DESC

-- Get notes for a module via artifact edges
SELECT * OMIT note.content, note.embedding FROM (
    SELECT in AS note FROM artifact WHERE out = $id FETCH note
) ORDER BY note.updated DESC

-- Get chat sessions for a module/source via refers_to edges
SELECT * FROM (
    SELECT <- chat_session AS chat_session FROM refers_to WHERE out = $id
    FETCH chat_session
) ORDER BY chat_session.updated DESC

-- Get courses for a user via course_membership edges
SELECT out AS course FROM course_membership WHERE in = $user_id FETCH course
```

### Bulk embedding insert

```python
await repo_insert("source_embedding", [
    {"source": ensure_record_id(source_id), "content": chunk,
     "embedding": vector, "order": idx}
    for idx, (chunk, vector) in enumerate(zip(chunks, embeddings))
])
```

---

## Quirks & Gotchas

- **No connection pooling**: Each `repo_*` opens/closes a connection. Fine for HTTP requests, inefficient for bulk operations
- **Hard-coded migration list**: New migrations require a code change in `AsyncMigrationManager.__init__()` — no auto-discovery
- **Migration 18 exists but isn't registered**: Will not run until manually added to code
- **Timestamp overwrite**: `repo_create()` always sets new timestamps — can't preserve original `created` time on reimport
- **RecordID format juggling**: `repo_update()` accepts `table:id` or full RecordID; `ensure_record_id()` normalizes
- **ISO date parsing in repo_update()**: Parses string `created` fields to datetime objects before sending to DB
- **Transaction conflicts**: `RuntimeError` from SurrealDB transaction conflicts logged at DEBUG level (prevents log spam during concurrent writes)
- **OMIT for performance**: Module's `get_sources()` and `get_notes()` omit large fields (`full_text`, `content`, `embedding`). Fetch individually for full content
- **No automatic cascade**: Only `Source.delete()` cascades manually (deletes file, embeddings, insights). Other relationships require manual cleanup

## Key Dependencies

- `surrealdb`: `AsyncSurreal` client, `RecordID` type
- `loguru`: Logging (debug/error/success levels)
- `os`, `datetime`, `contextlib`: Stdlib for env vars, timestamps, async context manager

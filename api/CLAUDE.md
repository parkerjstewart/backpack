# API Module

FastAPI REST backend for Backpack. Exposes endpoints for courses, modules, sources, tutoring, chat, search, podcasts, and user management.

## Architecture

**Three layers:**
1. **Routers** (`routers/`): HTTP endpoints — parse requests, call domain models or services, return responses
2. **Services** (`*_service.py`): Business logic for complex operations (podcast generation, context building, command jobs)
3. **Models** (`models.py`): Pydantic request/response schemas

**Important:** Routers frequently call domain models directly (e.g., `Source.get()`, `Module.get()`, `ChatSession.get()`) rather than going through services. Services are used when there's meaningful orchestration logic beyond simple CRUD.

## Startup Flow (main.py)

1. Load `.env` environment variables
2. Create FastAPI app with lifespan handler
3. Lifespan startup: run `AsyncMigrationManager` for database schema migrations (fails fast if migrations fail)
4. Register middleware: `UserAuthMiddleware` → `CORSMiddleware`
5. Include all 27 routers with `/api` prefix

**Auth-excluded paths:** `/`, `/health`, `/docs`, `/openapi.json`, `/redoc`, `/api/auth/status`, `/api/config`, `/api/users/login`, `/api/users/register`, `/api/users/avatars/*`

## Authentication (auth.py)

`UserAuthMiddleware` validates `Authorization: Bearer user:xxx` format. Minimal validation — checks format, not credentials. Respects OPTIONS preflight.

**Authorization helpers** (`routers/authz.py`):
- `require_authenticated_user_id()` — extracts user ID from Authorization header
- `require_teaching_role(user_id, course_id)` — checks user has teaching role in course

Used in modules, courses, and invitations routers for write operations.

## Router Map

### Content Management
| Router | Prefix | Key Endpoints |
|--------|--------|---------------|
| `modules.py` | `/api/modules` | CRUD modules, add/remove sources, generate overview + learning goals |
| `sources.py` | `/api/sources` | CRUD sources (multipart upload, link, text), async/sync processing, retry, batch delete, download, insights |
| `notes.py` | `/api/notes` | CRUD notes (human or AI type), auto-generates title for AI notes |
| `insights.py` | `/api/insights` | Get/delete insights, save insight as note |
| `transformations.py` | `/api/transformations` | CRUD transformations, execute on text, get/set default prompt |

### AI & Chat
| Router | Prefix | Key Endpoints |
|--------|--------|---------------|
| `chat.py` | `/api/chat` | Sessions CRUD, execute message (sync), build context |
| `source_chat.py` | `/api/sources/{id}/chat` | Source-scoped chat sessions, send message (**streaming SSE**) |
| `search.py` | `/api/search` | Text/vector search, ask with streaming or non-streaming |
| `tutor.py` | `/api/tutor` | Create session, respond (**streaming SSE**), get trajectory + summary |

### Users & Courses
| Router | Prefix | Key Endpoints |
|--------|--------|---------------|
| `users.py` | `/api/users` | Login, register, profile CRUD, avatar upload/download |
| `courses.py` | `/api/courses` | CRUD courses, list/add members, student mastery data |
| `invitations.py` | `/api/invitations` | Create invitation, get by token, accept |

### Infrastructure
| Router | Prefix | Key Endpoints |
|--------|--------|---------------|
| `auth.py` | `/api/auth` | Auth status check |
| `commands.py` | `/api/commands/jobs` | Submit/get/list/cancel background jobs, debug registry |
| `config.py` | `/api/config` | Version info, update check, database health |
| `models.py` | `/api/models` | Provider availability (scans env vars for API keys) |
| `settings.py` | `/api/settings` | App settings (processing engine, embedding config, etc.) |
| `embedding.py` | `/api/embedding` | Embed individual items |
| `embedding_rebuild.py` | `/api/embeddings/rebuild` | Rebuild all embeddings, check progress |
| `podcasts.py` | `/api/podcasts` | Submit podcast generation job, get/list episodes |
| `episode_profiles.py` | `/api/episode-profiles` | CRUD episode profiles |
| `speaker_profiles.py` | `/api/speaker-profiles` | CRUD speaker profiles |

## Key Patterns

### 1. Async vs Sync Source Processing
Sources can be processed either way. Async returns immediately with a `command_id`:
```
Async: Create source → add to modules → submit command job → return command_id
Sync:  Create source → add to modules → execute command → return populated source
```
Frontend polls `GET /sources/{id}/status` for async progress.

### 2. Streaming Responses (SSE)
Used in source_chat, search/ask, and tutor endpoints:
- Async generator yields `f"data: {json.dumps(event)}\n\n"`
- Returns `StreamingResponse(generator, media_type="text/plain")`
- Events vary by endpoint (e.g., `user_message`, `ai_message`, `strategy`, `answer`, `complete`)

### 3. LangGraph Integration
Each workflow is invoked differently:
- **Chat**: `chat_graph.invoke()` with thread_id config — synchronous, returns updated messages
- **Ask**: `ask_graph.astream()` — async streaming chunks (strategy → answer → final_answer)
- **Source chat**: `source_chat_graph.invoke()` — synchronous, result streamed to client
- **Tutor**: `tutor_graph` with interrupts — pauses for student input, resumed on next API call
- **Modules**: `module_generation_graph.ainvoke()` — generates overview + learning goals
- **Transformations**: `transformation_graph.ainvoke()` — runs transformation on text

### 4. Context Building
Configurable inclusion of sources and notes for AI calls:
- Levels: `"insights"`, `"full content"`, `"not in"`
- Token counting via `backpack.utils.token_count()` (fallback: len/4)
- Default: all sources/notes with short context
- Shared between chat and module context endpoints

### 5. Model Override Cascade
For chat: `request.model_override > session.model_override > default model`

### 6. Background Jobs via surreal-commands
- `CommandService.submit_command_job()` queues work
- `GET /commands/jobs/{job_id}` polls status
- Used for: source processing, podcast generation, embedding rebuilds
- Fire-and-forget — no blocking

### 7. File Upload Handling
Sources router uses `Depends(parse_source_form_data)` for multipart forms:
- Generates unique filenames (appends counter on collision)
- Cleans up files on error
- Validates paths for downloads

### 8. Multi-Module Sources
`SourceCreate` accepts `modules` (list) or deprecated `module_id` (single). Validator normalizes to array. Sources relate to modules via `source.add_to_module()`.

## Database Query Patterns

**SurrealDB relationships used in routers:**
- `reference`: source ↔ module
- `refers_to`: chat_session ↔ source or module
- `artifact`: module ↔ note

**ID handling:** Routers accept IDs with or without prefix (e.g., `source:abc` or just `abc`).

**FETCH pattern:** Queries use `FETCH command` to resolve command references inline for status.

## Services

| Service | Purpose |
|---------|---------|
| `chat_service.py` | HTTP client wrapper for chat endpoints (httpx, 600s read timeout) |
| `sources_service.py` | Source operations with `SourceWithMetadata` and `SourceProcessingResult` wrappers |
| `notes_service.py` | Note CRUD, converts API responses to domain objects |
| `podcast_service.py` | Validates profiles, submits generation jobs, queries status |
| `transformations_service.py` | Transformation CRUD via API client |
| `command_service.py` | Generic job submission/status via surreal-commands |
| `context_service.py` | Module context building |
| `episode_profiles_service.py` | Episode profile CRUD |
| `email_service.py` | Invitation emails |
| `module_service.py` | Module operations |

**client.py**: `APIClient` class using httpx. Timeout configurable via `API_CLIENT_TIMEOUT` env var (default 300s, bounds 30-3600s). Has methods for all API resources.

## Models (models.py)

Pydantic schemas organized by feature:
- **Modules**: ModuleCreate, ModuleUpdate, ModuleResponse (includes source_count, note_count)
- **Learning Goals**: LearningGoalCreate/Update/Response (auto-assigns order)
- **Sources**: SourceCreate/Update/Response (multi-module, async processing, Asset model)
- **Notes**: NoteCreate/Update/Response (types: "human" or "ai")
- **Search**: SearchRequest/Response, AskRequest/Response
- **Context**: ContextConfig, ContextRequest/Response (token counting)
- **Insights**: SourceInsightResponse, CreateSourceInsightRequest, SaveAsNoteRequest
- **Users/Courses**: UserLoginRequest, CourseCreate/Update, CourseMemberResponse
- **Invitations**: CreateInvitationRequest, InvitationResponse
- **Transformations**: TransformationCreate/Update/Response, Execute
- **Embedding**: EmbedRequest/Response, RebuildRequest/Response

## Quirks & Gotchas

- **Migrations auto-run on every startup** — no manual migration steps needed
- **CORS allows all origins** — must restrict for production
- **No pagination on some endpoints** — notes and modules list endpoints return all results
- **Chat graph is synchronous** — `chat_graph.invoke()` blocks until LLM responds (can be slow)
- **Tutor uses graph interrupts** — session state persists across requests via SqliteSaver, graph pauses at interrupt points
- **Source processing can be sync or async** — async is preferred for large files
- **File cleanup on error** — uploaded files are deleted if processing fails
- **Streaming has no server-side timeout** — SSE streams run until completion or client disconnect
- **Session thread_id = session ID** — LangGraph thread_id is the SurrealDB session record ID directly

## How to Add a New Endpoint

1. Create router in `routers/feature.py` with `router = APIRouter()`
2. Add request/response schemas to `models.py`
3. Create service in `feature_service.py` if complex orchestration is needed (skip for simple CRUD)
4. Register in `main.py`: `app.include_router(routers.feature.router, prefix="/api", tags=["feature"])`
5. Add auth exclusions in `main.py` if endpoint should be public
6. Test at http://localhost:5055/docs

# Backpack - Root CLAUDE.md

This file provides architectural guidance for contributors working on Backpack at the project level.

## Project Overview

**Backpack** is an AI-powered learning platform built on top of [Open Notebook](https://github.com/lfnovo/open-notebook). It transforms a privacy-focused research assistant into a full educational platform where students engage in Socratic tutoring sessions grounded in course materials, and instructors manage courses, modules, and learning goals with visibility into student comprehension.

**Key Values**: Intelligent tutoring, structured learning goals, multi-provider AI, privacy-first, self-hosted.

---

## Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Frontend (React/Next.js)                    │
│              frontend/ @ port 3000                       │
├─────────────────────────────────────────────────────────┤
│ - Courses, modules, sources, tutor, chat, search UI     │
│ - Zustand state management, TanStack Query (React Query)│
│ - Shadcn/ui component library with Tailwind CSS         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP REST
┌────────────────────────▼────────────────────────────────┐
│              API (FastAPI)                              │
│              api/ @ port 5055                           │
├─────────────────────────────────────────────────────────┤
│ - REST endpoints for courses, modules, tutor, chat      │
│ - LangGraph workflow orchestration                      │
│ - Job queue for async operations (embeddings, podcasts) │
│ - Multi-provider AI provisioning via Esperanto          │
└────────────────────────┬────────────────────────────────┘
                         │ SurrealQL
┌────────────────────────▼────────────────────────────────┐
│         Database (SurrealDB)                            │
│         Graph database @ port 8000                      │
├─────────────────────────────────────────────────────────┤
│ - Records: Course, Module, LearningGoal, Source, etc.   │
│ - Relationships: source-to-module, goal-to-module       │
│ - Vector embeddings for semantic search                 │
└─────────────────────────────────────────────────────────┘
```

---

## Useful Sources

User documentation is at @docs/

---

## Tech Stack

### Frontend (`frontend/`)
- **Framework**: Next.js 16 (React 19)
- **Language**: TypeScript
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Styling**: Tailwind CSS + Shadcn/ui
- **Build Tool**: Webpack (via Next.js)

### API Backend (`api/` + `backpack/`)
- **Framework**: FastAPI 0.104+
- **Language**: Python 3.11+
- **Workflows**: LangGraph state machines
- **Database**: SurrealDB async driver
- **AI Providers**: Esperanto library (8+ providers: OpenAI, Anthropic, Google, Groq, Ollama, Mistral, DeepSeek, xAI)
- **Job Queue**: Surreal-Commands for async jobs (embeddings, podcasts)
- **Logging**: Loguru
- **Validation**: Pydantic v2
- **Testing**: Pytest

### Database
- **SurrealDB**: Graph database with built-in embedding storage and vector search
- **Schema Migrations**: Automatic on API startup via AsyncMigrationManager

### Additional Services
- **Content Processing**: content-core library (file/URL extraction)
- **Prompts**: AI-Prompter with Jinja2 templating
- **Podcast Generation**: podcast-creator library
- **Embeddings**: Multi-provider via Esperanto

---

## Architecture Highlights

### 1. Async-First Design
- All database queries, graph invocations, and API calls are async (await)
- SurrealDB async driver with connection pooling
- FastAPI handles concurrent requests efficiently

### 2. LangGraph Workflows
Located in `backpack/graphs/`:
- **source.py**: Content ingestion (extract → embed → save)
- **chat.py**: Conversational agent with message history
- **source_chat.py**: Source-focused conversations
- **ask.py**: Search + synthesis (retrieve relevant sources → LLM)
- **transformation.py**: Custom transformations on sources
- **tutor.py**: Socratic tutoring with interrupt-based dialogue
- **tutor_models.py**: Pydantic models for tutoring state
- **module.py**: Module-level workflows (overview generation)
- **prompt.py**: Prompt construction utilities
- **tools.py**: Shared tool definitions
- All use `provision_langchain_model()` for smart model selection

### 3. Socratic Tutoring System
The flagship feature — an interrupt-based LangGraph workflow:
1. Initialize session, load module context and learning goals
2. Generate targeted questions from source material
3. Pause (interrupt) and wait for student response
4. Evaluate understanding, update trajectory
5. Provide Socratic follow-up or advance to next goal
6. Generate session summary with progress statistics
- State persisted via SqliteSaver checkpointing
- Sessions are stateful across API requests

### 4. Multi-Provider AI
- **Esperanto library**: Unified interface to 8+ AI providers
- **ModelConfig**: Environment-based configuration for default models (`provider/model-name` format)
- **ModelManager**: Factory pattern with fallback logic
- **Smart selection**: Detects large contexts (>105k tokens), auto-upgrades to large_context_model

### 5. Database Schema
- **Automatic migrations**: AsyncMigrationManager runs on API startup
- **SurrealDB graph model**: Records with relationships and embeddings
- **Vector search**: Built-in semantic search across all content
- **Transactions**: Repo functions handle ACID operations

### 6. Authentication
- **Current**: Bearer token middleware (`UserAuthMiddleware` in `api/auth.py`)
- Validates `Bearer user:xxx` format from Authorization header

---

## Domain Model Hierarchy

The primary organizational structure:

```
Course
  └── Module
        ├── LearningGoal (competencies + takeaways)
        ├── Source (uploaded content)
        │     ├── SourceInsight
        │     └── SourceEmbedding
        └── Note
```

Additional models: `User`, `CourseMembership`, `Invitation`, `ChatSession`, `Asset`, `Transformation`, `ContentSettings`

---

## Important Quirks & Gotchas

### API Startup
- **Migrations run automatically** on startup; check logs for errors
- **Must start API before UI**: UI depends on API for all data
- **SurrealDB must be running**: API fails without database connection

### Frontend-Backend Communication
- **Base API URL**: Configured in `.env.local` (default: http://localhost:5055)
- **CORS enabled**: Configured in `api/main.py` (allow all origins in dev)

### LangGraph Workflows
- **Blocking operations**: Chat/tutor workflows may take time; no timeout
- **State persistence**: Uses SQLite checkpoint storage in `/data/sqlite-db/`
- **Model fallback**: If primary model fails, falls back to cheaper/smaller model
- **Tutor interrupts**: The tutor graph pauses execution at interrupt points, waiting for student input via subsequent API calls

### Background Commands
- **Location**: `commands/` directory at project root
- **Handlers**: `embedding_commands.py`, `source_commands.py`, `podcast_commands.py`
- **Pattern**: Fire-and-forget with job tracking via surreal-commands
- **Track status**: Use `/commands/{command_id}` endpoint to poll

### Content Processing
- **File extraction**: Uses content-core library; supports 50+ file types
- **URL handling**: Extracts text + metadata from web pages

---

## Component References

See dedicated CLAUDE.md files for detailed guidance:

- **[frontend/src/CLAUDE.md](frontend/src/CLAUDE.md)**: React/Next.js architecture, state management, API integration
- **[api/CLAUDE.md](api/CLAUDE.md)**: FastAPI structure, service pattern, endpoint development
- **[backpack/CLAUDE.md](backpack/CLAUDE.md)**: Backend core, domain models, LangGraph workflows, AI provisioning
- **[backpack/domain/CLAUDE.md](backpack/domain/CLAUDE.md)**: Data models, repository pattern, search functions
- **[backpack/ai/CLAUDE.md](backpack/ai/CLAUDE.md)**: ModelManager, AI provider integration, Esperanto usage
- **[backpack/graphs/CLAUDE.md](backpack/graphs/CLAUDE.md)**: LangGraph workflow design, state machines
- **[backpack/database/CLAUDE.md](backpack/database/CLAUDE.md)**: SurrealDB operations, migrations, async patterns
- **[commands/CLAUDE.md](commands/CLAUDE.md)**: Background command handlers

---

## Documentation Map

- **[README.md](README.md)**: Project overview, features, quick start
- **[README.dev.md](README.dev.md)**: Developer guide, workflows, Makefile commands
- **[docs/index.md](docs/index.md)**: Complete user & deployment documentation
- **[CONFIGURATION.md](CONFIGURATION.md)**: Redirects to docs/5-CONFIGURATION/
- **[CONTRIBUTING.md](CONTRIBUTING.md)**: Redirects to docs/7-DEVELOPMENT/contributing.md

---

## Testing Strategy

- **Unit tests**: `tests/test_domain.py`, `tests/test_models_api.py`
- **Graph tests**: `tests/test_graphs.py` (workflow integration)
- **Utils tests**: `tests/test_utils.py`, `tests/test_chunking.py`, `tests/test_embedding.py`
- **Run all**: `uv run pytest tests/`
- **Coverage**: Check with `pytest --cov`

---

## Common Tasks

### Add a New API Endpoint
1. Create router in `api/routers/feature.py`
2. Create service in `api/feature_service.py`
3. Define schemas in `api/models.py`
4. Register router in `api/main.py`
5. Test via http://localhost:5055/docs

### Add a New LangGraph Workflow
1. Create `backpack/graphs/workflow_name.py`
2. Define StateDict and node functions
3. Build graph with `.add_node()` / `.add_edge()`
4. Invoke in service: `graph.ainvoke({"input": ...}, config={"..."})`
5. Test with sample data in `tests/`

### Add Database Migration
1. Create `migrations/XXX_description.surql`
2. Write SurrealQL schema changes
3. Create `migrations/XXX_description_down.surql` (optional rollback)
4. API auto-detects on startup; migration runs if newer than recorded version

---

## License

MIT (see LICENSE)

---

**Last Updated**: February 2026 | **Project Version**: 1.6.0

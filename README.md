<a id="readme-top"></a>

<br />
<div align="center">
  <h1>Backpack</h1>
  <p><strong>An AI-powered learning platform that transforms how students study and how instructors support them.</strong></p>
  <p>Stanford CS224G &mdash; Winter 2026</p>
</div>

---

## About

Lectures end, but learning shouldn't. Too often, students leave the classroom with fragmented understanding and no clear path to mastery. Meanwhile, instructors have limited visibility into where their students actually struggle.

**Backpack** bridges that gap. It's an intelligent tutoring platform where students engage in Socratic dialogue with an AI tutor grounded in their course materials, and instructors gain real-time insight into student comprehension across every learning objective.

Built on top of [Open Notebook](https://github.com/lfnovo/open-notebook), Backpack extends a privacy-focused research assistant into a full educational platform with structured courses, modules, learning goals, and an adaptive tutoring system.

---

## Key Features

### For Students
- **Socratic Tutoring** - AI-driven tutoring sessions that ask questions, evaluate understanding, and guide students toward mastery rather than just giving answers
- **Goal-Based Learning** - Each module defines clear learning goals (core competencies and key takeaways) so students always know what they're working toward
- **Session Summaries** - After each tutoring session, students receive a summary of what they covered, where they excelled, and what needs more work
- **Multi-Modal Sources** - Upload lecture slides, readings, videos, and web pages, all searchable and available as context for tutoring

### For Instructors
- **Course & Module Management** - Organize content into courses and modules with structured learning objectives
- **Learning Goal Tracking** - Define competencies and takeaways per module, and monitor student progress against them
- **Understanding Visibility** - See how students are progressing through learning goals and where they're struggling
- **Role-Based Access** - Instructor and student roles with appropriate permissions and views

### Platform Capabilities
- **Multi-Provider AI** - Supports OpenAI, Anthropic, Google, Groq, Ollama, Mistral, DeepSeek, xAI, and more via the [Esperanto](https://github.com/lfnovo/esperanto) library
- **Semantic Search** - Full-text and vector search across all uploaded content
- **Context-Aware Chat** - AI conversations grounded in course materials with proper citations
- **Privacy-First** - Fully self-hosted; your data never leaves your infrastructure

---

## Architecture

```
Frontend (Next.js / React 19)       ← HTTP REST →       API (FastAPI / Python)       ← SurrealQL →       Database (SurrealDB)
         port 3000                                              port 5055                                        port 8000
```

- **Frontend**: Next.js 16, TypeScript, Zustand, TanStack Query, Shadcn/ui + Tailwind CSS
- **Backend**: FastAPI, LangGraph workflow orchestration, async-first design
- **Database**: SurrealDB graph database with built-in vector embeddings
- **AI Orchestration**: LangGraph state machines for tutoring, chat, search synthesis, and content processing

### Tutoring Workflow

The Socratic tutor is implemented as a LangGraph state machine with interrupt-based dialogue:

1. **Initialize** - Load module context and select learning goals
2. **Generate Question** - Create a targeted question from the source material
3. **Await Response** - Pause execution and wait for student input
4. **Evaluate Understanding** - Assess the response and update the understanding trajectory
5. **Guide or Advance** - Provide Socratic follow-up or move to the next goal
6. **Summarize** - Generate a session summary with progress statistics

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (for SurrealDB)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- An AI provider API key (OpenAI, Anthropic, Google, etc.) or a local model via Ollama

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/parkerjstewart/backpack.git
cd backpack

# 2. Configure environment
cp .env.example .env
cp .env.example docker.env
# Edit .env and add your API key(s)

# 3. Install dependencies
uv sync
cd frontend && npm install && cd ..

# 4. Start all services (DB + API + Worker + Frontend)
make start-all
```

Access the app at **http://localhost:3000**

For development workflows, see [README.dev.md](README.dev.md).

---

## Team

| | Name | GitHub |
|---|---|---|
| | Parker Stewart | [@parkerjstewart](https://github.com/parkerjstewart) |
| | Ryan Lian | [@ryanl61703](https://github.com/ryanl61703) |
| | Kenneth Ma | [@kenma25](https://github.com/kenma25) |
| | Brent Ju | [@brentju](https://github.com/brentju) |

---

## Acknowledgments

Backpack is built on top of [Open Notebook](https://github.com/lfnovo/open-notebook) by [Luis Novo](https://github.com/lfnovo). We're grateful for the strong foundation it provided: multi-provider AI support, content ingestion, semantic search, and the SurrealDB-backed architecture that made our educational extensions possible.

---

## License

MIT. See [LICENSE](LICENSE) for details.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

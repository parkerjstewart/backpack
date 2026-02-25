# Graphs Module

LangGraph-based workflow orchestration for content processing, chat interactions, AI-powered transformations, and tutoring.

## Graph Inventory

| Graph | File | Nodes | Checkpointed | Async | Purpose |
|-------|------|-------|--------------|-------|---------|
| Chat | `chat.py` | 1 | Yes (SqliteSaver) | No (sync node) | Conversational agent with module context |
| Source Chat | `source_chat.py` | 1 | Yes (SqliteSaver) | No (sync node) | Source-focused chat with insights injection |
| Ask | `ask.py` | 3 | No | Yes | Multi-search strategy with fan-out synthesis |
| Source | `source.py` | 4 | No | Yes | Content ingestion pipeline (extract → save → transform) |
| Transformation | `transformation.py` | 1 | No | No (sync node) | Recursive chunked transformation execution |
| Module | `module.py` | 4 | No | Yes | Generate module name, overview, and learning goals |
| Prompt | `prompt.py` | 1 | No | Yes | Generic single-shot prompt chain |
| Tutor | `tutor.py` | 9 | Yes (SqliteSaver) | No (sync node) | Socratic tutoring with interrupt-based dialogue |

## Graph Details

### `chat.py` — Conversational Agent

Single-node graph with SqliteSaver checkpointing for message history persistence.

**State** (`ThreadState`):
- `messages`: Annotated list with `add_messages` reducer
- `module`: Optional `Module` for context injection
- `context`: Optional pre-built context string
- `context_config`: Optional dict for context building
- `model_override`: Optional model ID string

**Flow**: `call_model_with_messages` → END

**Prompt**: `chat/system.jinja` rendered with full state

---

### `source_chat.py` — Source-Focused Chat

Single-node graph with SqliteSaver checkpointing. Uses `ContextBuilder(source_id=..., max_tokens=50000)` to build source context with insights.

**State** (`SourceChatState`):
- `messages`, `source_id`, `source`, `insights`, `context`, `model_override`
- `context_indicators`: Dict tracking which insights/content were referenced

**Flow**: `call_model_with_source_context` → END

**Prompt**: `source_chat/system.jinja` rendered with source context

---

### `ask.py` — Multi-Search Strategy Agent

Multi-node async graph using `Send()` fan-out for parallel search execution.

**State** (`AskState` / `SubGraphState`):
- Input: `question`, `module_id`
- Intermediate: `term`, `instructions`, `results`, `ids`
- Output: `answer`

**Flow**:
1. `entry` — LLM generates `Strategy` (list of `Search` terms + instructions) via `PydanticOutputParser`
2. `search` (fan-out via `Send()`) — Each search term runs `vector_search()`, then an LLM extracts relevant info
3. `synthesize` — Combines all search results into final answer

**Models**: Uses 3 configurable models:
- `entry_model_id` — Strategy generation
- `search_model_id` — Per-search extraction
- `synthesize_model_id` — Final synthesis

**Prompt templates**: `ask/entry.jinja`, `ask/search.jinja`, `ask/synthesize.jinja`

---

### `source.py` — Content Ingestion Pipeline

Multi-node async graph for extracting, saving, and transforming source content.

**State** (`SourceState`):
- `content_state`: `ProcessSourceState` from content-core
- `apply_transformations`: List of `Transformation` objects
- `source_id`, `module_ids`, `source`, `embed`
- `transformation`: Annotated list with `operator.add` reducer

**Flow**:
1. `content_process` — Extract content via `content_core.extract_content()` using models from `ModelManager`
2. `save_source` — Save extracted content to database, optionally trigger `source.vectorize()` (fire-and-forget embedding)
3. `trigger_transformations` — Fan-out via `Send()` for each transformation
4. `transform_content` — Invoke transformation graph for each

**Note**: Uses `backpack.ai.models.ModelManager` directly (not `provision_langchain_model`) for content extraction model selection.

---

### `transformation.py` — Recursive Transformation Executor

Single-node graph with recursive chunking for large content.

**Constants**:
- `MAX_CHUNK_TOKENS = 90_000` (leaves room for system prompt ~2k + output ~5k)
- `CHUNK_OVERLAP_TOKENS = 200`
- `MAX_RECURSION_DEPTH = 3`

**Flow**: `transform_source` → END

**Chunking strategy**: If source text exceeds `MAX_CHUNK_TOKENS`, splits into chunks via `RecursiveCharacterTextSplitter` (using `token_count` as length function), transforms each chunk with `asyncio.gather()` for parallelism, then combines results. Falls back to `source.full_text` if `input_text` not provided.

**Prompts**: Uses transformation's own `prompt_template` field with `ai_prompter.Prompter`, rendered with source metadata (title, URL).

---

### `module.py` — Module Content Generation

Multi-node async graph that generates module name, overview, and learning goals from source materials.

**State** (`ModuleGenerationState`):
- Input: `source_ids`, `module_id`, `name`, `description`, `model_id`
- Built: `sources_context`, `notes_context`
- Output: `generated_name`, `overview`, `learning_goals`

**Flow**:
1. `build_context` — Loads sources and notes, builds context within `MAX_CONTEXT_TOKENS` (200k) budget
2. `generate_name` — LLM generates short title via `GeneratedName` structured output
3. `generate_overview` / `generate_learning_goals` — **Run in parallel** via conditional edges, using `GeneratedOverview` and `GeneratedLearningGoals` structured output

**Context budget strategy** (`build_sources_context`):
- If total source text ≤ 200k tokens → use full text
- If over budget → fall back to dense summaries (from existing insights, or generated on-the-fly via transformation graph)

**Structured output models**: `GeneratedName`, `GeneratedOverview`, `GeneratedLearningGoal`, `GeneratedLearningGoals`

**Prompt templates**: `module/generate_name.jinja`, `module/overview.jinja`, `module/learning_goals.jinja`

---

### `prompt.py` — Generic Prompt Chain

Minimal single-node async graph for arbitrary prompt-based LLM calls.

**State** (`PatternChainState`): `prompt_template`, `data`, `output`

**Flow**: `run_prompt` → END

---

### `tutor.py` — Socratic Tutoring Agent

The flagship workflow — a 9-node interrupt-based LangGraph graph implementing Socratic tutoring.

**State** (`TutorState`): TypedDict with plain dicts (not Pydantic models — models are used for parsing/validation only):
- Session: `module_id`, `session_id`, `module_context`, `learning_goals`
- Progress: `current_goal_index`, `current_question_index`, `goal_progress`, `understanding_trajectory`
- Dialogue: `messages`, `current_questions`, `last_exchange`
- Control: `session_complete`, `session_summary`

**Workflow Nodes**:
1. `initialize_session` — Load module, goals, build context via `ContextBuilder`
2. `select_next_goal` — Choose next goal (by order; TODO: embedding similarity)
3. `generate_starter_questions` — Create 2-5 questions per goal via LLM → `GeneratedQuestions`
4. `present_question` — Present question, `interrupt()` for student response
5. `evaluate_and_route` — Score response → `EvaluationResult`, return `Command(goto=...)` for routing
6. `socratic_response` — Generate Socratic reply, `interrupt()` for next response
7. `advance_to_next_question` — Move to next question within goal
8. `mark_goal_complete` — Mark goal done, check for more goals
9. `generate_summary` — Create `SessionSummary` with statistics and narrative

**Interrupt pattern**: Uses `interrupt()` to pause execution; API must handle `__interrupt__` in response and resume with `Command(resume=...)`. Uses `Command(goto=...)` for dynamic routing after evaluation.

**Prompt templates** (`prompts/tutor/`):
- `system.jinja` — Socratic tutor persona
- `generate_questions.jinja` — Create starter questions
- `evaluate_understanding.jinja` — Score student responses
- `socratic_response.jinja` — Generate Socratic replies
- `select_next_goal.jinja` — Topic-based goal selection
- `summary.jinja` — Session summary generation

**Models** (`tutor_models.py`):
- `StarterQuestion` — Question with index, concepts, depth, resolved status
- `GeneratedQuestions` — LLM response for question generation
- `EvaluationResult` — Understanding score (0-10) with misconceptions/breakthroughs
- `GoalSelection` — LLM response for goal selection
- `UnderstandingPoint` — Single trajectory point (per-exchange evaluation)
- `GoalProgress` — Progress tracking per learning goal
- `SessionSummary` — Complete session statistics and narrative

### `tools.py` — Shared Tool Library

Single tool: `get_current_timestamp()` — returns current datetime as ISO string. Used as a LangChain `@tool`.

---

## Prompt Template Reference

All templates in `prompts/` directory, rendered via `ai_prompter.Prompter`:

| Template Path | Used By | Purpose |
|---------------|---------|---------|
| `chat/system.jinja` | chat.py | Chat system prompt with module context |
| `source_chat/system.jinja` | source_chat.py | Source-focused chat with insights context |
| `ask/entry.jinja` | ask.py | Generate search strategy |
| `ask/search.jinja` | ask.py | Extract info from search results |
| `ask/synthesize.jinja` | ask.py | Combine results into answer |
| `tutor/system.jinja` | tutor.py | Socratic tutor persona |
| `tutor/generate_questions.jinja` | tutor.py | Create starter questions |
| `tutor/evaluate_understanding.jinja` | tutor.py | Score student responses |
| `tutor/socratic_response.jinja` | tutor.py | Generate Socratic replies |
| `tutor/select_next_goal.jinja` | tutor.py | Topic-based goal selection |
| `tutor/summary.jinja` | tutor.py | Session summary generation |
| `module/generate_name.jinja` | module.py | Generate module title |
| `module/overview.jinja` | module.py | Generate module overview |
| `module/learning_goals.jinja` | module.py | Generate learning goals |

Additional templates in `prompts/transformations/` are referenced by `Transformation` records (user-configurable).

---

## Important Patterns

### Async/Sync Bridging
`chat.py`, `source_chat.py`, and `tutor.py` define **sync** node functions but need to call async code (`provision_langchain_model()`, `ContextBuilder.build()`, database queries). They use `asyncio.new_event_loop()` + `loop.run_until_complete()` with `ThreadPoolExecutor` as a workaround. This is fragile if event loop state changes.

### Model Provisioning
- Most graphs: `provision_langchain_model(model_id)` from `backpack.ai.provision` (async factory with fallback)
- `source.py`: Uses `ModelManager` from `backpack.ai.models` directly for content extraction
- Model override cascade: `config["configurable"]["model_id"]` → `state["model_override"]` → default

### State Machines
Each graph compiles to a stateful runnable via `StateGraph.compile()`. Key patterns:
- `Send()` for fan-out parallelism (ask.py search, source.py transformations)
- `Command(goto=...)` for dynamic routing (tutor.py evaluation)
- `interrupt()` for human-in-the-loop pauses (tutor.py)
- Annotated lists with `add_messages` or `operator.add` reducers for accumulating state

### Checkpointing
`chat.py`, `source_chat.py`, and `tutor.py` use `SqliteSaver` for persistence:
- Checkpoint file path from `LANGGRAPH_CHECKPOINT_FILE` env var
- Connection shared across graphs via `sqlite3.connect()`
- Enables message history and session resumption

### Content Processing
- `clean_thinking_content()` is called on almost every LLM response to strip `<think>...</think>` tags
- `extract_json_from_response()` in tutor.py handles markdown code fences around JSON
- Structured output uses `PydanticOutputParser` (ask.py) or manual JSON parsing (tutor.py, module.py)

---

## Quirks & Edge Cases

- **source.py embedding is fire-and-forget**: `source.vectorize()` returns a job command ID; not awaited
- **transformation.py recursive chunking**: Large content is split, transformed in parallel via `asyncio.gather()`, then concatenated; up to 3 levels of recursion
- **ask.py hard-coded vector_search**: No fallback to text search despite commented code suggesting it was planned
- **module.py dense summary fallback**: When sources exceed 200k tokens, generates dense summaries on-the-fly via transformation graph if they don't already exist as insights
- **tutor.py stores dicts in state**: TypedDict state stores plain dicts, not Pydantic models; models used only for LLM response parsing/validation
- **source_chat.py context_indicators**: Tracks which insights/content sections were referenced in the conversation for UI highlighting

---

## Key Dependencies

- `langgraph`: StateGraph, Send, END, START, SqliteSaver, interrupt, Command
- `langchain_core`: Messages, PydanticOutputParser, RunnableConfig
- `ai_prompter`: Prompter for Jinja2 template rendering
- `content_core`: `extract_content()` for file/URL processing (source.py only)
- `backpack.ai.provision`: `provision_langchain_model()` (async factory with fallback logic)
- `backpack.ai.models`: `ModelManager` (used directly by source.py for extraction models)
- `backpack.domain.module`: Module, Source, LearningGoal, SourceInsight, vector_search
- `backpack.domain.transformation`: Transformation, DefaultPrompts
- `backpack.utils.context_builder`: ContextBuilder for assembling context within token limits
- `backpack.utils.token_utils`: token_count (used by transformation.py chunking, module.py budget)
- `backpack.utils`: clean_thinking_content (used by nearly all graphs)
- `loguru`: Logging

---

## Usage Examples

```python
# Chat with module context
config = {"configurable": {"thread_id": "chat-123", "model_id": "model:custom_id"}}
result = await chat_graph.ainvoke(
    {"messages": [HumanMessage(content="...")], "module": module_obj},
    config=config,
)

# Source processing (content → save → transform)
result = await source_graph.ainvoke({
    "content_state": process_source_state,
    "apply_transformations": [t1, t2],
    "source_id": "source:123",
    "module_ids": ["module:abc"],
    "embed": True,
})

# Ask (search + synthesize)
result = await ask_graph.ainvoke({
    "question": "What are the key themes?",
    "module_id": "module:abc",
})

# Module generation (name + overview + goals)
result = await module_graph.ainvoke({
    "source_ids": ["source:1", "source:2"],
    "module_id": "module:abc",
})

# Tutor session (interrupt-based)
from langgraph.types import Command

config = {"configurable": {"thread_id": "tutor-session-123"}}

# Start session — hits first interrupt at present_question
result = tutor_graph.invoke({"module_id": "module:abc"}, config=config)
interrupt_data = result["__interrupt__"][0].value
print(interrupt_data["message"])

# Resume with student response
result = tutor_graph.invoke(
    Command(resume="I think it works by..."),
    config=config,
)
```

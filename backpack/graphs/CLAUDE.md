# Graphs Module

LangGraph-based workflow orchestration for content processing, chat interactions, AI-powered transformations, and tutoring.

## Key Components

- **`chat.py`**: Conversational agent with message history, notebook context, and model override support
- **`source_chat.py`**: Source-focused chat with ContextBuilder for insights/content injection and context tracking
- **`ask.py`**: Multi-search strategy agent (generates search terms, retrieves results, synthesizes answers)
- **`source.py`**: Content ingestion pipeline (extract → save → transform with content-core)
- **`transformation.py`**: Single-node transformation executor with prompt templating via ai_prompter
- **`prompt.py`**: Generic pattern chain for arbitrary prompt-based LLM calls
- **`tools.py`**: Minimal tool library (currently just `get_current_timestamp()`)
- **`tutor.py`**: Socratic tutoring agent with interrupt-based dialogue, goal tracking, and understanding trajectory
- **`tutor_models.py`**: Pydantic models for tutor LLM response parsing and data structures

## Important Patterns

- **Async/sync bridging in graphs**: `chat.py`, `source_chat.py`, and `tutor.py` use `asyncio.new_event_loop()` workaround because LangGraph nodes are sync but `provision_langchain_model()` is async
- **State machines via StateGraph**: Each graph compiles to stateful runnable; conditional edges fan out work (ask.py, source.py do parallel transforms)
- **Prompt templating**: `ai_prompter.Prompter` with Jinja2 templates referenced by path ("chat/system", "ask/entry", "tutor/socratic_response", etc.)
- **Model provisioning via context**: Config dict passed to node via `RunnableConfig`; defaults fall back to state overrides
- **Checkpointing**: `chat.py`, `source_chat.py`, and `tutor.py` use SqliteSaver for message history (LangGraph's built-in persistence)
- **Content extraction**: `source.py` uses content-core library with provider/model from DefaultModels; URLs and files both supported
- **Interrupt-based dialogue**: `tutor.py` uses `interrupt()` to pause graph execution and wait for human input; resumed via `Command(resume=...)`
- **Command routing**: `tutor.py` uses `Command(goto=...)` for dynamic routing based on evaluation results

## Tutor Graph Details

The tutor graph (`tutor.py`) implements a Socratic tutoring workflow:

### Workflow Nodes
- `initialize_session`: Load module, goals, build context via ContextBuilder
- `select_next_goal`: Choose next goal (by order; TODO: embedding similarity)
- `generate_starter_questions`: Create 2-5 questions per goal via LLM
- `present_question`: Present question, `interrupt()` for student response
- `evaluate_and_route`: Score response, return `Command(goto=...)` for routing
- `socratic_response`: Generate Socratic reply, `interrupt()` for next response
- `advance_to_next_question`: Move to next question within goal
- `mark_goal_complete`: Mark goal done, check for more goals
- `generate_summary`: Create session summary with statistics and narrative

### Models (`tutor_models.py`)
- `StarterQuestion`: Question with index, concepts, depth, resolved status
- `GeneratedQuestions`: LLM response for question generation
- `EvaluationResult`: Understanding score with misconceptions/breakthroughs
- `GoalSelection`: LLM response for goal selection
- `UnderstandingPoint`: Single trajectory point (per-exchange evaluation)
- `GoalProgress`: Progress tracking per learning goal
- `SessionSummary`: Complete session statistics and narrative

### Prompts (`prompts/tutor/`)
- `system.jinja`: Socratic tutor persona
- `generate_questions.jinja`: Create starter questions
- `evaluate_understanding.jinja`: Score student responses
- `socratic_response.jinja`: Generate Socratic replies
- `select_next_goal.jinja`: Topic-based goal selection
- `summary.jinja`: Session summary generation

## Quirks & Edge Cases

- **Async loop gymnastics**: ThreadPoolExecutor workaround needed because LangGraph invokes sync nodes but we call async functions; fragile if event loop state changes
- **`clean_thinking_content()` ubiquitous**: Strips `<think>...</think>` tags from model responses (handles extended thinking models)
- **source_chat.py builds context twice**: ContextBuilder runs during node execution to fetch source/insights; rebuilds list from context_data (inefficient but safe)
- **source.py embedding is async**: `source.vectorize()` returns job command ID; not awaited (fire-and-forget)
- **transformation.py nullable source**: Accepts `input_text` or `source.full_text` (falls back to second if first missing)
- **ask.py hard-coded vector_search**: No fallback to text search despite commented code suggesting it was planned
- **SqliteSaver location**: Checkpoints stored in path from `LANGGRAPH_CHECKPOINT_FILE` env var; connection shared across graphs
- **tutor.py interrupt handling**: Uses `interrupt()` which pauses graph; API must handle `__interrupt__` in response and resume with `Command(resume=...)`
- **tutor.py stores dicts in state**: TypedDict state stores plain dicts, not Pydantic models; models used for parsing/validation only

## Key Dependencies

- `langgraph`: StateGraph, Send, END, START, SqliteSaver checkpoint persistence, interrupt, Command
- `langchain_core`: Messages, OutputParser, RunnableConfig
- `ai_prompter`: Prompter for Jinja2 template rendering
- `content_core`: `extract_content()` for file/URL processing
- `backpack.ai.provision`: `provision_langchain_model()` (async factory with fallback logic)
- `backpack.domain.module`: Domain models (Module, LearningGoal, Source, Note, SourceInsight, vector_search)
- `backpack.utils.context_builder`: ContextBuilder for assembling context within token limits
- `loguru`: Logging

## Usage Example

```python
# Invoke a graph with config override
config = {"configurable": {"model_id": "model:custom_id"}}
result = await chat_graph.ainvoke(
    {"messages": [HumanMessage(content="...")], "notebook": notebook},
    config=config
)

# Source processing (content → save → transform)
result = await source_graph.ainvoke({
    "content_state": {...},  # ProcessSourceState from content-core
    "apply_transformations": [t1, t2],
    "source_id": "source:123",
    "embed": True
})

# Tutor session (interrupt-based)
from langgraph.types import Command

# Start session - hits first interrupt
config = {"configurable": {"thread_id": "tutor-session-123"}}
result = tutor_graph.invoke({"module_id": "module:abc"}, config=config)

# Get interrupt data (first question)
interrupt_data = result["__interrupt__"][0].value
print(interrupt_data["message"])

# Resume with student response
result = tutor_graph.invoke(
    Command(resume="I think it works by..."),
    config=config
)
```

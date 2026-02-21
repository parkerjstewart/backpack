# Prompts Module

Jinja2 prompt templates for all AI workflows in Backpack. Loaded at runtime via `ai_prompter.Prompter`.

## Template Inventory

17 templates across 7 workflow directories:

| Directory | Templates | Used By | Purpose |
|-----------|-----------|---------|---------|
| `ask/` | 3 | `graphs/ask.py` | Multi-stage search synthesis |
| `chat/` | 1 | `graphs/chat.py` | General conversational agent |
| `source_chat/` | 1 | `graphs/source_chat.py` | Source-focused conversation |
| `module/` | 3 | `graphs/module.py` | Generate module name, overview, learning goals |
| `tutor/` | 6 | `graphs/tutor.py` | Socratic tutoring (questions, evaluation, responses) |
| `transformation/` | 1 | `graphs/transformation.py` | Merge chunked transformation results |
| `podcast/` | 2 | `podcast_creator` library (external) | Podcast outline and transcript generation |

---

## How Templates Are Loaded

```python
from ai_prompter import Prompter

# Basic rendering
prompt = Prompter(prompt_template="chat/system").render(data=state_dict)

# With PydanticOutputParser (auto-injects {{ format_instructions }})
parser = PydanticOutputParser(pydantic_object=Strategy)
prompt = Prompter(prompt_template="ask/entry", parser=parser).render(data=state_dict)
```

**Path syntax**: Forward slashes, no `.jinja` extension. `"ask/entry"` → `prompts/ask/entry.jinja`

**Variable injection**: All keys in `data=dict` become template variables. `data={"question": "..."}` → `{{ question }}` in template.

---

## Template Reference

### ask/ — Search Synthesis Pipeline

Three-stage chain: strategy → parallel search → synthesis.

#### `ask/entry.jinja`
**Variables**: `question`
**Parser**: `PydanticOutputParser(Strategy)` — auto-injects `{{ format_instructions }}`
**Output**: JSON with `reasoning` + list of `Search` objects (term + instructions)
**Node**: `call_model_with_messages`

#### `ask/query_process.jinja`
**Variables**: `question`, `term`, `instructions`, `results` (list of content items), `ids` (available IDs)
**Output**: Text sub-answer with `[document_id]` citations
**Node**: `process_search` (parallel via Send())

#### `ask/final_answer.jinja`
**Variables**: `question`, `strategy`, `answers` (concatenated sub-answers)
**Output**: Text with `[source:id]` / `[note:id]` / `[insight:id]` citations
**Node**: `write_final_answer`

**Citation pattern**: All three templates heavily emphasize "Do not make up document IDs" — repeated multiple times with examples. IDs must include type prefix (e.g., `[source:abc123]`).

---

### chat/ — Conversational Agent

#### `chat/system.jinja`
**Variables**: `notebook` (optional module context), `context` (optional user-selected context)
**Output**: System prompt text
**Node**: `call_model_with_messages`

Uses conditional blocks for optional context injection. Persona: "cognitive study assistant."

---

### source_chat/ — Source-Focused Chat

#### `source_chat/system.jinja`
**Variables**: `source` (dict: `id`, `title`, `topics`), `context` (optional source content/insights)
**Output**: System prompt text
**Node**: `call_model_with_source_context`

Uses `{{ source.topics | join(", ") }}` for list formatting. Persona: "specialized research assistant focused on a specific source."

---

### module/ — Module Content Generation

#### `module/name.jinja`
**Variables**: `sources` (list of dicts with `title`, `content`)
**Output**: Single title, under 5 words
**Node**: `generate_module_name`

#### `module/overview.jinja`
**Variables**: `name`, `description` (optional), `sources` (list), `notes` (list, optional — content truncated to 200 chars)
**Output**: 3–4 sentence summary (hard limit: 4 sentences)
**Node**: `generate_overview`

#### `module/learning_goals.jinja`
**Variables**: `name`, `description` (optional), `sources` (list), `notes` (list, optional)
**Output**: JSON with 3–5 learning goals, each with `description` (action verb), `takeaways`, `competencies`
**Node**: `generate_learning_goals`

---

### tutor/ — Socratic Tutoring System

6 templates powering the interrupt-based tutoring workflow.

#### `tutor/system.jinja`
**Variables**: `module_name` (optional), `current_goal` (dict: `description`, `mastery_criteria`)
**Output**: System prompt defining Socratic tutor persona
**Used as context** for all other tutor nodes

#### `tutor/generate_questions.jinja`
**Variables**: `goal` (dict: `description`, `mastery_criteria`), `module_name` (optional), `context_chunks` (list: `id`, `content`)
**Output**: JSON — `reasoning` + `questions` array (each: `question_text`, `target_concepts`, `expected_depth`)
**Node**: `generate_starter_questions`
**Parsing**: Manual via `extract_json_from_response()` (strips markdown code fences)

Expected depths: `"recall"`, `"understand"`, `"apply"`, `"analyze"` — questions progress in difficulty.

#### `tutor/evaluate_understanding.jinja`
**Variables**: `goal` (dict), `question` (dict: `question_text`, `target_concepts`, `expected_depth`), `student_response`, `context_chunks` (optional)
**Output**: JSON — `score` (0.0–1.0), `notes`, `misconceptions` (array), `breakthroughs` (array)
**Node**: `evaluate_and_route`
**Parsing**: Manual via `extract_json_from_response()`

Score thresholds: 0.7+ = resolved (can advance), <0.3 = significant misconceptions, 0.85+ = excellent.

#### `tutor/socratic_response.jinja`
**Variables**: `goal`, `current_question` (dict: `question_text`), `student_response`, `understanding_score` (float), `misconceptions` (list), `breakthroughs` (list), `context_chunks` (optional)
**Output**: Text — one paragraph max, ends with focused follow-up question
**Node**: `socratic_response`

Key rules: acknowledge what's RIGHT first, ask guiding questions (never give direct answers), cite materials as `[source_id]`.

#### `tutor/select_next_goal.jinja`
**Variables**: `completed_goals` (list), `remaining_goals` (list: `id`, `description`)
**Output**: JSON — `selected_goal_id`, `reasoning`
**Status**: **UNUSED** — exists on disk but `select_next_goal()` in tutor.py uses hardcoded order-based selection instead. TODO in code to implement embedding-based similarity.

#### `tutor/summary.jinja`
**Variables**: `module_name`, `summary` (dict with stats: `total_duration_seconds`, `goals_completed`, `total_goals`, `total_questions`, `total_exchanges`, `average_initial_understanding`, `average_final_understanding`, `understanding_improvement`, `goal_summaries`, `key_misconceptions`, `key_breakthroughs`)
**Output**: 2–3 paragraph narrative (positive tone, shown to student)
**Node**: `generate_summary`

Uses Jinja2 math: `{{ (value * 100) | round(1) }}%`, `{{ (seconds / 60) | round(1) }} minutes`.

---

### transformation/ — Chunked Content Merging

#### `transformation/merge.jinja`
**Variables**: `num_parts`, `title` (transformation name), `prompt` (original instructions)
**Output**: Consolidated text from multiple chunk results
**Used by**: `_build_merge_prompt()` in `graphs/transformation.py`

Called when source exceeds 90k tokens — chunks are transformed in parallel, then this template merges partial results into a unified output.

---

### podcast/ — Podcast Generation

**Note**: These templates are called by the external `podcast_creator` library, not directly by LangGraph graphs.

#### `podcast/outline.jinja`
**Variables**: `briefing`, `context` (string OR list — conditional handling), `speakers` (list: `name`, `backstory`, `personality`), `num_segments`, `format_instructions`
**Output**: JSON with `segments` array (each: `name`, `description`, `size`)

#### `podcast/transcript.jinja`
**Variables**: `briefing`, `context`, `speakers`, `outline`, `transcript` (existing so far), `is_final` (bool), `segment`, `speaker_names`, `turns` (min exchanges), `format_instructions`
**Output**: JSON with `transcript` array (each: `speaker`, `dialogue`)

Both include extended thinking support: reasoning in `<think>` tags, final JSON outside.

---

## Patterns for Writing New Templates

### Conditional Context Injection
```jinja
{% if context %}
# CONTEXT
{{ context }}
{% endif %}
```
`{% if var %}` is False for `None`, `""`, `0`, `[]`, `{}`. True for any non-empty value.

### List Iteration
```jinja
{% for source in sources %}
### {{ source.title or 'Untitled Source' }}
{{ source.content }}
{% endfor %}
```

### Structured JSON Output
For templates expecting JSON responses, two approaches exist:
1. **PydanticOutputParser**: Pass `parser=` to Prompter, template uses `{{ format_instructions }}`
2. **Manual extraction**: Template describes JSON format inline, code uses `extract_json_from_response()` to strip markdown fences

### Citation Format
All user-facing response templates use:
```
[document_id]  →  e.g., [source:abc123], [note:xyz789], [insight:pqr456]
```
Always include type prefix. Repeat "do not make up IDs" for LLM compliance.

---

## Adding a New Template

1. Create `prompts/workflow_name/template.jinja`
2. Use `{{ variable }}` for injection, `{% if %}` for optional sections, `{% for %}` for lists
3. Reference in graph code: `Prompter(prompt_template="workflow_name/template").render(data=state)`
4. If structured output: pass `parser=PydanticOutputParser(...)` to Prompter
5. Document variables and output format in this file
6. Update `graphs/CLAUDE.md` prompt template reference table

## Quirks

- **Template path has no extension**: `"ask/entry"` not `"ask/entry.jinja"`
- **No template inheritance**: All templates are flat (no `{% extends %}` or `{% include %}`)
- **select_next_goal.jinja is unused**: Code uses order-based selection; template exists for future embedding-based approach
- **Podcast templates called externally**: By `podcast_creator` library, not LangGraph — different invocation pattern
- **Hot reload**: Template changes picked up on next `Prompter().render()` call (no app restart needed for prompt edits)
- **For-loop type safety**: Templates don't validate input types — passing a string where a list is expected iterates character-by-character

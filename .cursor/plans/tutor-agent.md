# Tutor Agent — Central Reference

> **This is the single source of truth.** `tutor-agent-redesign.md` and `tutor-agent-v2.md` are superseded by this document.

---

## Philosophy

The tutor should feel like a **Socratic office-hours discussion** — not a quiz machine. One anchor problem per learning goal, explored through short back-and-forth exchanges. The evaluator reads the student's partial understanding and probes the specific thing they're missing. The student's mental model, built exchange by exchange, drives what gets asked next.

---

## How the Two Systems Connect

```
Module creation
  └─ module.py graph: build_context → generate_name → generate_overview
                                                     → generate_learning_goals
                                                           │
                                                    learning_goals.jinja
                                                           │
                                             Produces per goal:
                                               • description
                                               • anchor_examples  ─────┐
                                               • takeaways  ───────────┤─► tutor uses these
                                               • competencies  ────────┘

Tutor session
  └─ tutor.py graph: initialize → select_goal → generate_anchor_problem
                                                       │
                                              anchor problem built from
                                              goal.anchor_examples + module_examples
                                                       │
                                              tutor_turn ←──→ evaluate_and_update_model
                                              (student-facing)   (scores competencies,
                                                                  decides next action)
```

**Key dependencies:**
- `goal.takeaways` → the evaluator's answer key, also the `explain` mode source
- `goal.competencies` → the rubric; every exchange is scored per competency
- `goal.anchor_examples` → seeds `generate_anchor_problem`; should name specific lecture examples

---

## Part 1: Learning Goal Generation

### How it's triggered
`module.py`'s `generate_learning_goals()` node — called when a module is created or regenerated. Runs in parallel with `generate_overview()`.

### What the prompt does (`prompts/module/learning_goals.jinja`)

The LLM acts as an instructional designer. It reads all module sources and notes, identifies the lecture's narrative arc, then generates 3–5 learning goals. Each goal has:

| Field | Purpose | Used by tutor |
|-------|---------|---------------|
| `description` | Action-verb goal statement | Goal header, session messages |
| `anchor_examples` | Named lecture examples grounding this goal | Seeds `generate_anchor_problem` |
| `takeaways` | Dense prose "answer key" (2–4 paragraphs, NOT bullets) | `explain` and `macro_hint` modes |
| `competencies` | 3–5 sequential, testable rubric criteria | Scored each exchange by `evaluate_understanding` |

### Critical constraint on competencies
Competencies must be **sequential** — each building on the previous — so they map onto steps of a single worked problem:
> define the concept → set up the formula → work through derivation → interpret the result

This lets one anchor problem naturally cover all competencies in order.

### When to edit
- **`prompts/module/learning_goals.jinja`** — Change goal structure, competency format, or how takeaways are written
- **`backpack/graphs/module.py`** — Change how sources are fed to the prompt, token budgets, or structured output schema
- **`backpack/graphs/tutor_models.py`** (`GeneratedLearningGoal`) — Add/remove fields from the learning goal schema

---

## Part 2: Tutor Agent

### Graph nodes

```
START
  ↓
initialize_session          Load module, goals, context. Extract worked examples/figures/
                            definitions from all sources → module_examples list.
  ↓
select_next_goal            Pick lowest-order unfinished goal. Reset per-goal state:
                            anchor_problem=None, exchanges_on_goal=0, tutor_mode="open"
  ↓
generate_anchor_problem     ONE multi-step scenario per goal (maps to all competencies).
                            NOT answerable in one response — designed for 3-6 exchanges.
                            Produces: anchor_problem + opening_framing
  ↓
tutor_turn [INTERRUPT]  ←──────────────────────────────────────────────────────────┐
  Delivers message, calls interrupt(), waits for student response                  │
  ↓                                                                                │
evaluate_and_update_model   Score competencies, update student model, decide route │
  │                                                                                │
  ├─ mastered ─────────────────────────────────────────────────────► mark_goal_complete
  ├─ probe ────────────────────────────────────────────────────────────────────────┘
  ├─ macro_hint ───────────────────────────────────────────────────────────────────┘
  ├─ give_up → explain mode ───────────────────────────────────────────────────────┘
  ├─ max_exchanges (6) or stagnation (3 turns) → explain mode ─────────────────────┘
  ├─ weakest competency ≥ 0.55 → nudge mode ───────────────────────────────────────┘
  └─ otherwise → socratic mode ────────────────────────────────────────────────────┘

mark_goal_complete
  ├─ more goals → select_next_goal
  └─ all done → generate_summary → END
```

### Tutor modes

| Mode | Who it's for | When | Length | LLM call? |
|------|-------------|------|--------|-----------|
| `open` | Student | First turn on each goal | 2-3 sentences | No — delivers `opening_framing` |
| `probe` | Evaluator (to get more signal) | Response too thin/ambiguous to score | 1 sentence | No — delivers `probe_question` |
| `nudge` | Student | Weakest competency ≥ 0.55 | 1-2 sentences | Yes |
| `socratic` | Student | Clear gap, productive angle exists | 2-3 sentences | Yes |
| `macro_hint` | Student | Probe space exhausted on factual recall gap | 2 sentences | Yes |
| `explain` | Student | `give_up` or safety-net trigger | 2-3 paragraphs | Yes |

**Probe vs. nudge distinction**: `probe` is for the evaluator's benefit ("I need more signal to score this"). It can incidentally hint — that's fine. `nudge` is a deliberate small push for the student.

### Evaluator meta-decision (`suggested_next_action`)

Before scoring competencies, the evaluator assesses the conversation history and sets:

| Value | When | Key heuristic |
|-------|------|---------------|
| `"probe"` | Response too vague to score, and a new angle exists | Has a genuinely different framing not yet tried? |
| `"macro_hint"` | Same factual gap probed 2+ times from different angles, no progress | Recall gap (formula/definition) vs. reasoning gap |
| `"give_up"` | Student can't reason about concept at all | Would more probing ever help? |
| `"continue"` | Normal flow | Default — use score-based routing |

**Probe space exhaustion heuristic**: First "I don't know" → probe a different angle. After 2+ different angles with no progress → probe space exhausted → `macro_hint` or `give_up`.

### Exit criteria (how a goal ends)

A goal completes via `mark_goal_complete` in three ways:

1. **Mastery** — `is_resolved: true` from evaluator (all competencies ≥ 0.7)
2. **Explain acknowledged** — after `explain` mode, next evaluation immediately routes to `mark_goal_complete` (the `tutor_mode == "explain"` check in `evaluate_and_update_model`)
3. **Safety net** — `exchanges_on_goal ≥ 6` OR `turns_since_last_progress ≥ 3` → forces `explain` mode → then (2)

The session ends when `check_more_goals()` finds no unfinished goals → `generate_summary`.

### Routing thresholds

| Constant | Value | Location |
|----------|-------|----------|
| `NUDGE_THRESHOLD` | 0.55 | `tutor.py` line ~46 |
| `MAX_EXCHANGES_BEFORE_EXPLAIN` | 6 | `tutor.py` line ~45 |
| Stagnation | 3 turns no improvement | `evaluate_and_update_model` routing |
| Mastery threshold | 0.7 per competency | `evaluate_and_update_model` + eval prompt |

---

## Part 3: State Reference

### TutorState fields

```python
# Session-level (set at initialize, don't change per goal)
module_id: str
module_name: Optional[str]
learning_goals: List[Dict]          # Full list with description/competencies/takeaways
module_context: Optional[Dict]      # Sources, insights, notes
module_examples: List[Dict]         # Extracted figures/examples/definitions (for anchor gen)
session_started_at: Optional[str]
model_override: Optional[str]

# Goal tracking
current_goal_id: Optional[str]
completed_goal_ids: List[str]
goal_progress: Dict[str, Dict]      # Per-goal progress (started_at, exchanges, trajectory, etc.)
goal_contexts: Dict[str, List]      # Pre-fetched vector search results per goal

# Per-goal state (reset by select_next_goal)
anchor_problem: Optional[str]       # Multi-step scenario for current goal
opening_framing: Optional[str]      # Natural intro line ("Let's work through...")
exchanges_on_goal: int              # Resets to 0 each new goal
tutor_mode: str                     # "open"|"probe"|"nudge"|"socratic"|"macro_hint"|"explain"
probe_question: Optional[str]       # Set by evaluator when probe action chosen

# Student model (per goal, accumulates within goal)
student_model: Dict[str, Dict]      # See structure below

# Conversation
messages: List                      # Full message history (add_messages reducer)
latest_evaluation: Optional[Dict]   # Last eval result
understanding_trajectory: List      # Timestamped score snapshots across all goals
```

### `student_model[goal_id]` structure

```python
{
    "competency_assessments": [
        {
            "competency": "Can set up Poisson likelihood",
            "score": 0.15,
            "evidence": [                           # accumulates — one entry per exchange
                "Said 'multiply probabilities' — partially right",
                "Stated 'I don't know the formula' after probing"
            ],
            "hypotheses": [
                {"text": "Doesn't remember Poisson PMF formula", "confidence": "high"},
                {"text": "Knows conceptually but not formally", "confidence": "low"}
            ],
            "gap": "Missing Poisson PMF form λ^k e^{-λ}/k!",
            "attempts": 2                           # increments each exchange
        }
    ],
    "active_probe_target": "Can set up Poisson likelihood",  # weakest unresolved
    "turns_since_last_progress": 1,
    "confirmed_knowledge": ["Understands MLE concept at high level"]
}
```

---

## Part 4: File Map — What to Edit and When

### Prompts

| File | What it does | Edit when... |
|------|-------------|--------------|
| `prompts/module/learning_goals.jinja` | Generates learning goals from module sources | Changing goal structure, competency format, or takeaway style |
| `prompts/tutor/generate_anchor_problem.jinja` | Designs one multi-step anchor problem per goal | Changing anchor problem style, opening framing instructions |
| `prompts/tutor/evaluate_understanding.jinja` | Scores competencies + makes probe/macro_hint/give_up decision | Changing scoring rubric, routing heuristics, `suggested_next_action` logic |
| `prompts/tutor/tutor_turn.jinja` | Generates mode-specific tutor response | Adding/changing a mode, tweaking tone or length rules |
| `prompts/tutor/summary.jinja` | End-of-session narrative | Changing summary format or content |
| `prompts/tutor/extract_module_examples.jinja` | Extracts figures/examples/definitions from sources | Changing what gets extracted for anchor problem context |

### Python code

| File | What it does | Edit when... |
|------|-------------|--------------|
| `backpack/graphs/tutor.py` | Graph nodes, routing logic, state machine | Adding nodes, changing routing thresholds, fixing bugs in evaluate/route logic |
| `backpack/graphs/tutor_models.py` | Pydantic models for LLM structured outputs | Adding fields to EvaluationResult, CompetencyScore, etc. |
| `backpack/graphs/module.py` | Module content generation graph | Changing how goals/names/overviews are generated from sources |
| `api/routers/tutor.py` | REST API endpoints for tutor sessions | Adding/changing API fields, session creation, trajectory endpoint |
| `backpack/domain/module.py` | Module/LearningGoal domain models + DB | Adding fields to LearningGoal that persist to DB |

### Tests

| File | What to update |
|------|---------------|
| `tests/test_graphs.py` | Add tests when adding new Pydantic model fields or changing EvaluationResult |

### This documentation

| File | When to update |
|------|---------------|
| `.cursor/plans/tutor-agent.md` (this file) | After any architectural change, new mode, or routing threshold change |

---

## Part 5: Common Change Recipes

### Add a new tutor mode
1. Add the mode name to `TutorState` comment in `tutor.py`
2. Add routing logic in `evaluate_and_update_model` (decide when to trigger it)
3. Add the mode block in `prompts/tutor/tutor_turn.jinja`
4. If the new mode should bypass LLM (like `probe`/`open`), add an `elif` before the `else` in `tutor_turn()` node
5. Update the mode table in this doc

### Change how the evaluator decides probe/macro_hint/give_up
- Edit **Step 0** in `prompts/tutor/evaluate_understanding.jinja`
- If adding new action types, also update `EvaluationResult.suggested_next_action` Literal in `tutor_models.py` and add routing branch in `evaluate_and_update_model`

### Change competency scoring thresholds
- `NUDGE_THRESHOLD` and `MAX_EXCHANGES_BEFORE_EXPLAIN` are at the top of `tutor.py`
- Mastery threshold (0.7) is in `evaluate_and_update_model` (Python) and mentioned in `evaluate_understanding.jinja` (must match)
- Stagnation turns (3) is in the routing block of `evaluate_and_update_model`

### Change learning goal structure (add a field)
1. Add field to `GeneratedLearningGoal` in `backpack/graphs/module.py`
2. Add to `LearningGoal` domain model in `backpack/domain/module.py` (DB persistence)
3. Update `prompts/module/learning_goals.jinja` to instruct the LLM
4. Pass the field in `learning_goals` list in `initialize_session` in `tutor.py`
5. Update API schema if needed in `api/routers/tutor.py`

---

## Part 6: Debugging

All evaluation decisions are logged. Run with `LOGURU_LEVEL=DEBUG` to see per-competency detail:

```
INFO  tutor_turn in mode=socratic for goal=goal:abc123
INFO  Eval score=0.25, resolved=False, action=macro_hint, exchanges=3, turns_since_progress=2
DEBUG   Action rationale: Probed Poisson PMF from 3 angles, student consistently says they don't know. Recall gap, not reasoning gap.
DEBUG   Notes: Strong MLE intuition, missing PMF formula
DEBUG   [0.80] Can define MLE in own words | gap:
DEBUG   [0.15] Can set up Poisson likelihood | gap: Missing PMF form λ^k e^{-λ}/k!
DEBUG   Probe target: 'Can set up Poisson likelihood'
INFO  Macro hint triggered: Probed Poisson PMF from 3 angles...
```

---

## Change History

| Version | What changed |
|---------|-------------|
| v1 | 10→7 nodes. Replaced question list with one anchor problem per goal. Added student model with evidence accumulation and hypotheses. |
| v2 | Evaluator-driven routing via `suggested_next_action`. Added `macro_hint` mode. Fixed probe loop (probe space exhaustion heuristic). Opening framing no longer assumes lecture recall. Strengthened nudge/socratic acknowledgment. Added per-competency debug logging. |

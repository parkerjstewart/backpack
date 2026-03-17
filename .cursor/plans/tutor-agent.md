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

The LLM acts as an instructional designer. It reads all module sources and notes, classifies them, then generates 2–4 learning goals. Each goal has:

| Field | Purpose | Used by tutor |
|-------|---------|---------------|
| `description` | Action-verb goal statement | Goal header, session messages |
| `anchor_examples` | Named lecture examples grounding this goal (notes source origin) | Seeds `generate_anchor_problem` |
| `takeaways` | Dense prose "answer key" (2–4 paragraphs, NOT bullets) | `explain_competency` and `macro_hint` modes |
| `competencies` | 2–4 sequential, testable rubric criteria | Scored each exchange by `evaluate_understanding` |

### Prompt steps (in order)

1. **Step 0 — Source triage**: LLM classifies every source as *primary* (lecture slides, transcripts, chapters) or *supplementary* (readings, papers, optional material) based on title keywords and content structure.
2. **Step 1 — Narrative arc**: Identifies the sequence of ideas from **primary sources only** — so goal structure is driven by the lecture, not whichever reading has the most tokens.
3. **Step 2 — Coverage check**: Before generating goals, LLM must verify every source (primary and supplementary) will appear in at least one goal's `anchor_examples` or `takeaways`. Gaps get folded into existing goals or trigger a new goal.
4. **Step 3 — Goal generation**: Produces 2–4 goals. `anchor_examples` notes which source each example comes from.

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
                            anchor_problem=None, exchanges_on_goal=0, tutor_mode="opening"
  ↓
generate_anchor_problem     ONE multi-step scenario per goal (maps to all competencies).
                            NOT answerable in one response — designed for 3-6 exchanges.
                            Produces: anchor_problem + opening_framing
  ↓
tutor_turn [INTERRUPT]  ←──────────────────────────────────────────────────────────┐
  Unified LLM call: evaluator_guidance + behavioral_profile → natural response     │
  ↓                                                                                │
evaluate_and_update_model   Score competencies, update student model, decide route │
  │  (if is_tangent: use evaluate_tangent.jinja instead of full evaluator)        │
  │                                                                                │
  ├─ tangent → tangent profile, increment tangent_turns ───────────────────────────┘
  ├─ advance / score ≥ 0.65 → mark_goal_complete or transition profile ───────────┘
  ├─ explain_competency → explain profile ─────────────────────────────────────────┘
  ├─ macro_hint → give_fact profile ──────────────────────────────────────────────┘
  ├─ probe → guide profile (with evaluator_guidance providing focus) ──────────────┘
  ├─ safety net (≥12 total) or stagnation (≥3 turns no progress) → explain profile ┘
  ├─ continue + score ≥ 0.55 → nudge profile ──────────────────────────────────────┘
  └─ otherwise → guide profile ────────────────────────────────────────────────────┘

mark_goal_complete
  ├─ more goals → select_next_goal
  └─ all done → generate_summary → END
```

### Architecture: Unified Tutor Prompt

The tutor no longer switches between mode-specific prompt blocks. Every turn runs through `tutor_turn.jinja` with three layers of instruction:

1. **`evaluator_guidance`** — specific, contextual recommendation from the evaluator (what to do)
2. **`behavioral_profile`** — mode-specific structural guardrails selected by the router (how to do it)
3. **General guidelines** — always apply (baseline behavior)

The evaluator's guidance tells the LLM *what* to address; the behavioral profile tells it *how* to structure the response. Both are in the same unified prompt — no mode block switching.

### Behavioral Profiles (tutor_mode)

`tutor_mode` is stored in state and used as a debug/logging label AND to select the behavioral profile string passed to the prompt.

| Profile | When selected | Key behavior |
|---------|--------------|--------------|
| `opening` | First turn on a goal | Present anchor problem as fresh context (never "that X example from class"), no concept definitions, one open-ended question |
| `guide` | Default — `continue` or `probe` action | Ask questions only — never state what a concept "is", never preview upcoming steps; one question then stop |
| `nudge` | `continue` + active score ≥ 0.55 | Short 1-2 sentence push toward specific gap |
| `give_fact` | `macro_hint` action | Give the missing fact directly, create artifact if formula, acknowledge artifact in message |
| `explain` | `explain_competency` action or stagnation | Comprehensive explanation; use Key Takeaways; create artifact for equations, acknowledge it in message |
| `transition` | Competency mastered → advancing | Celebrate, briefly fill any remaining gap conversationally, bridge naturally; only artifact things already covered |
| `tangent` | `tangent` action | Brief answer (1-2 sentences); reconnect to exactly where they left off, not forward-looking |

**Routing priority**: `tangent` → `advance` → safety net → mastery check → `explain_competency` → `macro_hint` → `probe/needs_more_info` → stagnation → score-based (`nudge` vs `guide`).

**Evaluator guidance** (`evaluator_guidance` in state): Natural-language recommendation from evaluator, passed directly to the tutor prompt. Specific and actionable. The profile provides structural guardrails; the guidance provides specific context within that structure.

**Competency names stay internal**: All profiles NEVER quote the competency rubric text to the student. The competency is the agent's internal assessment target — questions should feel natural, framed through the problem.

### Artifact System

Artifacts are formula/definition cards on the student's reference board. They are created by the tutor LLM via the `new_artifact` field in `TutorResponse`.

**When artifacts are created**:
- **Rescue**: Student is genuinely stuck (evaluator routed to `give_fact` or `explain`). Artifact unblocks them.
- **Confirmation**: Student just demonstrated understanding of the concept. Artifact formalizes what they proved they know.
- **Never preemptively**: Do not create an artifact for a concept the student hasn't engaged with yet or is still being asked to demonstrate.
- Modes that may create artifacts: `give_fact`, `explain`, `transition` (covered material only). Modes that must not: `guide`, `nudge`, `tangent`, `opening` (unless the student explicitly asked for a formula to be written down).

**Acknowledgment rule**: When an artifact is created, the tutor's `message` must naturally reference it. The artifact should never silently appear. Examples:
- Rescue: "Here's the general likelihood formula for your board — try plugging in the Poisson PMF we already have."
- Confirmation: "Exactly — I've put the formal version on your board for reference."

**Toolkit philosophy (composability over specificity)**: Artifacts are reusable building blocks. Always check `ESTABLISHED ARTIFACTS` before creating a new one — if the new artifact is just an existing one plugged into another formula, add the general wrapper formula instead. Example: board has "Poisson PMF"; student needs likelihood → add "Joint likelihood" `L(θ) = ∏ P(Xᵢ=xᵢ; θ)`, not "Poisson joint likelihood."

**Artifact tracking in hint scoring**: When an artifact is created in `give_fact` or `explain` mode, `hint_count` is incremented on the active competency and the artifact label is added to `artifacts_given`. The evaluator sees `artifacts_given` and applies the same scoring penalty as a macro hint (recall-level: student demonstrated application but not independent recall).

**`reference_artifact_label`**: The tutor can also highlight an existing artifact by label (any mode), without creating a new one.

When the evaluator returns `"tangent"`:
- Router sets `is_tangent=True`, `tangent_turns=1`, `tutor_mode="tangent"`
- On the next exchange: lightweight `evaluate_tangent.jinja` runs instead of full evaluator
- Tangent evaluator checks: resolved? incidental evidence? guidance for tutor
- If `resolved=True`: return to normal flow with appropriate profile
- If not resolved and `tangent_turns < MAX_TANGENT_TURNS (3)`: continue tangent
- At limit: `evaluator_guidance` instructs tutor to gently reconnect
- Tangent turns don't increment `encounters` or `turns_since_progress` on active competency

### Per-competency lifecycle

Each competency progresses through: `pending` → `active` → `mastered` (score ≥ 0.65) or `explained`

- **`pending`**: Not yet focused on. Default assumption is student understands — no score assigned.
- **`active`**: Currently being probed. Evaluator scores this in depth.
- **`mastered`**: Score ≥ 0.65 achieved through probing or spontaneous demonstration. Stagnation at score ≥ 0.65 also triggers mastery (not explain).
- **`explained`**: Student couldn't demonstrate — tutor explained it and advanced.

**Transition on mastery**: When a competency is mastered and the agent advances to the next, it uses `transition` mode — celebrates mastery, fills any remaining gap conversationally ("just to round things out…"), and naturally bridges to the next topic. Previous competency info (evidence, gap, hypotheses) is passed via `transitioning_from_competency` state field. The `transition_guidance` string always includes the gap text when one exists.

**hint_count**: Each `macro_hint` on a competency increments its `hint_count`. When an artifact is created in `give_fact` or `explain` mode, it also increments `hint_count` and records the artifact label in `artifacts_given`. The evaluator applies a recall-vs-conceptual scoring penalty: recall hints (forgot formula but used it expertly) → mild penalty; conceptual hints (needed the relationship explained) → larger penalty. Artifacts are treated the same as recall hints.

Goal completes when all competencies are `mastered` or `explained`.

**Incidental scoring (upside-only, mandatory scan)**: Every exchange, the evaluator performs a mandatory scan of ALL pending competencies, explicitly checking whether the student's response provides positive evidence (score ≥ 0.5). Pending competency names and current scores are passed to the evaluator prompt. If evidence is found, it's recorded; if not, omission is not evidence of a gap.

### Evaluator output

The evaluator produces two key outputs per exchange:

1. **`suggested_next_action`** — structural routing decision
2. **`tutor_guidance`** — natural-language recommendation addressed to the tutor

| Action | When | Key heuristic |
|--------|------|---------------|
| `"probe"` | Response too vague to score active competency, specific new angle exists | Must be specific: name what to demonstrate |
| `"macro_hint"` | Same factual gap on active competency probed 2+ times, no progress | Recall gap vs. reasoning gap |
| `"explain_competency"` | Student can't reason about this specific competency at all | Would more probing ever help on THIS one? |
| `"advance"` | Active competency mastered AND gaps have been addressed | Score ≥ 0.85: unconditional. Score 0.65-0.84: only if identified gap has been probed at least once |
| `"continue"` | Normal flow | Default — use score-based routing |
| `"tangent"` | Student's response/question is off-topic for assessing the active competency | Distinguish from in-scope help requests; asking for the answer to the active competency is NOT tangent |

`tutor_guidance` is specific and actionable — like a note from a teaching assistant to the lead tutor. It tells the tutor what the student did, what to address, and how to respond.

**Context gap vs. knowledge gap**: If student says "I don't remember the scenario" — that's a context gap, not a knowledge gap. Restate the scenario; don't use `macro_hint` or `explain_competency`.

**Post-explain flow**: After the tutor explains a concept (explain profile), the evaluator runs normally on the next student response. If the student has follow-up questions, the conversation continues on that competency — the evaluator's guidance will say "address their question." The router advances only when the evaluator says the student is ready (action: `continue`/`advance` with no further questions).

### Exit criteria (how a goal ends)

A goal completes via `mark_goal_complete` when:

1. **All competencies mastered** — every competency reaches score ≥ 0.65
2. **All competencies addressed** — each is either `mastered` or `explained` (after `explain_competency` advances through them all)
3. **Safety net** — `total_exchanges_on_goal ≥ 12` → forces `explain_competency` on remaining competencies → complete

The session ends when `check_more_goals()` finds no unfinished goals → `generate_summary`.

### Routing thresholds

| Constant | Value | Location |
|----------|-------|----------|
| `NUDGE_THRESHOLD` | 0.55 | `tutor.py` |
| `MASTERY_THRESHOLD` | 0.65 | `tutor.py` |
| `MAX_NO_PROGRESS_TURNS` | 3 | `tutor.py` (turns with no score improvement → force explain) |
| `MAX_TOTAL_EXCHANGES_PER_GOAL` | 12 | `tutor.py` (safety net per goal) |
| `MAX_TANGENT_TURNS` | 3 | `tutor.py` (consecutive tangent turns before forced reconnect) |
| `MAX_ENCOUNTERS_PER_COMPETENCY` | 10 | `tutor.py` (high safety net only — stagnation driven by turns_since_progress) |
| Per-competency stagnation | `turns_since_progress >= MAX_NO_PROGRESS_TURNS` | `evaluate_and_update_model` — if score ≥ 0.65, masters instead of explaining |

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
exchanges_on_goal: int              # Resets to 0 each new goal (kept for backward compat)
total_exchanges_on_goal: int        # Same counter used for safety-net limit
tutor_mode: str                     # "opening"|"guide"|"nudge"|"give_fact"|"explain"|"transition"|"tangent"
probe_question: Optional[str]       # Backward compat; secondary to evaluator_guidance
evaluator_guidance: Optional[str]   # Natural-language recommendation from evaluator → tutor prompt
transitioning_from_competency: Optional[Dict]  # Previous competency info for transition mode {competency, score, gap, evidence, hypotheses}

# Tangent tracking (reset by select_next_goal)
tangent_turns: int                  # Consecutive turns in tangent exchange (reset on return)
tangent_topic: Optional[str]        # What the tangent is about
is_tangent: bool                    # Whether previous turn was a tangent (drives evaluator selection)

# Per-competency lifecycle tracking (reset by select_next_goal)
competency_statuses: List[Dict]     # [{competency, status, score, evidence, gap, hypotheses, encounters, turns_since_progress}]
active_competency_index: int        # -1 = brain-dump/open mode; 0..N-1 = focused on that competency

# Student model (per goal, derived from competency_statuses for backward compat)
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
| `prompts/tutor/evaluate_understanding.jinja` | Scores competencies + makes routing decision + writes `tutor_guidance` | Changing scoring rubric, routing heuristics, `suggested_next_action` logic, guidance format |
| `prompts/tutor/evaluate_tangent.jinja` | Lightweight evaluator for tangent exchanges | Changing tangent resolution logic or incidental evidence rules |
| `prompts/tutor/tutor_turn.jinja` | Unified tutor response prompt (all profiles) | Changing general guidelines, prompt structure, or context sections |
| `prompts/tutor/summary.jinja` | End-of-session narrative | Changing summary format or content |
| `prompts/tutor/extract_module_examples.jinja` | Extracts figures/examples/definitions from sources | Changing what gets extracted for anchor problem context |

### Python code

| File | What it does | Edit when... |
|------|-------------|--------------|
| `backpack/graphs/tutor.py` | Graph nodes, routing logic, state machine | Adding nodes, changing routing thresholds, fixing bugs in evaluate/route logic |
| `backpack/graphs/tutor_models.py` | Pydantic models for LLM structured outputs | Adding fields to EvaluationResult, CompetencyScore, etc. |
| `backpack/graphs/module.py` | Module content generation graph | Changing how goals/names/overviews are generated from sources |
| `api/routers/tutor.py` | REST API endpoints for tutor sessions | Adding/changing API fields, session creation, trajectory endpoint, debug endpoint |
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
4. If the new mode should bypass LLM (like `open`), add an `elif` before the `else` in `tutor_turn()` node
5. Update the mode table in this doc

### Change how the evaluator decides probe/macro_hint/explain_competency
- Edit **Step 1** in `prompts/tutor/evaluate_understanding.jinja`
- If adding new action types, also update `EvaluationResult.suggested_next_action` Literal in `tutor_models.py` and add routing branch in `evaluate_and_update_model`

### Change competency scoring thresholds
- `NUDGE_THRESHOLD`, `MASTERY_THRESHOLD`, `MAX_ENCOUNTERS_PER_COMPETENCY`, `MAX_TOTAL_EXCHANGES_PER_GOAL` are constants at the top of `tutor.py`
- Mastery threshold (0.65) is in Python constants and referenced in `evaluate_understanding.jinja` (must match)
- Stagnation: encounters ≥ 3 AND turns_since_progress ≥ 2 → explain (but score ≥ 0.65 overrides to mastery)

### Export session data
- `GET /tutor/sessions/{id}/export` returns full conversation, per-goal competency lifecycle snapshots, trajectory, student model
- Competency lifecycle is preserved per completed goal in `goal_progress[goal_id]["competency_statuses"]`

### Change learning goal structure (add a field)
1. Add field to `GeneratedLearningGoal` in `backpack/graphs/module.py`
2. Add to `LearningGoal` domain model in `backpack/domain/module.py` (DB persistence)
3. Update `prompts/module/learning_goals.jinja` to instruct the LLM
4. Pass the field in `learning_goals` list in `initialize_session` in `tutor.py`
5. Update API schema if needed in `api/routers/tutor.py`

---

## Part 6: Debugging

### In-app debug panel

Click the **bug icon** (🐛) in the try-tutor page header to open a live debug panel alongside the chat. It calls `GET /tutor/sessions/{id}/debug` after each exchange and displays:

- **Goal progress** — overall score bar + "X/Y competencies mastered" counter
- **Tutor mode badge** — color-coded (opening=slate, guide=blue, nudge=orange, give_fact=red, explain=green, transition=purple, tangent=yellow)
- **Exchange count** and stagnation turns
- **Evaluator guidance** (`evaluator_guidance`) — natural-language recommendation from evaluator, shown prominently with a blue left border
- **Evaluator rationale** (`action_rationale`) and notes (`evaluation_notes`) from the last eval
- **Per-competency cards** — score bar, gap text, hypotheses with confidence badges, collapsible evidence log (last 3 entries); active probe target highlighted with a target icon
- **Confirmed knowledge** list

Relevant files: `frontend/src/components/tutor/TutorDebugPanel.tsx`, `api/routers/tutor.py` (`DebugStateResponse` + `get_debug_state`), `frontend/src/lib/hooks/use-tutor.ts` (`latestDebugInfo`).

### Log-level debugging

All evaluation decisions are also logged. Run with `LOGURU_LEVEL=DEBUG` to see per-competency detail:

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
| v3 | Improved learning goal generation prompt: added source triage step (AI classifies primary vs supplementary), scoped narrative arc to primary sources, added coverage check step to ensure every source appears in at least one goal. Goal count expanded to 3–6. `anchor_examples` now notes source origin. |
| v4 | Added in-app debug panel to try-tutor page. New `GET /tutor/sessions/{id}/debug` endpoint exposes tutor mode, exchanges, student model (competency scores, evidence, hypotheses, gap, active probe target), and evaluator rationale. Frontend: `TutorDebugPanel.tsx` component, `latestDebugInfo` in `use-tutor.ts`, bug-icon toggle button in page header. |
| v5 | Per-competency flow redesign. Each competency now has a lifecycle (pending→active→mastered/explained). Tutor walks through competencies sequentially; evaluator focuses on the active one and records incidental positive evidence for others (upside-only). Replaced `explain` (per-goal) with `explain_competency` (per-competency): explains just the stuck competency then advances to the next. Removed `give_up` action. Added `advance` action. `student_model` now derived from `competency_statuses` for backward compat. Debug panel shows lifecycle badges (pending/active/mastered/explained). Exchange limits changed: 3 encounters per competency + 12 total per goal safety net (was 6 flat). Added independently-testable clarification to `learning_goals.jinja`. |
| v6 | Probing quality overhaul: evaluator now drafts a model answer (diff) before scoring — gap descriptions are concrete and actionable. Tutor prompts explicitly tell the student what to demonstrate. Prior evidence acknowledged when activating competency with incidental score. Fast-track: competencies with score ≥ 0.5 open in nudge mode. hint_count tracking per competency + LLM-judged recall-vs-conceptual scoring penalty for macro_hints. MASTERY_THRESHOLD lowered 0.7→0.65. Stagnation at score ≥ 0.65 now masters instead of explaining (scoring bug fix). Consistency rule: positive evaluator notes must match score ≥ 0.65. Explicit surrender: "I don't know" gets one scaffolded probe before explain. Goal/competency count reduced: 3-6→2-4 goals, 3-5→2-4 competencies. competency_statuses snapshot preserved in goal_progress on goal completion. New `GET /tutor/sessions/{id}/export` endpoint returns full conversation + lifecycle data. |
| v6.1 | Free-flowing conversation overhaul. New `transition` tutor mode: on mastery advancement, celebrates what was demonstrated, clarifies minor remaining gaps, and naturally bridges to next topic (replaces abrupt socratic/nudge switch). Competency names kept internal — socratic/nudge/transition NEVER quote rubric text to student. Mandatory cross-competency evidence scan: evaluator now receives all pending competency names/scores and must explicitly check each for positive evidence every exchange (replaces opportunistic scan). Debug panel shows goal-level scoring: progress bar, mastered count, overall score. Session summary includes per-goal competency breakdown (mastered/explained/score). New state field: `transitioning_from_competency` carries previous competency context (evidence, gap, hypotheses) for smooth transitions. |
| v6.2 | Flexible socratic mode + probe loop fix. Removed `probe` as a no-LLM mode — probe evaluator action now routes to `socratic` with evaluator's `probe_question` as `suggested_focus` (LLM responds to student's actual words, not a verbatim script). Socratic mode expanded with scaffolding guidance: when student asks for help, tutor gives a stepping stone (context, prior step, related formula) before asking a question. Fixed routing priority bug: `macro_hint` and `explain_competency` now checked before `needs_more_info`, so explicit evaluator escalation is respected. Evaluator updated: student requests for help are scaffolding opportunities (not macro_hint triggers); probe diversity check (repeated identical probes replaced by `continue`); strengthened consistency check (engaging student = not `explain_competency`). |
| v7 | Autonomy redesign. Replaced rigid mode-specific prompt blocks with a unified tutor prompt: evaluator's `tutor_guidance` (what to do) + behavioral profile (how to do it) + general guidelines (always apply). Profiles: `opening`, `guide`, `nudge`, `give_fact`, `explain`, `transition`, `tangent`. Evaluator now produces `tutor_guidance` — natural-language recommendation for the tutor — in addition to `suggested_next_action`. Added tangent handling: new `"tangent"` evaluator action, lightweight `evaluate_tangent.jinja` for subsequent tangent turns, `is_tangent`/`tangent_turns`/`tangent_topic` state fields. Added `demonstrated_knowledge` section to tutor prompt (prevents re-testing). Removed explain auto-advance: after explaining, evaluator runs normally on next response (student can ask follow-ups before advancing). Fixed stagnation: now `turns_since_progress >= MAX_NO_PROGRESS_TURNS (3)` instead of encounters-based. Mode renames: `open`→`opening`, `socratic`→`guide`, `macro_hint`→`give_fact`, `explain_competency`→`explain`. Debug panel updated: new mode colors, `evaluator_guidance` shown prominently. |
| v7.1 | Tangent detection fix + post-budget handling. Evaluator was never selecting `"tangent"` action because: (1) Step 0 anchored on scoring before checking topic relevance, (2) no tangent output example in OUTPUT FORMAT biased LLM away from it. Fix: added "Step -1: Tangent pre-check" before model answer drafting — evaluator now checks if response is on-topic first and short-circuits to tangent if not. Added tangent output example alongside existing `explain_competency` and `probe` examples. Post-budget tangent handling: when `tangent_episodes >= MAX_TANGENT_EPISODES_PER_COMPETENCY`, tutor now firmly redirects WITHOUT answering the off-topic question (previously used evaluator's "answer them" guidance which bypassed the redirect). Budget-exhausted turns count toward encounters/stagnation since they go through the full eval pipeline. |
| v7.2 | Artifact system overhaul + Socratic tightening. **Artifacts**: Added timing rules (rescue or confirmation only — never preemptive); added acknowledgment rule (message must reference the artifact); added toolkit composability rules (add general wrapper, not problem-specific compositions). Artifact creation in `give_fact`/`explain` now increments `hint_count` and records label in `artifacts_given`; evaluator receives `artifacts_given` and applies recall-level scoring penalty (same as macro hint). **Tangent behavior**: Tangent answers now brief (1-2 sentences); reconnect returns to exactly where they left off, not forward-looking. **Tangent classification**: Tightened — student asking for the answer to the active competency is NOT a tangent (`probe`/`macro_hint`); vague/evasive answers are NOT tangents (`continue`/`probe`). **Incidental mastery**: Higher bar — student must independently demonstrate (≥0.75) not just parrot tutor's explanation. **Opening**: Added rule to introduce scenario as fresh context — never assume prior student exposure to source examples ("that X setup"). **Guide mode**: Strengthened against info-giving — must not define concepts, must not preview steps; one question then stop. **Advance logic**: Score 0.65-0.84 advance only if identified gap has been probed at least once; score ≥0.85 unconditional. **Transition**: `transition_guidance` now always includes gap text; tutor fills gaps conversationally during transition ("just to round things out…") rather than silently advancing past them. |

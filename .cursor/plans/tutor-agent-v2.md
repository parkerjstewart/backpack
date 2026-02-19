> **Superseded.** See `.cursor/plans/tutor-agent.md` for the current reference.

# Tutor Agent — Design Reference (v2, archived)

## Philosophy

The tutor should feel like a Socratic **office-hours discussion**, not a quiz machine. One anchor problem per learning goal, explored through short back-and-forth exchanges. The student's mental model drives what gets asked next.

---

## Mode Definitions

| Mode | Who it's for | When | Behavior |
|------|-------------|------|----------|
| `open` | Student | First turn on a goal | Deliver `opening_framing` directly (no LLM call) |
| `probe` | Evaluator's benefit | Response too thin/ambiguous to score | 1-sentence clarifier to get enough signal to evaluate |
| `nudge` | Student | Student is close (weakest score ≥ 0.55) | 1–2 sentences: brief reaction + gentle push question |
| `socratic` | Student | Clear gap, productive angle exists | 2–3 sentences: acknowledge right + one targeted question |
| `macro_hint` | Student | Probe space exhausted on a factual gap | Give the missing fact directly + re-engage with problem |
| `explain` | Student | Student can't reason about concept at all (give_up) or max exchanges hit | 2–3 paragraphs: direct explanation from Key Takeaways |

**Key distinction**: `probe` is for the evaluator to get more signal — not for the student. It can incidentally act as a hint, and that's fine. `nudge` and `macro_hint` are explicitly for the student.

---

## Graph Flow

```
START
  │
  ▼
initialize_session
  │  Loads module, goals, builds context, extracts examples
  ▼
select_next_goal
  │  Picks lowest-order unfinished goal, resets per-goal state
  ▼
generate_anchor_problem
  │  ONE multi-step scenario per goal (explores all competencies)
  ▼
tutor_turn [INTERRUPT]  ◄────────────────────────────────────┐
  │  Delivers message, waits for student response via interrupt()  │
  ▼                                                               │
evaluate_and_update_model                                        │
  │                                                               │
  ├── is_resolved (all comps ≥ 0.7) ──► mark_goal_complete       │
  │                                                               │
  ├── suggested_action == "probe"  ──► tutor_turn (probe mode) ──┘
  │
  ├── suggested_action == "macro_hint" ──► tutor_turn (macro_hint) ──┐
  │                                                                   │
  ├── suggested_action == "give_up"  ──► tutor_turn (explain) ──┐    │
  │                                                              │    │
  ├── max_exchanges or stagnation (3 turns) ──► explain ─────── ┤    │
  │                                                              │    │
  ├── weakest ≥ 0.55 ──► tutor_turn (nudge) ──────────────────► ┤ ───┘
  │                                                              │
  └── otherwise ──► tutor_turn (socratic) ──────────────────────┘
        (loops back to evaluate)

mark_goal_complete
  │
  ├── more goals? ──► select_next_goal
  │
  └── all done? ──► generate_summary ──► END
```

---

## Evaluator Meta-Decision (`suggested_next_action`)

The evaluator looks at conversation history before scoring and recommends the next action:

```
"probe"      — Response too vague to score. A new framing angle exists.
"macro_hint" — Same factual gap probed 2+ times from different angles.
               Student can't recall a formula/definition. Giving it unblocks them.
"give_up"    — Student can't reason about the concept at all even with hints.
"continue"   — Normal flow. Use score-based routing.
```

The evaluator also outputs `action_rationale` — a brief explanation logged for debugging.

**Probe space exhaustion heuristic**: First "I don't know" → fine to probe a different angle. After 2+ different probe angles with no progress → probe space exhausted, switch to `macro_hint` or `give_up`.

---

## Student Model (per goal)

```python
student_model[goal_id] = {
    "competency_assessments": [
        {
            "competency": "Can set up Poisson likelihood",
            "score": 0.15,              # 0.0–1.0
            "evidence": [               # accumulates across exchanges
                "Said 'multiply probabilities' — partially right",
                "Stated 'I don't know the formula' after probing"
            ],
            "hypotheses": [
                {"text": "Doesn't remember Poisson PMF formula", "confidence": "high"},
                {"text": "Knows it conceptually but not formally", "confidence": "low"}
            ],
            "gap": "Missing Poisson PMF form λ^k e^{-λ}/k!",
            "attempts": 2
        }
    ],
    "active_probe_target": "Can set up Poisson likelihood",  # weakest unresolved
    "turns_since_last_progress": 1,
    "confirmed_knowledge": ["Understands MLE concept at high level"]
}
```

---

## Routing Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `NUDGE_THRESHOLD` | 0.55 | Weakest competency ≥ this → nudge instead of socratic |
| `MAX_EXCHANGES_BEFORE_EXPLAIN` | 6 | Safety net: force explain after this many exchanges |
| Stagnation threshold | 3 turns | Force explain if no improvement for 3 turns |

---

## Key Files

| File | Role |
|------|------|
| `backpack/graphs/tutor.py` | Graph nodes, state machine, routing logic |
| `backpack/graphs/tutor_models.py` | Pydantic models for LLM outputs |
| `prompts/tutor/evaluate_understanding.jinja` | Per-exchange scoring + meta-decision |
| `prompts/tutor/tutor_turn.jinja` | Mode-driven tutor response generation |
| `prompts/tutor/generate_anchor_problem.jinja` | One anchor problem per goal |
| `prompts/tutor/summary.jinja` | End-of-session narrative |
| `api/routers/tutor.py` | REST endpoints for session management |

---

## Debugging

All evaluation decisions are logged at `DEBUG` level:
```
INFO  Eval score=0.25, resolved=False, action=macro_hint, exchanges=3, turns_since_progress=2
DEBUG   Action rationale: We've probed the Poisson PMF from 3 different angles...
DEBUG   Notes: Student has solid MLE intuition but can't recall the PMF form
DEBUG   [0.80] Can define MLE | gap:
DEBUG   [0.15] Can set up Poisson likelihood | gap: Missing PMF formula λ^k e^{-λ}/k!
DEBUG   Probe target: 'Can set up Poisson likelihood'
```

Run with `LOGURU_LEVEL=DEBUG` or adjust log level in config to see eval details.

---

## Change History

- **v1** (tutor-agent-redesign.md): 10→7 nodes, anchor problem per goal, student model with evidence accumulation
- **v2** (this file): Evaluator-driven routing via `suggested_next_action`, `macro_hint` mode, opening framing without lecture recall assumption, strengthened acknowledgment in nudge/socratic modes

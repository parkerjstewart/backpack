# Tutor Artifact System

## Context

Commit `4fff7da` (v7.1) was the last known-good tutor behavior. Subsequent commits added structured output (`TutorResponse` with `supplement`/`image_prompt` fields), image generation, and a model switch to GPT-5.2. This introduced a behavioral regression: **the `supplement` field leaks answers in guide/nudge mode**. The model now has a dedicated field to dump formulas alongside probing questions, defeating the Socratic approach.

The fix isn't to remove supplements — it's to evolve them into **artifacts**: a cumulative reference system where established knowledge is surfaced to help the student, but new formulas are only revealed when the tutor mode explicitly calls for it.

## Root Cause (for reference)

Three compounding issues introduced after `4fff7da`:

1. **`supplement` field leaks answers in guide/nudge mode**: `BEHAVIORAL_PROFILES["guide"]` says "If you reference a formula or formal definition, put it in the supplement field" — so the model can ask "What do you think the PMF looks like?" while simultaneously providing `supplement: "$$P(X=k) = ...$$"`. No such outlet existed in the original plain-text output.

2. **Model change to GPT-5.2 with `reasoning_effort="none"`** (`tutor_turn` provisioning, line ~725): Uses hardcoded `"openai/gpt-5.2"` instead of `DEFAULT_CHAT_MODEL`. Zero chain-of-thought reduces ability to follow complex behavioral constraints.

3. **Prompt ends with format spec instead of directive**: The old "Generate your response now:" closing gave way to 20 lines of JSON format instructions that normalize formula-dumping.

## Design

### Artifact Model

Each artifact:
```python
{
    "id": "art-1",           # Auto-incremented ("art-N")
    "label": "Poisson PMF",  # Short name from LLM
    "content": "$$P(X=k) = \\frac{\\lambda^k e^{-\\lambda}}{k!}$$",  # LaTeX/markdown
    "source_mode": "give_fact",  # Which tutor mode created it
    "goal_id": "goal:abc",       # Which learning goal
    "exchange": 4                # Exchange number when created
}
```

### LLM Output Restructure

Replace `TutorResponse.supplement` with two fields:
- `new_artifact: Optional[{label, content}]` — create a new artifact (only allowed in give_fact/explain/transition)
- `reference_artifact_label: Optional[str]` — highlight an existing artifact by label (allowed in any mode)

Keep `image_prompt` as-is for now (may sunset later).

### Mode Gating Rules

| Mode | Can create artifact? | Can reference existing? |
|------|---------------------|------------------------|
| guide | **NO** | YES |
| nudge | **NO** | YES |
| give_fact | YES | YES |
| explain | YES | YES |
| transition | YES | YES |
| tangent | **NO** | YES |
| opening | **NO** | NO |

### Per-Turn Display

- **New artifact created**: Show inline below message + add to sidebar + highlight in sidebar
- **Existing artifact referenced**: Highlight in sidebar only (no new inline content)
- **Neither**: No change to sidebar

---

## Files to Modify

### 1. `backpack/graphs/tutor_models.py`

Add `NewArtifact` model:
```python
class NewArtifact(BaseModel):
    label: str  # Short display name, e.g. "Poisson PMF"
    content: str  # LaTeX/markdown content
```

Update `TutorResponse`:
- Replace `supplement: Optional[str]` with `new_artifact: Optional[NewArtifact]`
- Add `reference_artifact_label: Optional[str]`
- Keep `image_prompt` as-is
- Update all field descriptions to reference mode gating

### 2. `backpack/graphs/tutor.py`

**TutorState** (line ~245):
- Replace `latest_supplement: Optional[str]` and `latest_image_url: Optional[str]` with:
  - `artifacts: List[Dict[str, Any]]` — cumulative list (persisted in checkpoints)
  - `highlighted_artifact_id: Optional[str]` — per-turn, which artifact to highlight
  - Keep `latest_image_url` for now (image feature still wired up)

**BEHAVIORAL_PROFILES** (lines 59-144):
- `guide`: Remove "If you reference a formula or formal definition, put it in the supplement field". Add: "Do NOT set new_artifact — the student should work through formulas themselves. If an existing artifact is relevant to the current step, set reference_artifact_label to its label."
- `nudge`: Add: "Do NOT set new_artifact. You can reference an existing one if helpful."
- `give_fact`: Replace supplement instruction with: "Set new_artifact with a short label and the LaTeX/markdown content."
- `explain`: Same replacement — use `new_artifact` instead of supplement.
- `transition`: Can create artifact for key takeaway being summarized.

**`initialize_session`** (line ~430):
- Replace `"latest_supplement": None` with `"artifacts": [], "highlighted_artifact_id": None`

**`tutor_turn`** (line ~690):
- Add `artifacts = state.get("artifacts", [])`
- Pass `artifacts` in `prompt_data`
- After LLM call: extract `result.new_artifact` and `result.reference_artifact_label`
- **Mode gate enforcement** (backend safety net):
  ```python
  ARTIFACT_CREATION_MODES = {"give_fact", "explain", "transition"}
  if result.new_artifact and tutor_mode not in ARTIFACT_CREATION_MODES:
      logger.warning(f"tutor_turn: dropping new_artifact in {tutor_mode} mode (mode gate)")
      result_new_artifact = None
  ```
- If new artifact passes gate: generate ID (`f"art-{len(artifacts)+1}"`), append to artifacts list, set `highlighted_artifact_id`
- If `reference_artifact_label` set: find matching artifact by label, set `highlighted_artifact_id` to its ID
- Update interrupt payload: replace `"supplement"` with `"artifact_content"` (content of highlighted artifact if new), `"highlighted_artifact_id"`, `"artifacts"`
- Update return dict: replace `latest_supplement` with `artifacts` and `highlighted_artifact_id`

### 3. `prompts/tutor/tutor_turn.jinja`

Add before `# YOUR TASK`:
```jinja
{% if artifacts %}
# ESTABLISHED ARTIFACTS (student can see these)

{% for art in artifacts %}
- **[{{ art.label }}]** {{ art.content }}
{% endfor %}

*(These are already visible to the student. You can reference them by label. Do not re-explain or re-derive them — just point to them.)*
{% endif %}
```

Update **Output Format** section:
- Replace `supplement` field description with:
  - `new_artifact` (object with `label` and `content`) — explained with mode-gating rule
  - `reference_artifact_label` (string matching an existing artifact label)
- Add prominent instruction: **"IMPORTANT: `new_artifact` must be null in guide, nudge, tangent, and opening modes. Only create artifacts when you are revealing information (give_fact, explain, transition modes)."**

### 4. `api/routers/tutor.py`

Add `ArtifactResponse` model:
```python
class ArtifactResponse(BaseModel):
    id: str
    label: str
    content: str
    source_mode: str
    goal_id: Optional[str] = None
    exchange: Optional[int] = None
```

Update `CreateSessionResponse`:
- Replace `first_supplement: Optional[str]` with `artifacts: List[ArtifactResponse] = []` and `highlighted_artifact_id: Optional[str] = None`

Update `TutorResponsePayload`:
- Replace `tutor_supplement: Optional[str]` with `artifacts: List[ArtifactResponse] = []` and `highlighted_artifact_id: Optional[str] = None`
- Keep `tutor_image_url` for now

Update both endpoint handlers to extract artifact data from interrupt payload / state.

### 5. `frontend/src/lib/types/api.ts`

Add:
```typescript
export interface Artifact {
  id: string
  label: string
  content: string
  source_mode: string
  goal_id?: string | null
  exchange?: number | null
}
```

Update `TutorSessionResponse` and `TutorResponsePayload`: replace supplement fields with `artifacts: Artifact[]` and `highlighted_artifact_id: string | null`.

### 6. `frontend/src/lib/hooks/use-tutor.ts`

- Add session-level `artifacts` state (`useState<Artifact[]>([])`)
- Update `Message` interface: replace `supplement?: string | null` with `highlighted_artifact_id?: string | null`
- On each tutor response: merge/replace `artifacts` from response into state
- Store `highlighted_artifact_id` on the message object

### 7. `frontend/src/components/tutor/TutorChat.tsx`

**Per-message inline artifact display**: If `message.highlighted_artifact_id` is set AND the artifact is new (just created this turn, i.e., `source_mode` was give_fact/explain), render its content inline below the message using existing KaTeX/markdown rendering.

**Artifacts sidebar**: New panel showing all accumulated artifacts. The one matching `highlighted_artifact_id` of the last message gets visual emphasis (ring/highlight). Each artifact shows label + collapsible content.

### 8. `frontend/src/lib/hooks/useVoiceSession.ts`

Update WebSocket parsing for `assistant_text_final` event to handle `artifacts` and `highlighted_artifact_id` instead of `supplement`.

---

## Verification

1. Start a tutor session on a math-heavy module (e.g., MLE/Poisson)
2. **Guide mode**: Give vague answers — tutor should ask Socratic questions with NO new artifacts created. Check debug panel shows `tutor_mode: guide`.
3. **Give fact trigger**: Say "I don't know" multiple times on same factual gap → evaluator routes to `give_fact` → verify artifact appears in sidebar with correct label
4. **Guide mode after give_fact**: Next turn should be guide mode again — artifact should be referenced/highlighted but no new artifact created
5. **Explain mode**: Trigger stagnation (3 turns no progress) → verify artifact created with full explanation content
6. **Transition**: Demonstrate mastery → verify transition creates an artifact summarizing what was learned (if applicable)
7. Run `uv run pytest tests/` — existing tests should pass

"""
Socratic Tutoring Agent using LangGraph.

This module implements a conversational tutoring agent that guides students through
learning goals using the Socratic method. Uses interrupt() for human-in-the-loop
conversation flow and Command for dynamic routing based on evaluation results.

Graph flow (per goal):
  initialize → select_goal → generate_anchor_problem
    → tutor_turn [interrupt] → evaluate_and_update_model
        → "continue" (nudge/probe/socratic) → tutor_turn (loop)
        → competency mastered → advance to next pending competency → tutor_turn (loop)
        → explain_competency → tutor_turn → evaluate → advance to next → tutor_turn (loop)
        → all competencies addressed → mark_goal_complete
    → mark_goal_complete → [more goals?] → select_goal | summary
    → summary → END
"""

import asyncio
import concurrent.futures
import json
import re
import sqlite3
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional

import openai

from ai_prompter import Prompter
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt
from loguru import logger
from typing_extensions import TypedDict

from backpack.ai.provision import provision_langchain_model
from backpack.config import LANGGRAPH_CHECKPOINT_FILE
from backpack.domain.module import Module, vector_search
from backpack.graphs.tutor_models import (
    EvaluationResult,
    GeneratedAnchorProblem,
    ModuleExamples,
    TangentEvaluationResult,
    TutorResponse,
)
from backpack.utils import clean_thinking_content
from backpack.utils.context_builder import ContextBuilder

MAX_ENCOUNTERS_PER_COMPETENCY = 10  # high safety-net only; stagnation driven by turns_since_progress
MAX_NO_PROGRESS_TURNS = 3           # turns with no score improvement → force explain
MAX_TOTAL_EXCHANGES_PER_GOAL = 12   # safety net per goal
MAX_TANGENT_TURNS = 3               # turns per tangent episode before force-reconnect
MAX_TANGENT_EPISODES_PER_COMPETENCY = 2  # separate tangent episodes allowed per competency
NUDGE_THRESHOLD = 0.55  # active competency score >= this → nudge instead of guide
MASTERY_THRESHOLD = 0.65


# ============================================================================
# Behavioral Profiles
# ============================================================================

BEHAVIORAL_PROFILES: dict[str, str] = {
    "guide": (
        "You're guiding the student through the problem. Your goal is to help them "
        "demonstrate and build understanding.\n"
        "- When the student is engaging and progressing, prefer asking over telling — "
        "  invite them to reason through the next step rather than giving it to them "
        "  ('What would you try next?' instead of 'Now take the derivative.')\n"
        "- Give information when: (a) the evaluator's guidance says to, (b) the student "
        "  explicitly asked, (c) they're genuinely stuck after you've asked, or "
        "  (d) a brief context reminder is needed\n"
        "- Follow the evaluator's assessment closely — it tells you what the student needs\n"
        "- If giving info, give enough to unblock, then follow with a question\n"
        "- If prior evidence exists, build on it — don't re-test demonstrated understanding\n"
        "- 2-4 sentences typical, shorter or longer as the exchange calls for\n"
        "- If you reference a formula or formal definition, put it in the supplement field"
    ),
    "nudge": (
        "The student is close — they almost have it. Give a brief, targeted push.\n"
        "- 1-2 sentences — short reaction + one specific question or prompt\n"
        "- Name the specific concept or formula they're missing\n"
        "- Don't re-explain — they're almost there"
    ),
    "give_fact": (
        "The student is stuck on a specific fact you've already probed from multiple "
        "angles. Give it to them directly.\n"
        "- State the fact matter-of-factly, then re-engage with the problem\n"
        "- Don't ask them to recall it again — just give it and move on\n"
        "- Check: is this a context gap (forgot the scenario) or a knowledge gap "
        "  (forgot the formula)? If context gap, restate the scenario instead.\n"
        "- 2-3 sentences typical\n"
        "- If the fact is a formula, put it in the supplement field as a LaTeX equation"
    ),
    "explain": (
        "The student is genuinely stuck on this concept. Explain it clearly and "
        "thoroughly.\n"
        "- Take the space you need — comprehensive is more important than brief\n"
        "- Use Key Takeaways as your answer key, but explain conversationally\n"
        "- Address the student's specific confusion, not just the general concept\n"
        "- Walk through the reasoning step by step if that helps\n"
        "- End with: \"Does that help? Any questions about this, or should we move on?\"\n"
        "- Don't quiz them on this concept again after explaining\n"
        "- Stay conversational — \"here's how I think about it...\" not \"the answer is...\"\n"
        "- Put any equations or formal definitions in the supplement field, not in the message\n"
        "- For structural concepts (networks, trees, state machines, graphs), set image_prompt "
        "  instead of trying to describe the structure in text"
    ),
    "transition": (
        "Look at the evaluator_guidance to determine how to frame this transition.\n"
        "If the student mastered this competency: celebrate specifically what they demonstrated, "
        "clarify any minor remaining gap, then bridge naturally to the next topic.\n"
        "If the competency was explained to them (they didn't fully demonstrate it): briefly "
        "summarize the key takeaway they should hold onto (1 sentence), then bridge to the next "
        "topic — don't quiz them on it again or over-dwell.\n"
        "In both cases:\n"
        "- Bridge through the problem, a conceptual connection, or a follow-up to what they just said\n"
        "- Don't name the competency rubric text\n"
        "- 2-3 sentences typical"
    ),
    "tangent": (
        "The student asked a side question. Answer it directly and helpfully — "
        "this is a teaching moment, not an assessment.\n"
        "- Answer their question directly and completely\n"
        "- Don't assess or quiz — just help\n"
        "- Follow the evaluator's guidance on whether to reconnect. If the guidance "
        "  doesn't mention coming back, just answer and let the conversation breathe — "
        "  don't force a redirect after every side question\n"
        "- IMPORTANT: When reconnecting, invite them back with a question — do NOT "
        "  fill in the active competency gap for them "
        "  ('Shall we pick back up where we left off?' not 'The Poisson PMF is...')\n"
        "- 2-4 sentences typical, but take more space if the topic needs it"
    ),
    "opening": (
        "This is the opening turn. Introduce the problem and invite the student's "
        "initial thinking.\n"
        "- Present the anchor problem scenario naturally\n"
        "- Invite them to share what they know or how they'd approach it\n"
        "- Casual, welcoming — don't quiz immediately\n"
        "- Use the opening_framing as inspiration but generate your own natural intro\n"
        "- 2-3 sentences typical"
    ),
}


def _parse_competency_names(text: str) -> List[str]:
    """Parse competency names from the free-text competencies field.

    Learning goals generate competencies as dash-prefixed lines, e.g.:
      - "Can define MLE in their own words"
      - "Can set up a Poisson likelihood"
    """
    if not text:
        return []
    names = []
    for line in text.strip().split("\n"):
        line = line.strip().lstrip("-*•").strip().strip('"').strip("'").strip()
        if line:
            names.append(line)
    return names or []



def _run_model(coro_factory):
    """Run an async model-provisioning coroutine from a sync LangGraph node.

    LangGraph nodes are sync; this helper creates a fresh event loop in a
    thread-pool worker so it can safely await async AI calls regardless of
    whether there is already a running loop in the calling thread.
    """
    def _in_new_loop():
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(coro_factory())
        finally:
            loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as ex:
            return ex.submit(_in_new_loop).result()
    except RuntimeError:
        return _in_new_loop()


# ============================================================================
# State
# ============================================================================


class TutorState(TypedDict):
    """State for the Socratic tutoring agent."""

    messages: Annotated[list, add_messages]
    module_id: str
    module_name: Optional[str]
    learning_goals: List[Dict[str, Any]]
    goal_progress: Dict[str, Dict[str, Any]]
    completed_goal_ids: List[str]
    current_goal_id: Optional[str]

    # Anchor problem for current goal
    anchor_problem: Optional[str]
    opening_framing: Optional[str]
    exchanges_on_goal: int  # resets to 0 on each new goal (kept for backward compat / trajectory)
    total_exchanges_on_goal: int  # same counter, used for safety-net limit

    # Per-competency lifecycle tracking (reset each new goal)
    # Each entry: {competency, status, score, evidence, gap, hypotheses, encounters, turns_since_progress}
    # status: "pending" | "active" | "mastered" | "explained"
    competency_statuses: List[Dict[str, Any]]
    active_competency_index: int  # -1 = brain-dump/open mode; 0..N-1 = focused on that competency

    # Conversation mode — descriptive label for debug/logging; no longer selects prompt behavior
    # "opening" | "guide" | "nudge" | "give_fact" | "explain" | "transition" | "tangent"
    tutor_mode: str

    # Previous competency info for transition mode (set when advancing between competencies)
    transitioning_from_competency: Optional[Dict[str, Any]]

    # Evaluator's suggested focus question; kept for backward compat, secondary to evaluator_guidance
    probe_question: Optional[str]

    # Natural-language recommendation from evaluator, passed to tutor prompt
    evaluator_guidance: Optional[str]

    # Tangent tracking
    tangent_turns: int       # consecutive turns in tangent (reset on return to main problem)
    tangent_topic: Optional[str]  # what the tangent is about
    is_tangent: bool         # whether the previous turn was a tangent exchange

    latest_evaluation: Optional[Dict[str, Any]]
    module_context: Optional[Dict[str, Any]]
    goal_contexts: Dict[str, List[Dict[str, Any]]]
    session_started_at: Optional[str]
    model_override: Optional[str]
    understanding_trajectory: List[Dict[str, Any]]

    # Per-goal student model: competency_assessments, active_probe_target, turns_since_last_progress
    student_model: Dict[str, Dict[str, Any]]

    # Worked examples / figures / definitions extracted from module material
    module_examples: List[Dict[str, Any]]

    # Supplement from the most recent tutor_turn (equations, definitions, etc.)
    latest_supplement: Optional[str]

    # Generated image data URI from the most recent tutor_turn (if any)
    latest_image_url: Optional[str]


# ============================================================================
# Helper: get current goal dict from state
# ============================================================================


def _get_current_goal(state: TutorState) -> Optional[Dict[str, Any]]:
    current_goal_id = state.get("current_goal_id")
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            return g
    return None


def _get_recent_messages(state: TutorState, n: int = 8) -> List[Dict[str, str]]:
    """Return last N messages as [{"role": "tutor"|"student", "content": "..."}]."""
    result = []
    for msg in state.get("messages", [])[-n:]:
        if isinstance(msg, AIMessage) or (hasattr(msg, "type") and msg.type == "ai"):
            result.append({"role": "tutor", "content": msg.content or ""})
        elif isinstance(msg, HumanMessage) or (hasattr(msg, "type") and msg.type == "human"):
            result.append({"role": "student", "content": msg.content or ""})
    return result


def _get_student_response(state: TutorState) -> str:
    """Return the most recent human message content."""
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage) or (hasattr(msg, "type") and msg.type == "human"):
            return msg.content if hasattr(msg, "content") else str(msg)
    return ""


# ============================================================================
# Node: initialize_session
# ============================================================================


def initialize_session(state: TutorState, config: RunnableConfig) -> dict:
    """Initialize the tutoring session: load module, goals, and build context."""
    logger.info(f"Initializing tutoring session for module: {state['module_id']}")
    module_id = state["module_id"]

    async def fetch_data():
        module = await Module.get(module_id)
        if not module:
            raise ValueError(f"Module not found: {module_id}")
        goals = await module.get_learning_goals()

        # Build module context
        builder = ContextBuilder(
            module_id=module_id,
            include_insights=True,
            include_notes=True,
            max_tokens=30000,
        )
        module_context = await builder.build()

        # Extract lecture examples (figures, worked examples, definitions)
        module_examples = []
        try:
            context_parts = []
            for src in module_context.get("sources", []):
                title = src.get("title") or "Untitled"
                full_text = src.get("full_text") or ""
                if full_text:
                    context_parts.append(f"## Source: {title}\n{full_text[:8000]}")
                for ins in src.get("insights", []):
                    c = ins.get("content", "") if isinstance(ins, dict) else getattr(ins, "content", "")
                    if c:
                        context_parts.append(f"### Insight from {title}\n{c[:2000]}")
            for note in module_context.get("notes", []):
                content = note.get("content") or ""
                if content:
                    context_parts.append(f"## Note\n{content[:4000]}")
            context_text = "\n\n---\n\n".join(context_parts)
            if context_text:
                prompt_data = {"context_text": context_text[:25000]}
                extract_prompt = Prompter(prompt_template="tutor/extract_module_examples").render(
                    data=prompt_data
                )
                model = await provision_langchain_model(
                    extract_prompt,
                    config.get("configurable", {}).get("model_id") or state.get("model_override"),
                    "transformation",
                    max_tokens=1500,
                )
                result = model.with_structured_output(ModuleExamples).invoke(extract_prompt)
                for item in result.worked_examples:
                    module_examples.append({**item.model_dump(), "type": "worked_example"})
                for item in result.figures:
                    module_examples.append({**item.model_dump(), "type": "figure"})
                for item in result.key_definitions:
                    module_examples.append({**item.model_dump(), "type": "key_definition"})
        except Exception as e:
            logger.warning(f"Failed to extract module examples: {e}")

        # Pre-fetch context for each goal — enrich query with anchor examples
        goal_contexts = {}
        for goal in goals:
            try:
                anchor = getattr(goal, "anchor_examples", "") or ""
                query = f"{goal.description}\n{anchor}" if anchor else goal.description
                results = await vector_search(query, results=8, source=True, note=True)
                goal_contexts[goal.id] = results if results else []
            except Exception as e:
                logger.warning(f"Error building goal context for {goal.id}: {e}")
                goal_contexts[goal.id] = []

        return module, goals, module_context, goal_contexts, module_examples

    module, goals, module_context, goal_contexts, module_examples = _run_model(
        lambda: fetch_data()
    )

    # Initialize goal progress (one anchor problem per goal, no question list)
    goal_progress = {}
    for goal in goals:
        goal_progress[goal.id] = {
            "goal_id": goal.id,
            "goal_description": goal.description,
            "started_at": None,
            "completed_at": None,
            "completed": False,
            "anchor_problem": None,
            "exchanges": 0,
            "initial_understanding": None,
            "final_understanding": None,
            "trajectory": [],
        }

    learning_goals = [
        {
            "id": g.id,
            "description": g.description,
            "takeaways": g.takeaways,
            "competencies": g.competencies,
            "anchor_examples": getattr(g, "anchor_examples", "") or "",
            "order": g.order,
        }
        for g in goals
    ]

    logger.info(f"Session initialized with {len(goals)} learning goals")

    return {
        "module_name": module.name,
        "learning_goals": learning_goals,
        "goal_progress": goal_progress,
        "completed_goal_ids": [],
        "module_context": module_context,
        "goal_contexts": goal_contexts,
        "session_started_at": datetime.now().isoformat(),
        "understanding_trajectory": [],
        "anchor_problem": None,
        "opening_framing": None,
        "exchanges_on_goal": 0,
        "total_exchanges_on_goal": 0,
        "competency_statuses": [],
        "active_competency_index": -1,
        "tutor_mode": "opening",
        "probe_question": None,
        "evaluator_guidance": None,
        "tangent_turns": 0,
        "tangent_topic": None,
        "is_tangent": False,
        "student_model": {},
        "module_examples": module_examples,
        "latest_supplement": None,
        "latest_image_url": None,
        "messages": [
            AIMessage(
                content=f"Hey! Ready to work through '{module.name}' together? "
                "I'll ask some questions and we can talk through the concepts — "
                "think of it like a small study group."
            )
        ],
    }


# ============================================================================
# Node: select_next_goal
# ============================================================================


def select_next_goal(state: TutorState, config: RunnableConfig) -> dict:
    """Select the next learning goal (lowest order among unfinished)."""
    logger.info("Selecting next learning goal")

    completed_ids = state.get("completed_goal_ids", [])
    all_goals = state.get("learning_goals", [])
    unfinished = [g for g in all_goals if g["id"] not in completed_ids]

    if not unfinished:
        logger.info("All goals completed")
        return {"current_goal_id": None}

    next_goal = min(unfinished, key=lambda g: g.get("order", 0))
    logger.info(f"Selected goal: {next_goal['id']}")

    goal_progress = dict(state.get("goal_progress", {}))
    if next_goal["id"] in goal_progress:
        goal_progress[next_goal["id"]] = dict(goal_progress[next_goal["id"]])
        goal_progress[next_goal["id"]]["started_at"] = datetime.now().isoformat()

    # Initialize per-competency lifecycle tracking
    competency_names = _parse_competency_names(next_goal.get("competencies", ""))
    competency_statuses = [
        {
            "competency": name,
            "status": "pending",
            "score": 0.0,
            "evidence": [],
            "gap": "",
            "hypotheses": [],
            "encounters": 0,
            "turns_since_progress": 0,
            "hint_count": 0,
        }
        for name in competency_names
    ]

    return {
        "current_goal_id": next_goal["id"],
        "goal_progress": goal_progress,
        # Reset per-goal conversation state
        "anchor_problem": None,
        "opening_framing": None,
        "exchanges_on_goal": 0,
        "total_exchanges_on_goal": 0,
        "competency_statuses": competency_statuses,
        "active_competency_index": -1,  # -1 = open/brain-dump mode
        "tutor_mode": "opening",
        "probe_question": None,
        "evaluator_guidance": None,
        "tangent_turns": 0,
        "tangent_topic": None,
        "is_tangent": False,
        "messages": [AIMessage(content=f"Alright, let's talk about **{next_goal['description']}**.")],
    }


# ============================================================================
# Node: generate_anchor_problem
# ============================================================================


def generate_anchor_problem(state: TutorState, config: RunnableConfig) -> dict:
    """Generate ONE anchor problem for the current goal to explore conversationally."""
    current_goal_id = state["current_goal_id"]
    logger.info(f"Generating anchor problem for goal: {current_goal_id}")

    current_goal = _get_current_goal(state)
    if not current_goal:
        raise ValueError(f"Goal not found: {current_goal_id}")

    context_chunks = state.get("goal_contexts", {}).get(current_goal_id, [])[:5]
    module_examples = state.get("module_examples", [])[:10]

    prompt_data = {
        "goal": current_goal,
        "context_chunks": context_chunks,
        "module_name": state.get("module_name", ""),
        "module_examples": module_examples,
    }

    system_prompt = Prompter(prompt_template="tutor/generate_anchor_problem").render(
        data=prompt_data
    )

    def _provision():
        return provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("model_id") or state.get("model_override"),
            "tools",
            max_tokens=2000,
            reasoning_effort="low",
        )

    model = _run_model(_provision)
    try:
        result: GeneratedAnchorProblem = model.with_structured_output(GeneratedAnchorProblem).invoke(system_prompt)
        anchor_problem = result.anchor_problem
        opening_framing = result.opening_framing
    except Exception as e:
        logger.error(f"Failed to generate anchor problem: {e}")
        anchor_problem = f"Let's work through {current_goal['description']}."
        opening_framing = f"Alright — {current_goal['description']}. Walk me through how you'd approach this."

    if not opening_framing:
        opening_framing = anchor_problem

    # Update goal_progress with anchor_problem
    goal_progress = dict(state.get("goal_progress", {}))
    if current_goal_id in goal_progress:
        goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
        goal_progress[current_goal_id]["anchor_problem"] = anchor_problem

    logger.info(f"Anchor problem generated for goal {current_goal_id}")

    return {
        "anchor_problem": anchor_problem,
        "opening_framing": opening_framing,
        "goal_progress": goal_progress,
        "exchanges_on_goal": 0,
        "total_exchanges_on_goal": 0,
        "tutor_mode": "opening",
        "probe_question": None,
        "evaluator_guidance": None,
        "tangent_turns": 0,
        "tangent_topic": None,
        "is_tangent": False,
    }


# ============================================================================
# Node: tutor_turn  (unified interrupt node)
# ============================================================================


def _build_demonstrated_knowledge(state: TutorState) -> str:
    """Build a summary of what the student has already demonstrated.

    Assembled from competency statuses with evidence and confirmed_knowledge from
    the latest evaluation. Passed to the tutor prompt to prevent re-testing.
    """
    lines = []
    current_goal_id = state.get("current_goal_id")

    # Add mastered competency names
    for comp in state.get("competency_statuses", []):
        if comp.get("status") == "mastered":
            lines.append(f"- Mastered: {comp['competency']}")

    # Add evidence from any competency that has been scored
    for comp in state.get("competency_statuses", []):
        evidence = comp.get("evidence", [])
        if evidence and comp.get("status") != "mastered":
            for ev in evidence[-2:]:  # last 2 evidence entries per competency
                if ev:
                    lines.append(f"- {ev}")

    # Add confirmed_knowledge from latest evaluation
    latest_eval = state.get("latest_evaluation") or {}
    for item in latest_eval.get("confirmed_knowledge", []):
        if item and f"- {item}" not in lines:
            lines.append(f"- {item}")

    # Add from student_model confirmed_knowledge (goal-level)
    if current_goal_id:
        student_model = state.get("student_model", {})
        goal_model = student_model.get(current_goal_id, {})
        for item in goal_model.get("confirmed_knowledge", []):
            if item and f"- {item}" not in lines:
                lines.append(f"- {item}")

    return "\n".join(lines) if lines else ""


def _generate_image(prompt: str) -> Optional[str]:
    """Call OpenAI image generation with the given prompt.

    Returns a data URI (data:image/png;base64,...) on success, or None on failure.
    Failures are logged as warnings and silently swallowed so the tutor turn still
    completes — the image is just omitted from the response.
    """
    try:
        client = openai.OpenAI()
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1024x1024",
            response_format="b64_json",
        )
        b64 = response.data[0].b64_json
        logger.info(f"Image generated successfully (prompt: {prompt[:60]}...)")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        logger.warning(f"Image generation failed, continuing without image: {e}")
        return None


def tutor_turn(state: TutorState, config: RunnableConfig) -> dict:
    """Generate a tutor message and wait for student response.

    Uses a unified prompt with behavioral profile + evaluator guidance.
    Profile is selected by the router (stored in tutor_mode) and maps to
    BEHAVIORAL_PROFILES dict. Evaluator guidance (evaluator_guidance) provides
    the specific context within whatever profile is active.
    """
    tutor_mode = state.get("tutor_mode", "opening")
    current_goal_id = state.get("current_goal_id")
    logger.info(f"tutor_turn in mode={tutor_mode} for goal={current_goal_id}")

    current_goal = _get_current_goal(state)
    competency_statuses = state.get("competency_statuses", [])
    active_idx = state.get("active_competency_index", -1)

    active_competency = (
        competency_statuses[active_idx]
        if 0 <= active_idx < len(competency_statuses)
        else None
    )

    # Find the name of the next pending competency (for transition framing)
    next_pending_competency = None
    if 0 <= active_idx < len(competency_statuses):
        for i in range(active_idx + 1, len(competency_statuses)):
            if competency_statuses[i]["status"] == "pending":
                next_pending_competency = competency_statuses[i]["competency"]
                break

    # Select behavioral profile
    behavioral_profile = BEHAVIORAL_PROFILES.get(tutor_mode, BEHAVIORAL_PROFILES["guide"])

    # Build demonstrated_knowledge summary
    demonstrated_knowledge = _build_demonstrated_knowledge(state)

    # For the opening turn, include opening_framing as a hint in the profile
    if tutor_mode == "opening":
        opening_framing = state.get("opening_framing", "")
        if opening_framing:
            behavioral_profile = BEHAVIORAL_PROFILES["opening"] + f"\n\nOpening framing hint (adapt this naturally): {opening_framing}"

    prompt_data = {
        "goal": current_goal or {},
        "anchor_problem": state.get("anchor_problem", ""),
        "behavioral_profile": behavioral_profile,
        "evaluator_guidance": state.get("evaluator_guidance") or "",
        "demonstrated_knowledge": demonstrated_knowledge,
        "exchanges_on_goal": state.get("exchanges_on_goal", 0),
        "conversation": _get_recent_messages(state, n=8),
        "active_competency": active_competency,
        "next_pending_competency": next_pending_competency,
        "module_examples": state.get("module_examples", [])[:8],
        "context_chunks": state.get("goal_contexts", {}).get(current_goal_id, [])[:3],
    }

    system_prompt = Prompter(prompt_template="tutor/tutor_turn").render(data=prompt_data)

    def _provision():
        # Uses "tutor" type → DEFAULT_TUTOR_MODEL (gpt-5.2, no reasoning).
        # To re-enable reasoning, remove reasoning_effort or set it to "low"/"high".
        return provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("model_id") or state.get("model_override"),
            "tutor",
            max_tokens=1000,
            reasoning_effort="none",
        )

    model = _run_model(_provision)

    message = ""
    supplement = None
    image_prompt = None
    try:
        result: TutorResponse = model.with_structured_output(TutorResponse).invoke(system_prompt)
        message = clean_thinking_content(result.message or "")
        supplement = result.supplement or None
        image_prompt = result.image_prompt or None
        logger.info(
            f"tutor_turn structured output ok | supplement={'yes (' + str(len(supplement)) + ' chars)' if supplement else 'null'}"
            f" | image_prompt={'yes' if image_prompt else 'null'}"
        )
    except Exception as e:
        logger.warning(f"Structured output failed for tutor_turn ({e}); falling back to plain invoke")
        try:
            ai_msg = model.invoke(system_prompt)
            raw = clean_thinking_content(
                ai_msg.content if isinstance(ai_msg.content, str) else str(ai_msg.content)
            )
            # Model may have followed the JSON format in the prompt even without structured output
            try:
                data = json.loads(raw.strip())
                message = clean_thinking_content(data.get("message", "") or "")
                supplement = data.get("supplement") or None
                image_prompt = data.get("image_prompt") or None
                logger.info(f"tutor_turn JSON fallback ok | supplement={'yes' if supplement else 'null'}")
            except json.JSONDecodeError:
                json_match = re.search(r'\{[\s\S]*\}', raw)
                if json_match:
                    try:
                        data = json.loads(json_match.group())
                        message = clean_thinking_content(data.get("message", "") or "")
                        supplement = data.get("supplement") or None
                        image_prompt = data.get("image_prompt") or None
                    except json.JSONDecodeError:
                        message = raw
                else:
                    message = raw
                    logger.info("tutor_turn plain text fallback (no JSON found in response)")
        except Exception as e2:
            logger.error(f"Plain invoke also failed: {e2}")

    if not message:
        message = "What are your thoughts on this?"

    image_url = _generate_image(image_prompt) if image_prompt else None

    # INTERRUPT: pause and wait for the student's response
    student_response = interrupt(
        {
            "type": "tutor_turn",
            "message": message,
            "supplement": supplement,
            "image_url": image_url,
            "tutor_mode": tutor_mode,
            "goal_id": current_goal_id,
        }
    )

    logger.info(f"Received student response ({tutor_mode}): {str(student_response)[:80]}...")

    return {
        "messages": [AIMessage(content=message), HumanMessage(content=student_response)],
        "latest_supplement": supplement,
        "latest_image_url": image_url,
    }


# ============================================================================
# Node: evaluate_and_update_model
# ============================================================================


def _find_next_active_index(competency_statuses: List[Dict[str, Any]], start: int = 0) -> int:
    """Return index of the next competency with status 'pending', or -1 if none."""
    for i in range(start, len(competency_statuses)):
        if competency_statuses[i]["status"] == "pending":
            return i
    return -1


def evaluate_and_update_model(
    state: TutorState, config: RunnableConfig
) -> Command[Literal["tutor_turn", "mark_goal_complete"]]:
    """Evaluate the student's latest response and update the running student model.

    Per-competency flow:
    - active_competency_index == -1: brain-dump mode (first response, open mode)
    - active_competency_index >= 0: focused on that specific competency
    - Each competency progresses: pending → active → mastered (>=0.7) or explained
    - explain_competency mode: explain just this one, advance to next pending
    - Goal completes when all competencies are mastered or explained
    """
    logger.info("Evaluating student response and updating student model")

    current_goal_id = state.get("current_goal_id")
    tutor_mode = state.get("tutor_mode", "socratic")
    current_goal = _get_current_goal(state)
    goal_contexts = state.get("goal_contexts", {})
    goal_progress = dict(state.get("goal_progress", {}))
    student_message = _get_student_response(state)
    competency_statuses = [dict(c) for c in state.get("competency_statuses", [])]
    active_idx = state.get("active_competency_index", -1)

    if not student_message:
        logger.warning("No student message found; routing back to tutor_turn")
        return Command(goto="tutor_turn", update={"tutor_mode": "socratic"})

    is_tangent = state.get("is_tangent", False)
    tangent_turns = state.get("tangent_turns", 0)

    # ---- If the previous turn was a tangent exchange, use lightweight tangent evaluator ----
    if is_tangent:
        # Force-resolve if the previous response already included the reconnect message
        if tangent_turns >= MAX_TANGENT_TURNS:
            logger.info(f"Tangent force-resolve after {tangent_turns} turns — skipping evaluator")
            if 0 <= active_idx < len(competency_statuses):
                re_entry_score = competency_statuses[active_idx].get("score", 0.0)
                re_entry_mode = "nudge" if re_entry_score >= NUDGE_THRESHOLD else "guide"
            else:
                re_entry_mode = "guide"
            return Command(
                goto="tutor_turn",
                update={
                    "competency_statuses": competency_statuses,
                    "is_tangent": False,
                    "tangent_turns": 0,
                    "tangent_topic": None,
                    "tutor_mode": re_entry_mode,
                    "evaluator_guidance": "Student's tangent has been addressed. Pick up where you left off on the active competency — ask them a question to re-engage.",
                    "probe_question": None,
                },
            )

        logger.info(f"Evaluating tangent exchange (turn {tangent_turns})")
        tangent_topic = state.get("tangent_topic", "")
        pending_competencies = [
            {"competency": c["competency"], "score": c.get("score", 0.0), "evidence": c.get("evidence", [])}
            for c in competency_statuses
            if c["status"] == "pending"
        ]

        tangent_prompt_data = {
            "goal": current_goal or {},
            "anchor_problem": state.get("anchor_problem", ""),
            "student_response": student_message,
            "tangent_topic": tangent_topic,
            "tangent_turns": tangent_turns,
            "conversation": _get_recent_messages(state, n=6),
            "pending_competencies": pending_competencies,
        }
        tangent_prompt = Prompter(prompt_template="tutor/evaluate_tangent").render(
            data=tangent_prompt_data
        )

        def _provision_tangent():
            return provision_langchain_model(
                tangent_prompt,
                config.get("configurable", {}).get("model_id") or state.get("model_override"),
                "tools",
                max_tokens=1500,
                reasoning_effort="low",
            )

        tangent_model = _run_model(_provision_tangent)
        try:
            tangent_result: TangentEvaluationResult = tangent_model.with_structured_output(
                TangentEvaluationResult
            ).invoke(tangent_prompt)
        except Exception as e:
            logger.error(f"Failed to parse tangent evaluation: {e}")
            tangent_result = TangentEvaluationResult(
                resolved=True, tutor_guidance="Return to the main problem and continue the discussion."
            )

        # Apply incidental observations (upside-only)
        for obs in tangent_result.incidental_observations:
            if obs.score >= 0.5:
                for comp in competency_statuses:
                    if comp["competency"] == obs.competency and comp["status"] == "pending":
                        evidence_list = list(comp.get("evidence", []))
                        if obs.evidence:
                            evidence_list.append(obs.evidence)
                        comp["score"] = max(comp.get("score", 0.0), obs.score)
                        comp["evidence"] = evidence_list
                        if obs.score >= MASTERY_THRESHOLD:
                            comp["status"] = "mastered"

        new_tangent_turns = 0 if tangent_result.resolved else tangent_turns + 1

        if tangent_result.resolved:
            # Return to normal flow — run full evaluator next exchange
            logger.info("Tangent resolved — returning to main competency flow")
            # Pick appropriate profile for re-entry
            if 0 <= active_idx < len(competency_statuses):
                re_entry_score = competency_statuses[active_idx].get("score", 0.0)
                re_entry_mode = "nudge" if re_entry_score >= NUDGE_THRESHOLD else "guide"
            else:
                re_entry_mode = "guide"
            return Command(
                goto="tutor_turn",
                update={
                    "competency_statuses": competency_statuses,
                    "is_tangent": False,
                    "tangent_turns": 0,
                    "tangent_topic": None,
                    "tutor_mode": re_entry_mode,
                    "evaluator_guidance": tangent_result.tutor_guidance or "Return to the main problem.",
                    "probe_question": None,
                },
            )
        else:
            # Continue tangent; on the last allowed turn override guidance to guarantee reconnect
            if new_tangent_turns >= MAX_TANGENT_TURNS:
                tutor_guidance = (
                    "This is the last tangent exchange. Answer any remaining part of the student's "
                    "question, then reconnect to the main problem — invite them back with a question "
                    "about where they left off. Do not give away the answer to the active competency."
                )
            else:
                tutor_guidance = tangent_result.tutor_guidance or "Continue helping with the tangent."
            logger.info(f"Tangent continuing (turn {new_tangent_turns})")
            return Command(
                goto="tutor_turn",
                update={
                    "competency_statuses": competency_statuses,
                    "is_tangent": True,
                    "tangent_turns": new_tangent_turns,
                    "tutor_mode": "tangent",
                    "evaluator_guidance": tutor_guidance,
                    "probe_question": None,
                },
            )

    # ---- Build evaluation prompt ----
    active_competency_dict = (
        competency_statuses[active_idx] if 0 <= active_idx < len(competency_statuses) else None
    )

    # Prior evidence per competency for the evaluator
    prior_evidence_by_comp = {
        c["competency"]: c.get("evidence", [])
        for c in competency_statuses
        if c.get("evidence")
    }

    context_chunks = goal_contexts.get(current_goal_id, [])[:3]
    module_examples = state.get("module_examples", [])[:8]

    # Pending competencies for mandatory cross-competency evidence scan
    pending_competencies = [
        {"competency": c["competency"], "score": c.get("score", 0.0), "evidence": c.get("evidence", [])}
        for c in competency_statuses
        if c["status"] == "pending"
    ]

    prompt_data = {
        "goal": current_goal or {},
        "anchor_problem": state.get("anchor_problem", ""),
        "student_response": student_message,
        "context_chunks": context_chunks,
        "module_examples": module_examples,
        "prior_evidence": prior_evidence_by_comp,
        "conversation": _get_recent_messages(state, n=6),
        "active_competency": active_competency_dict,
        "pending_competencies": pending_competencies,
    }

    system_prompt = Prompter(prompt_template="tutor/evaluate_understanding").render(
        data=prompt_data
    )

    def _provision():
        return provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("model_id") or state.get("model_override"),
            "tools",
            max_tokens=3000,
            reasoning_effort="none",
        )

    model = _run_model(_provision)

    # ---- Parse evaluation result ----
    try:
        result: EvaluationResult = model.with_structured_output(EvaluationResult).invoke(system_prompt)
        overall = result.overall_score
        needs_more_info = result.needs_more_info
        probe_question = result.probe_question
        suggested_action = result.suggested_next_action
        action_rationale = result.action_rationale or ""
        tutor_guidance = result.tutor_guidance or ""
        tangent_topic_from_eval = result.tangent_topic

        evaluation = {
            "score": overall,
            "overall_score": overall,
            "competency_scores": [cs.model_dump() for cs in result.competency_scores],
            "weakest_competency": result.weakest_competency,
            "notes": result.notes,
            "misconceptions": result.misconceptions,
            "breakthroughs": result.breakthroughs,
            "is_resolved": False,  # resolved via per-competency logic below
            "needs_more_info": needs_more_info,
            "probe_question": probe_question,
            "hypothesized_gaps": result.hypothesized_gaps,
            "confirmed_knowledge": result.confirmed_knowledge,
            "suggested_next_action": suggested_action,
            "action_rationale": action_rationale,
            "tutor_guidance": tutor_guidance,
        }
    except Exception as e:
        logger.error(f"Failed to parse evaluation: {e}")
        evaluation = {
            "score": 0.5, "overall_score": 0.5,
            "competency_scores": [], "weakest_competency": None,
            "notes": "Parsing failed", "misconceptions": [], "breakthroughs": [],
            "is_resolved": False, "needs_more_info": False, "probe_question": None,
            "hypothesized_gaps": [], "confirmed_knowledge": [],
            "suggested_next_action": "continue", "action_rationale": "",
            "tutor_guidance": "",
        }
        result = None
        overall = 0.5
        needs_more_info = False
        probe_question = None
        suggested_action = "continue"
        action_rationale = ""
        tutor_guidance = ""
        tangent_topic_from_eval = None

    # ---- Update competency statuses ----
    # Brain-dump mode (active_idx == -1): score any competencies the student touched
    if active_idx == -1:
        all_scored = []
        if result and result.active_competency_score:
            all_scored.append(result.active_competency_score)
        if result:
            all_scored.extend(result.incidental_observations)

        for cs in all_scored:
            for comp in competency_statuses:
                if comp["competency"] == cs.competency and cs.score >= 0.5:
                    evidence_list = list(comp.get("evidence", []))
                    if cs.evidence:
                        evidence_list.append(cs.evidence)
                    comp["score"] = cs.score
                    comp["evidence"] = evidence_list
                    comp["gap"] = cs.gap
                    comp["hypotheses"] = [h.model_dump() if hasattr(h, "model_dump") else h for h in cs.hypotheses]
                    if cs.score >= MASTERY_THRESHOLD:
                        comp["status"] = "mastered"

        # Advance to first non-mastered pending competency
        next_idx = _find_next_active_index(competency_statuses, start=0)
        if next_idx == -1:
            # All mastered in brain dump — rare but possible
            logger.info("All competencies mastered in brain dump — marking complete")
        else:
            competency_statuses[next_idx]["status"] = "active"
            active_idx = next_idx
            logger.info(f"Brain dump done — activating competency [{active_idx}]: {competency_statuses[active_idx]['competency']}")

    else:
        # Focused mode: update the active competency from active_competency_score
        active_comp = competency_statuses[active_idx]
        if result and result.active_competency_score:
            cs = result.active_competency_score
            prev_score = active_comp["score"]
            new_score = cs.score
            evidence_list = list(active_comp.get("evidence", []))
            if cs.evidence:
                evidence_list.append(cs.evidence)
            active_comp["score"] = new_score
            active_comp["evidence"] = evidence_list
            active_comp["gap"] = cs.gap
            active_comp["hypotheses"] = [h.model_dump() if hasattr(h, "model_dump") else h for h in cs.hypotheses]
            active_comp["encounters"] = active_comp.get("encounters", 0) + 1
            if new_score - prev_score >= 0.05:
                active_comp["turns_since_progress"] = 0
            else:
                active_comp["turns_since_progress"] = active_comp.get("turns_since_progress", 0) + 1

        # Incidental observations: upside-only for non-active competencies
        if result:
            for obs in result.incidental_observations:
                if obs.score < 0.5:
                    continue  # skip anything that isn't clearly positive
                for comp in competency_statuses:
                    if comp["competency"] == obs.competency and comp["status"] == "pending":
                        evidence_list = list(comp.get("evidence", []))
                        if obs.evidence:
                            evidence_list.append(obs.evidence)
                        comp["score"] = max(comp.get("score", 0.0), obs.score)
                        comp["evidence"] = evidence_list
                        if obs.score >= MASTERY_THRESHOLD:
                            comp["status"] = "mastered"
                            logger.info(f"Incidental mastery on '{comp['competency']}' (score={obs.score:.2f})")

    # ---- Derive backward-compat student_model from competency_statuses ----
    student_model = dict(state.get("student_model", {}))
    student_model[current_goal_id] = {
        "competency_assessments": [
            {
                "competency": c["competency"],
                "score": c["score"],
                "evidence": c.get("evidence", []),
                "gap": c.get("gap", ""),
                "hypotheses": c.get("hypotheses", []),
                "attempts": c.get("encounters", 0),
                "status": c["status"],
            }
            for c in competency_statuses
        ],
        "active_probe_target": (
            competency_statuses[active_idx]["competency"]
            if 0 <= active_idx < len(competency_statuses)
            else None
        ),
        "turns_since_last_progress": (
            competency_statuses[active_idx].get("turns_since_progress", 0)
            if 0 <= active_idx < len(competency_statuses)
            else 0
        ),
        "confirmed_knowledge": evaluation.get("confirmed_knowledge", []),
    }

    # ---- Record trajectory point ----
    exchanges_on_goal = state.get("exchanges_on_goal", 0) + 1
    total_exchanges = state.get("total_exchanges_on_goal", 0) + 1
    trajectory_point = {
        "timestamp": datetime.now().isoformat(),
        "goal_id": current_goal_id,
        "exchange_number": exchanges_on_goal,
        "student_message": student_message,
        "understanding_score": evaluation["score"],
        "evaluation_notes": evaluation["notes"],
        "misconceptions": evaluation["misconceptions"],
        "breakthroughs": evaluation["breakthroughs"],
    }
    trajectory = list(state.get("understanding_trajectory", []))
    trajectory.append(trajectory_point)

    if current_goal_id in goal_progress:
        goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
        goal_progress[current_goal_id]["trajectory"] = list(
            goal_progress[current_goal_id].get("trajectory", [])
        )
        goal_progress[current_goal_id]["trajectory"].append(trajectory_point)
        goal_progress[current_goal_id]["exchanges"] = exchanges_on_goal
        if goal_progress[current_goal_id].get("initial_understanding") is None:
            goal_progress[current_goal_id]["initial_understanding"] = evaluation["score"]
        goal_progress[current_goal_id]["final_understanding"] = evaluation["score"]

    active_comp_name = (
        competency_statuses[active_idx]["competency"]
        if 0 <= active_idx < len(competency_statuses)
        else "brain-dump"
    )
    logger.info(
        f"Eval score={evaluation['score']:.2f}, action={suggested_action}, "
        f"active=[{active_idx}] '{active_comp_name}', total_exchanges={total_exchanges}"
    )
    logger.debug(f"  Action rationale: {action_rationale}")
    logger.debug(f"  Notes: {evaluation.get('notes', '')}")
    for c in competency_statuses:
        logger.debug(f"  [{c['score']:.2f}] {c['status']:10s} {c['competency']} | enc={c.get('encounters',0)}")

    state_updates = {
        "understanding_trajectory": trajectory,
        "latest_evaluation": evaluation,
        "goal_progress": goal_progress,
        "student_model": student_model,
        "exchanges_on_goal": exchanges_on_goal,
        "total_exchanges_on_goal": total_exchanges,
        "competency_statuses": competency_statuses,
        "active_competency_index": active_idx,
        "evaluator_guidance": tutor_guidance,
        "is_tangent": False,  # will be overridden for tangent action
        "tangent_turns": 0,
        "tangent_topic": None,
    }

    # ---- Check if all competencies are resolved ----
    all_addressed = all(c["status"] in ("mastered", "explained") for c in competency_statuses)
    if all_addressed:
        logger.info("All competencies addressed — marking goal complete")
        return Command(goto="mark_goal_complete", update=state_updates)

    # ---- Tangent detected by evaluator ----
    if suggested_action == "tangent":
        # Check per-competency tangent episode budget
        tangent_budget_exhausted = False
        if 0 <= active_idx < len(competency_statuses):
            episodes = competency_statuses[active_idx].get("tangent_episodes", 0)
            if episodes >= MAX_TANGENT_EPISODES_PER_COMPETENCY:
                tangent_budget_exhausted = True
                logger.info(f"Tangent budget exhausted ({episodes} episodes on this competency) — treating as continue")

        if tangent_budget_exhausted:
            inline_guidance = (
                f"Student is asking about something off-topic ({tangent_topic_from_eval or 'a side question'}). "
                "We've already addressed side questions on this topic — do NOT answer this one. "
                "Briefly acknowledge their interest, then firmly redirect: say something like "
                "'Let's come back to that later — right now let's focus on [the current problem].' "
                "Then re-engage them with a question about the active competency."
            )
            return Command(
                goto="tutor_turn",
                update={**state_updates, "tutor_mode": "guide", "evaluator_guidance": inline_guidance, "probe_question": None},
            )

        # Budget available — enter tangent mode and increment episode counter
        if 0 <= active_idx < len(competency_statuses):
            competency_statuses[active_idx]["tangent_episodes"] = (
                competency_statuses[active_idx].get("tangent_episodes", 0) + 1
            )
        logger.info(f"Tangent detected: {tangent_topic_from_eval or 'off-topic'}")
        return Command(
            goto="tutor_turn",
            update={
                **state_updates,
                "competency_statuses": competency_statuses,
                "tutor_mode": "tangent",
                "is_tangent": True,
                "tangent_turns": 1,
                "tangent_topic": tangent_topic_from_eval or "",
                "probe_question": None,
            },
        )

    # ---- Safety net: absolute exchange limit ----
    if total_exchanges >= MAX_TOTAL_EXCHANGES_PER_GOAL:
        logger.info(f"Safety net: reached {total_exchanges} total exchanges — switching to explain")
        safety_guidance = (
            tutor_guidance or
            "We've spent a lot of time on this — let me just walk you through it. "
            "Explain the current concept clearly and then move on."
        )
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "explain", "evaluator_guidance": safety_guidance, "probe_question": None},
        )

    # ---- Check if active competency was mastered this turn ----
    if 0 <= active_idx < len(competency_statuses):
        active_comp = competency_statuses[active_idx]
        if active_comp["score"] >= MASTERY_THRESHOLD:
            active_comp["status"] = "mastered"
            next_idx = _find_next_active_index(competency_statuses, start=active_idx + 1)
            if next_idx == -1:
                logger.info("Active competency mastered + no more pending — marking complete")
                return Command(goto="mark_goal_complete", update={**state_updates, "competency_statuses": competency_statuses})
            competency_statuses[next_idx]["status"] = "active"
            logger.info(f"Competency mastered — advancing to [{next_idx}]: {competency_statuses[next_idx]['competency']}")
            prev_comp = active_comp
            transition_guidance = (
                f"Student mastered '{prev_comp['competency']}'. "
                "Celebrate what they demonstrated specifically, then bridge naturally to the next topic."
            )
            return Command(
                goto="tutor_turn",
                update={
                    **state_updates,
                    "competency_statuses": competency_statuses,
                    "active_competency_index": next_idx,
                    "tutor_mode": "transition",
                    "probe_question": None,
                    "evaluator_guidance": transition_guidance,
                    "transitioning_from_competency": {
                        "competency": prev_comp["competency"],
                        "score": prev_comp.get("score", 0.0),
                        "status": prev_comp.get("status", "mastered"),
                        "gap": prev_comp.get("gap", ""),
                        "evidence": prev_comp.get("evidence", []),
                        "hypotheses": prev_comp.get("hypotheses", []),
                    },
                },
            )

    # ---- Evaluator-driven actions on active competency ----
    if suggested_action == "advance":
        # Evaluator signals mastery even if score isn't yet threshold — trust the evaluator
        prev_comp = competency_statuses[active_idx] if 0 <= active_idx < len(competency_statuses) else None
        if prev_comp:
            prev_comp["status"] = "mastered"
        next_idx = _find_next_active_index(competency_statuses, start=active_idx + 1)
        if next_idx == -1:
            return Command(goto="mark_goal_complete", update={**state_updates, "competency_statuses": competency_statuses})
        competency_statuses[next_idx]["status"] = "active"
        logger.info(f"Evaluator advance — moving to [{next_idx}]: {competency_statuses[next_idx]['competency']}")
        if prev_comp:
            prev_status = prev_comp.get("status", "mastered")
            if prev_status == "mastered":
                transition_guidance = (
                    f"Student mastered '{prev_comp['competency']}'. "
                    "Celebrate what they demonstrated specifically, then bridge naturally to the next topic."
                )
            else:
                gap = prev_comp.get("gap", "")
                transition_guidance = (
                    f"Student didn't fully demonstrate '{prev_comp['competency']}' (it was explained to them). "
                    f"Briefly summarize the key takeaway in 1 sentence, then bridge to the next topic without quizzing them on it."
                    + (f" Gap: {gap}" if gap else "")
                )
        else:
            transition_guidance = "Bridge naturally to the next topic."
        return Command(
            goto="tutor_turn",
            update={
                **state_updates,
                "competency_statuses": competency_statuses,
                "active_competency_index": next_idx,
                "tutor_mode": "transition",
                "probe_question": None,
                "evaluator_guidance": transition_guidance,
                "transitioning_from_competency": {
                    "competency": prev_comp["competency"],
                    "score": prev_comp.get("score", 0.0),
                    "status": prev_comp.get("status", "mastered"),
                    "gap": prev_comp.get("gap", ""),
                    "evidence": prev_comp.get("evidence", []),
                    "hypotheses": prev_comp.get("hypotheses", []),
                } if prev_comp else {},
            },
        )

    if suggested_action == "explain_competency":
        logger.info(f"Explain competency: {action_rationale}")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "explain", "probe_question": None},
        )

    if suggested_action == "macro_hint":
        logger.info(f"Macro hint triggered: {action_rationale}")
        # Increment hint_count on active competency so evaluator can apply scoring penalty
        if 0 <= active_idx < len(competency_statuses):
            competency_statuses[active_idx]["hint_count"] = competency_statuses[active_idx].get("hint_count", 0) + 1
        return Command(
            goto="tutor_turn",
            update={**state_updates, "competency_statuses": competency_statuses, "tutor_mode": "give_fact", "probe_question": None},
        )

    if suggested_action == "probe" or needs_more_info:
        logger.info(f"Probe → guide with evaluator guidance: {action_rationale or 'thin response'}")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "guide", "probe_question": probe_question},
        )

    # ---- Per-competency stagnation check ----
    if 0 <= active_idx < len(competency_statuses):
        active_comp = competency_statuses[active_idx]
        stagnation = active_comp.get("turns_since_progress", 0)
        if stagnation >= MAX_NO_PROGRESS_TURNS:
            # If score is already good enough, master instead of explaining
            if active_comp.get("score", 0.0) >= MASTERY_THRESHOLD:
                active_comp["status"] = "mastered"
                next_idx = _find_next_active_index(competency_statuses, start=active_idx + 1)
                logger.info(
                    f"Stagnation but score {active_comp['score']:.2f} >= {MASTERY_THRESHOLD} — mastering instead of explaining"
                )
                if next_idx == -1:
                    return Command(goto="mark_goal_complete", update={**state_updates, "competency_statuses": competency_statuses})
                competency_statuses[next_idx]["status"] = "active"
                stagnation_transition_guidance = (
                    f"Student mastered '{active_comp['competency']}'. "
                    "Celebrate what they demonstrated specifically, then bridge naturally to the next topic."
                )
                return Command(
                    goto="tutor_turn",
                    update={
                        **state_updates,
                        "competency_statuses": competency_statuses,
                        "active_competency_index": next_idx,
                        "tutor_mode": "transition",
                        "probe_question": None,
                        "evaluator_guidance": stagnation_transition_guidance,
                        "transitioning_from_competency": {
                            "competency": active_comp["competency"],
                            "score": active_comp.get("score", 0.0),
                            "status": active_comp.get("status", "mastered"),
                            "gap": active_comp.get("gap", ""),
                            "evidence": active_comp.get("evidence", []),
                            "hypotheses": active_comp.get("hypotheses", []),
                        },
                    },
                )
            logger.info(
                f"Per-competency stagnation: {stagnation} turns no progress — explaining"
            )
            stagnation_guidance = (
                tutor_guidance or
                f"Student has been stuck on this competency for {stagnation} turns without progress. "
                "Explain the concept clearly and move on."
            )
            return Command(
                goto="tutor_turn",
                update={**state_updates, "tutor_mode": "explain", "evaluator_guidance": stagnation_guidance, "probe_question": None},
            )

        # ---- Score-based profile selection ----
        active_score = active_comp.get("score", 0.0)
        if suggested_action == "continue" and active_score >= NUDGE_THRESHOLD:
            logger.info(f"Student is close on active competency (score={active_score:.2f}) — nudging")
            return Command(
                goto="tutor_turn",
                update={**state_updates, "tutor_mode": "nudge", "probe_question": None},
            )

    logger.info("Continuing collaborative dialogue on active competency")
    return Command(
        goto="tutor_turn",
        update={**state_updates, "tutor_mode": "guide", "probe_question": None},
    )


# ============================================================================
# Node: mark_goal_complete
# ============================================================================


def mark_goal_complete(state: TutorState, config: RunnableConfig) -> dict:
    """Mark the current learning goal as complete and reset per-goal state."""
    logger.info(f"Marking goal complete: {state.get('current_goal_id')}")

    current_goal_id = state.get("current_goal_id")
    goal_progress = dict(state.get("goal_progress", {}))
    completed_goal_ids = list(state.get("completed_goal_ids", []))

    competency_statuses = state.get("competency_statuses", [])

    if current_goal_id in goal_progress:
        goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
        goal_progress[current_goal_id]["completed"] = True
        goal_progress[current_goal_id]["completed_at"] = datetime.now().isoformat()
        # Save competency lifecycle snapshot before resetting — preserves evidence, scores, hypotheses
        goal_progress[current_goal_id]["competency_statuses"] = [dict(c) for c in competency_statuses]

    if current_goal_id not in completed_goal_ids:
        completed_goal_ids.append(current_goal_id)

    goal_description = ""
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            goal_description = g["description"]
            break
    mastered = [c for c in competency_statuses if c["status"] == "mastered"]
    explained = [c for c in competency_statuses if c["status"] == "explained"]
    total = len(competency_statuses)

    if explained and total > 0:
        completion_msg = (
            f"Nice work on **{goal_description}**! "
            f"You demonstrated {len(mastered)} out of {total} concepts yourself — "
            "I walked you through the rest. Ready for the next topic?"
        )
    else:
        completion_msg = (
            f"Nice — you've got a solid handle on **{goal_description}**. "
            "Ready for the next topic?"
        )

    return {
        "goal_progress": goal_progress,
        "completed_goal_ids": completed_goal_ids,
        "current_goal_id": None,
        "anchor_problem": None,
        "opening_framing": None,
        "exchanges_on_goal": 0,
        "total_exchanges_on_goal": 0,
        "competency_statuses": [],
        "active_competency_index": -1,
        "tutor_mode": "opening",
        "probe_question": None,
        "evaluator_guidance": None,
        "tangent_turns": 0,
        "tangent_topic": None,
        "is_tangent": False,
        "messages": [AIMessage(content=completion_msg)],
    }


# ============================================================================
# Conditional edge: check_more_goals
# ============================================================================


def check_more_goals(state: TutorState) -> str:
    completed_ids = set(state.get("completed_goal_ids", []))
    all_goals = state.get("learning_goals", [])
    unfinished = [g for g in all_goals if g["id"] not in completed_ids]
    return "more_goals" if unfinished else "all_complete"


# ============================================================================
# Node: generate_summary
# ============================================================================


def generate_summary(state: TutorState, config: RunnableConfig) -> dict:
    """Generate a comprehensive session summary."""
    logger.info("Generating session summary")

    goal_progress = state.get("goal_progress", {})
    session_started = state.get("session_started_at")

    total_goals = len(state.get("learning_goals", []))
    goals_completed = len(state.get("completed_goal_ids", []))
    total_exchanges = 0
    initial_scores, final_scores = [], []
    all_misconceptions, all_breakthroughs = [], []
    goal_summaries = []

    for goal in state.get("learning_goals", []):
        progress = goal_progress.get(goal["id"], {})
        exchanges = progress.get("exchanges", 0)
        total_exchanges += exchanges

        if progress.get("initial_understanding") is not None:
            initial_scores.append(progress["initial_understanding"])
        if progress.get("final_understanding") is not None:
            final_scores.append(progress["final_understanding"])

        for t in progress.get("trajectory", []):
            if isinstance(t, dict):
                all_misconceptions.extend(t.get("misconceptions", []))
                all_breakthroughs.extend(t.get("breakthroughs", []))

        # Include per-competency breakdown from lifecycle snapshot
        comp_statuses = progress.get("competency_statuses", [])
        competency_results = [
            {"name": c.get("competency", ""), "status": c.get("status", "pending"), "score": c.get("score", 0.0)}
            for c in comp_statuses
        ]

        goal_summaries.append({
            "goal_id": goal["id"],
            "description": goal["description"],
            "completed": progress.get("completed", False),
            "exchanges": exchanges,
            "initial_understanding": progress.get("initial_understanding"),
            "final_understanding": progress.get("final_understanding"),
            "competencies": competency_results,
        })

    avg_initial = sum(initial_scores) / len(initial_scores) if initial_scores else 0
    avg_final = sum(final_scores) / len(final_scores) if final_scores else 0
    improvement = avg_final - avg_initial

    duration_seconds = 0
    if session_started:
        try:
            duration_seconds = (datetime.now() - datetime.fromisoformat(session_started)).total_seconds()
        except ValueError:
            pass

    summary_data = {
        "module_name": state.get("module_name", ""),
        "summary": {
            "total_duration_seconds": duration_seconds,
            "total_goals": total_goals,
            "goals_completed": goals_completed,
            "total_exchanges": total_exchanges,
            "average_initial_understanding": avg_initial,
            "average_final_understanding": avg_final,
            "understanding_improvement": improvement,
            "goal_summaries": goal_summaries,
        },
    }

    system_prompt = Prompter(prompt_template="tutor/summary").render(data=summary_data)

    def _provision():
        return provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("model_id") or state.get("model_override"),
            "chat",
            max_tokens=1000,
        )

    model = _run_model(_provision)
    ai_msg = model.invoke(system_prompt)
    narrative = clean_thinking_content(
        ai_msg.content if isinstance(ai_msg.content, str) else str(ai_msg.content)
    )

    # Build per-goal competency breakdown
    goal_details = ""
    for gs in goal_summaries:
        competencies = gs.get("competencies", [])
        if competencies:
            goal_details += f"\n#### {gs['description']}\n"
            for c in competencies:
                score_pct = round(c["score"] * 100)
                status_label = c["status"]
                if status_label == "mastered":
                    goal_details += f"- {c['name']}: mastered ({score_pct}%)\n"
                elif status_label == "explained":
                    goal_details += f"- {c['name']}: explained\n"
                else:
                    goal_details += f"- {c['name']}: {status_label} ({score_pct}%)\n"

    final_message = (
        f"## Session Complete!\n\n{narrative}\n\n"
        f"### Summary\n"
        f"- **Goals Completed**: {goals_completed}/{total_goals}\n"
        f"- **Total Exchanges**: {total_exchanges}\n"
        f"- **Understanding Improvement**: {improvement:+.0%}\n"
        f"- **Duration**: {duration_seconds / 60:.1f} minutes\n"
    )
    if goal_details:
        final_message += f"\n### Per-Goal Results\n{goal_details}"

    return {"messages": [AIMessage(content=final_message)]}


# ============================================================================
# Graph construction
# ============================================================================

conn = sqlite3.connect(LANGGRAPH_CHECKPOINT_FILE, check_same_thread=False)
memory = SqliteSaver(conn)

tutor_state = StateGraph(TutorState)

tutor_state.add_node("initialize", initialize_session)
tutor_state.add_node("select_goal", select_next_goal)
tutor_state.add_node("generate_anchor_problem", generate_anchor_problem)
tutor_state.add_node("tutor_turn", tutor_turn)
tutor_state.add_node("evaluate", evaluate_and_update_model)
tutor_state.add_node("mark_goal_complete", mark_goal_complete)
tutor_state.add_node("summary", generate_summary)

tutor_state.add_edge(START, "initialize")
tutor_state.add_edge("initialize", "select_goal")
tutor_state.add_edge("select_goal", "generate_anchor_problem")
tutor_state.add_edge("generate_anchor_problem", "tutor_turn")
tutor_state.add_edge("tutor_turn", "evaluate")
tutor_state.add_conditional_edges(
    "mark_goal_complete",
    check_more_goals,
    {"more_goals": "select_goal", "all_complete": "summary"},
)
tutor_state.add_edge("summary", END)

tutor_graph = tutor_state.compile(checkpointer=memory)

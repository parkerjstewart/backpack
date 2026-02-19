"""
Socratic Tutoring Agent using LangGraph.

This module implements a conversational tutoring agent that guides students through
learning goals using the Socratic method. Uses interrupt() for human-in-the-loop
conversation flow and Command for dynamic routing based on evaluation results.

Graph flow (per goal):
  initialize → select_goal → generate_anchor_problem
    → tutor_turn [interrupt] → evaluate_and_update_model
        → "continue" (nudge/probe/socratic) → tutor_turn (loop)
        → "mastered" → mark_goal_complete
        → "give_up" → tutor_turn (explain mode) → evaluate → mark_goal_complete
    → mark_goal_complete → [more goals?] → select_goal | summary
    → summary → END
"""

import asyncio
import concurrent.futures
import sqlite3
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional

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
)
from backpack.utils import clean_thinking_content
from backpack.utils.context_builder import ContextBuilder

MAX_EXCHANGES_BEFORE_EXPLAIN = 6
NUDGE_THRESHOLD = 0.55  # weakest competency >= this → nudge instead of full Socratic



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

    # Anchor problem for current goal (replaces current_question / current_question_index)
    anchor_problem: Optional[str]
    opening_framing: Optional[str]
    exchanges_on_goal: int  # resets to 0 on each new goal

    # Conversation mode — drives tutor_turn behavior
    # "open" | "nudge" | "probe" | "socratic" | "macro_hint" | "explain"
    tutor_mode: str

    # Set by evaluate when needs_more_info=True; delivered directly by tutor_turn
    probe_question: Optional[str]

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
        "tutor_mode": "open",
        "probe_question": None,
        "student_model": {},
        "module_examples": module_examples,
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

    return {
        "current_goal_id": next_goal["id"],
        "goal_progress": goal_progress,
        # Reset per-goal conversation state
        "anchor_problem": None,
        "opening_framing": None,
        "exchanges_on_goal": 0,
        "tutor_mode": "open",
        "probe_question": None,
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
            max_tokens=1000,
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
        "tutor_mode": "open",
        "probe_question": None,
    }


# ============================================================================
# Node: tutor_turn  (unified interrupt node)
# ============================================================================


def tutor_turn(state: TutorState, config: RunnableConfig) -> dict:
    """Generate a tutor message and wait for student response.

    Modes:
      open     — First exchange: deliver the opening_framing directly (no LLM call)
      probe    — Deliver probe_question directly (no LLM call)
      nudge    — Short 1-sentence push ("can you say more about X?")
      socratic — 2-3 sentence hypothesis-driven bridging question
      explain  — 2-3 paragraph direct explanation from takeaways
    """
    tutor_mode = state.get("tutor_mode", "open")
    current_goal_id = state.get("current_goal_id")
    logger.info(f"tutor_turn in mode={tutor_mode} for goal={current_goal_id}")

    # --- Modes that don't need an LLM call ---
    if tutor_mode == "open":
        message = state.get("opening_framing") or state.get("anchor_problem") or ""

    elif tutor_mode == "probe":
        message = state.get("probe_question") or "Can you say a bit more about that?"

    else:
        # nudge / socratic / macro_hint / explain — call the LLM
        current_goal = _get_current_goal(state)
        goal_model = state.get("student_model", {}).get(current_goal_id, {})
        active_target = goal_model.get("active_probe_target")
        active_assessment = next(
            (
                a
                for a in goal_model.get("competency_assessments", [])
                if a.get("competency") == active_target
            ),
            {},
        )

        prompt_data = {
            "goal": current_goal or {},
            "anchor_problem": state.get("anchor_problem", ""),
            "tutor_mode": tutor_mode,
            "exchanges_on_goal": state.get("exchanges_on_goal", 0),
            "conversation": _get_recent_messages(state, n=8),
            "student_model": goal_model,
            "active_probe_target": active_target,
            "active_assessment": active_assessment,
            "module_examples": state.get("module_examples", [])[:8],
            "context_chunks": state.get("goal_contexts", {}).get(current_goal_id, [])[:3],
        }

        system_prompt = Prompter(prompt_template="tutor/tutor_turn").render(data=prompt_data)

        def _provision():
            return provision_langchain_model(
                system_prompt,
                config.get("configurable", {}).get("model_id") or state.get("model_override"),
                "chat",
                max_tokens=800,
            )

        model = _run_model(_provision)
        ai_msg = model.invoke(system_prompt)
        message = clean_thinking_content(
            ai_msg.content if isinstance(ai_msg.content, str) else str(ai_msg.content)
        )

    if not message:
        message = "What are your thoughts on this?"

    # INTERRUPT: pause and wait for the student's response
    student_response = interrupt(
        {
            "type": "tutor_turn",
            "message": message,
            "tutor_mode": tutor_mode,
            "goal_id": current_goal_id,
        }
    )

    logger.info(f"Received student response ({tutor_mode}): {str(student_response)[:80]}...")

    return {
        "messages": [AIMessage(content=message), HumanMessage(content=student_response)],
    }


# ============================================================================
# Node: evaluate_and_update_model
# ============================================================================


def evaluate_and_update_model(
    state: TutorState, config: RunnableConfig
) -> Command[Literal["tutor_turn", "mark_goal_complete"]]:
    """Evaluate the student's latest response and update the running student model."""
    logger.info("Evaluating student response and updating student model")

    current_goal_id = state.get("current_goal_id")
    tutor_mode = state.get("tutor_mode", "socratic")
    current_goal = _get_current_goal(state)
    goal_contexts = state.get("goal_contexts", {})
    goal_progress = dict(state.get("goal_progress", {}))
    student_message = _get_student_response(state)

    if not student_message:
        logger.warning("No student message found; routing back to tutor_turn")
        return Command(goto="tutor_turn", update={"tutor_mode": "socratic"})

    # ---- If the previous turn was an explain, just mark complete ----
    if tutor_mode == "explain":
        logger.info("Explain turn acknowledged — marking goal complete")
        return Command(goto="mark_goal_complete", update={})

    # ---- Build evaluation prompt ----
    prior_student_model = state.get("student_model", {}).get(current_goal_id, {})
    prior_assessments = {
        a["competency"]: a
        for a in prior_student_model.get("competency_assessments", [])
    }

    context_chunks = goal_contexts.get(current_goal_id, [])[:3]
    module_examples = state.get("module_examples", [])[:8]

    # Pass prior evidence per competency so the LLM can reason cumulatively
    prior_evidence_by_comp = {
        comp: a.get("evidence", [])
        for comp, a in prior_assessments.items()
    }

    prompt_data = {
        "goal": current_goal or {},
        "anchor_problem": state.get("anchor_problem", ""),
        "student_response": student_message,
        "context_chunks": context_chunks,
        "module_examples": module_examples,
        "prior_evidence": prior_evidence_by_comp,
        "conversation": _get_recent_messages(state, n=6),
    }

    system_prompt = Prompter(prompt_template="tutor/evaluate_understanding").render(
        data=prompt_data
    )

    def _provision():
        return provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("model_id") or state.get("model_override"),
            "tools",
            max_tokens=1500,
        )

    model = _run_model(_provision)

    # ---- Parse evaluation result ----
    try:
        result: EvaluationResult = model.with_structured_output(EvaluationResult).invoke(system_prompt)
        overall = result.overall_score  # already validated 0.0–1.0 by Pydantic
        needs_more_info = result.needs_more_info
        probe_question = result.probe_question
        comp_scores_raw = result.competency_scores

        comp_score_dict: Dict[str, float] = {cs.competency: cs.score for cs in comp_scores_raw}

        # Deterministic resolution: all competencies >= 0.7
        comp_values = list(comp_score_dict.values())
        is_resolved = all(v >= 0.7 for v in comp_values) if comp_values else overall >= 0.7

        evaluation = {
            "score": overall,
            "overall_score": overall,
            "competency_scores": [cs.model_dump() for cs in comp_scores_raw],
            "competency_score_dict": comp_score_dict,
            "weakest_competency": result.weakest_competency,
            "notes": result.notes,
            "misconceptions": result.misconceptions,
            "breakthroughs": result.breakthroughs,
            "is_resolved": is_resolved,
            "needs_more_info": needs_more_info,
            "probe_question": probe_question,
            "hypothesized_gaps": result.hypothesized_gaps,
            "confirmed_knowledge": result.confirmed_knowledge,
            "suggested_next_action": result.suggested_next_action,
            "action_rationale": result.action_rationale,
        }
    except Exception as e:
        logger.error(f"Failed to parse evaluation: {e}")
        evaluation = {
            "score": 0.5, "overall_score": 0.5,
            "competency_scores": [], "competency_score_dict": {},
            "weakest_competency": None, "notes": "Parsing failed",
            "misconceptions": [], "breakthroughs": [],
            "is_resolved": False, "needs_more_info": False, "probe_question": None,
            "hypothesized_gaps": [], "confirmed_knowledge": [],
        }
        comp_score_dict = {}
        is_resolved = False
        needs_more_info = False
        probe_question = None
        overall = 0.5
        comp_scores_raw = []

    # ---- Accumulate student model ----
    new_assessments = []
    for cs in comp_scores_raw:
        prev = prior_assessments.get(cs.competency, {})
        evidence_list = list(prev.get("evidence", []))
        if cs.evidence:
            evidence_list.append(cs.evidence)
        new_assessments.append({
            "competency": cs.competency,
            "score": cs.score,
            "evidence": evidence_list,
            "gap": cs.gap,
            "hypotheses": [h.model_dump() for h in cs.hypotheses],
            "attempts": prev.get("attempts", 0) + 1,
        })

    # Set active_probe_target to weakest unresolved competency
    unresolved = [(a["score"], a["competency"]) for a in new_assessments if a["score"] < 0.7]
    active_probe_target = min(unresolved, key=lambda x: x[0])[1] if unresolved else None

    # Stagnation detection (compare to previous scores)
    prev_comp_scores = {
        a["competency"]: a["score"] for a in prior_student_model.get("competency_assessments", [])
    }
    turns_since_last_progress: int = prior_student_model.get("turns_since_last_progress", 0)
    new_comp_scores = {a["competency"]: a["score"] for a in new_assessments}

    if new_comp_scores and prev_comp_scores:
        improvement = sum(
            max(0.0, new_comp_scores.get(k, 0.0) - prev_comp_scores.get(k, 0.0))
            for k in new_comp_scores
        )
        turns_since_last_progress = 0 if improvement >= 0.05 else turns_since_last_progress + 1
    else:
        turns_since_last_progress = 0

    student_model = dict(state.get("student_model", {}))
    student_model[current_goal_id] = {
        "competency_assessments": new_assessments,
        "active_probe_target": active_probe_target,
        "turns_since_last_progress": turns_since_last_progress,
        "confirmed_knowledge": evaluation.get("confirmed_knowledge", []),
    }

    # ---- Record trajectory point ----
    exchanges_on_goal = state.get("exchanges_on_goal", 0) + 1
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

    state_updates = {
        "understanding_trajectory": trajectory,
        "latest_evaluation": evaluation,
        "goal_progress": goal_progress,
        "student_model": student_model,
        "exchanges_on_goal": exchanges_on_goal,
    }

    suggested_action = evaluation.get("suggested_next_action", "continue")
    action_rationale = evaluation.get("action_rationale") or ""

    logger.info(
        f"Eval score={evaluation['score']:.2f}, resolved={is_resolved}, "
        f"action={suggested_action}, exchanges={exchanges_on_goal}, "
        f"turns_since_progress={turns_since_last_progress}"
    )
    logger.debug(f"  Action rationale: {action_rationale}")
    logger.debug(f"  Notes: {evaluation.get('notes', '')}")
    for cs in comp_scores_raw:
        logger.debug(f"  [{cs.score:.2f}] {cs.competency} | gap: {cs.gap}")
    if active_probe_target:
        logger.debug(f"  Probe target: '{active_probe_target}'")

    # ---- Route ----
    if is_resolved:
        logger.info("Goal mastered — marking complete")
        return Command(goto="mark_goal_complete", update=state_updates)

    weakest_score = min(comp_score_dict.values()) if comp_score_dict else overall

    # Evaluator-driven meta-actions take priority over score-based routing
    if suggested_action == "probe" or needs_more_info:
        logger.info(f"Probing for more info: {action_rationale or 'thin response'}")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "probe", "probe_question": probe_question},
        )

    if suggested_action == "macro_hint":
        logger.info(f"Macro hint triggered: {action_rationale}")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "macro_hint", "probe_question": None},
        )

    if suggested_action == "give_up":
        logger.info(f"Give up — switching to explain: {action_rationale}")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "explain", "probe_question": None},
        )

    # Score-based routing (suggested_action == "continue")
    if exchanges_on_goal >= MAX_EXCHANGES_BEFORE_EXPLAIN or turns_since_last_progress >= 3:
        reason = (
            f"max exchanges ({MAX_EXCHANGES_BEFORE_EXPLAIN})"
            if exchanges_on_goal >= MAX_EXCHANGES_BEFORE_EXPLAIN
            else f"stagnation ({turns_since_last_progress} turns)"
        )
        logger.info(f"Switching to explain mode: {reason}")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "explain", "probe_question": None},
        )

    if weakest_score >= NUDGE_THRESHOLD:
        logger.info(f"Student is close (weakest={weakest_score:.2f}) — nudging")
        return Command(
            goto="tutor_turn",
            update={**state_updates, "tutor_mode": "nudge", "probe_question": None},
        )

    logger.info("Continuing Socratic dialogue")
    return Command(
        goto="tutor_turn",
        update={**state_updates, "tutor_mode": "socratic", "probe_question": None},
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

    if current_goal_id in goal_progress:
        goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
        goal_progress[current_goal_id]["completed"] = True
        goal_progress[current_goal_id]["completed_at"] = datetime.now().isoformat()

    if current_goal_id not in completed_goal_ids:
        completed_goal_ids.append(current_goal_id)

    goal_description = ""
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            goal_description = g["description"]
            break

    return {
        "goal_progress": goal_progress,
        "completed_goal_ids": completed_goal_ids,
        "current_goal_id": None,
        "anchor_problem": None,
        "opening_framing": None,
        "exchanges_on_goal": 0,
        "tutor_mode": "open",
        "probe_question": None,
        "messages": [
            AIMessage(
                content=f"Nice — you've got a solid handle on **{goal_description}**. "
                "Ready for the next topic?"
            )
        ],
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

        goal_summaries.append({
            "goal_id": goal["id"],
            "description": goal["description"],
            "completed": progress.get("completed", False),
            "exchanges": exchanges,
            "initial_understanding": progress.get("initial_understanding"),
            "final_understanding": progress.get("final_understanding"),
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

    final_message = (
        f"## Session Complete!\n\n{narrative}\n\n"
        f"### Summary\n"
        f"- **Goals Completed**: {goals_completed}/{total_goals}\n"
        f"- **Total Exchanges**: {total_exchanges}\n"
        f"- **Understanding Improvement**: {improvement:+.0%}\n"
        f"- **Duration**: {duration_seconds / 60:.1f} minutes\n"
    )

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

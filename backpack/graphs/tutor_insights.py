"""
Session insight generation for the Socratic Tutoring Agent.

Standalone function that synthesizes evaluator data (per-competency scores,
evidence, gaps, hypotheses, and trajectory) into digestible per-goal and
session-level insights. Called from the tutor graph at session end, but can
also be invoked independently for re-generation or batch processing.
"""

import asyncio
import concurrent.futures
from typing import Any, Dict, List, Optional

from ai_prompter import Prompter
from loguru import logger

from backpack.ai.provision import provision_langchain_model
from backpack.graphs.tutor_models import (
    CompetencyResult,
    GeneratedInsights,
    GoalInsight,
    SessionInsights,
)


def _run_model(coro_factory):
    """Run an async model-provisioning coroutine from a sync context.

    Mirrors the pattern used in tutor.py graph nodes.
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


def generate_insights(
    goal_data: List[Dict[str, Any]],
    module_name: str = "",
    model_id: Optional[str] = None,
) -> SessionInsights:
    """Generate session insights from evaluator data.

    Args:
        goal_data: List of dicts, each containing:
            - goal_id: str
            - description: str
            - takeaways: str (from LearningGoal)
            - competencies: str (from LearningGoal)
            - competency_statuses: list of competency snapshot dicts
            - trajectory: list of trajectory point dicts
            - initial_understanding: float or None
            - final_understanding: float or None
        module_name: Module name for prompt context.
        model_id: Optional model override (provider/model-name format).

    Returns:
        SessionInsights with programmatic stats merged with LLM-generated
        knowledge gaps and overall summary.
    """
    logger.info(f"Generating session insights for {len(goal_data)} goals")

    # -- Programmatic stats per goal --
    goal_insights: List[GoalInsight] = []
    for gd in goal_data:
        comp_statuses = gd.get("competency_statuses", [])

        competency_results = [
            CompetencyResult(
                name=c.get("competency", ""),
                status=c.get("status", "pending"),
                score=c.get("score", 0.0),
            )
            for c in comp_statuses
        ]

        scores = [c.get("score", 0.0) for c in comp_statuses]
        final_score = sum(scores) / len(scores) if scores else 0.0

        trajectory = gd.get("trajectory", [])
        score_progression = [
            t.get("understanding_score", 0.0) for t in trajectory
        ]

        goal_insights.append(GoalInsight(
            goal_id=gd["goal_id"],
            goal_description=gd.get("description", ""),
            final_score=final_score,
            score_progression=score_progression,
            knowledge_gap="",
            competency_results=competency_results,
        ))

    # -- Determine strongest / weakest --
    strongest_goal_id = None
    weakest_goal_id = None
    if goal_insights:
        strongest = max(goal_insights, key=lambda g: g.final_score)
        weakest = min(goal_insights, key=lambda g: g.final_score)
        strongest_goal_id = strongest.goal_id
        weakest_goal_id = weakest.goal_id
        if strongest.final_score == weakest.final_score:
            weakest_goal_id = None

    # -- LLM call for qualitative insights --
    prompt_data = {
        "module_name": module_name,
        "goals": goal_data,
    }
    system_prompt = Prompter(prompt_template="tutor/generate_insights").render(
        data=prompt_data
    )

    overall_summary = ""
    gap_by_goal: Dict[str, str] = {}

    try:
        def _provision():
            return provision_langchain_model(
                system_prompt,
                model_id,
                "tools",
                max_tokens=1500,
                reasoning_effort="low",
            )

        model = _run_model(_provision)
        result: GeneratedInsights = model.with_structured_output(
            GeneratedInsights
        ).invoke(system_prompt)

        overall_summary = result.overall_summary or ""
        for gi in result.goal_insights:
            gap_by_goal[gi.goal_id] = gi.knowledge_gap or ""

        logger.info("Session insight LLM call succeeded")
    except Exception as e:
        logger.error(f"Session insight LLM call failed: {e}")

    # -- Merge LLM output into programmatic GoalInsights --
    for gi in goal_insights:
        gi.knowledge_gap = gap_by_goal.get(gi.goal_id, "")

    insights = SessionInsights(
        goal_insights=goal_insights,
        overall_summary=overall_summary,
        strongest_goal_id=strongest_goal_id,
        weakest_goal_id=weakest_goal_id,
    )

    logger.info(
        f"Session insights generated: {len(goal_insights)} goals, "
        f"strongest={strongest_goal_id}, weakest={weakest_goal_id}"
    )
    return insights

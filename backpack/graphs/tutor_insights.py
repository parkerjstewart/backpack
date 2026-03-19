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
    messages: Optional[List[Dict[str, str]]] = None,
) -> SessionInsights:
    """Generate session insights from evaluator data and conversation transcript.

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
        messages: Optional conversation transcript as list of
            {"role": "tutor"|"student", "content": "..."} dicts.

    Returns:
        SessionInsights with programmatic stats merged with LLM-generated
        knowledge gaps, stumbling concepts, tutor nudges, reinforcement
        topics, and overall summary.
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
        "messages": messages or [],
    }
    system_prompt = Prompter(prompt_template="tutor/generate_insights").render(
        data=prompt_data
    )

    overall_summary = ""
    llm_by_goal: Dict[str, Dict[str, Any]] = {}

    try:
        def _provision():
            return provision_langchain_model(
                system_prompt,
                model_id,
                "tools",
                max_tokens=3000,
                reasoning_effort="low",
            )

        model = _run_model(_provision)
        result: GeneratedInsights = model.with_structured_output(
            GeneratedInsights
        ).invoke(system_prompt)

        overall_summary = result.overall_summary or ""
        for gi in result.goal_insights:
            llm_by_goal[gi.goal_id] = {
                "knowledge_gap": gi.knowledge_gap or "",
                "stumbling_concepts": gi.stumbling_concepts or [],
                "tutor_nudges": gi.tutor_nudges or [],
                "reinforcement_topics": gi.reinforcement_topics or [],
            }

        logger.info("Session insight LLM call succeeded")
    except Exception as e:
        logger.error(f"Session insight LLM call failed: {e}")

    # -- Merge LLM output into programmatic GoalInsights --
    for gi in goal_insights:
        llm_data = llm_by_goal.get(gi.goal_id, {})
        gi.knowledge_gap = llm_data.get("knowledge_gap", "")
        gi.stumbling_concepts = llm_data.get("stumbling_concepts", [])
        gi.tutor_nudges = llm_data.get("tutor_nudges", [])
        gi.reinforcement_topics = llm_data.get("reinforcement_topics", [])

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


async def generate_class_insights(
    module_id: str,
    module_name: str = "",
    model_id: Optional[str] = None,
) -> None:
    """Aggregate all student progress for a module and generate a class-level summary.

    Fetches all StudentProgress records, groups by student (latest session each),
    computes aggregate stats, generates an LLM narrative, and persists to
    ModuleClassInsights.
    """
    from backpack.domain.student_progress import (
        ModuleClassInsights,
        StudentProgress,
    )

    logger.info(f"Generating class insights for module {module_id}")

    records = await StudentProgress.get_for_module(module_id)
    if not records:
        await asyncio.sleep(1.5)
        records = await StudentProgress.get_for_module(module_id)
    if not records:
        logger.info(f"No student progress records for module {module_id}")
        return

    # Group by user — keep only the latest session per student
    latest_by_user: Dict[str, Any] = {}
    for r in records:
        uid = str(r.user)
        if uid not in latest_by_user:
            latest_by_user[uid] = r

    student_count = len(latest_by_user)

    # Compute per-goal averages across students
    goal_scores: Dict[str, List[float]] = {}
    goal_descriptions: Dict[str, str] = {}
    all_weak_areas: List[str] = []

    for progress in latest_by_user.values():
        for gi in progress.goal_insights or []:
            gid = gi.get("goal_id", "")
            score = gi.get("final_score", 0.0)
            if gid:
                goal_scores.setdefault(gid, []).append(score)
                if gid not in goal_descriptions:
                    goal_descriptions[gid] = gi.get("goal_description", "")
            all_weak_areas.extend(gi.get("reinforcement_topics", []))
            all_weak_areas.extend(gi.get("stumbling_concepts", []))

    goal_averages = []
    for gid, scores in goal_scores.items():
        goal_averages.append({
            "goal_id": gid,
            "description": goal_descriptions.get(gid, ""),
            "avg_score": sum(scores) / len(scores) if scores else 0.0,
            "student_count": len(scores),
        })

    # Common weak areas — deduplicate by lowercase, keep top 8 by frequency
    area_counts: Dict[str, int] = {}
    area_canonical: Dict[str, str] = {}
    for area in all_weak_areas:
        key = area.lower().strip()
        if key:
            area_counts[key] = area_counts.get(key, 0) + 1
            if key not in area_canonical:
                area_canonical[key] = area
    common_weak_areas = [
        area_canonical[k]
        for k, _ in sorted(area_counts.items(), key=lambda x: -x[1])[:8]
    ]

    # Performance tiers
    mastered = 0
    struggling = 0
    progressing = 0
    for progress in latest_by_user.values():
        gi_list = progress.goal_insights or []
        if not gi_list:
            continue
        scores = [g.get("final_score", 0.0) for g in gi_list]
        if all(s >= 0.65 for s in scores):
            mastered += 1
        elif any(s < 0.4 for s in scores):
            struggling += 1
        else:
            progressing += 1

    performance_tiers = {
        "mastered": mastered,
        "progressing": progressing,
        "struggling": struggling,
    }

    avg_overall = 0.0
    if goal_averages:
        avg_overall = sum(g["avg_score"] for g in goal_averages) / len(goal_averages)

    stats = {
        "avg_overall_score": avg_overall,
        "goal_averages": goal_averages,
        "common_weak_areas": common_weak_areas,
        "performance_tiers": performance_tiers,
    }

    # Build per-student summaries for the LLM prompt
    student_summaries = []
    for progress in latest_by_user.values():
        gi_list = progress.goal_insights or []
        scores = [g.get("final_score", 0.0) for g in gi_list]
        avg = sum(scores) / len(scores) if scores else 0.0
        student_summaries.append({
            "name": str(progress.user).split(":")[-1],
            "avg_score": avg,
            "summary": progress.overall_summary or "",
        })

    # LLM call
    prompt_data = {
        "module_name": module_name,
        "student_count": student_count,
        "goal_averages": goal_averages,
        "common_weak_areas": common_weak_areas,
        "performance_tiers": performance_tiers,
        "student_summaries": student_summaries,
    }
    prompt = Prompter(prompt_template="tutor/class_insights").render(data=prompt_data)

    summary_text = ""
    try:
        model = await provision_langchain_model(
            prompt,
            model_id,
            "tools",
            max_tokens=1000,
            reasoning_effort="low",
        )
        result = model.invoke(prompt)
        summary_text = result.content if hasattr(result, "content") else str(result)
        logger.info("Class insight LLM call succeeded")
    except Exception as e:
        logger.error(f"Class insight LLM call failed: {e}")

    # Persist
    existing = await ModuleClassInsights.get_for_module(module_id)
    if existing:
        existing.summary_text = summary_text
        existing.stats = stats
        existing.student_count = student_count
        await existing.save()
    else:
        record = ModuleClassInsights(
            module=module_id,
            summary_text=summary_text,
            stats=stats,
            student_count=student_count,
        )
        await record.save()

    logger.info(
        f"Class insights saved for module {module_id}: "
        f"{student_count} students, avg={avg_overall:.0%}"
    )

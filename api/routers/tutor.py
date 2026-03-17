"""
Tutor API router for Socratic tutoring sessions.

Provides endpoints for:
- Creating tutoring sessions for a module
- Submitting student responses and getting tutor replies
- Retrieving session state, progress, and trajectory
- Getting session summaries when complete
"""

import asyncio
import json
import queue
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from loguru import logger
from pydantic import BaseModel, Field

from api.routers.authz import get_current_user_id_from_auth, require_authenticated_user_id
from langchain_core.messages import HumanMessage, SystemMessage

from backpack.ai.provision import provision_langchain_model
from backpack.domain.module import Module
from backpack.domain.student_progress import StudentProgress
from backpack.graphs.tutor import tutor_graph
from backpack.utils.token_stream import drain_token_queue

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateSessionRequest(BaseModel):
    """Request to create a new tutoring session."""
    module_id: str = Field(..., description="ID of the module to tutor")
    model_override: Optional[str] = Field(
        None,
        description="Optional model override for this session"
    )


class ArtifactResponse(BaseModel):
    """A single artifact in the session's reference panel."""
    id: str = Field(..., description="Unique artifact ID (art-XXXXXXXX)")
    label: str = Field(..., description="Short display name")
    content: str = Field(..., description="LaTeX/markdown content")
    source_mode: str = Field(..., description="Tutor mode that created this artifact")
    goal_id: Optional[str] = Field(None, description="Learning goal when artifact was created")
    exchange: Optional[int] = Field(None, description="Exchange number when artifact was created")


class CreateSessionResponse(BaseModel):
    """Response after creating a tutoring session."""
    session_id: str = Field(..., description="Unique session identifier")
    module_id: str = Field(..., description="Module ID")
    module_name: str = Field(..., description="Module name")
    first_message: str = Field(..., description="First message from tutor")
    first_image_url: Optional[str] = Field(None, description="Optional generated image data URI for first message")
    artifacts: List[ArtifactResponse] = Field(default_factory=list, description="Accumulated artifacts")
    highlighted_artifact_id: Optional[str] = Field(None, description="Artifact to highlight this turn")
    current_goal_id: Optional[str] = Field(None, description="Current learning goal ID")
    current_goal_description: Optional[str] = Field(None, description="Current goal description")
    total_goals: int = Field(..., description="Total number of learning goals")


class StudentResponseRequest(BaseModel):
    """Request to submit a student response."""
    message: str = Field(..., description="Student's response message")
    whiteboard_png: Optional[str] = Field(
        None,
        description="Optional base64 PNG data URL of the student's whiteboard drawing"
    )


class TutorResponsePayload(BaseModel):
    """Response from tutor after student message."""
    session_id: str = Field(..., description="Session identifier")
    phase: Literal["in_progress", "goal_complete", "session_complete"] = Field(
        ...,
        description="Current phase of the session"
    )

    # Current state
    current_goal_id: Optional[str] = Field(None, description="Current goal ID")
    current_goal_description: Optional[str] = Field(None, description="Current goal description")
    anchor_problem: Optional[str] = Field(None, description="Anchor problem being explored for current goal")

    # The tutor's response message
    tutor_message: str = Field(..., description="Tutor's response")
    tutor_image_url: Optional[str] = Field(None, description="Optional generated image data URI")
    artifact_content: Optional[str] = Field(None, description="Content of newly created artifact (for inline display)")
    artifacts: List[ArtifactResponse] = Field(default_factory=list, description="Accumulated artifacts")
    highlighted_artifact_id: Optional[str] = Field(None, description="Artifact to highlight this turn")

    # Latest evaluation (for real-time feedback)
    latest_understanding_score: Optional[float] = Field(
        None,
        description="Latest overall understanding score (0-1)",
    )
    competency_scores: Optional[Dict[str, float]] = Field(
        None,
        description="Per-competency scores when available",
    )

    # Progress summary
    goals_completed: int = Field(default=0, description="Number of goals completed")
    goals_remaining: int = Field(default=0, description="Number of goals remaining")


class SuggestionsRequest(BaseModel):
    """Request to generate quick reply suggestions."""
    messages: List[Dict[str, str]] = Field(
        ..., description="Recent conversation messages with 'role' and 'content' keys"
    )


class SuggestionsResponse(BaseModel):
    """Response with generated quick reply suggestions."""
    suggestions: List[str] = Field(..., description="2-4 short conversational responses")


class _SuggestionsOutput(BaseModel):
    """Structured output for the suggestions LLM call."""
    suggestions: List[str] = Field(..., description="2-4 short student responses")


class SessionStateResponse(BaseModel):
    """Full session state."""
    session_id: str
    module_id: str
    module_name: str
    phase: str

    # Progress
    total_goals: int
    goals_completed: int
    current_goal_id: Optional[str]
    current_goal_description: Optional[str]
    anchor_problem: Optional[str]

    # Goal progress list
    goal_progress: List[Dict[str, Any]]

    # Session timing
    started_at: Optional[str]
    elapsed_seconds: Optional[float]


class TrajectoryResponse(BaseModel):
    """Understanding trajectory for instructor view."""
    session_id: str
    module_id: str
    module_name: str
    trajectory: List[Dict[str, Any]]
    goal_summaries: List[Dict[str, Any]]


class SessionSummaryResponse(BaseModel):
    """Session summary response."""
    session_id: str
    summary: Dict[str, Any]
    narrative: str


class GoalInsightResponse(BaseModel):
    """Per-goal insight in a student progress response."""
    goal_id: str
    goal_description: str = ""
    final_score: float = 0.0
    score_progression: List[float] = []
    knowledge_gap: str = ""
    stumbling_concepts: List[str] = []
    tutor_nudges: List[str] = []
    reinforcement_topics: List[str] = []
    competency_results: List[Dict[str, Any]] = []


class StudentProgressResponse(BaseModel):
    """A single session's progress record for a student."""
    session_id: str
    module_id: str
    overall_summary: Optional[str] = None
    strongest_goal_id: Optional[str] = None
    weakest_goal_id: Optional[str] = None
    goal_insights: List[GoalInsightResponse] = []
    created: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================

def extract_interrupt_data(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract interrupt data from graph result."""
    interrupts = result.get("__interrupt__")
    if interrupts:
        return interrupts[0].value
    return None


def get_current_goal_info(state: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    """Get current goal ID and description from state."""
    current_goal_id = state.get("current_goal_id")
    current_goal_description = None

    if current_goal_id:
        for goal in state.get("learning_goals", []):
            if goal.get("id") == current_goal_id:
                current_goal_description = goal.get("description")
                break

    return current_goal_id, current_goal_description


def count_goals(state: Dict[str, Any]) -> tuple[int, int]:
    """Count completed and remaining goals."""
    total = len(state.get("learning_goals", []))
    completed = len(state.get("completed_goal_ids", []))
    return completed, total - completed


async def _save_session_insights(
    session_id: str,
    state_values: Dict[str, Any],
    authorization: Optional[str],
) -> None:
    """Persist session insights to SurrealDB when a session completes.

    Fails silently — insights remain available in the LangGraph checkpoint as fallback.
    """
    try:
        user_id = get_current_user_id_from_auth(authorization)
        if not user_id:
            logger.warning(
                f"No authenticated user for session {session_id}; skipping insight save"
            )
            return

        insights = state_values.get("session_insights")
        if not insights:
            logger.warning(f"No session_insights in state for session {session_id}")
            return

        module_id = state_values.get("module_id")
        if not module_id:
            logger.warning(f"No module_id in state for session {session_id}")
            return

        progress = StudentProgress(
            user=user_id,
            module=module_id,
            session_id=session_id,
            overall_summary=insights.get("overall_summary"),
            strongest_goal_id=insights.get("strongest_goal_id"),
            weakest_goal_id=insights.get("weakest_goal_id"),
            goal_insights=insights.get("goal_insights", []),
        )
        await progress.save()
        logger.info(f"Saved session insights for session {session_id}")
    except Exception as e:
        logger.error(f"Failed to save session insights for {session_id}: {e}")


def parse_artifacts(artifacts_raw: List[Any]) -> List[ArtifactResponse]:
    """Safely parse a list of raw artifact dicts into ArtifactResponse objects.

    Skips malformed entries rather than letting a single bad artifact raise
    a 500 on the whole response.
    """
    result = []
    for a in artifacts_raw:
        try:
            result.append(ArtifactResponse.model_validate(a))
        except Exception as e:
            logger.warning(f"Skipping malformed artifact (will not be shown): {e} | data={a}")
    return result


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/tutor/sessions", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest):
    """Create a new tutoring session for a module.

    Initializes the session, selects the first goal, generates questions,
    and returns the first question to present to the student.
    """
    logger.info(f"Creating tutoring session for module: {request.module_id}")

    try:
        # Verify module exists
        module = await Module.get(request.module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")

        # Generate session ID
        session_id = f"tutor-{uuid.uuid4()}"
        config = {"configurable": {"thread_id": session_id}}

        # Start the graph - will initialize and hit first interrupt
        initial_state = {
            "module_id": request.module_id,
            "model_override": request.model_override,
            "messages": [],
            "goal_progress": {},
            "completed_goal_ids": [],
            "goal_contexts": {},
            "understanding_trajectory": [],
        }

        result = tutor_graph.invoke(initial_state, config=config)

        # Extract interrupt data (first question)
        interrupt_data = extract_interrupt_data(result)

        if not interrupt_data:
            raise HTTPException(
                status_code=500,
                detail="Session initialization failed - no interrupt received"
            )

        # Get state for response
        state = tutor_graph.get_state(config=RunnableConfig(**config))
        state_values = state.values if state else result

        current_goal_id, current_goal_description = get_current_goal_info(state_values)
        total_goals = len(state_values.get("learning_goals", []))

        artifacts_raw = interrupt_data.get("artifacts", [])
        return CreateSessionResponse(
            session_id=session_id,
            module_id=request.module_id,
            module_name=state_values.get("module_name", module.name),
            first_message=interrupt_data.get("message", ""),
            first_image_url=interrupt_data.get("image_url"),
            artifacts=parse_artifacts(artifacts_raw),
            highlighted_artifact_id=interrupt_data.get("highlighted_artifact_id"),
            current_goal_id=current_goal_id,
            current_goal_description=current_goal_description,
            total_goals=total_goals,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating tutoring session: {e}")
        logger.exception(e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tutor/sessions/{session_id}", response_model=SessionStateResponse)
async def get_session(session_id: str):
    """Get the current state of a tutoring session."""
    logger.info(f"Getting session state: {session_id}")

    try:
        config = {"configurable": {"thread_id": session_id}}
        state = tutor_graph.get_state(config=RunnableConfig(**config))

        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Session not found")

        state_values = state.values
        current_goal_id, current_goal_description = get_current_goal_info(state_values)
        completed, remaining = count_goals(state_values)

        # Determine phase
        if remaining == 0 and completed > 0:
            phase = "complete"
        elif current_goal_id:
            phase = "in_progress"
        else:
            phase = "initializing"

        # Calculate elapsed time
        started_at = state_values.get("session_started_at")
        elapsed_seconds = None
        if started_at:
            try:
                start_dt = datetime.fromisoformat(started_at)
                elapsed_seconds = (datetime.now() - start_dt).total_seconds()
            except ValueError:
                pass

        # Get goal progress list
        goal_progress_dict = state_values.get("goal_progress", {})
        goal_progress_list = []
        for goal in state_values.get("learning_goals", []):
            progress = goal_progress_dict.get(goal["id"], {})
            goal_progress_list.append({
                "goal_id": goal["id"],
                "description": goal["description"],
                "completed": progress.get("completed", False),
                "exchanges": progress.get("exchanges", 0),
                "anchor_problem": progress.get("anchor_problem"),
            })

        return SessionStateResponse(
            session_id=session_id,
            module_id=state_values.get("module_id", ""),
            module_name=state_values.get("module_name", ""),
            phase=phase,
            total_goals=completed + remaining,
            goals_completed=completed,
            current_goal_id=current_goal_id,
            current_goal_description=current_goal_description,
            anchor_problem=state_values.get("anchor_problem"),
            goal_progress=goal_progress_list,
            started_at=started_at,
            elapsed_seconds=elapsed_seconds,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tutor/sessions/{session_id}/respond", response_model=TutorResponsePayload)
async def submit_response(
    session_id: str,
    request: StudentResponseRequest,
    authorization: Optional[str] = Header(None),
):
    """Submit a student response and get the tutor's reply.

    Resumes the graph with the student's message, evaluates their response,
    and returns either a Socratic follow-up or advances to the next question/goal.
    When the session completes, persists insights to the database.
    """
    logger.info(f"Submitting response to session: {session_id}")

    try:
        config = {"configurable": {"thread_id": session_id}}

        # Check if session exists
        current_state = tutor_graph.get_state(config=RunnableConfig(**config))
        if not current_state or not current_state.values:
            raise HTTPException(status_code=404, detail="Session not found")

        # Resume the graph with the student's response.
        # When a whiteboard PNG is attached, pass a dict so tutor_turn can
        # build a multimodal HumanMessage (text + image).
        if request.whiteboard_png:
            resume_value = {"text": request.message, "whiteboard_png": request.whiteboard_png}
        else:
            resume_value = request.message

        result = tutor_graph.invoke(
            Command(resume=resume_value),
            config=config
        )

        # Get updated state
        updated_state = tutor_graph.get_state(config=RunnableConfig(**config))
        state_values = updated_state.values if updated_state else result

        completed, remaining = count_goals(state_values)
        current_goal_id, current_goal_description = get_current_goal_info(state_values)

        # Check if we hit another interrupt (waiting for next response)
        interrupt_data = extract_interrupt_data(result)

        if interrupt_data:
            # Still in progress - return the tutor's response
            latest_eval = state_values.get("latest_evaluation", {})
            artifacts_raw = interrupt_data.get("artifacts", [])

            return TutorResponsePayload(
                session_id=session_id,
                phase="in_progress",
                current_goal_id=current_goal_id,
                current_goal_description=current_goal_description,
                anchor_problem=state_values.get("anchor_problem"),
                tutor_message=interrupt_data.get("message", ""),
                tutor_image_url=interrupt_data.get("image_url"),
                artifact_content=interrupt_data.get("artifact_content"),
                artifacts=parse_artifacts(artifacts_raw),
                highlighted_artifact_id=interrupt_data.get("highlighted_artifact_id"),
                latest_understanding_score=latest_eval.get("score"),
                competency_scores=latest_eval.get("competency_score_dict"),
                goals_completed=completed,
                goals_remaining=remaining,
            )

        # No interrupt means session might be complete or transitioning
        # Get the last AI message
        messages = state_values.get("messages", [])
        last_ai_message = ""
        for msg in reversed(messages):
            if hasattr(msg, 'type') and msg.type == 'ai':
                last_ai_message = msg.content
                break
            elif isinstance(msg, AIMessage):
                last_ai_message = msg.content
                break

        # Determine phase
        if remaining == 0:
            phase = "session_complete"
        elif not current_goal_id:
            phase = "goal_complete"
        else:
            phase = "in_progress"

        if phase == "session_complete":
            await _save_session_insights(
                session_id=session_id,
                state_values=state_values,
                authorization=authorization,
            )

        artifacts_raw = state_values.get("artifacts", [])
        highlighted_id = state_values.get("highlighted_artifact_id")
        artifact_content = None
        if highlighted_id:
            for art in artifacts_raw:
                if art.get("id") == highlighted_id:
                    artifact_content = art.get("content")
                    break

        return TutorResponsePayload(
            session_id=session_id,
            phase=phase,
            current_goal_id=current_goal_id,
            current_goal_description=current_goal_description,
            anchor_problem=state_values.get("anchor_problem"),
            tutor_message=last_ai_message or "Session updated.",
            tutor_image_url=state_values.get("latest_image_url"),
            artifact_content=artifact_content,
            artifacts=parse_artifacts(artifacts_raw),
            highlighted_artifact_id=highlighted_id,
            latest_understanding_score=state_values.get("latest_evaluation", {}).get("score"),
            competency_scores=state_values.get("latest_evaluation", {}).get("competency_score_dict"),
            goals_completed=completed,
            goals_remaining=remaining,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting response: {e}")
        logger.exception(e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tutor/sessions/{session_id}/respond/stream")
async def stream_tutor_response(session_id: str, request: StudentResponseRequest):
    """Submit a student response and stream the tutor's reply token-by-token via SSE.

    Events emitted:
      data: {"type": "token", "text": "..."}        — one per token chunk
      data: {"type": "complete", "session_id": ..., "phase": ..., ...}  — full payload at end
      data: {"type": "error", "message": "..."}     — on failure
    """
    logger.info(f"Streaming response for session: {session_id}")

    # Validate session before committing to a streaming response (so we can return 404)
    try:
        current_state = tutor_graph.get_state(
            config=RunnableConfig(**{"configurable": {"thread_id": session_id}})
        )
        if not current_state or not current_state.values:
            raise HTTPException(status_code=404, detail="Session not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    token_queue: queue.Queue = queue.Queue()

    if request.whiteboard_png:
        resume_value: Any = {"text": request.message, "whiteboard_png": request.whiteboard_png}
    else:
        resume_value = request.message

    config = {
        "configurable": {
            "thread_id": session_id,
            "token_queue": token_queue,
        }
    }

    async def generate():
        loop = asyncio.get_running_loop()

        # Run the graph in a thread so the sync invoke() doesn't block the event loop.
        # ensure_future (not create_task) is required here: run_in_executor returns an
        # asyncio.Future, and create_task only accepts coroutines.
        graph_task = asyncio.ensure_future(
            loop.run_in_executor(None, tutor_graph.invoke, Command(resume=resume_value), config)
        )

        tokens_emitted = 0
        async for token in drain_token_queue(token_queue, graph_task, session_id):
            yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"
            tokens_emitted += 1
        logger.info(f"stream [{session_id}]: {tokens_emitted} tokens emitted to client")

        # Await the graph result and build the complete payload
        try:
            result = await graph_task
        except Exception as e:
            logger.error(f"Graph error during streaming: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        updated_state = tutor_graph.get_state(config=RunnableConfig(**{"configurable": {"thread_id": session_id}}))
        state_values = updated_state.values if updated_state else result

        completed, remaining = count_goals(state_values)
        current_goal_id, current_goal_description = get_current_goal_info(state_values)
        interrupt_data = extract_interrupt_data(result)
        latest_eval = state_values.get("latest_evaluation", {})

        if interrupt_data:
            phase = "in_progress"
            tutor_message = interrupt_data.get("message", "")
            tutor_image_url = interrupt_data.get("image_url")
            artifact_content = interrupt_data.get("artifact_content")
            highlighted_artifact_id = interrupt_data.get("highlighted_artifact_id")
            artifacts_raw = interrupt_data.get("artifacts", [])
        else:
            messages = state_values.get("messages", [])
            tutor_message = ""
            for msg in reversed(messages):
                if hasattr(msg, "type") and msg.type == "ai":
                    tutor_message = msg.content
                    break
                elif isinstance(msg, AIMessage):
                    tutor_message = msg.content
                    break
            tutor_image_url = state_values.get("latest_image_url")
            artifacts_raw = state_values.get("artifacts", [])
            highlighted_artifact_id = state_values.get("highlighted_artifact_id")
            artifact_content = None
            if highlighted_artifact_id:
                for art in artifacts_raw:
                    if art.get("id") == highlighted_artifact_id:
                        artifact_content = art.get("content")
                        break
            phase = "session_complete" if remaining == 0 else ("goal_complete" if not current_goal_id else "in_progress")

        logger.info(
            f"stream [{session_id}]: complete | interrupt={'yes' if interrupt_data else 'no'} "
            f"| phase={phase} | tutor_message_len={len(tutor_message)}"
        )
        payload = {
            "type": "complete",
            "session_id": session_id,
            "phase": phase,
            "current_goal_id": current_goal_id,
            "current_goal_description": current_goal_description,
            "anchor_problem": state_values.get("anchor_problem"),
            "tutor_message": tutor_message,
            "tutor_image_url": tutor_image_url,
            "artifact_content": artifact_content,
            "artifacts": [a.model_dump() for a in parse_artifacts(artifacts_raw)],
            "highlighted_artifact_id": highlighted_artifact_id,
            "latest_understanding_score": latest_eval.get("score"),
            "competency_scores": latest_eval.get("competency_score_dict"),
            "goals_completed": completed,
            "goals_remaining": remaining,
        }
        yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/tutor/sessions/{session_id}/trajectory", response_model=TrajectoryResponse)
async def get_trajectory(session_id: str):
    """Get the full understanding trajectory for instructor view.

    Returns all understanding points recorded during the session,
    organized by learning goal.
    """
    logger.info(f"Getting trajectory for session: {session_id}")

    try:
        config = {"configurable": {"thread_id": session_id}}
        state = tutor_graph.get_state(config=RunnableConfig(**config))

        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Session not found")

        state_values = state.values
        trajectory = state_values.get("understanding_trajectory", [])

        # Build goal summaries
        goal_progress_dict = state_values.get("goal_progress", {})
        goal_summaries = []

        for goal in state_values.get("learning_goals", []):
            progress = goal_progress_dict.get(goal["id"], {})

            # Get trajectory points for this goal
            goal_trajectory = [t for t in trajectory if t.get("goal_id") == goal["id"]]

            goal_summaries.append({
                "goal_id": goal["id"],
                "description": goal["description"],
                "completed": progress.get("completed", False),
                "initial_understanding": progress.get("initial_understanding"),
                "final_understanding": progress.get("final_understanding"),
                "trajectory_points": len(goal_trajectory),
                "exchanges": progress.get("exchanges", 0),
                "anchor_problem": progress.get("anchor_problem"),
            })

        return TrajectoryResponse(
            session_id=session_id,
            module_id=state_values.get("module_id", ""),
            module_name=state_values.get("module_name", ""),
            trajectory=trajectory,
            goal_summaries=goal_summaries,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting trajectory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DebugStateResponse(BaseModel):
    """Debug state for inspecting tutor agent internals during a session."""
    session_id: str
    tutor_mode: Optional[str] = Field(None, description="Current behavioral profile (opening/guide/nudge/give_fact/explain/transition/tangent)")
    exchanges_on_goal: int = Field(0, description="Number of exchanges on current goal")
    student_model: Optional[Dict[str, Any]] = Field(None, description="Full student model for current goal")
    evaluation_notes: Optional[str] = Field(None, description="Evaluator notes from last exchange")
    action_rationale: Optional[str] = Field(None, description="Evaluator rationale for chosen action")
    evaluator_guidance: Optional[str] = Field(None, description="Natural-language tutor guidance from evaluator")
    latest_understanding_score: Optional[float] = Field(None, description="Overall understanding score (0-1)")
    competency_scores: Optional[Dict[str, float]] = Field(None, description="Per-competency scores")
    # Per-competency lifecycle tracking
    competency_statuses: Optional[List[Dict[str, Any]]] = Field(None, description="Per-competency lifecycle status (pending/active/mastered/explained)")
    active_competency_index: Optional[int] = Field(None, description="Index of currently active competency (-1 = brain-dump)")
    # Goal-level scoring
    goal_score: Optional[float] = Field(None, description="Average competency score for current goal (0-1)")
    competencies_mastered: Optional[int] = Field(None, description="Number of mastered competencies for current goal")
    competencies_total: Optional[int] = Field(None, description="Total number of competencies for current goal")
    evaluator_action: Optional[str] = Field(None, description="Last suggested_next_action from evaluator (advance/continue/probe/macro_hint/explain_competency/tangent)")


@router.get("/tutor/sessions/{session_id}/debug", response_model=DebugStateResponse)
async def get_debug_state(session_id: str):
    """Get the current internal agent state for debugging.

    Returns tutor mode, student model (competency assessments, hypotheses, evidence),
    and the latest evaluation output. Useful for inspecting agent behavior during a session.
    """
    logger.info(f"Getting debug state for session: {session_id}")

    try:
        config = {"configurable": {"thread_id": session_id}}
        state = tutor_graph.get_state(config=RunnableConfig(**config))

        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Session not found")

        sv = state.values
        current_goal_id, _ = get_current_goal_info(sv)
        latest_eval = sv.get("latest_evaluation") or {}
        student_model = sv.get("student_model", {})

        # Compute goal-level scoring from competency statuses
        statuses = sv.get("competency_statuses", [])
        goal_score = None
        competencies_mastered = None
        competencies_total = None
        if statuses:
            goal_score = sum(c.get("score", 0) for c in statuses) / len(statuses)
            competencies_mastered = sum(1 for c in statuses if c.get("status") == "mastered")
            competencies_total = len(statuses)

        return DebugStateResponse(
            session_id=session_id,
            tutor_mode=sv.get("tutor_mode"),
            exchanges_on_goal=sv.get("exchanges_on_goal", 0),
            student_model=student_model.get(current_goal_id) if current_goal_id else None,
            evaluation_notes=latest_eval.get("notes"),
            action_rationale=latest_eval.get("action_rationale"),
            evaluator_guidance=sv.get("evaluator_guidance"),
            latest_understanding_score=latest_eval.get("score"),
            competency_scores=latest_eval.get("competency_score_dict"),
            competency_statuses=sv.get("competency_statuses"),
            active_competency_index=sv.get("active_competency_index"),
            goal_score=goal_score,
            competencies_mastered=competencies_mastered,
            competencies_total=competencies_total,
            evaluator_action=latest_eval.get("suggested_next_action"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting debug state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tutor/sessions/{session_id}/summary", response_model=SessionSummaryResponse)
async def get_summary(session_id: str):
    """Get the session summary (only available when session is complete).

    Returns comprehensive statistics and a narrative summary of the
    student's learning journey.
    """
    logger.info(f"Getting summary for session: {session_id}")

    try:
        config = {"configurable": {"thread_id": session_id}}
        state = tutor_graph.get_state(config=RunnableConfig(**config))

        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Session not found")

        state_values = state.values

        # Check if session is complete
        completed, remaining = count_goals(state_values)
        if remaining > 0:
            raise HTTPException(
                status_code=400,
                detail="Session not complete. Summary only available after all goals are mastered."
            )

        # Build summary from state
        goal_progress_dict = state_values.get("goal_progress", {})
        trajectory = state_values.get("understanding_trajectory", [])

        # Calculate statistics
        total_exchanges = 0
        initial_scores = []
        final_scores = []
        all_misconceptions = []
        all_breakthroughs = []
        goal_summaries = []

        for goal in state_values.get("learning_goals", []):
            progress = goal_progress_dict.get(goal["id"], {})
            exchanges = progress.get("exchanges", 0)
            total_exchanges += exchanges

            if progress.get("initial_understanding") is not None:
                initial_scores.append(progress["initial_understanding"])
            if progress.get("final_understanding") is not None:
                final_scores.append(progress["final_understanding"])

            # Collect from trajectory
            for t in progress.get("trajectory", []):
                if isinstance(t, dict):
                    all_misconceptions.extend(t.get("misconceptions", []))
                    all_breakthroughs.extend(t.get("breakthroughs", []))

            goal_summaries.append({
                "goal_id": goal["id"],
                "description": goal["description"],
                "completed": progress.get("completed", False),
                "exchanges": exchanges,
                "anchor_problem": progress.get("anchor_problem"),
                "initial_understanding": progress.get("initial_understanding"),
                "final_understanding": progress.get("final_understanding"),
            })

        avg_initial = sum(initial_scores) / len(initial_scores) if initial_scores else 0
        avg_final = sum(final_scores) / len(final_scores) if final_scores else 0

        # Get narrative from last AI message (summary was generated)
        messages = state_values.get("messages", [])
        narrative = ""
        for msg in reversed(messages):
            content = msg.content if hasattr(msg, 'content') else str(msg)
            if "Session Complete" in content or "Goals Completed" in content:
                narrative = content
                break

        summary = {
            "session_id": session_id,
            "module_id": state_values.get("module_id", ""),
            "module_name": state_values.get("module_name", ""),
            "total_goals": len(state_values.get("learning_goals", [])),
            "goals_completed": completed,
            "total_exchanges": total_exchanges,
            "average_initial_understanding": avg_initial,
            "average_final_understanding": avg_final,
            "understanding_improvement": avg_final - avg_initial,
            "key_misconceptions": list(set(all_misconceptions))[:10],
            "key_breakthroughs": list(set(all_breakthroughs))[:10],
            "goal_summaries": goal_summaries,
        }

        return SessionSummaryResponse(
            session_id=session_id,
            summary=summary,
            narrative=narrative,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SessionExportResponse(BaseModel):
    """Full export of session data including conversation, competency lifecycle, and trajectories."""
    session_id: str
    module_id: str
    module_name: str
    phase: str
    session_started_at: Optional[str] = None
    messages: List[Dict[str, Any]] = Field(default_factory=list, description="Full conversation [{role, content}]")
    learning_goals: List[Dict[str, Any]] = Field(default_factory=list)
    goal_progress: Dict[str, Any] = Field(default_factory=dict, description="Per-goal data including competency_statuses snapshots for completed goals")
    understanding_trajectory: List[Dict[str, Any]] = Field(default_factory=list, description="All evaluation points across the session")
    student_model: Dict[str, Any] = Field(default_factory=dict, description="Per-goal competency assessments and hypotheses")
    current_state: Optional[Dict[str, Any]] = Field(None, description="Live competency_statuses and active_competency_index if session in progress")


@router.get("/tutor/sessions/{session_id}/export", response_model=SessionExportResponse)
async def export_session(session_id: str):
    """Export full session data for post-session analysis.

    Returns the complete conversation history, per-goal competency lifecycle snapshots
    (including scores, evidence, hypotheses, and hint counts), the full understanding
    trajectory, and the student model. Available during and after the session.
    """
    logger.info(f"Exporting session data: {session_id}")

    try:
        config = {"configurable": {"thread_id": session_id}}
        state = tutor_graph.get_state(config=RunnableConfig(**config))

        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Session not found")

        sv = state.values

        # Convert LangChain messages to plain dicts
        raw_messages = sv.get("messages", [])
        messages = []
        for msg in raw_messages:
            if hasattr(msg, "type"):
                role = "tutor" if msg.type == "ai" else "student"
            else:
                role = "unknown"
            content = msg.content if hasattr(msg, "content") else str(msg)
            messages.append({"role": role, "content": content})

        # Determine in-progress state (competency_statuses is non-empty if goal active)
        current_competency_statuses = sv.get("competency_statuses", [])
        current_state = None
        if current_competency_statuses:
            current_state = {
                "competency_statuses": current_competency_statuses,
                "active_competency_index": sv.get("active_competency_index", -1),
                "tutor_mode": sv.get("tutor_mode"),
                "current_goal_id": sv.get("current_goal_id"),
            }

        # Determine phase
        completed, remaining = count_goals(sv)
        if remaining == 0 and completed > 0:
            phase = "complete"
        elif completed == 0 and remaining > 0:
            phase = "in_progress"
        else:
            phase = "in_progress"

        return SessionExportResponse(
            session_id=session_id,
            module_id=sv.get("module_id", ""),
            module_name=sv.get("module_name", ""),
            phase=phase,
            session_started_at=sv.get("session_started_at"),
            messages=messages,
            learning_goals=sv.get("learning_goals", []),
            goal_progress=sv.get("goal_progress", {}),
            understanding_trajectory=sv.get("understanding_trajectory", []),
            student_model=sv.get("student_model", {}),
            current_state=current_state,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/tutor/modules/{module_id}/progress",
    response_model=List[StudentProgressResponse],
)
async def get_student_module_progress(
    module_id: str,
    authorization: Optional[str] = Header(None),
):
    """Get a student's session-level progress for a module (most recent first)."""
    user_id = require_authenticated_user_id(authorization)

    try:
        records = await StudentProgress.get_for_student(user_id, module_id)

        return [
            StudentProgressResponse(
                session_id=r.session_id,
                module_id=str(r.module),
                overall_summary=r.overall_summary,
                strongest_goal_id=r.strongest_goal_id,
                weakest_goal_id=r.weakest_goal_id,
                goal_insights=[
                    GoalInsightResponse(**gi) for gi in (r.goal_insights or [])
                ],
                created=str(r.created) if r.created else None,
            )
            for r in records
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching student progress for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tutor/sessions/{session_id}/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(session_id: str, request: SuggestionsRequest):
    """Generate 2-4 quick reply suggestions based on recent conversation.

    These are short conversational reactions (not substantive answers) that the
    student can tap to respond immediately, e.g. 'I forgot the formula' or
    'Can you give me a hint?'. The session_id is accepted but not used — all
    context comes from the messages passed in the request body.
    """
    logger.info(f"Generating suggestions for session: {session_id}")

    try:
        system_prompt = (
            "You are helping a student in a Socratic tutoring session. "
            "Based on the conversation so far, generate 2-4 short, honest conversational "
            "reactions the student might naturally say next. These should NOT be substantive "
            "answers to the tutor's question — they should be authentic student reactions like "
            "'I forgot the formula', 'Can you give me a hint?', 'I think I understand now', "
            "'Wait, can you explain that part again?', 'I'm not sure where to start', "
            "'Oh, I see — so it's like...', 'That makes sense', 'I'm confused about X'. "
            "Keep each suggestion under 10 words. Return 2-4 suggestions as a JSON list."
        )

        # Format the last few messages for context
        conversation = "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in request.messages
        )
        human_prompt = f"Conversation:\n{conversation}\n\nGenerate suggestions for the student's next reply."

        model = await provision_langchain_model(conversation, None, "chat", max_tokens=200)
        structured = model.with_structured_output(_SuggestionsOutput)
        result: _SuggestionsOutput = await structured.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ])

        return SuggestionsResponse(suggestions=result.suggestions)

    except Exception as e:
        logger.warning(f"Failed to generate suggestions for {session_id}: {e}")
        # Non-fatal — return empty list so UI degrades gracefully
        return SuggestionsResponse(suggestions=[])
se(suggestions=[])
>>>>>>> origin/main

se(suggestions=[])
>>>>>>> origin/main
se(suggestions=[])
>>>>>>> origin/main

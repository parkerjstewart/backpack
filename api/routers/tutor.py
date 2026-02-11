"""
Tutor API router for Socratic tutoring sessions.

Provides endpoints for:
- Creating tutoring sessions for a module
- Submitting student responses and getting tutor replies
- Retrieving session state, progress, and trajectory
- Getting session summaries when complete
"""

import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from loguru import logger
from pydantic import BaseModel, Field

from backpack.domain.module import Module
from backpack.graphs.tutor import tutor_graph

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


class CreateSessionResponse(BaseModel):
    """Response after creating a tutoring session."""
    session_id: str = Field(..., description="Unique session identifier")
    module_id: str = Field(..., description="Module ID")
    module_name: str = Field(..., description="Module name")
    first_message: str = Field(..., description="First message from tutor")
    current_goal_id: Optional[str] = Field(None, description="Current learning goal ID")
    current_goal_description: Optional[str] = Field(None, description="Current goal description")
    total_goals: int = Field(..., description="Total number of learning goals")


class StudentResponseRequest(BaseModel):
    """Request to submit a student response."""
    message: str = Field(..., description="Student's response message")


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
    current_question_index: Optional[int] = Field(None, description="Current question index")
    current_question_text: Optional[str] = Field(None, description="Current question text")
    
    # The tutor's response message
    tutor_message: str = Field(..., description="Tutor's response")
    
    # Latest evaluation (for real-time feedback)
    latest_understanding_score: Optional[float] = Field(
        None, 
        description="Latest understanding score (0-1)"
    )
    
    # Progress summary
    goals_completed: int = Field(default=0, description="Number of goals completed")
    goals_remaining: int = Field(default=0, description="Number of goals remaining")


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
    current_question_index: Optional[int]
    current_question_text: Optional[str]
    
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


# ============================================================================
# Helper Functions
# ============================================================================

def extract_interrupt_data(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract interrupt data from graph result."""
    if "__interrupt__" in result:
        interrupts = result["__interrupt__"]
        if interrupts and len(interrupts) > 0:
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
        
        return CreateSessionResponse(
            session_id=session_id,
            module_id=request.module_id,
            module_name=state_values.get("module_name", module.name),
            first_message=interrupt_data.get("message", ""),
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
        
        # Get current question info
        current_question = state_values.get("current_question")
        current_question_index = current_question.get("index") if current_question else None
        current_question_text = current_question.get("question_text") if current_question else None
        
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
            from datetime import datetime
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
                "questions_count": len(progress.get("starter_questions", [])),
                "current_question_index": progress.get("current_question_index", 0),
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
            current_question_index=current_question_index,
            current_question_text=current_question_text,
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
async def submit_response(session_id: str, request: StudentResponseRequest):
    """Submit a student response and get the tutor's reply.
    
    Resumes the graph with the student's message, evaluates their response,
    and returns either a Socratic follow-up or advances to the next question/goal.
    """
    logger.info(f"Submitting response to session: {session_id}")
    
    try:
        config = {"configurable": {"thread_id": session_id}}
        
        # Check if session exists
        current_state = tutor_graph.get_state(config=RunnableConfig(**config))
        if not current_state or not current_state.values:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Resume the graph with the student's response
        result = tutor_graph.invoke(
            Command(resume=request.message),
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
            current_question = state_values.get("current_question")
            latest_eval = state_values.get("latest_evaluation", {})
            
            return TutorResponsePayload(
                session_id=session_id,
                phase="in_progress",
                current_goal_id=current_goal_id,
                current_goal_description=current_goal_description,
                current_question_index=current_question.get("index") if current_question else None,
                current_question_text=current_question.get("question_text") if current_question else None,
                tutor_message=interrupt_data.get("message", ""),
                latest_understanding_score=latest_eval.get("score"),
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
            elif hasattr(msg, 'content') and not hasattr(msg, 'type'):
                # AIMessage object
                from langchain_core.messages import AIMessage
                if isinstance(msg, AIMessage):
                    last_ai_message = msg.content
                    break
        
        # Determine phase
        if remaining == 0:
            phase = "session_complete"
        elif not current_goal_id:
            phase = "goal_complete"
        else:
            phase = "in_progress"
        
        return TutorResponsePayload(
            session_id=session_id,
            phase=phase,
            current_goal_id=current_goal_id,
            current_goal_description=current_goal_description,
            current_question_index=None,
            current_question_text=None,
            tutor_message=last_ai_message or "Session updated.",
            latest_understanding_score=state_values.get("latest_evaluation", {}).get("score"),
            goals_completed=completed,
            goals_remaining=remaining,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting response: {e}")
        logger.exception(e)
        raise HTTPException(status_code=500, detail=str(e))


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
                "questions": [
                    {
                        "index": q.get("index"),
                        "text": q.get("question_text"),
                        "resolved": q.get("resolved", False),
                        "exchanges": q.get("exchanges", 0),
                    }
                    for q in progress.get("starter_questions", [])
                ],
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
        total_questions = 0
        total_exchanges = 0
        initial_scores = []
        final_scores = []
        all_misconceptions = []
        all_breakthroughs = []
        goal_summaries = []
        
        for goal in state_values.get("learning_goals", []):
            progress = goal_progress_dict.get(goal["id"], {})
            questions = progress.get("starter_questions", [])
            
            total_questions += len(questions)
            for q in questions:
                total_exchanges += q.get("exchanges", 0)
            
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
                "questions_count": len(questions),
                "total_exchanges": sum(q.get("exchanges", 0) for q in questions),
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
            "total_questions": total_questions,
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

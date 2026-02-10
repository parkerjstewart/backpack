"""
Socratic Tutoring Agent using LangGraph.

This module implements a conversational tutoring agent that guides students through
learning goals using the Socratic method. The agent:

1. Selects learning goals based on topic similarity
2. Generates 2-5 starter questions per goal
3. Engages in Socratic dialogue, using interrupt() to wait for student responses
4. Continuously evaluates understanding and records trajectory
5. Uses Command for dynamic routing based on evaluation results

The graph uses checkpointing for session persistence and interrupt() for
human-in-the-loop conversation flow.
"""

import asyncio
import json
import sqlite3
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional

from ai_prompter import Prompter
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt
from loguru import logger
from pydantic import BaseModel
from typing_extensions import TypedDict

from backpack.ai.provision import provision_langchain_model
from backpack.config import LANGGRAPH_CHECKPOINT_FILE
from backpack.domain.module import LearningGoal, Module, vector_search
from backpack.graphs.tutor_models import (
    EvaluationResult,
    GoalProgress,
    SessionSummary,
    StarterQuestion,
    UnderstandingPoint,
)
from backpack.utils import clean_thinking_content
from backpack.utils.context_builder import ContextBuilder


# ============================================================================
# State Definition
# ============================================================================

class TutorState(TypedDict):
    """State for the Socratic tutoring agent."""
    # Message history
    messages: Annotated[list, add_messages]
    
    # Module information
    module_id: str
    module_name: Optional[str]
    learning_goals: List[Dict[str, Any]]  # Serialized LearningGoal objects
    
    # Goal progress tracking
    goal_progress: Dict[str, Dict[str, Any]]  # goal_id -> GoalProgress as dict
    completed_goal_ids: List[str]
    current_goal_id: Optional[str]
    
    # Current dialogue state
    current_question: Optional[Dict[str, Any]]  # StarterQuestion as dict
    latest_evaluation: Optional[Dict[str, Any]]  # EvaluationResult as dict
    
    # Context (cached from embeddings)
    module_context: Optional[Dict[str, Any]]
    goal_contexts: Dict[str, List[Dict[str, Any]]]  # goal_id -> relevant chunks
    
    # Session metadata
    session_started_at: Optional[str]  # ISO format datetime
    model_override: Optional[str]
    
    # Full trajectory for instructor view
    understanding_trajectory: List[Dict[str, Any]]  # List of UnderstandingPoint dicts


# ============================================================================
# Helper Functions
# ============================================================================

def run_async(coro):
    """Run an async coroutine from sync context, handling event loop issues."""
    try:
        loop = asyncio.get_running_loop()
        # We're in an async context, use thread pool
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            def run_in_new_loop():
                new_loop = asyncio.new_event_loop()
                try:
                    asyncio.set_event_loop(new_loop)
                    return new_loop.run_until_complete(coro)
                finally:
                    new_loop.close()
                    asyncio.set_event_loop(None)
            future = executor.submit(run_in_new_loop)
            return future.result()
    except RuntimeError:
        # No event loop, safe to use asyncio.run
        return asyncio.run(coro)


async def get_module_and_goals(module_id: str) -> tuple[Module, List[LearningGoal]]:
    """Fetch module and its learning goals."""
    module = await Module.get(module_id)
    if not module:
        raise ValueError(f"Module not found: {module_id}")
    
    goals = await module.get_learning_goals()
    return module, goals


async def build_goal_context(goal_description: str, num_results: int = 8) -> List[Dict]:
    """Build context for a specific learning goal using vector search."""
    try:
        results = await vector_search(
            goal_description, 
            results=num_results, 
            source=True, 
            note=True
        )
        return results if results else []
    except Exception as e:
        logger.warning(f"Error building goal context: {e}")
        return []


def get_goal_progress(state: TutorState, goal_id: str) -> Optional[GoalProgress]:
    """Get GoalProgress from state, deserializing from dict."""
    progress_dict = state.get("goal_progress", {}).get(goal_id)
    if progress_dict:
        return GoalProgress(**progress_dict)
    return None


def serialize_goal_progress(progress: GoalProgress) -> Dict[str, Any]:
    """Serialize GoalProgress to dict for state storage."""
    return progress.model_dump()


# ============================================================================
# Graph Nodes
# ============================================================================

def initialize_session(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Initialize the tutoring session.
    
    - Load module and learning goals
    - Build context using ContextBuilder
    - Pre-fetch goal contexts via vector_search
    - Initialize goal_progress dict
    """
    logger.info(f"Initializing tutoring session for module: {state['module_id']}")
    
    module_id = state["module_id"]
    
    # Fetch module and goals
    module, goals = run_async(get_module_and_goals(module_id))
    
    # Build module-level context
    async def build_module_context():
        builder = ContextBuilder(
            module_id=module_id,
            include_insights=True,
            include_notes=True,
            max_tokens=30000
        )
        return await builder.build()
    
    module_context = run_async(build_module_context())
    
    # Pre-fetch context for each learning goal
    goal_contexts = {}
    for goal in goals:
        context = run_async(build_goal_context(goal.description))
        goal_contexts[goal.id] = context
    
    # Initialize goal progress for each goal
    goal_progress = {}
    for goal in goals:
        progress = GoalProgress(
            goal_id=goal.id,
            goal_description=goal.description
        )
        goal_progress[goal.id] = serialize_goal_progress(progress)
    
    # Serialize learning goals
    learning_goals = [
        {
            "id": g.id,
            "description": g.description,
            "mastery_criteria": g.mastery_criteria,
            "order": g.order
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
        "messages": [AIMessage(content=f"Welcome! Let's work through the learning goals for '{module.name}'. I'll guide you through each concept using questions and discussion.")]
    }


def select_next_goal(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Select the next learning goal based on topic similarity.
    
    Prioritizes goals that are topically similar to just-completed goals
    to maintain conversational coherence.
    """
    logger.info("Selecting next learning goal")
    
    completed_ids = state.get("completed_goal_ids", [])
    all_goals = state.get("learning_goals", [])
    
    # Find unfinished goals
    unfinished_goals = [g for g in all_goals if g["id"] not in completed_ids]
    
    if not unfinished_goals:
        logger.info("All goals completed")
        return {"current_goal_id": None}
    
    # If no goals completed yet, pick the first one by order
    if not completed_ids:
        next_goal = min(unfinished_goals, key=lambda g: g.get("order", 0))
        logger.info(f"Selected first goal: {next_goal['id']}")
    else:
        # Select based on topic similarity to last completed goal
        # For now, use a simple heuristic: pick the next one by order
        # TODO: Implement embedding-based similarity
        next_goal = min(unfinished_goals, key=lambda g: g.get("order", 0))
        logger.info(f"Selected next goal by order: {next_goal['id']}")
    
    # Mark the goal as started
    goal_progress = state.get("goal_progress", {})
    if next_goal["id"] in goal_progress:
        progress = GoalProgress(**goal_progress[next_goal["id"]])
        progress.started_at = datetime.now()
        goal_progress[next_goal["id"]] = serialize_goal_progress(progress)
    
    return {
        "current_goal_id": next_goal["id"],
        "goal_progress": goal_progress,
        "messages": [AIMessage(content=f"Let's focus on this learning goal: **{next_goal['description']}**")]
    }


def generate_starter_questions(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Generate 2-5 starter questions for the current learning goal.
    
    Uses the LLM to create questions based on goal complexity and context.
    """
    logger.info(f"Generating starter questions for goal: {state['current_goal_id']}")
    
    current_goal_id = state["current_goal_id"]
    goal_progress = state.get("goal_progress", {})
    goal_contexts = state.get("goal_contexts", {})
    
    # Get the goal details
    current_goal = None
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            current_goal = g
            break
    
    if not current_goal:
        raise ValueError(f"Goal not found: {current_goal_id}")
    
    # Get context for this goal
    context_chunks = goal_contexts.get(current_goal_id, [])
    
    # Build prompt data
    prompt_data = {
        "goal": current_goal,
        "context_chunks": context_chunks[:5],  # Limit context
        "module_name": state.get("module_name", ""),
    }
    
    # Render prompt and call LLM
    system_prompt = Prompter(prompt_template="tutor/generate_questions").render(data=prompt_data)
    
    model = run_async(provision_langchain_model(
        system_prompt,
        config.get("configurable", {}).get("model_id") or state.get("model_override"),
        "tools",
        max_tokens=2000,
        structured=dict(type="json")
    ))
    
    ai_message = run_async(model.ainvoke(system_prompt))
    content = clean_thinking_content(
        ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    )
    
    # Parse the response
    try:
        parsed = json.loads(content)
        questions_data = parsed.get("questions", [])
    except json.JSONDecodeError:
        logger.warning("Failed to parse questions JSON, using defaults")
        questions_data = [
            {"question_text": f"Can you explain what you understand about: {current_goal['description']}?", "target_concepts": [], "expected_depth": "understand"}
        ]
    
    # Create StarterQuestion objects
    starter_questions = []
    for i, q in enumerate(questions_data[:5]):  # Max 5 questions
        question = StarterQuestion(
            index=i,
            question_text=q.get("question_text", q.get("text", "")),
            target_concepts=q.get("target_concepts", []),
            expected_depth=q.get("expected_depth", "understand")
        )
        starter_questions.append(question)
    
    # Ensure at least one question
    if not starter_questions:
        starter_questions.append(StarterQuestion(
            index=0,
            question_text=f"What do you understand about: {current_goal['description']}?",
            target_concepts=[],
            expected_depth="understand"
        ))
    
    # Update goal progress
    progress = GoalProgress(**goal_progress[current_goal_id])
    progress.starter_questions = starter_questions
    progress.current_question_index = 0
    goal_progress[current_goal_id] = serialize_goal_progress(progress)
    
    # Set current question
    current_question = starter_questions[0].model_dump()
    
    logger.info(f"Generated {len(starter_questions)} starter questions")
    
    return {
        "goal_progress": goal_progress,
        "current_question": current_question,
    }


def present_question(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Present a question and wait for student response using interrupt().
    
    This node pauses execution and returns the question to the API.
    When the student responds, execution resumes with their answer.
    """
    logger.info("Presenting question to student")
    
    current_question = state.get("current_question")
    current_goal_id = state.get("current_goal_id")
    
    if not current_question:
        raise ValueError("No current question to present")
    
    # Get goal description
    goal_description = ""
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            goal_description = g["description"]
            break
    
    question_text = current_question.get("question_text", "")
    question_index = current_question.get("index", 0)
    
    # Format the question message
    if question_index == 0:
        message = f"**Question {question_index + 1}:** {question_text}\n\nPlease share your thoughts and reasoning."
    else:
        message = f"**Question {question_index + 1}:** {question_text}"
    
    # INTERRUPT: Pause and wait for student response
    # The interrupt payload is returned to the API caller
    student_response = interrupt({
        "type": "question",
        "message": message,
        "question_index": question_index,
        "goal_id": current_goal_id,
        "goal_description": goal_description,
    })
    
    # When resumed, student_response contains the student's answer
    logger.info(f"Received student response: {student_response[:100]}...")
    
    return {
        "messages": [
            AIMessage(content=message),
            HumanMessage(content=student_response)
        ],
    }


def evaluate_and_route(
    state: TutorState, 
    config: RunnableConfig
) -> Command[Literal["socratic_response", "advance_to_next_question", "mark_goal_complete"]]:
    """Evaluate student understanding and route to next step.
    
    Uses the LLM to score the response and identify misconceptions/breakthroughs.
    Returns a Command to dynamically route based on the evaluation.
    """
    logger.info("Evaluating student response")
    
    current_goal_id = state.get("current_goal_id")
    current_question = state.get("current_question")
    goal_contexts = state.get("goal_contexts", {})
    goal_progress_dict = state.get("goal_progress", {})
    
    # Get the student's latest message
    messages = state.get("messages", [])
    student_message = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human'):
            student_message = msg.content if hasattr(msg, 'content') else str(msg)
            break
    
    if not student_message:
        logger.warning("No student message found")
        return Command(
            goto="socratic_response",
            update={"latest_evaluation": EvaluationResult.from_score(0.0, "No response found").model_dump()}
        )
    
    # Get goal and context
    current_goal = None
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            current_goal = g
            break
    
    context_chunks = goal_contexts.get(current_goal_id, [])
    
    # Build prompt data for evaluation
    prompt_data = {
        "goal": current_goal,
        "question": current_question,
        "student_response": student_message,
        "context_chunks": context_chunks[:3],
    }
    
    # Call LLM for evaluation
    system_prompt = Prompter(prompt_template="tutor/evaluate_understanding").render(data=prompt_data)
    
    model = run_async(provision_langchain_model(
        system_prompt,
        config.get("configurable", {}).get("model_id") or state.get("model_override"),
        "tools",
        max_tokens=1000,
        structured=dict(type="json")
    ))
    
    ai_message = run_async(model.ainvoke(system_prompt))
    content = clean_thinking_content(
        ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    )
    
    # Parse evaluation result
    try:
        parsed = json.loads(content)
        evaluation = EvaluationResult(
            score=float(parsed.get("score", 0.5)),
            evaluation_notes=parsed.get("notes", ""),
            misconceptions=parsed.get("misconceptions", []),
            breakthroughs=parsed.get("breakthroughs", []),
            is_resolved=float(parsed.get("score", 0.5)) >= 0.7
        )
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Failed to parse evaluation: {e}")
        evaluation = EvaluationResult.from_score(0.5, "Evaluation parsing failed")
    
    # Record trajectory point
    trajectory_point = UnderstandingPoint(
        timestamp=datetime.now(),
        goal_id=current_goal_id,
        question_index=current_question.get("index", 0),
        exchange_number=current_question.get("exchanges", 0) + 1,
        student_message=student_message,
        understanding_score=evaluation.score,
        evaluation_notes=evaluation.evaluation_notes,
        misconceptions=evaluation.misconceptions,
        breakthroughs=evaluation.breakthroughs,
    )
    
    # Update trajectory
    trajectory = state.get("understanding_trajectory", [])
    trajectory.append(trajectory_point.model_dump())
    
    # Update goal progress trajectory
    if current_goal_id in goal_progress_dict:
        progress = GoalProgress(**goal_progress_dict[current_goal_id])
        progress.trajectory.append(trajectory_point)
        
        # Update initial/final understanding
        if progress.initial_understanding is None:
            progress.initial_understanding = evaluation.score
        progress.final_understanding = evaluation.score
        
        goal_progress_dict[current_goal_id] = serialize_goal_progress(progress)
    
    # Update current question exchange count
    updated_question = dict(current_question)
    updated_question["exchanges"] = updated_question.get("exchanges", 0) + 1
    
    logger.info(f"Evaluation score: {evaluation.score}, resolved: {evaluation.is_resolved}")
    
    # Determine routing
    state_updates = {
        "understanding_trajectory": trajectory,
        "latest_evaluation": evaluation.model_dump(),
        "goal_progress": goal_progress_dict,
        "current_question": updated_question,
    }
    
    if evaluation.is_resolved:
        # Check if there are more questions
        progress = GoalProgress(**goal_progress_dict[current_goal_id])
        if progress.has_more_questions():
            logger.info("Question resolved, advancing to next question")
            return Command(goto="advance_to_next_question", update=state_updates)
        else:
            logger.info("Question resolved, goal complete")
            return Command(goto="mark_goal_complete", update=state_updates)
    else:
        # Continue Socratic dialogue
        logger.info("Continuing Socratic dialogue")
        return Command(goto="socratic_response", update=state_updates)


def socratic_response(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Generate a Socratic response and wait for next student input.
    
    Creates a response that:
    - Acknowledges what the student got right
    - Asks guiding questions for misconceptions
    - Provides hints without giving answers directly
    - Cites course materials
    """
    logger.info("Generating Socratic response")
    
    current_goal_id = state.get("current_goal_id")
    current_question = state.get("current_question")
    latest_evaluation = state.get("latest_evaluation", {})
    goal_contexts = state.get("goal_contexts", {})
    
    # Get student's last message
    messages = state.get("messages", [])
    student_message = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human'):
            student_message = msg.content if hasattr(msg, 'content') else str(msg)
            break
    
    # Get goal
    current_goal = None
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            current_goal = g
            break
    
    context_chunks = goal_contexts.get(current_goal_id, [])
    
    # Build prompt data
    prompt_data = {
        "goal": current_goal,
        "current_question": current_question,
        "student_response": student_message,
        "understanding_score": latest_evaluation.get("score", 0.5),
        "misconceptions": latest_evaluation.get("misconceptions", []),
        "breakthroughs": latest_evaluation.get("breakthroughs", []),
        "context_chunks": context_chunks[:5],
    }
    
    # Generate Socratic response
    system_prompt = Prompter(prompt_template="tutor/socratic_response").render(data=prompt_data)
    
    model = run_async(provision_langchain_model(
        system_prompt,
        config.get("configurable", {}).get("model_id") or state.get("model_override"),
        "chat",
        max_tokens=1500,
    ))
    
    ai_message = run_async(model.ainvoke(system_prompt))
    socratic_message = clean_thinking_content(
        ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    )
    
    # INTERRUPT: Wait for student's next response
    student_response = interrupt({
        "type": "socratic_dialogue",
        "message": socratic_message,
        "evaluation": latest_evaluation,
        "exchange_number": current_question.get("exchanges", 0) + 1,
        "goal_id": current_goal_id,
    })
    
    logger.info(f"Received follow-up response: {student_response[:100]}...")
    
    return {
        "messages": [
            AIMessage(content=socratic_message),
            HumanMessage(content=student_response)
        ],
    }


def advance_to_next_question(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Advance to the next starter question for the current goal."""
    logger.info("Advancing to next question")
    
    current_goal_id = state.get("current_goal_id")
    goal_progress_dict = state.get("goal_progress", {})
    
    if current_goal_id not in goal_progress_dict:
        raise ValueError(f"Goal progress not found: {current_goal_id}")
    
    progress = GoalProgress(**goal_progress_dict[current_goal_id])
    
    # Mark current question as resolved
    if progress.starter_questions and progress.current_question_index < len(progress.starter_questions):
        progress.starter_questions[progress.current_question_index].resolved = True
    
    # Advance to next question
    next_question = progress.advance_to_next_question()
    
    goal_progress_dict[current_goal_id] = serialize_goal_progress(progress)
    
    return {
        "goal_progress": goal_progress_dict,
        "current_question": next_question.model_dump() if next_question else None,
        "messages": [AIMessage(content="Great progress! Let's move on to the next question.")],
    }


def mark_goal_complete(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Mark the current learning goal as complete."""
    logger.info(f"Marking goal complete: {state['current_goal_id']}")
    
    current_goal_id = state.get("current_goal_id")
    goal_progress_dict = state.get("goal_progress", {})
    completed_goal_ids = list(state.get("completed_goal_ids", []))
    
    if current_goal_id in goal_progress_dict:
        progress = GoalProgress(**goal_progress_dict[current_goal_id])
        progress.completed = True
        progress.completed_at = datetime.now()
        
        # Mark last question as resolved
        if progress.starter_questions and progress.current_question_index < len(progress.starter_questions):
            progress.starter_questions[progress.current_question_index].resolved = True
        
        goal_progress_dict[current_goal_id] = serialize_goal_progress(progress)
    
    # Add to completed list
    if current_goal_id not in completed_goal_ids:
        completed_goal_ids.append(current_goal_id)
    
    # Get goal description for message
    goal_description = ""
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            goal_description = g["description"]
            break
    
    return {
        "goal_progress": goal_progress_dict,
        "completed_goal_ids": completed_goal_ids,
        "current_goal_id": None,
        "current_question": None,
        "messages": [AIMessage(content=f"Excellent! You've demonstrated understanding of: **{goal_description}**\n\nLet's continue to the next topic.")],
    }


def check_more_goals(state: TutorState) -> str:
    """Check if there are more goals to complete."""
    completed_ids = set(state.get("completed_goal_ids", []))
    all_goals = state.get("learning_goals", [])
    
    unfinished = [g for g in all_goals if g["id"] not in completed_ids]
    
    if unfinished:
        return "more_goals"
    return "all_complete"


def check_more_questions(state: TutorState) -> str:
    """Check if there are more questions for the current goal."""
    current_goal_id = state.get("current_goal_id")
    goal_progress_dict = state.get("goal_progress", {})
    
    if current_goal_id and current_goal_id in goal_progress_dict:
        progress = GoalProgress(**goal_progress_dict[current_goal_id])
        if progress.has_more_questions():
            return "more_questions"
    
    return "goal_complete"


def generate_summary(state: TutorState, config: RunnableConfig) -> Dict[str, Any]:
    """Generate a comprehensive session summary.
    
    Compiles statistics and generates a narrative summary of the student's
    learning journey.
    """
    logger.info("Generating session summary")
    
    goal_progress_dict = state.get("goal_progress", {})
    trajectory = state.get("understanding_trajectory", [])
    session_started = state.get("session_started_at")
    
    # Calculate statistics
    total_goals = len(state.get("learning_goals", []))
    goals_completed = len(state.get("completed_goal_ids", []))
    
    total_questions = 0
    total_exchanges = 0
    goal_summaries = []
    all_misconceptions = []
    all_breakthroughs = []
    initial_scores = []
    final_scores = []
    
    for goal_id, progress_dict in goal_progress_dict.items():
        progress = GoalProgress(**progress_dict)
        total_questions += len(progress.starter_questions)
        
        for q in progress.starter_questions:
            total_exchanges += q.exchanges
        
        if progress.initial_understanding is not None:
            initial_scores.append(progress.initial_understanding)
        if progress.final_understanding is not None:
            final_scores.append(progress.final_understanding)
        
        # Collect misconceptions and breakthroughs
        for tp in progress.trajectory:
            if isinstance(tp, dict):
                all_misconceptions.extend(tp.get("misconceptions", []))
                all_breakthroughs.extend(tp.get("breakthroughs", []))
            else:
                all_misconceptions.extend(tp.misconceptions)
                all_breakthroughs.extend(tp.breakthroughs)
        
        # Goal summary
        duration = progress.get_duration_seconds()
        goal_summaries.append({
            "goal_id": goal_id,
            "description": progress.goal_description,
            "completed": progress.completed,
            "questions_count": len(progress.starter_questions),
            "total_exchanges": sum(q.exchanges for q in progress.starter_questions),
            "initial_understanding": progress.initial_understanding,
            "final_understanding": progress.final_understanding,
            "duration_seconds": duration,
        })
    
    # Calculate averages
    avg_initial = sum(initial_scores) / len(initial_scores) if initial_scores else 0
    avg_final = sum(final_scores) / len(final_scores) if final_scores else 0
    improvement = avg_final - avg_initial
    
    # Build summary
    completed_at = datetime.now()
    started_at = datetime.fromisoformat(session_started) if session_started else completed_at
    
    summary = SessionSummary(
        session_id=config.get("configurable", {}).get("thread_id", "unknown"),
        module_id=state.get("module_id", ""),
        module_name=state.get("module_name", ""),
        started_at=started_at,
        completed_at=completed_at,
        total_duration_seconds=(completed_at - started_at).total_seconds(),
        total_goals=total_goals,
        goals_completed=goals_completed,
        total_questions=total_questions,
        total_exchanges=total_exchanges,
        goal_summaries=goal_summaries,
        average_initial_understanding=avg_initial,
        average_final_understanding=avg_final,
        understanding_improvement=improvement,
        key_misconceptions=list(set(all_misconceptions))[:10],
        key_breakthroughs=list(set(all_breakthroughs))[:10],
    )
    
    # Generate narrative summary using LLM
    prompt_data = {
        "summary": summary.model_dump(),
        "module_name": state.get("module_name", ""),
    }
    
    system_prompt = Prompter(prompt_template="tutor/summary").render(data=prompt_data)
    
    model = run_async(provision_langchain_model(
        system_prompt,
        config.get("configurable", {}).get("model_id") or state.get("model_override"),
        "chat",
        max_tokens=1000,
    ))
    
    ai_message = run_async(model.ainvoke(system_prompt))
    narrative = clean_thinking_content(
        ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    )
    
    summary.narrative = narrative
    
    final_message = f"""## Session Complete! 🎉

{narrative}

### Summary Statistics
- **Goals Completed**: {goals_completed}/{total_goals}
- **Total Questions Discussed**: {total_questions}
- **Total Exchanges**: {total_exchanges}
- **Understanding Improvement**: {improvement:+.0%}
- **Duration**: {summary.total_duration_seconds / 60:.1f} minutes
"""
    
    return {
        "messages": [AIMessage(content=final_message)],
    }


# ============================================================================
# Graph Construction
# ============================================================================

def build_tutor_graph() -> StateGraph:
    """Build the complete tutoring agent graph."""
    
    graph = StateGraph(TutorState)
    
    # Add nodes
    graph.add_node("initialize", initialize_session)
    graph.add_node("select_goal", select_next_goal)
    graph.add_node("generate_questions", generate_starter_questions)
    graph.add_node("present_question", present_question)
    graph.add_node("evaluate", evaluate_and_route)
    graph.add_node("socratic_response", socratic_response)
    graph.add_node("advance_to_next_question", advance_to_next_question)
    graph.add_node("mark_goal_complete", mark_goal_complete)
    graph.add_node("summary", generate_summary)
    
    # Add edges
    graph.add_edge(START, "initialize")
    graph.add_edge("initialize", "select_goal")
    graph.add_edge("select_goal", "generate_questions")
    graph.add_edge("generate_questions", "present_question")
    graph.add_edge("present_question", "evaluate")
    
    # evaluate uses Command for routing - no explicit edges needed for its targets
    # but we need edges FROM socratic_response back to evaluate
    graph.add_edge("socratic_response", "evaluate")
    
    # advance_to_next_question goes back to present_question
    graph.add_edge("advance_to_next_question", "present_question")
    
    # mark_goal_complete checks if more goals
    graph.add_conditional_edges(
        "mark_goal_complete",
        check_more_goals,
        {
            "more_goals": "select_goal",
            "all_complete": "summary"
        }
    )
    
    graph.add_edge("summary", END)
    
    return graph


# Create the compiled graph with checkpointer
conn = sqlite3.connect(LANGGRAPH_CHECKPOINT_FILE, check_same_thread=False)
memory = SqliteSaver(conn)

tutor_graph = build_tutor_graph().compile(checkpointer=memory)

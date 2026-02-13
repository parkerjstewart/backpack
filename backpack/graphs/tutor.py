"""
Socratic Tutoring Agent using LangGraph.

This module implements a conversational tutoring agent that guides students through
learning goals using the Socratic method. Uses interrupt() for human-in-the-loop
conversation flow and Command for dynamic routing based on evaluation results.
"""

import asyncio
import json
import re
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
from backpack.domain.module import LearningGoal, Module, vector_search
from backpack.graphs.tutor_models import EvaluationResult, GeneratedQuestions
from backpack.utils import clean_thinking_content
from backpack.utils.context_builder import ContextBuilder


def extract_json_from_response(content: str) -> str:
    """Extract JSON from LLM response, stripping markdown code fences if present."""
    # Try to find JSON within markdown code blocks
    code_block_pattern = r"```(?:json)?\s*\n?([\s\S]*?)\n?```"
    matches = re.findall(code_block_pattern, content)
    if matches:
        # Return the first code block content
        return matches[0].strip()
    
    # Try to find raw JSON object or array
    json_pattern = r"(\{[\s\S]*\}|\[[\s\S]*\])"
    matches = re.findall(json_pattern, content)
    if matches:
        return matches[0].strip()
    
    # Return original content if no patterns match
    return content.strip()


class TutorState(TypedDict):
    """State for the Socratic tutoring agent."""
    messages: Annotated[list, add_messages]
    module_id: str
    module_name: Optional[str]
    learning_goals: List[Dict[str, Any]]
    goal_progress: Dict[str, Dict[str, Any]]
    completed_goal_ids: List[str]
    current_goal_id: Optional[str]
    current_question: Optional[Dict[str, Any]]
    current_question_index: int
    latest_evaluation: Optional[Dict[str, Any]]
    module_context: Optional[Dict[str, Any]]
    goal_contexts: Dict[str, List[Dict[str, Any]]]
    session_started_at: Optional[str]
    model_override: Optional[str]
    understanding_trajectory: List[Dict[str, Any]]


def initialize_session(state: TutorState, config: RunnableConfig) -> dict:
    """Initialize the tutoring session: load module, goals, and build context."""
    logger.info(f"Initializing tutoring session for module: {state['module_id']}")

    module_id = state["module_id"]

    # Handle async operations from sync context
    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)

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
                    max_tokens=30000
                )
                module_context = await builder.build()

                # Pre-fetch context for each goal
                goal_contexts = {}
                for goal in goals:
                    try:
                        results = await vector_search(
                            goal.description, results=8, source=True, note=True
                        )
                        goal_contexts[goal.id] = results if results else []
                    except Exception as e:
                        logger.warning(f"Error building goal context: {e}")
                        goal_contexts[goal.id] = []

                return module, goals, module_context, goal_contexts

            return new_loop.run_until_complete(fetch_data())
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_new_loop)
            module, goals, module_context, goal_contexts = future.result()
    except RuntimeError:
        module, goals, module_context, goal_contexts = run_in_new_loop()

    # Initialize goal progress
    goal_progress = {}
    for goal in goals:
        goal_progress[goal.id] = {
            "goal_id": goal.id,
            "goal_description": goal.description,
            "started_at": None,
            "completed_at": None,
            "completed": False,
            "starter_questions": [],
            "current_question_index": 0,
            "initial_understanding": None,
            "final_understanding": None,
            "trajectory": [],
        }

    learning_goals = [
        {"id": g.id, "description": g.description, "mastery_criteria": g.mastery_criteria, "order": g.order}
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
        "current_question_index": 0,
        "messages": [AIMessage(content=f"Welcome! Let's work through the learning goals for '{module.name}'. I'll guide you through each concept using questions and discussion.")],
    }


def select_next_goal(state: TutorState, config: RunnableConfig) -> dict:
    """Select the next learning goal based on topic similarity."""
    logger.info("Selecting next learning goal")

    completed_ids = state.get("completed_goal_ids", [])
    all_goals = state.get("learning_goals", [])
    unfinished_goals = [g for g in all_goals if g["id"] not in completed_ids]

    if not unfinished_goals:
        logger.info("All goals completed")
        return {"current_goal_id": None}

    # Select by order (TODO: implement embedding-based similarity)
    next_goal = min(unfinished_goals, key=lambda g: g.get("order", 0))
    logger.info(f"Selected goal: {next_goal['id']}")

    # Mark goal as started
    goal_progress = dict(state.get("goal_progress", {}))
    if next_goal["id"] in goal_progress:
        goal_progress[next_goal["id"]] = dict(goal_progress[next_goal["id"]])
        goal_progress[next_goal["id"]]["started_at"] = datetime.now().isoformat()

    return {
        "current_goal_id": next_goal["id"],
        "goal_progress": goal_progress,
        "messages": [AIMessage(content=f"Let's focus on this learning goal: **{next_goal['description']}**")],
    }


def generate_starter_questions(state: TutorState, config: RunnableConfig) -> dict:
    """Generate 2-5 starter questions for the current learning goal."""
    logger.info(f"Generating starter questions for goal: {state['current_goal_id']}")

    current_goal_id = state["current_goal_id"]
    goal_contexts = state.get("goal_contexts", {})

    # Get goal details
    current_goal = None
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            current_goal = g
            break

    if not current_goal:
        raise ValueError(f"Goal not found: {current_goal_id}")

    context_chunks = goal_contexts.get(current_goal_id, [])[:5]

    prompt_data = {
        "goal": current_goal,
        "context_chunks": context_chunks,
        "module_name": state.get("module_name", ""),
    }

    system_prompt = Prompter(prompt_template="tutor/generate_questions").render(data=prompt_data)

    # Handle async model provisioning from sync context
    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(
                provision_langchain_model(
                    system_prompt,
                    config.get("configurable", {}).get("model_id") or state.get("model_override"),
                    "tools",
                    max_tokens=2000,
                    structured=dict(type="json"),
                )
            )
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_new_loop)
            model = future.result()
    except RuntimeError:
        model = run_in_new_loop()

    ai_message = model.invoke(system_prompt)
    raw_content = ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    content = clean_thinking_content(raw_content)

    # Parse response - extract JSON from potential markdown code blocks
    json_content = extract_json_from_response(content)
    try:
        parsed = json.loads(json_content)
        questions_data = parsed.get("questions", [])
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse questions JSON: {e}")
        logger.error(f"Raw LLM response:\n{raw_content}")
        logger.error(f"Cleaned content:\n{content}")
        logger.error(f"Extracted JSON attempt:\n{json_content}")
        questions_data = [{"question_text": f"Can you explain your understanding of this learning goal: {current_goal['description']}"}]

    # Build starter questions
    starter_questions = []
    for i, q in enumerate(questions_data[:5]):
        starter_questions.append({
            "index": i,
            "question_text": q.get("question_text", q.get("text", "")),
            "target_concepts": q.get("target_concepts", []),
            "expected_depth": q.get("expected_depth", "understand"),
            "resolved": False,
            "exchanges": 0,
        })

    if not starter_questions:
        starter_questions.append({
            "index": 0,
            "question_text": f"Can you explain your understanding of this learning goal: {current_goal['description']}",
            "target_concepts": [],
            "expected_depth": "understand",
            "resolved": False,
            "exchanges": 0,
        })

    # Update goal progress
    goal_progress = dict(state.get("goal_progress", {}))
    goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
    goal_progress[current_goal_id]["starter_questions"] = starter_questions
    goal_progress[current_goal_id]["current_question_index"] = 0

    logger.info(f"Generated {len(starter_questions)} starter questions")

    return {
        "goal_progress": goal_progress,
        "current_question": starter_questions[0],
        "current_question_index": 0,
    }


def present_question(state: TutorState, config: RunnableConfig) -> dict:
    """Present a question and wait for student response using interrupt()."""
    logger.info("Presenting question to student")

    current_question = state.get("current_question")
    current_goal_id = state.get("current_goal_id")

    if not current_question:
        raise ValueError("No current question to present")

    goal_description = ""
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            goal_description = g["description"]
            break

    question_text = current_question.get("question_text", "")
    question_index = current_question.get("index", 0)

    if question_index == 0:
        message = f"**Question {question_index + 1}:** {question_text}\n\nPlease share your thoughts and reasoning."
    else:
        message = f"**Question {question_index + 1}:** {question_text}"

    # INTERRUPT: Pause and wait for student response
    student_response = interrupt({
        "type": "question",
        "message": message,
        "question_index": question_index,
        "goal_id": current_goal_id,
        "goal_description": goal_description,
    })

    logger.info(f"Received student response: {student_response[:100]}...")

    return {
        "messages": [AIMessage(content=message), HumanMessage(content=student_response)],
    }


def evaluate_and_route(
    state: TutorState, config: RunnableConfig
) -> Command[Literal["socratic_response", "advance_to_next_question", "mark_goal_complete"]]:
    """Evaluate student understanding and route to next step."""
    logger.info("Evaluating student response")

    current_goal_id = state.get("current_goal_id")
    current_question = state.get("current_question")
    goal_contexts = state.get("goal_contexts", {})
    goal_progress = dict(state.get("goal_progress", {}))

    # Get student's latest message
    messages = state.get("messages", [])
    student_message = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage) or (hasattr(msg, 'type') and msg.type == 'human'):
            student_message = msg.content if hasattr(msg, 'content') else str(msg)
            break

    if not student_message:
        logger.warning("No student message found")
        return Command(goto="socratic_response", update={"latest_evaluation": {"score": 0.0, "notes": "No response"}})

    # Get goal
    current_goal = None
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            current_goal = g
            break

    context_chunks = goal_contexts.get(current_goal_id, [])[:3]

    prompt_data = {
        "goal": current_goal,
        "question": current_question,
        "student_response": student_message,
        "context_chunks": context_chunks,
    }

    system_prompt = Prompter(prompt_template="tutor/evaluate_understanding").render(data=prompt_data)

    # Handle async model provisioning
    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(
                provision_langchain_model(
                    system_prompt,
                    config.get("configurable", {}).get("model_id") or state.get("model_override"),
                    "tools",
                    max_tokens=1000,
                    structured=dict(type="json"),
                )
            )
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_new_loop)
            model = future.result()
    except RuntimeError:
        model = run_in_new_loop()

    ai_message = model.invoke(system_prompt)
    raw_content = ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    content = clean_thinking_content(raw_content)

    # Parse evaluation - extract JSON from potential markdown code blocks
    json_content = extract_json_from_response(content)
    try:
        parsed = json.loads(json_content)
        score = float(parsed.get("score", 0.5))
        evaluation = {
            "score": score,
            "notes": parsed.get("notes", ""),
            "misconceptions": parsed.get("misconceptions", []),
            "breakthroughs": parsed.get("breakthroughs", []),
            "is_resolved": score >= 0.7,
        }
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse evaluation: {e}")
        logger.error(f"Raw LLM response:\n{raw_content}")
        logger.error(f"Extracted JSON attempt:\n{json_content}")
        evaluation = {"score": 0.5, "notes": "Parsing failed", "misconceptions": [], "breakthroughs": [], "is_resolved": False}

    # Record trajectory point
    trajectory_point = {
        "timestamp": datetime.now().isoformat(),
        "goal_id": current_goal_id,
        "question_index": current_question.get("index", 0),
        "exchange_number": current_question.get("exchanges", 0) + 1,
        "student_message": student_message,
        "understanding_score": evaluation["score"],
        "evaluation_notes": evaluation["notes"],
        "misconceptions": evaluation["misconceptions"],
        "breakthroughs": evaluation["breakthroughs"],
    }

    trajectory = list(state.get("understanding_trajectory", []))
    trajectory.append(trajectory_point)

    # Update goal progress
    if current_goal_id in goal_progress:
        goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
        goal_progress[current_goal_id]["trajectory"] = list(goal_progress[current_goal_id].get("trajectory", []))
        goal_progress[current_goal_id]["trajectory"].append(trajectory_point)

        if goal_progress[current_goal_id].get("initial_understanding") is None:
            goal_progress[current_goal_id]["initial_understanding"] = evaluation["score"]
        goal_progress[current_goal_id]["final_understanding"] = evaluation["score"]

    # Update question exchange count
    updated_question = dict(current_question)
    updated_question["exchanges"] = updated_question.get("exchanges", 0) + 1

    logger.info(f"Evaluation score: {evaluation['score']}, resolved: {evaluation['is_resolved']}")

    state_updates = {
        "understanding_trajectory": trajectory,
        "latest_evaluation": evaluation,
        "goal_progress": goal_progress,
        "current_question": updated_question,
    }

    if evaluation["is_resolved"]:
        # Check if more questions
        questions = goal_progress.get(current_goal_id, {}).get("starter_questions", [])
        current_idx = state.get("current_question_index", 0)
        if current_idx < len(questions) - 1:
            logger.info("Question resolved, advancing to next question")
            return Command(goto="advance_to_next_question", update=state_updates)
        else:
            logger.info("Question resolved, goal complete")
            return Command(goto="mark_goal_complete", update=state_updates)
    else:
        logger.info("Continuing Socratic dialogue")
        return Command(goto="socratic_response", update=state_updates)


def socratic_response(state: TutorState, config: RunnableConfig) -> dict:
    """Generate a Socratic response and wait for next student input."""
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

    current_goal = None
    for g in state.get("learning_goals", []):
        if g["id"] == current_goal_id:
            current_goal = g
            break

    context_chunks = goal_contexts.get(current_goal_id, [])[:5]

    prompt_data = {
        "goal": current_goal,
        "current_question": current_question,
        "student_response": student_message,
        "understanding_score": latest_evaluation.get("score", 0.5),
        "misconceptions": latest_evaluation.get("misconceptions", []),
        "breakthroughs": latest_evaluation.get("breakthroughs", []),
        "context_chunks": context_chunks,
    }

    system_prompt = Prompter(prompt_template="tutor/socratic_response").render(data=prompt_data)

    # Handle async model provisioning
    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(
                provision_langchain_model(
                    system_prompt,
                    config.get("configurable", {}).get("model_id") or state.get("model_override"),
                    "chat",
                    max_tokens=1500,
                )
            )
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_new_loop)
            model = future.result()
    except RuntimeError:
        model = run_in_new_loop()

    ai_message = model.invoke(system_prompt)
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
        "messages": [AIMessage(content=socratic_message), HumanMessage(content=student_response)],
    }


def advance_to_next_question(state: TutorState, config: RunnableConfig) -> dict:
    """Advance to the next starter question for the current goal."""
    logger.info("Advancing to next question")

    current_goal_id = state.get("current_goal_id")
    goal_progress = dict(state.get("goal_progress", {}))
    current_idx = state.get("current_question_index", 0)

    if current_goal_id not in goal_progress:
        raise ValueError(f"Goal progress not found: {current_goal_id}")

    goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
    questions = goal_progress[current_goal_id].get("starter_questions", [])

    # Mark current as resolved
    if current_idx < len(questions):
        questions = [dict(q) for q in questions]
        questions[current_idx]["resolved"] = True
        goal_progress[current_goal_id]["starter_questions"] = questions

    next_idx = current_idx + 1
    next_question = questions[next_idx] if next_idx < len(questions) else None
    goal_progress[current_goal_id]["current_question_index"] = next_idx

    return {
        "goal_progress": goal_progress,
        "current_question": next_question,
        "current_question_index": next_idx,
        "messages": [AIMessage(content="Great progress! Let's move on to the next question.")],
    }


def mark_goal_complete(state: TutorState, config: RunnableConfig) -> dict:
    """Mark the current learning goal as complete."""
    logger.info(f"Marking goal complete: {state['current_goal_id']}")

    current_goal_id = state.get("current_goal_id")
    goal_progress = dict(state.get("goal_progress", {}))
    completed_goal_ids = list(state.get("completed_goal_ids", []))

    if current_goal_id in goal_progress:
        goal_progress[current_goal_id] = dict(goal_progress[current_goal_id])
        goal_progress[current_goal_id]["completed"] = True
        goal_progress[current_goal_id]["completed_at"] = datetime.now().isoformat()

        # Mark last question resolved
        questions = goal_progress[current_goal_id].get("starter_questions", [])
        if questions:
            questions = [dict(q) for q in questions]
            questions[-1]["resolved"] = True
            goal_progress[current_goal_id]["starter_questions"] = questions

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
        "current_question": None,
        "current_question_index": 0,
        "messages": [AIMessage(content=f"Excellent! You've demonstrated understanding of: **{goal_description}**\n\nLet's continue to the next topic.")],
    }


def check_more_goals(state: TutorState) -> str:
    """Check if there are more goals to complete."""
    completed_ids = set(state.get("completed_goal_ids", []))
    all_goals = state.get("learning_goals", [])
    unfinished = [g for g in all_goals if g["id"] not in completed_ids]
    return "more_goals" if unfinished else "all_complete"


def generate_summary(state: TutorState, config: RunnableConfig) -> dict:
    """Generate a comprehensive session summary."""
    logger.info("Generating session summary")

    goal_progress = state.get("goal_progress", {})
    session_started = state.get("session_started_at")

    # Calculate statistics
    total_goals = len(state.get("learning_goals", []))
    goals_completed = len(state.get("completed_goal_ids", []))
    total_questions = 0
    total_exchanges = 0
    initial_scores = []
    final_scores = []

    for progress in goal_progress.values():
        questions = progress.get("starter_questions", [])
        total_questions += len(questions)
        for q in questions:
            total_exchanges += q.get("exchanges", 0)
        if progress.get("initial_understanding") is not None:
            initial_scores.append(progress["initial_understanding"])
        if progress.get("final_understanding") is not None:
            final_scores.append(progress["final_understanding"])

    avg_initial = sum(initial_scores) / len(initial_scores) if initial_scores else 0
    avg_final = sum(final_scores) / len(final_scores) if final_scores else 0
    improvement = avg_final - avg_initial

    # Calculate duration
    duration_seconds = 0
    if session_started:
        try:
            start_dt = datetime.fromisoformat(session_started)
            duration_seconds = (datetime.now() - start_dt).total_seconds()
        except ValueError:
            pass

    summary_data = {
        "module_name": state.get("module_name", ""),
        "summary": {
            "total_duration_seconds": duration_seconds,
            "total_goals": total_goals,
            "goals_completed": goals_completed,
            "total_questions": total_questions,
            "total_exchanges": total_exchanges,
            "average_initial_understanding": avg_initial,
            "average_final_understanding": avg_final,
            "understanding_improvement": improvement,
        },
    }

    system_prompt = Prompter(prompt_template="tutor/summary").render(data=summary_data)

    # Handle async model provisioning
    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(
                provision_langchain_model(
                    system_prompt,
                    config.get("configurable", {}).get("model_id") or state.get("model_override"),
                    "chat",
                    max_tokens=1000,
                )
            )
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_new_loop)
            model = future.result()
    except RuntimeError:
        model = run_in_new_loop()

    ai_message = model.invoke(system_prompt)
    narrative = clean_thinking_content(
        ai_message.content if isinstance(ai_message.content, str) else str(ai_message.content)
    )

    final_message = f"""## Session Complete! 🎉

{narrative}

### Summary Statistics
- **Goals Completed**: {goals_completed}/{total_goals}
- **Total Questions Discussed**: {total_questions}
- **Total Exchanges**: {total_exchanges}
- **Understanding Improvement**: {improvement:+.0%}
- **Duration**: {duration_seconds / 60:.1f} minutes
"""

    return {"messages": [AIMessage(content=final_message)]}


# Create SQLite checkpointer
conn = sqlite3.connect(LANGGRAPH_CHECKPOINT_FILE, check_same_thread=False)
memory = SqliteSaver(conn)

# Build the graph
tutor_state = StateGraph(TutorState)
tutor_state.add_node("initialize", initialize_session)
tutor_state.add_node("select_goal", select_next_goal)
tutor_state.add_node("generate_questions", generate_starter_questions)
tutor_state.add_node("present_question", present_question)
tutor_state.add_node("evaluate", evaluate_and_route)
tutor_state.add_node("socratic_response", socratic_response)
tutor_state.add_node("advance_to_next_question", advance_to_next_question)
tutor_state.add_node("mark_goal_complete", mark_goal_complete)
tutor_state.add_node("summary", generate_summary)

tutor_state.add_edge(START, "initialize")
tutor_state.add_edge("initialize", "select_goal")
tutor_state.add_edge("select_goal", "generate_questions")
tutor_state.add_edge("generate_questions", "present_question")
tutor_state.add_edge("present_question", "evaluate")
tutor_state.add_edge("socratic_response", "evaluate")
tutor_state.add_edge("advance_to_next_question", "present_question")
tutor_state.add_conditional_edges(
    "mark_goal_complete",
    check_more_goals,
    {"more_goals": "select_goal", "all_complete": "summary"}
)
tutor_state.add_edge("summary", END)

tutor_graph = tutor_state.compile(checkpointer=memory)

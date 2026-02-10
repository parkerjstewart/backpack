"""
Unit tests for the backpack.graphs module.

This test suite focuses on testing graph structures, tools, and validation
without heavy mocking of the actual processing logic.
"""

from datetime import datetime

import pytest

from backpack.graphs.prompt import PatternChainState, graph
from backpack.graphs.tools import get_current_timestamp
from backpack.graphs.transformation import (
    TransformationState,
    run_transformation,
)
from backpack.graphs.transformation import (
    graph as transformation_graph,
)
from backpack.graphs.tutor_models import (
    EvaluationResult,
    GoalProgress,
    SessionSummary,
    StarterQuestion,
    UnderstandingPoint,
)
from backpack.graphs.tutor import (
    TutorState,
    build_tutor_graph,
    check_more_goals,
    check_more_questions,
    serialize_goal_progress,
)

# ============================================================================
# TEST SUITE 1: Graph Tools
# ============================================================================


class TestGraphTools:
    """Test suite for graph tool definitions."""

    def test_get_current_timestamp_format(self):
        """Test timestamp tool returns correct format."""
        timestamp = get_current_timestamp.func()

        assert isinstance(timestamp, str)
        assert len(timestamp) == 14  # YYYYMMDDHHmmss format
        assert timestamp.isdigit()

    def test_get_current_timestamp_validity(self):
        """Test timestamp represents valid datetime."""
        timestamp = get_current_timestamp.func()

        # Parse it back to datetime to verify validity
        year = int(timestamp[0:4])
        month = int(timestamp[4:6])
        day = int(timestamp[6:8])
        hour = int(timestamp[8:10])
        minute = int(timestamp[10:12])
        second = int(timestamp[12:14])

        # Should be valid date components
        assert 2020 <= year <= 2100
        assert 1 <= month <= 12
        assert 1 <= day <= 31
        assert 0 <= hour <= 23
        assert 0 <= minute <= 59
        assert 0 <= second <= 59

        # Should parse as datetime
        dt = datetime.strptime(timestamp, "%Y%m%d%H%M%S")
        assert isinstance(dt, datetime)

    def test_get_current_timestamp_is_tool(self):
        """Test that function is properly decorated as a tool."""
        # Check it has tool attributes
        assert hasattr(get_current_timestamp, "name")
        assert hasattr(get_current_timestamp, "description")


# ============================================================================
# TEST SUITE 2: Prompt Graph State
# ============================================================================


class TestPromptGraph:
    """Test suite for prompt pattern chain graph."""

    def test_pattern_chain_state_structure(self):
        """Test PatternChainState structure and fields."""
        state = PatternChainState(
            prompt="Test prompt", parser=None, input_text="Test input", output=""
        )

        assert state["prompt"] == "Test prompt"
        assert state["parser"] is None
        assert state["input_text"] == "Test input"
        assert state["output"] == ""

    def test_prompt_graph_compilation(self):
        """Test that prompt graph compiles correctly."""
        assert graph is not None

        # Graph should have the expected structure
        assert hasattr(graph, "invoke")
        assert hasattr(graph, "ainvoke")


# ============================================================================
# TEST SUITE 3: Transformation Graph
# ============================================================================


class TestTransformationGraph:
    """Test suite for transformation graph workflows."""

    def test_transformation_state_structure(self):
        """Test TransformationState structure and fields."""
        from unittest.mock import MagicMock

        from backpack.domain.module import Source
        from backpack.domain.transformation import Transformation

        mock_source = MagicMock(spec=Source)
        mock_transformation = MagicMock(spec=Transformation)

        state = TransformationState(
            input_text="Test text",
            source=mock_source,
            transformation=mock_transformation,
            output="",
        )

        assert state["input_text"] == "Test text"
        assert state["source"] == mock_source
        assert state["transformation"] == mock_transformation
        assert state["output"] == ""

    @pytest.mark.asyncio
    async def test_run_transformation_assertion_no_content(self):
        """Test transformation raises assertion with no content."""
        from unittest.mock import MagicMock

        from backpack.domain.transformation import Transformation

        mock_transformation = MagicMock(spec=Transformation)

        state = {
            "input_text": None,
            "transformation": mock_transformation,
            "source": None,
        }

        config = {"configurable": {"model_id": None}}

        with pytest.raises(AssertionError, match="No content to transform"):
            await run_transformation(state, config)

    def test_transformation_graph_compilation(self):
        """Test that transformation graph compiles correctly."""
        assert transformation_graph is not None
        assert hasattr(transformation_graph, "invoke")
        assert hasattr(transformation_graph, "ainvoke")


# ============================================================================
# TEST SUITE 4: Tutor Models
# ============================================================================


class TestTutorModels:
    """Test suite for tutor Pydantic models."""

    def test_understanding_point_creation(self):
        """Test UnderstandingPoint creation with all fields."""
        point = UnderstandingPoint(
            goal_id="goal_123",
            question_index=0,
            exchange_number=1,
            student_message="I think it works by...",
            understanding_score=0.65,
            evaluation_notes="Good start but missing key concept",
            misconceptions=["Confused about X"],
            breakthroughs=["Understood Y"],
        )

        assert point.goal_id == "goal_123"
        assert point.question_index == 0
        assert point.exchange_number == 1
        assert point.understanding_score == 0.65
        assert len(point.misconceptions) == 1
        assert len(point.breakthroughs) == 1

    def test_understanding_point_defaults(self):
        """Test UnderstandingPoint default values."""
        point = UnderstandingPoint(
            goal_id="goal_123",
            question_index=0,
            student_message="Response",
            understanding_score=0.5,
        )

        assert point.exchange_number == 1
        assert point.evaluation_notes == ""
        assert point.misconceptions == []
        assert point.breakthroughs == []
        assert point.timestamp is not None

    def test_understanding_point_score_bounds(self):
        """Test understanding score validation bounds."""
        # Valid scores
        point_low = UnderstandingPoint(
            goal_id="g1",
            question_index=0,
            student_message="msg",
            understanding_score=0.0,
        )
        point_high = UnderstandingPoint(
            goal_id="g1",
            question_index=0,
            student_message="msg",
            understanding_score=1.0,
        )
        
        assert point_low.understanding_score == 0.0
        assert point_high.understanding_score == 1.0

        # Invalid scores should raise
        with pytest.raises(ValueError):
            UnderstandingPoint(
                goal_id="g1",
                question_index=0,
                student_message="msg",
                understanding_score=-0.1,
            )
        with pytest.raises(ValueError):
            UnderstandingPoint(
                goal_id="g1",
                question_index=0,
                student_message="msg",
                understanding_score=1.1,
            )

    def test_starter_question_creation(self):
        """Test StarterQuestion creation."""
        question = StarterQuestion(
            index=0,
            question_text="What do you understand about X?",
            target_concepts=["concept1", "concept2"],
            expected_depth="understand",
        )

        assert question.index == 0
        assert "understand about X" in question.question_text
        assert len(question.target_concepts) == 2
        assert question.expected_depth == "understand"
        assert question.resolved is False
        assert question.exchanges == 0

    def test_starter_question_depth_values(self):
        """Test StarterQuestion expected_depth literal values."""
        for depth in ["recall", "understand", "apply", "analyze"]:
            question = StarterQuestion(
                index=0,
                question_text="Test",
                expected_depth=depth,
            )
            assert question.expected_depth == depth

    def test_goal_progress_creation(self):
        """Test GoalProgress creation and methods."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Understand concept X",
        )

        assert progress.goal_id == "goal_123"
        assert progress.goal_description == "Understand concept X"
        assert progress.completed is False
        assert progress.started_at is None
        assert progress.completed_at is None
        assert progress.starter_questions == []
        assert progress.current_question_index == 0

    def test_goal_progress_get_current_question(self):
        """Test GoalProgress.get_current_question method."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
                StarterQuestion(index=1, question_text="Q2"),
            ],
            current_question_index=0,
        )

        current = progress.get_current_question()
        assert current is not None
        assert current.question_text == "Q1"

        progress.current_question_index = 1
        current = progress.get_current_question()
        assert current.question_text == "Q2"

    def test_goal_progress_has_more_questions(self):
        """Test GoalProgress.has_more_questions method."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
                StarterQuestion(index=1, question_text="Q2"),
            ],
            current_question_index=0,
        )

        assert progress.has_more_questions() is True

        progress.current_question_index = 1
        assert progress.has_more_questions() is False

    def test_goal_progress_advance_to_next_question(self):
        """Test GoalProgress.advance_to_next_question method."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
                StarterQuestion(index=1, question_text="Q2"),
            ],
            current_question_index=0,
        )

        next_q = progress.advance_to_next_question()
        assert next_q is not None
        assert next_q.question_text == "Q2"
        assert progress.current_question_index == 1

        # No more questions
        next_q = progress.advance_to_next_question()
        assert next_q is None

    def test_goal_progress_duration(self):
        """Test GoalProgress.get_duration_seconds method."""
        from datetime import timedelta

        now = datetime.now()
        earlier = now - timedelta(seconds=120)

        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            started_at=earlier,
            completed_at=now,
        )

        duration = progress.get_duration_seconds()
        assert duration is not None
        assert 119 <= duration <= 121  # Allow small timing variance

    def test_evaluation_result_from_score(self):
        """Test EvaluationResult.from_score class method."""
        # Below threshold
        result = EvaluationResult.from_score(
            0.5,
            notes="Partial understanding",
            misconceptions=["X is wrong"],
        )
        assert result.score == 0.5
        assert result.is_resolved is False
        assert len(result.misconceptions) == 1

        # At threshold
        result = EvaluationResult.from_score(0.7)
        assert result.is_resolved is True

        # Above threshold
        result = EvaluationResult.from_score(0.9, breakthroughs=["Got it!"])
        assert result.is_resolved is True
        assert len(result.breakthroughs) == 1

    def test_session_summary_creation(self):
        """Test SessionSummary creation."""
        now = datetime.now()
        earlier = datetime(2024, 1, 1, 10, 0, 0)

        summary = SessionSummary(
            session_id="session_123",
            module_id="module_456",
            module_name="Test Module",
            started_at=earlier,
            completed_at=now,
            total_duration_seconds=3600,
            total_goals=5,
            goals_completed=5,
            total_questions=15,
            total_exchanges=45,
            average_initial_understanding=0.4,
            average_final_understanding=0.85,
            understanding_improvement=0.45,
        )

        assert summary.session_id == "session_123"
        assert summary.total_goals == 5
        assert summary.understanding_improvement == 0.45


# ============================================================================
# TEST SUITE 5: Tutor Graph State and Helpers
# ============================================================================


class TestTutorGraph:
    """Test suite for tutor graph structure and helper functions."""

    def test_tutor_graph_compilation(self):
        """Test that tutor graph compiles correctly."""
        state_graph = build_tutor_graph()

        assert state_graph is not None
        # StateGraph needs to be compiled to have invoke/ainvoke
        assert hasattr(state_graph, "compile")
        
        # Compile without checkpointer for testing
        compiled = state_graph.compile()
        assert hasattr(compiled, "invoke")
        assert hasattr(compiled, "ainvoke")

    def test_serialize_goal_progress(self):
        """Test GoalProgress serialization."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test goal",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
            ],
        )

        serialized = serialize_goal_progress(progress)

        assert isinstance(serialized, dict)
        assert serialized["goal_id"] == "goal_123"
        assert serialized["goal_description"] == "Test goal"
        assert len(serialized["starter_questions"]) == 1

    def test_check_more_goals_with_remaining(self):
        """Test check_more_goals when goals remain."""
        state = {
            "learning_goals": [
                {"id": "g1", "description": "Goal 1"},
                {"id": "g2", "description": "Goal 2"},
            ],
            "completed_goal_ids": ["g1"],
        }

        result = check_more_goals(state)
        assert result == "more_goals"

    def test_check_more_goals_all_complete(self):
        """Test check_more_goals when all complete."""
        state = {
            "learning_goals": [
                {"id": "g1", "description": "Goal 1"},
                {"id": "g2", "description": "Goal 2"},
            ],
            "completed_goal_ids": ["g1", "g2"],
        }

        result = check_more_goals(state)
        assert result == "all_complete"

    def test_check_more_questions_with_remaining(self):
        """Test check_more_questions when questions remain."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
                StarterQuestion(index=1, question_text="Q2"),
            ],
            current_question_index=0,
        )

        state = {
            "current_goal_id": "goal_123",
            "goal_progress": {"goal_123": serialize_goal_progress(progress)},
        }

        result = check_more_questions(state)
        assert result == "more_questions"

    def test_check_more_questions_goal_complete(self):
        """Test check_more_questions when goal is complete."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
                StarterQuestion(index=1, question_text="Q2"),
            ],
            current_question_index=1,  # At last question
        )

        state = {
            "current_goal_id": "goal_123",
            "goal_progress": {"goal_123": serialize_goal_progress(progress)},
        }

        result = check_more_questions(state)
        assert result == "goal_complete"

    def test_tutor_state_structure(self):
        """Test TutorState TypedDict structure."""
        # TutorState is a TypedDict, verify its annotations
        from typing import get_type_hints

        hints = get_type_hints(TutorState)

        assert "messages" in hints
        assert "module_id" in hints
        assert "learning_goals" in hints
        assert "goal_progress" in hints
        assert "completed_goal_ids" in hints
        assert "current_goal_id" in hints
        assert "current_question" in hints
        assert "understanding_trajectory" in hints


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

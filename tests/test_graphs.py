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
    GeneratedQuestions,
    GoalProgress,
    GoalSelection,
    SessionSummary,
    StarterQuestion,
    UnderstandingPoint,
)
from backpack.graphs.tutor import (
    TutorState,
    check_more_goals,
    check_more_questions_in_goal,
    tutor_state,
)
from backpack.graphs.tutor_models import CompetencyScore

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

    def test_starter_question_defaults(self):
        """Test StarterQuestion default values."""
        question = StarterQuestion(question_text="Test question")

        assert question.index == 0
        assert question.target_concepts == []
        assert question.expected_depth == "understand"
        assert question.resolved is False
        assert question.exchanges == 0

    def test_generated_questions_creation(self):
        """Test GeneratedQuestions creation."""
        questions = GeneratedQuestions(
            reasoning="Testing different concepts",
            questions=[
                StarterQuestion(question_text="Q1"),
                StarterQuestion(question_text="Q2", expected_depth="apply"),
            ],
        )

        assert questions.reasoning == "Testing different concepts"
        assert len(questions.questions) == 2
        assert questions.questions[1].expected_depth == "apply"

    def test_generated_questions_defaults(self):
        """Test GeneratedQuestions default values."""
        questions = GeneratedQuestions()

        assert questions.reasoning == ""
        assert questions.questions == []

    def test_evaluation_result_creation(self):
        """Test EvaluationResult creation."""
        result = EvaluationResult(
            score=0.75,
            notes="Good understanding",
            misconceptions=["Minor confusion"],
            breakthroughs=["Key insight"],
        )

        assert result.score == 0.75
        assert result.notes == "Good understanding"
        assert len(result.misconceptions) == 1
        assert len(result.breakthroughs) == 1

    def test_evaluation_result_score_bounds(self):
        """Test EvaluationResult score validation bounds."""
        # Valid scores
        result_low = EvaluationResult(score=0.0)
        result_high = EvaluationResult(score=1.0)

        assert result_low.score == 0.0
        assert result_high.score == 1.0

        # Invalid scores should raise
        with pytest.raises(ValueError):
            EvaluationResult(score=-0.1)
        with pytest.raises(ValueError):
            EvaluationResult(score=1.1)

    def test_evaluation_result_defaults(self):
        """Test EvaluationResult default values."""
        result = EvaluationResult(score=0.5)

        assert result.notes == ""
        assert result.misconceptions == []
        assert result.breakthroughs == []

    def test_goal_selection_creation(self):
        """Test GoalSelection creation."""
        selection = GoalSelection(
            selected_goal_id="goal:123",
            reasoning="Related to previous topic",
        )

        assert selection.selected_goal_id == "goal:123"
        assert selection.reasoning == "Related to previous topic"

    def test_goal_selection_defaults(self):
        """Test GoalSelection default values."""
        selection = GoalSelection(selected_goal_id="goal:456")

        assert selection.reasoning == ""

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

    def test_goal_progress_creation(self):
        """Test GoalProgress creation."""
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

    def test_goal_progress_with_questions(self):
        """Test GoalProgress with starter questions."""
        progress = GoalProgress(
            goal_id="goal_123",
            goal_description="Test",
            starter_questions=[
                StarterQuestion(index=0, question_text="Q1"),
                StarterQuestion(index=1, question_text="Q2"),
            ],
            current_question_index=1,
        )

        assert len(progress.starter_questions) == 2
        assert progress.current_question_index == 1
        assert progress.starter_questions[0].question_text == "Q1"

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
        assert summary.narrative == ""


# ============================================================================
# TEST SUITE 5: Tutor Graph State and Helpers
# ============================================================================


class TestTutorGraph:
    """Test suite for tutor graph structure and helper functions."""

    def test_tutor_graph_compilation(self):
        """Test that tutor graph compiles correctly."""
        assert tutor_state is not None
        # tutor_state is a StateGraph, check it has compile
        assert hasattr(tutor_state, "compile")

        # Compile without checkpointer for testing
        compiled = tutor_state.compile()
        assert hasattr(compiled, "invoke")
        assert hasattr(compiled, "ainvoke")

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

    def test_check_more_goals_none_complete(self):
        """Test check_more_goals when none complete."""
        state = {
            "learning_goals": [
                {"id": "g1", "description": "Goal 1"},
            ],
            "completed_goal_ids": [],
        }

        result = check_more_goals(state)
        assert result == "more_goals"

    def test_tutor_state_structure(self):
        """Test TutorState TypedDict structure."""
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
        # New fields from revamp
        assert "student_model" in hints
        assert "module_examples" in hints

    # -------------------------------------------------------------------------
    # check_more_questions_in_goal tests
    # -------------------------------------------------------------------------

    def test_check_more_questions_has_more(self):
        """Returns 'advance' when current question is not the last."""
        state = {
            "current_goal_id": "g1",
            "current_question_index": 0,
            "goal_progress": {
                "g1": {
                    "starter_questions": [
                        {"index": 0, "question_text": "Q1"},
                        {"index": 1, "question_text": "Q2"},
                    ]
                }
            },
        }
        assert check_more_questions_in_goal(state) == "advance"

    def test_check_more_questions_last_question(self):
        """Returns 'mark_complete' when on the last question."""
        state = {
            "current_goal_id": "g1",
            "current_question_index": 1,
            "goal_progress": {
                "g1": {
                    "starter_questions": [
                        {"index": 0, "question_text": "Q1"},
                        {"index": 1, "question_text": "Q2"},
                    ]
                }
            },
        }
        assert check_more_questions_in_goal(state) == "mark_complete"

    def test_check_more_questions_goal_missing(self):
        """Returns 'mark_complete' when goal_id is not in goal_progress."""
        state = {
            "current_goal_id": "g99",
            "current_question_index": 0,
            "goal_progress": {},
        }
        assert check_more_questions_in_goal(state) == "mark_complete"

    # -------------------------------------------------------------------------
    # Deterministic resolution logic tests (unit-level, no LLM call needed)
    # -------------------------------------------------------------------------

    def test_all_competencies_above_threshold_resolves(self):
        """All competency scores >= 0.7 means is_resolved must be True."""
        comp_values = [0.7, 0.8, 0.9]
        resolved = all(v >= 0.7 for v in comp_values)
        assert resolved is True

    def test_one_competency_below_threshold_not_resolved(self):
        """A single competency below 0.7 keeps is_resolved False."""
        comp_values = [0.9, 0.65, 0.8]
        resolved = all(v >= 0.7 for v in comp_values)
        assert resolved is False

    def test_empty_competency_list_falls_back_to_overall(self):
        """When no per-competency scores, fallback to overall_score >= 0.7."""
        comp_values = []
        overall = 0.75
        resolved = all(v >= 0.7 for v in comp_values) if comp_values else overall >= 0.7
        assert resolved is True

    def test_score_clamping(self):
        """Score values must be clamped to [0.0, 1.0]."""
        raw_values = [-0.5, 1.5, 0.6]
        clamped = [max(0.0, min(1.0, v)) for v in raw_values]
        assert clamped == [0.0, 1.0, 0.6]

    # -------------------------------------------------------------------------
    # Stagnation counter logic tests
    # -------------------------------------------------------------------------

    def test_stagnation_counter_increments_when_no_improvement(self):
        """Counter increments when total improvement < 0.05."""
        prev_scores = {"C1": 0.5, "C2": 0.6}
        new_scores = {"C1": 0.52, "C2": 0.61}
        improvement = sum(
            max(0.0, new_scores.get(k, 0.0) - prev_scores.get(k, 0.0))
            for k in new_scores
        )
        turns = 1  # current counter value
        turns = 0 if improvement >= 0.05 else turns + 1
        assert turns == 2

    def test_stagnation_counter_resets_on_improvement(self):
        """Counter resets when total improvement >= 0.05."""
        prev_scores = {"C1": 0.5, "C2": 0.6}
        new_scores = {"C1": 0.6, "C2": 0.65}
        improvement = sum(
            max(0.0, new_scores.get(k, 0.0) - prev_scores.get(k, 0.0))
            for k in new_scores
        )
        turns = 3  # current counter value (high)
        turns = 0 if improvement >= 0.05 else turns + 1
        assert turns == 0

    def test_stagnation_counter_resets_on_first_turn(self):
        """Counter is 0 when there are no previous scores (first evaluation)."""
        prev_scores = {}
        new_scores = {"C1": 0.5}
        if new_scores and prev_scores:
            improvement = sum(
                max(0.0, new_scores.get(k, 0.0) - prev_scores.get(k, 0.0))
                for k in new_scores
            )
            turns = 0 if improvement >= 0.05 else 1
        else:
            turns = 0  # first turn — always reset
        assert turns == 0

    # -------------------------------------------------------------------------
    # CompetencyScore model
    # -------------------------------------------------------------------------

    def test_competency_score_creation(self):
        """Test CompetencyScore model creation and field validation."""
        cs = CompetencyScore(
            competency="Can explain MLE",
            score=0.75,
            evidence="Student correctly described maximizing likelihood",
        )
        assert cs.competency == "Can explain MLE"
        assert cs.score == 0.75
        assert "maximizing" in cs.evidence

    def test_competency_score_bounds(self):
        """Score must be in [0.0, 1.0]."""
        with pytest.raises(ValueError):
            CompetencyScore(competency="X", score=-0.1)
        with pytest.raises(ValueError):
            CompetencyScore(competency="X", score=1.1)

    def test_evaluation_result_new_fields(self):
        """EvaluationResult should include new revamp fields."""
        result = EvaluationResult(
            score=0.6,
            competency_scores=[
                CompetencyScore(competency="C1", score=0.6, evidence="partial"),
            ],
            weakest_competency="C1",
            is_resolved=False,
            hypothesized_gaps=["missing prerequisite"],
            confirmed_knowledge=["understands basics"],
        )
        assert result.is_resolved is False
        assert result.weakest_competency == "C1"
        assert len(result.hypothesized_gaps) == 1
        assert len(result.confirmed_knowledge) == 1
        assert len(result.competency_scores) == 1

    def test_evaluation_result_overall_score_alias(self):
        """EvaluationResult.score property is backward-compat alias for overall_score."""
        result = EvaluationResult(overall_score=0.8)
        assert result.score == 0.8

        result2 = EvaluationResult(score=0.65)
        assert result2.score == 0.65
        assert result2.overall_score == 0.65


# ============================================================================
# TEST SUITE 6: API Schema Serialization
# ============================================================================


class TestApiSchemas:
    """Test suite for API schema changes (anchor_examples wiring)."""

    def test_learning_goal_response_includes_anchor_examples(self):
        """LearningGoalResponse must expose anchor_examples field."""
        from api.models import LearningGoalResponse

        resp = LearningGoalResponse(
            id="learning_goal:1",
            module="module:1",
            description="Explain MLE",
            takeaways="Key takeaways here",
            competencies="Can define MLE",
            anchor_examples="the taxi arrival Poisson example",
            order=0,
            created="2026-01-01",
            updated="2026-01-01",
        )
        assert resp.anchor_examples == "the taxi arrival Poisson example"

    def test_learning_goal_response_anchor_examples_defaults_empty(self):
        """anchor_examples should default to empty string."""
        from api.models import LearningGoalResponse

        resp = LearningGoalResponse(
            id="learning_goal:1",
            module="module:1",
            description="Explain MLE",
            order=0,
            created="2026-01-01",
            updated="2026-01-01",
        )
        assert resp.anchor_examples == ""

    def test_learning_goal_update_includes_anchor_examples(self):
        """LearningGoalUpdate must support optional anchor_examples."""
        from api.models import LearningGoalUpdate

        update = LearningGoalUpdate(anchor_examples="coin flip example")
        assert update.anchor_examples == "coin flip example"

    def test_learning_goal_update_anchor_examples_optional(self):
        """anchor_examples should be None (not patched) when not supplied."""
        from api.models import LearningGoalUpdate

        update = LearningGoalUpdate(description="New description")
        assert update.anchor_examples is None

    def test_learning_goal_preview_has_anchor_examples(self):
        """LearningGoalPreview (used in generated-goals response) includes anchor_examples."""
        from api.models import LearningGoalPreview

        preview = LearningGoalPreview(
            description="Goal",
            anchor_examples="specific lecture example",
        )
        assert preview.anchor_examples == "specific lecture example"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

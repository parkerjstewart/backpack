"""
Pydantic models for the Socratic Tutoring Agent.

These models are used for:
1. LLM response parsing (structured output)
2. Data structure definitions for state storage
3. API response schemas
"""

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import AliasChoices, BaseModel, Field


# ============================================================================
# LLM Response Parsing Models
# ============================================================================


class GeneratedAnchorProblem(BaseModel):
    """Response from the anchor problem generation prompt."""

    anchor_problem: str = Field(
        ..., description="The multi-step scenario to explore conversationally"
    )
    opening_framing: str = Field(
        ..., description="Natural intro message to kick off the discussion"
    )


class Hypothesis(BaseModel):
    """A competing hypothesis about why a competency gap exists."""

    text: str = Field(..., description="The hypothesis text")
    confidence: str = Field(..., description="Confidence level, e.g. 'high', 'medium', 'low'")


class CompetencyScore(BaseModel):
    """Per-competency evaluation for a student response."""

    competency: str = Field(..., description="The competency criterion being scored")
    score: float = Field(..., ge=0.0, le=1.0, description="Score 0.0-1.0 for this competency")
    evidence: str = Field(
        default="",
        description="New observation this turn — what indicated this score",
    )
    gap: str = Field(
        default="",
        description="What specifically is missing for this competency",
    )
    hypotheses: List[Hypothesis] = Field(
        default_factory=list,
        description="Competing hypotheses about why the gap exists",
    )


class EvaluationResult(BaseModel):
    """Result of evaluating a student's response."""

    overall_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Overall understanding score 0-1",
        validation_alias=AliasChoices("overall_score", "score"),
    )
    needs_more_info: bool = Field(
        default=False,
        description="True when the response is too thin/ambiguous to score confidently",
    )
    probe_question: Optional[str] = Field(
        default=None,
        description="Short clarifying question to ask when needs_more_info is True",
    )
    competency_scores: List[CompetencyScore] = Field(
        default_factory=list,
        description="Per-competency scores",
    )
    weakest_competency: Optional[str] = Field(
        default=None,
        description="Name of the competency with lowest score",
    )
    notes: str = Field(default="", description="Reasoning for the evaluation")
    misconceptions: List[str] = Field(default_factory=list)
    breakthroughs: List[str] = Field(default_factory=list)
    is_resolved: bool = Field(
        default=False,
        description="True when all competencies >= 0.7",
    )
    hypothesized_gaps: List[str] = Field(
        default_factory=list,
        description="Prerequisite concepts that might be missing",
    )
    confirmed_knowledge: List[str] = Field(
        default_factory=list,
        description="Concepts the student demonstrated correctly",
    )
    suggested_next_action: Literal["probe", "macro_hint", "give_up", "continue"] = Field(
        default="continue",
        description=(
            "Evaluator's recommendation for what the tutor should do next. "
            "'probe': need more signal to score. "
            "'macro_hint': probe space exhausted on a factual gap — give the fact directly. "
            "'give_up': student can't reason about the concept at all — explain and move on. "
            "'continue': normal flow, use score-based routing."
        ),
    )
    action_rationale: Optional[str] = Field(
        default=None,
        description="Brief explanation of why this action was recommended based on conversation history",
    )

    @property
    def score(self) -> float:
        """Backward-compatible alias for overall_score."""
        return self.overall_score


class GoalSelection(BaseModel):
    """Response from goal selection prompt."""

    selected_goal_id: str = Field(..., description="ID of the selected goal")
    reasoning: str = Field(default="", description="Why this goal was selected")


class ModuleExampleItem(BaseModel):
    """A single worked example, figure, or key definition extracted from module material."""

    name: str = Field(default="", description="Short label the tutor can reference")
    description: str = Field(default="", description="Brief context of what it illustrates")
    source_ref: str = Field(default="", description="Source title or ID if known")
    term: str = Field(default="", description="Term being defined (for key_definitions)")
    summary: str = Field(default="", description="Brief definition summary (for key_definitions)")


class ModuleExamples(BaseModel):
    """Structured output from the extract_module_examples prompt."""

    worked_examples: List[ModuleExampleItem] = Field(default_factory=list)
    figures: List[ModuleExampleItem] = Field(default_factory=list)
    key_definitions: List[ModuleExampleItem] = Field(default_factory=list)


# ============================================================================
# Trajectory and Progress Tracking Models
# ============================================================================


class UnderstandingPoint(BaseModel):
    """Single point in the understanding trajectory.

    Recorded after every student response to track learning progress over time.
    """

    timestamp: datetime = Field(default_factory=datetime.now)
    goal_id: str = Field(..., description="ID of the learning goal being assessed")
    exchange_number: int = Field(
        default=1,
        description="Which back-and-forth exchange within this goal",
    )
    student_message: str = Field(..., description="What the student said")
    understanding_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Understanding score from 0.0 to 1.0",
    )
    evaluation_notes: str = Field(default="", description="Agent's reasoning for the score")
    misconceptions: List[str] = Field(
        default_factory=list,
        description="Identified misconceptions (if any)",
    )
    breakthroughs: List[str] = Field(
        default_factory=list,
        description="Key insights demonstrated (if any)",
    )


class GoalProgress(BaseModel):
    """Tracks progress for a single learning goal."""

    goal_id: str = Field(..., description="ID of the learning goal")
    goal_description: str = Field(..., description="Description of the learning goal")
    started_at: Optional[datetime] = Field(default=None, description="When work began")
    completed_at: Optional[datetime] = Field(default=None, description="When completed")
    completed: bool = Field(default=False, description="True when goal is mastered")

    # Anchor problem (one per goal, explored conversationally)
    anchor_problem: str = Field(default="", description="The multi-step scenario being explored")
    exchanges: int = Field(default=0, description="Total exchanges for this goal")

    # Understanding tracking
    initial_understanding: Optional[float] = Field(default=None)
    final_understanding: Optional[float] = Field(default=None)
    trajectory: List[UnderstandingPoint] = Field(default_factory=list)


class SessionSummary(BaseModel):
    """Summary of a completed tutoring session."""

    session_id: str
    module_id: str
    module_name: str

    # Timing
    started_at: datetime
    completed_at: datetime
    total_duration_seconds: float

    # Progress
    total_goals: int
    goals_completed: int
    total_exchanges: int

    # Per-goal summaries
    goal_summaries: List[Any] = Field(default_factory=list)

    # Overall trajectory
    average_initial_understanding: float = Field(default=0.0)
    average_final_understanding: float = Field(default=0.0)
    understanding_improvement: float = Field(default=0.0)

    # Key insights
    key_misconceptions: List[str] = Field(default_factory=list)
    key_breakthroughs: List[str] = Field(default_factory=list)

    # Narrative summary
    narrative: str = Field(default="")

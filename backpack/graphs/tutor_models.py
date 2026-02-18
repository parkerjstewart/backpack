"""
Pydantic models for the Socratic Tutoring Agent.

These models are used for:
1. LLM response parsing (structured output)
2. Data structure definitions for state storage
3. API response schemas
"""

from datetime import datetime
from typing import List, Optional

from pydantic import AliasChoices, BaseModel, Field


# ============================================================================
# LLM Response Parsing Models
# ============================================================================

class StarterQuestion(BaseModel):
    """A starter question for a learning goal."""
    index: int = Field(default=0, description="Question index within the goal (0-based)")
    question_text: str = Field(..., description="The question to present to the student")
    target_concepts: List[str] = Field(
        default_factory=list,
        description="Key concepts this question assesses"
    )
    expected_depth: str = Field(
        default="understand",
        description="Expected cognitive depth: recall, understand, apply, or analyze"
    )
    resolved: bool = Field(default=False, description="True when understanding >= 0.7")
    exchanges: int = Field(default=0, description="Number of back-and-forth exchanges")


class GeneratedQuestions(BaseModel):
    """Response from the question generation prompt."""
    reasoning: str = Field(default="", description="Explanation of question design")
    questions: List[StarterQuestion] = Field(
        default_factory=list,
        description="List of generated questions (2-5)"
    )


class CompetencyScore(BaseModel):
    """Per-competency evaluation for a student response."""
    competency: str = Field(..., description="The competency criterion being scored")
    score: float = Field(..., ge=0.0, le=1.0, description="Score 0.0-1.0 for this competency")
    evidence: str = Field(
        default="",
        description="What in the response indicated this score",
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
    competency_scores: List[CompetencyScore] = Field(
        default_factory=list,
        description="Per-competency scores",
    )
    weakest_competency: Optional[str] = Field(
        default=None,
        description="ID or name of the competency with lowest score",
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

    @property
    def score(self) -> float:
        """Backward-compatible alias for overall_score."""
        return self.overall_score


class GoalSelection(BaseModel):
    """Response from goal selection prompt."""
    selected_goal_id: str = Field(..., description="ID of the selected goal")
    reasoning: str = Field(default="", description="Why this goal was selected")


# ============================================================================
# Trajectory and Progress Tracking Models
# ============================================================================

class UnderstandingPoint(BaseModel):
    """Single point in the understanding trajectory.
    
    Recorded after every student response to track learning progress over time.
    This data is used to visualize the student's journey for instructors.
    """
    timestamp: datetime = Field(default_factory=datetime.now)
    goal_id: str = Field(..., description="ID of the learning goal being assessed")
    question_index: int = Field(..., description="Index of the starter question (0-based)")
    exchange_number: int = Field(
        default=1,
        description="Which back-and-forth exchange within this question"
    )
    student_message: str = Field(..., description="What the student said")
    understanding_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Understanding score from 0.0 to 1.0"
    )
    evaluation_notes: str = Field(default="", description="Agent's reasoning for the score")
    misconceptions: List[str] = Field(
        default_factory=list,
        description="Identified misconceptions (if any)"
    )
    breakthroughs: List[str] = Field(
        default_factory=list,
        description="Key insights demonstrated (if any)"
    )


class GoalProgress(BaseModel):
    """Tracks progress for a single learning goal."""
    goal_id: str = Field(..., description="ID of the learning goal")
    goal_description: str = Field(..., description="Description of the learning goal")
    started_at: Optional[datetime] = Field(default=None, description="When work began")
    completed_at: Optional[datetime] = Field(default=None, description="When completed")
    completed: bool = Field(default=False, description="True when all questions resolved")
    
    # Starter questions for this goal
    starter_questions: List[StarterQuestion] = Field(default_factory=list)
    current_question_index: int = Field(default=0)
    
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
    total_questions: int
    total_exchanges: int
    
    # Per-goal summaries
    goal_summaries: List[dict] = Field(default_factory=list)
    
    # Overall trajectory
    average_initial_understanding: float = Field(default=0.0)
    average_final_understanding: float = Field(default=0.0)
    understanding_improvement: float = Field(default=0.0)
    
    # Key insights
    key_misconceptions: List[str] = Field(default_factory=list)
    key_breakthroughs: List[str] = Field(default_factory=list)
    
    # Narrative summary
    narrative: str = Field(default="")

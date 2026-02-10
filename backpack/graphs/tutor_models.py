"""
Pydantic models for the Socratic Tutoring Agent.

These models track student progress, understanding trajectory, and dialogue state
for the tutoring workflow.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


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
    evaluation_notes: str = Field(
        default="", 
        description="Agent's reasoning for the score"
    )
    misconceptions: List[str] = Field(
        default_factory=list, 
        description="Identified misconceptions (if any)"
    )
    breakthroughs: List[str] = Field(
        default_factory=list, 
        description="Key insights demonstrated (if any)"
    )


class StarterQuestion(BaseModel):
    """A starter question for a learning goal.
    
    Generated at the start of each goal's discussion. The agent uses these
    questions to drive the Socratic dialogue with the student.
    """
    index: int = Field(..., description="Question index within the goal (0-based)")
    question_text: str = Field(..., description="The question to present to the student")
    target_concepts: List[str] = Field(
        default_factory=list, 
        description="Key concepts this question assesses"
    )
    expected_depth: Literal["recall", "understand", "apply", "analyze"] = Field(
        default="understand",
        description="Expected cognitive depth for this question"
    )
    resolved: bool = Field(
        default=False, 
        description="True when understanding score >= 0.7"
    )
    exchanges: int = Field(
        default=0, 
        description="Number of back-and-forth exchanges for this question"
    )


class GoalProgress(BaseModel):
    """Tracks progress for a single learning goal.
    
    Contains all starter questions, timing information, and the understanding
    trajectory for this specific goal.
    """
    goal_id: str = Field(..., description="ID of the learning goal")
    goal_description: str = Field(..., description="Description of the learning goal")
    started_at: Optional[datetime] = Field(
        default=None, 
        description="When work on this goal began"
    )
    completed_at: Optional[datetime] = Field(
        default=None, 
        description="When this goal was marked complete"
    )
    completed: bool = Field(default=False, description="True when all questions resolved")
    
    # Starter questions for this goal
    starter_questions: List[StarterQuestion] = Field(
        default_factory=list,
        description="Generated starter questions for this goal"
    )
    current_question_index: int = Field(
        default=0, 
        description="Index of current question being discussed"
    )
    
    # Understanding tracking
    initial_understanding: Optional[float] = Field(
        default=None,
        description="Understanding score from first response"
    )
    final_understanding: Optional[float] = Field(
        default=None,
        description="Understanding score from last response"
    )
    trajectory: List[UnderstandingPoint] = Field(
        default_factory=list,
        description="All understanding points for this goal"
    )
    
    def get_current_question(self) -> Optional[StarterQuestion]:
        """Get the current starter question being discussed."""
        if 0 <= self.current_question_index < len(self.starter_questions):
            return self.starter_questions[self.current_question_index]
        return None
    
    def has_more_questions(self) -> bool:
        """Check if there are more questions to discuss."""
        return self.current_question_index < len(self.starter_questions) - 1
    
    def advance_to_next_question(self) -> Optional[StarterQuestion]:
        """Move to the next question and return it."""
        if self.has_more_questions():
            self.current_question_index += 1
            return self.get_current_question()
        return None
    
    def get_duration_seconds(self) -> Optional[float]:
        """Get the duration spent on this goal in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        elif self.started_at:
            return (datetime.now() - self.started_at).total_seconds()
        return None


class EvaluationResult(BaseModel):
    """Result of evaluating a student's response.
    
    Used internally by the evaluate_and_route node to determine next steps.
    """
    score: float = Field(
        ..., 
        ge=0.0, 
        le=1.0, 
        description="Understanding score from 0.0 to 1.0"
    )
    evaluation_notes: str = Field(
        default="", 
        description="Reasoning for the score"
    )
    misconceptions: List[str] = Field(
        default_factory=list,
        description="Identified misconceptions"
    )
    breakthroughs: List[str] = Field(
        default_factory=list,
        description="Key insights demonstrated"
    )
    is_resolved: bool = Field(
        default=False,
        description="True if score >= 0.7 (question resolved)"
    )
    
    @classmethod
    def from_score(
        cls, 
        score: float, 
        notes: str = "",
        misconceptions: Optional[List[str]] = None,
        breakthroughs: Optional[List[str]] = None,
        resolution_threshold: float = 0.7
    ) -> "EvaluationResult":
        """Create an evaluation result from a score."""
        return cls(
            score=score,
            evaluation_notes=notes,
            misconceptions=misconceptions or [],
            breakthroughs=breakthroughs or [],
            is_resolved=score >= resolution_threshold
        )


class GeneratedQuestions(BaseModel):
    """Response from the question generation prompt.
    
    Used to parse the LLM's output when generating starter questions.
    """
    questions: List[Dict[str, Any]] = Field(
        ...,
        description="List of generated questions with metadata"
    )
    reasoning: str = Field(
        default="",
        description="Agent's reasoning for question selection"
    )


class GoalSimilarity(BaseModel):
    """Similarity score between two learning goals.
    
    Used for topic-based goal selection.
    """
    goal_id: str
    similarity_score: float = Field(ge=0.0, le=1.0)
    shared_concepts: List[str] = Field(default_factory=list)


class SessionSummary(BaseModel):
    """Summary of a completed tutoring session.
    
    Generated at the end of a session with all goals mastered.
    """
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
    goal_summaries: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Summary for each learning goal"
    )
    
    # Overall trajectory
    average_initial_understanding: float
    average_final_understanding: float
    understanding_improvement: float
    
    # Key insights
    key_misconceptions: List[str] = Field(
        default_factory=list,
        description="Most common misconceptions across all goals"
    )
    key_breakthroughs: List[str] = Field(
        default_factory=list,
        description="Notable breakthroughs across all goals"
    )
    
    # Narrative summary
    narrative: str = Field(
        default="",
        description="LLM-generated narrative summary of the session"
    )

"""
Student progress domain model for session-level tutoring insights.

Each record represents one completed tutoring session for a student on a module,
with nested per-goal insights (scores, progressions, knowledge gaps, competency results).
"""

from datetime import datetime
from typing import Any, ClassVar, Dict, List, Optional

from loguru import logger
from pydantic import field_validator
from surrealdb import RecordID

from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.base import ObjectModel
from backpack.exceptions import DatabaseOperationError


class StudentProgress(ObjectModel):
    """One tutoring session's insights for a student on a module."""

    table_name: ClassVar[str] = "student_progress"
    nullable_fields: ClassVar[set[str]] = {
        "overall_summary",
        "strongest_goal_id",
        "weakest_goal_id",
    }

    user: str
    module: str
    session_id: str
    overall_summary: Optional[str] = None
    strongest_goal_id: Optional[str] = None
    weakest_goal_id: Optional[str] = None
    goal_insights: List[Dict[str, Any]] = []
    last_activity: Optional[datetime] = None

    @field_validator("user", mode="before")
    @classmethod
    def parse_user(cls, value):
        if value is None:
            return value
        if isinstance(value, RecordID):
            return str(value)
        return str(value) if value else None

    @field_validator("module", mode="before")
    @classmethod
    def parse_module(cls, value):
        if value is None:
            return value
        if isinstance(value, RecordID):
            return str(value)
        return str(value) if value else None

    def _prepare_save_data(self) -> dict:
        data = super()._prepare_save_data()
        if data.get("user") is not None:
            data["user"] = ensure_record_id(data["user"])
        if data.get("module") is not None:
            data["module"] = ensure_record_id(data["module"])
        data["last_activity"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return data

    @classmethod
    async def get_for_student(
        cls, user_id: str, module_id: str
    ) -> List["StudentProgress"]:
        """Get all session progress records for a student+module, most recent first."""
        try:
            result = await repo_query(
                """
                SELECT * FROM student_progress
                WHERE user = $user_id AND module = $module_id
                ORDER BY created DESC
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "module_id": ensure_record_id(module_id),
                },
            )
            return [cls(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching student progress: {e}")
            raise DatabaseOperationError(e)

    @classmethod
    async def get_latest_for_student(
        cls, user_id: str, module_id: str
    ) -> Optional["StudentProgress"]:
        """Get the most recent session progress for a student+module."""
        try:
            result = await repo_query(
                """
                SELECT * FROM student_progress
                WHERE user = $user_id AND module = $module_id
                ORDER BY created DESC
                LIMIT 1
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "module_id": ensure_record_id(module_id),
                },
            )
            return cls(**result[0]) if result else None
        except Exception as e:
            logger.error(f"Error fetching latest student progress: {e}")
            raise DatabaseOperationError(e)

    @classmethod
    async def get_for_module(cls, module_id: str) -> List["StudentProgress"]:
        """Get all student progress records for a module (for instructor views)."""
        try:
            result = await repo_query(
                """
                SELECT * FROM student_progress
                WHERE module = $module_id
                ORDER BY created DESC
                """,
                {"module_id": ensure_record_id(module_id)},
            )
            return [cls(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching module progress: {e}")
            raise DatabaseOperationError(e)

    @classmethod
    async def get_by_session(cls, session_id: str) -> Optional["StudentProgress"]:
        """Look up progress by tutor session ID."""
        try:
            result = await repo_query(
                """
                SELECT * FROM student_progress
                WHERE session_id = $session_id
                LIMIT 1
                """,
                {"session_id": session_id},
            )
            return cls(**result[0]) if result else None
        except Exception as e:
            logger.error(f"Error fetching progress by session: {e}")
            raise DatabaseOperationError(e)

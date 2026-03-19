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

from backpack.database.repository import ensure_record_id, repo_query, repo_upsert
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
        data["last_activity"] = datetime.now()
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

    @classmethod
    async def get_for_module_with_users(
        cls, module_id: str
    ) -> List[Dict[str, Any]]:
        """Get all student progress records for a module with user info attached.

        Returns dicts with keys: user (id, name, email), progress (raw dict).
        Only the latest session per student is returned.
        """
        try:
            result = await repo_query(
                """
                SELECT *,
                    user.id AS user_id,
                    user.name AS user_name,
                    user.email AS user_email
                FROM student_progress
                WHERE module = $module_id
                ORDER BY created DESC
                """,
                {"module_id": ensure_record_id(module_id)},
            )
            if not result:
                return []

            seen_users: Dict[str, Dict[str, Any]] = {}
            for row in result:
                uid = str(row.get("user_id") or row.get("user", ""))
                if uid and uid not in seen_users:
                    seen_users[uid] = {
                        "user": {
                            "id": uid,
                            "name": row.get("user_name") or "",
                            "email": row.get("user_email") or "",
                        },
                        "progress": row,
                    }
            return list(seen_users.values())
        except Exception as e:
            logger.error(f"Error fetching module progress with users: {e}")
            raise DatabaseOperationError(e)


class ModuleClassInsights:
    """Persisted class-level insights for a module (one record per module)."""

    def __init__(
        self,
        module: str,
        summary_text: Optional[str] = None,
        stats: Optional[Dict[str, Any]] = None,
        student_count: int = 0,
        id: Optional[str] = None,
        created: Optional[str] = None,
        updated: Optional[str] = None,
    ):
        self.module = module
        self.summary_text = summary_text
        self.stats = stats or {}
        self.student_count = student_count
        self.id = id
        self.created = created
        self.updated = updated

    @classmethod
    async def get_for_module(cls, module_id: str) -> Optional["ModuleClassInsights"]:
        """Fetch the class insights record for a module."""
        try:
            result = await repo_query(
                """
                SELECT * FROM module_class_insights
                WHERE module = $module_id
                LIMIT 1
                """,
                {"module_id": ensure_record_id(module_id)},
            )
            if result:
                row = result[0]
                return cls(
                    module=str(row.get("module", "")),
                    summary_text=row.get("summary_text"),
                    stats=row.get("stats"),
                    student_count=row.get("student_count", 0),
                    id=str(row.get("id", "")),
                    created=str(row.get("created")) if row.get("created") else None,
                    updated=str(row.get("updated")) if row.get("updated") else None,
                )
            return None
        except Exception as e:
            logger.error(f"Error fetching class insights for module: {e}")
            raise DatabaseOperationError(e)

    async def save(self) -> None:
        """Upsert the class insights record (one per module)."""
        try:
            data = {
                "module": ensure_record_id(self.module),
                "summary_text": self.summary_text,
                "stats": self.stats,
                "student_count": self.student_count,
            }
            if self.id:
                record_id = self.id
                if ":" not in record_id:
                    record_id = f"module_class_insights:{record_id}"
                await repo_upsert("module_class_insights", record_id, data)
            else:
                # First time — create via query to respect unique index
                await repo_query(
                    """
                    CREATE module_class_insights SET
                        module = $module,
                        summary_text = $summary_text,
                        stats = $stats,
                        student_count = $student_count,
                        created = time::now(),
                        updated = time::now()
                    """,
                    data,
                )
        except Exception as e:
            logger.error(f"Error saving class insights: {e}")
            raise DatabaseOperationError(e)

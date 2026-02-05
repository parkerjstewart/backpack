"""
Course and User domain models for LMS functionality.
"""

from typing import Any, ClassVar, Dict, List, Literal, Optional

from loguru import logger
from pydantic import field_validator
from surrealdb import RecordID

from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.base import ObjectModel
from backpack.exceptions import DatabaseOperationError, InvalidInputError


class User(ObjectModel):
    """Represents a user in the system."""

    table_name: ClassVar[str] = "user"
    email: str
    name: Optional[str] = None
    role: str = "student"  # 'student', 'instructor', or 'admin'
    external_id: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise InvalidInputError("Email cannot be empty")
        return v.lower().strip()

    @classmethod
    async def get_by_email(cls, email: str) -> Optional["User"]:
        """Get a user by their email address."""
        if not email:
            return None
        try:
            result = await repo_query(
                "SELECT * FROM user WHERE email = $email LIMIT 1",
                {"email": email.lower().strip()},
            )
            if result:
                return cls(**result[0])
            return None
        except Exception as e:
            logger.error(f"Error fetching user by email {email}: {str(e)}")
            return None

    async def get_courses(self) -> List["Course"]:
        """Get all courses this user is enrolled in or teaching."""
        try:
            result = await repo_query(
                """
                SELECT out.* as course FROM course_membership
                WHERE in = $user_id
                FETCH course
                """,
                {"user_id": ensure_record_id(self.id)},
            )
            return [Course(**r["course"]) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching courses for user {self.id}: {str(e)}")
            raise DatabaseOperationError(e)


class Course(ObjectModel):
    """Represents a course containing modules."""

    table_name: ClassVar[str] = "course"
    title: str
    description: Optional[str] = None
    instructor_id: Optional[str] = None
    archived: bool = False

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise InvalidInputError("Course title cannot be empty")
        return v

    @field_validator("instructor_id", mode="before")
    @classmethod
    def parse_instructor_id(cls, value):
        """Parse instructor_id field to ensure string format from RecordID."""
        if value is None:
            return value
        if isinstance(value, RecordID):
            return str(value)
        return str(value) if value else None

    def _prepare_save_data(self) -> dict:
        """Override to ensure instructor_id is RecordID format for database."""
        data = super()._prepare_save_data()
        if data.get("instructor_id") is not None:
            data["instructor_id"] = ensure_record_id(data["instructor_id"])
        return data

    async def get_modules(self) -> List[Any]:
        """Get all modules in this course, ordered by order field."""
        from backpack.domain.module import Module

        try:
            result = await repo_query(
                """
                SELECT * FROM module WHERE course = $course_id ORDER BY order ASC
                """,
                {"course_id": ensure_record_id(self.id)},
            )
            return [Module(**m) for m in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching modules for course {self.id}: {str(e)}")
            raise DatabaseOperationError(e)

    async def get_members(
        self, role: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all members of this course with their membership info.

        Args:
            role: Optional filter by role ('student', 'instructor', 'ta')

        Returns:
            List of dicts with user info and membership role
        """
        try:
            if role:
                result = await repo_query(
                    """
                    SELECT in.* as user, role, enrolled_at
                    FROM course_membership
                    WHERE out = $course_id AND role = $role
                    FETCH user
                    """,
                    {"course_id": ensure_record_id(self.id), "role": role},
                )
            else:
                result = await repo_query(
                    """
                    SELECT in.* as user, role, enrolled_at
                    FROM course_membership
                    WHERE out = $course_id
                    FETCH user
                    """,
                    {"course_id": ensure_record_id(self.id)},
                )
            return result if result else []
        except Exception as e:
            logger.error(f"Error fetching members for course {self.id}: {str(e)}")
            raise DatabaseOperationError(e)

    async def get_students(self) -> List[Dict[str, Any]]:
        """Get all students enrolled in this course."""
        return await self.get_members(role="student")

    async def get_teaching_team(self) -> List[Dict[str, Any]]:
        """Get all instructors and TAs for this course."""
        try:
            result = await repo_query(
                """
                SELECT in.* as user, role, enrolled_at
                FROM course_membership
                WHERE out = $course_id AND (role = 'instructor' OR role = 'ta')
                FETCH user
                """,
                {"course_id": ensure_record_id(self.id)},
            )
            return result if result else []
        except Exception as e:
            logger.error(f"Error fetching teaching team for course {self.id}: {str(e)}")
            raise DatabaseOperationError(e)

    async def get_students_needing_attention(self) -> List[Dict[str, Any]]:
        """
        Get students who may need attention based on progress.
        Returns students with 'struggling' status on any learning goal in this course.
        """
        try:
            result = await repo_query(
                """
                SELECT DISTINCT
                    sp.user.* as user,
                    count(sp.id) as struggling_count
                FROM student_progress as sp
                WHERE sp.status = 'struggling'
                  AND sp.learning_goal.module.course = $course_id
                GROUP BY sp.user
                ORDER BY struggling_count DESC
                FETCH user
                """,
                {"course_id": ensure_record_id(self.id)},
            )
            return result if result else []
        except Exception as e:
            logger.error(
                f"Error fetching students needing attention for course {self.id}: {str(e)}"
            )
            raise DatabaseOperationError(e)

    async def add_member(
        self, user_id: str, role: Literal["student", "instructor", "ta"] = "student"
    ) -> Dict[str, Any]:
        """
        Add a member to this course.

        Args:
            user_id: The user's ID
            role: The membership role ('student', 'instructor', 'ta')

        Returns:
            The created membership record
        """
        if not user_id:
            raise InvalidInputError("User ID must be provided")
        try:
            # Check if membership already exists
            existing = await repo_query(
                """
                SELECT * FROM course_membership
                WHERE in = $user_id AND out = $course_id
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "course_id": ensure_record_id(self.id),
                },
            )
            if existing:
                # Update role if membership exists
                result = await repo_query(
                    """
                    UPDATE course_membership
                    SET role = $role
                    WHERE in = $user_id AND out = $course_id
                    """,
                    {
                        "user_id": ensure_record_id(user_id),
                        "course_id": ensure_record_id(self.id),
                        "role": role,
                    },
                )
                return result[0] if result else existing[0]

            # Create new membership
            result = await repo_query(
                """
                RELATE $user_id->course_membership->$course_id
                SET role = $role, enrolled_at = time::now()
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "course_id": ensure_record_id(self.id),
                    "role": role,
                },
            )
            return result[0] if result else {}
        except Exception as e:
            logger.error(
                f"Error adding member {user_id} to course {self.id}: {str(e)}"
            )
            raise DatabaseOperationError(e)

    async def remove_member(self, user_id: str) -> bool:
        """
        Remove a member from this course.

        Args:
            user_id: The user's ID

        Returns:
            True if the membership was removed
        """
        if not user_id:
            raise InvalidInputError("User ID must be provided")
        try:
            await repo_query(
                """
                DELETE course_membership
                WHERE in = $user_id AND out = $course_id
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "course_id": ensure_record_id(self.id),
                },
            )
            return True
        except Exception as e:
            logger.error(
                f"Error removing member {user_id} from course {self.id}: {str(e)}"
            )
            raise DatabaseOperationError(e)

    async def get_student_module_mastery(
        self, user_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get a student's mastery status for each module in this course.

        Returns a list of module mastery summaries.
        """
        try:
            result = await repo_query(
                """
                SELECT
                    module.id as module_id,
                    module.name as module_name,
                    module.order as module_order,
                    count(lg.id) as total_goals,
                    count(
                        SELECT VALUE id FROM student_progress
                        WHERE learning_goal IN lg.*.id
                          AND user = $user_id
                          AND status = 'mastered'
                    ) as mastered_goals,
                    count(
                        SELECT VALUE id FROM student_progress
                        WHERE learning_goal IN lg.*.id
                          AND user = $user_id
                          AND status = 'struggling'
                    ) as struggling_goals
                FROM (
                    SELECT *,
                           (SELECT * FROM learning_goal WHERE module = parent.id) as lg
                    FROM module
                    WHERE course = $course_id
                ) as module
                ORDER BY module.order ASC
                """,
                {
                    "course_id": ensure_record_id(self.id),
                    "user_id": ensure_record_id(user_id),
                },
            )
            return result if result else []
        except Exception as e:
            logger.error(
                f"Error fetching student mastery for course {self.id}: {str(e)}"
            )
            raise DatabaseOperationError(e)


class CourseMembership(ObjectModel):
    """Represents a user's membership in a course."""

    table_name: ClassVar[str] = "course_membership"
    role: str = "student"
    enrolled_at: Optional[str] = None

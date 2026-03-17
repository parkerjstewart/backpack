"""
Invitation domain model for email-based course invitations.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import ClassVar, List, Optional

from loguru import logger
from pydantic import field_validator
from surrealdb import RecordID

from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.base import ObjectModel
from backpack.exceptions import DatabaseOperationError, InvalidInputError


class Invitation(ObjectModel):
    """Represents an invitation to join a course."""

    table_name: ClassVar[str] = "invitation"
    nullable_fields: ClassVar[set[str]] = {"invited_by"}

    token: str = ""
    course_id: Optional[str] = None
    email: str = ""
    name: str = ""
    role: str = "student"
    status: str = "pending"
    invited_by: Optional[str] = None
    expires_at: Optional[datetime] = None

    @field_validator("course_id", mode="before")
    @classmethod
    def parse_course_id(cls, value):
        """Parse course_id field to ensure string format from RecordID."""
        if value is None:
            return value
        if isinstance(value, RecordID):
            return str(value)
        return str(value) if value else None

    @field_validator("invited_by", mode="before")
    @classmethod
    def parse_invited_by(cls, value):
        """Parse invited_by field to ensure string format from RecordID."""
        if value is None:
            return value
        if isinstance(value, RecordID):
            return str(value)
        return str(value) if value else None

    @field_validator("expires_at", mode="before")
    @classmethod
    def parse_expires_at(cls, value):
        if value is None:
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v):
        if v:
            return v.lower().strip()
        return v

    def _prepare_save_data(self) -> dict:
        """Override to ensure record fields are RecordID format for database."""
        data = super()._prepare_save_data()
        if data.get("course_id") is not None:
            data["course_id"] = ensure_record_id(data["course_id"])
        if data.get("invited_by") is not None:
            data["invited_by"] = ensure_record_id(data["invited_by"])
        return data

    async def save(self) -> None:
        """Save the invitation, generating a token and expiry if new.

        Enrollment requests (status='requested') are instructor-approved flows
        and don't use token-based links, so token/expires_at are left empty.
        """
        if self.status != "requested":
            if not self.token:
                self.token = str(uuid.uuid4())
            if not self.expires_at:
                self.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        await super().save()

    # ------------------------------------------------------------------
    # Class methods
    # ------------------------------------------------------------------

    @classmethod
    async def get_by_token(cls, token: str) -> Optional["Invitation"]:
        """Get an invitation by its unique token."""
        if not token:
            return None
        try:
            result = await repo_query(
                "SELECT * FROM invitation WHERE token = $token LIMIT 1",
                {"token": token},
            )
            if result:
                return cls(**result[0])
            return None
        except Exception as e:
            logger.error(f"Error fetching invitation by token: {str(e)}")
            return None

    @classmethod
    async def get_requests_for_course(cls, course_id: str) -> List["Invitation"]:
        """Get all student-initiated enrollment requests (status='requested') for a course."""
        try:
            result = await repo_query(
                """
                SELECT * FROM invitation
                WHERE course_id = $course_id AND status = 'requested'
                ORDER BY created DESC
                """,
                {"course_id": ensure_record_id(course_id)},
            )
            return [cls(**r) for r in result] if result else []
        except Exception as e:
            logger.error(
                f"Error fetching enrollment requests for course {course_id}: {str(e)}"
            )
            raise DatabaseOperationError(e)

    @classmethod
    async def get_request_by_user_and_course(
        cls, user_id: str, course_id: str, email: str = ""
    ) -> Optional["Invitation"]:
        """Get an active enrollment request or pending invitation for a user in a course.

        Checks both:
        - 'requested' status where invited_by = user_id (student-initiated self-enrollment)
        - 'pending' status where email matches (instructor-sent invitation to this student)

        Both cases block the student from submitting a duplicate self-enrollment request.
        """
        if not user_id or not course_id:
            return None
        try:
            result = await repo_query(
                """
                SELECT * FROM invitation
                WHERE course_id = $course_id
                  AND (
                    (invited_by = $user_id AND status = 'requested')
                    OR (email = $email AND status = 'pending')
                  )
                LIMIT 1
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "course_id": ensure_record_id(course_id),
                    "email": email.lower().strip() if email else "",
                },
            )
            return cls(**result[0]) if result else None
        except Exception as e:
            logger.error(
                f"Error fetching enrollment request for user {user_id} in course {course_id}: {str(e)}"
            )
            return None

    @classmethod
    async def get_enrollment_requests_by_user(cls, user_id: str) -> List[dict]:
        """Get all pending enrollment requests submitted by a user, with course titles.

        Returns raw dicts (not Invitation instances) because the result includes the
        joined course_title field. Callers should use Invitation(**{k: v for k, v in r.items()
        if k != 'course_title'}) if an Invitation instance is needed.
        """
        if not user_id:
            return []
        try:
            result = await repo_query(
                """
                SELECT *, course_id.title AS course_title FROM invitation
                WHERE invited_by = $user_id AND status = 'requested'
                ORDER BY created DESC
                """,
                {"user_id": ensure_record_id(user_id)},
            )
            return result if result else []
        except Exception as e:
            logger.error(
                f"Error fetching enrollment requests for user {user_id}: {str(e)}"
            )
            raise DatabaseOperationError(e)

    @classmethod
    async def get_pending_for_course(cls, course_id: str) -> List["Invitation"]:
        """Get all pending invitations for a course."""
        try:
            result = await repo_query(
                """
                SELECT * FROM invitation
                WHERE course_id = $course_id AND status = 'pending'
                ORDER BY created DESC
                """,
                {"course_id": ensure_record_id(course_id)},
            )
            return [cls(**r) for r in result] if result else []
        except Exception as e:
            logger.error(
                f"Error fetching pending invitations for course {course_id}: {str(e)}"
            )
            raise DatabaseOperationError(e)

    @classmethod
    async def get_by_email_and_course(
        cls, email: str, course_id: str
    ) -> Optional["Invitation"]:
        """Get an existing pending invitation for a specific email and course."""
        if not email or not course_id:
            return None
        try:
            result = await repo_query(
                """
                SELECT * FROM invitation
                WHERE email = $email AND course_id = $course_id AND status = 'pending'
                LIMIT 1
                """,
                {
                    "email": email.lower().strip(),
                    "course_id": ensure_record_id(course_id),
                },
            )
            if result:
                return cls(**result[0])
            return None
        except Exception as e:
            logger.error(
                f"Error fetching invitation for {email} in course {course_id}: {str(e)}"
            )
            return None

    # ------------------------------------------------------------------
    # Instance methods
    # ------------------------------------------------------------------

    async def _create_membership(self, user_id: str) -> dict:
        """
        Create a course_membership edge for the given user, or return the existing one.

        Shared by accept() and approve() to avoid code duplication.
        """
        existing = await repo_query(
            """
            SELECT * FROM course_membership
            WHERE in = $user_id AND out = $course_id
            """,
            {
                "user_id": ensure_record_id(user_id),
                "course_id": ensure_record_id(self.course_id),
            },
        )
        if existing:
            existing_role = existing[0].get("role")
            if existing_role and existing_role != self.role:
                logger.warning(
                    f"User {user_id} is already a member of {self.course_id} "
                    f"with role '{existing_role}'; invitation role '{self.role}' ignored"
                )
            return existing[0]

        result = await repo_query(
            """
            RELATE $user_id->course_membership->$course_id
            SET role = $role, enrolled_at = time::now()
            """,
            {
                "user_id": ensure_record_id(user_id),
                "course_id": ensure_record_id(self.course_id),
                "role": self.role,
            },
        )
        return result[0] if result else {}

    async def accept(self, user_id: str) -> dict:
        """
        Accept the invitation: create course_membership and update status.

        Args:
            user_id: The ID of the user accepting the invitation.

        Returns:
            The created membership record.
        """
        if not user_id:
            raise InvalidInputError("User ID must be provided")
        if self.status != "pending":
            raise InvalidInputError(
                f"Cannot accept invitation with status '{self.status}'"
            )
        if self.expires_at and datetime.now(timezone.utc) > self.expires_at:
            self.status = "expired"
            await self.save()
            raise InvalidInputError("This invitation has expired")

        try:
            membership = await self._create_membership(user_id)
            self.status = "accepted"
            await self.save()
            return membership
        except InvalidInputError:
            raise
        except Exception as e:
            logger.error(f"Error accepting invitation {self.id}: {str(e)}")
            raise DatabaseOperationError(e)

    async def approve(self) -> dict:
        """
        Approve a student enrollment request (teaching staff action).
        Creates course_membership for the requesting student and marks as accepted.

        Note: self.invited_by holds the requesting student's user ID.
        """
        if self.status != "requested":
            raise InvalidInputError(
                f"Cannot approve request with status '{self.status}'"
            )
        if not self.invited_by:
            raise InvalidInputError("Enrollment request has no associated student")

        try:
            membership = await self._create_membership(self.invited_by)
            self.status = "accepted"
            await self.save()
            return membership
        except InvalidInputError:
            raise
        except Exception as e:
            logger.error(f"Error approving enrollment request {self.id}: {str(e)}")
            raise DatabaseOperationError(e)

    async def deny(self) -> None:
        """Deny a student enrollment request (teaching staff action)."""
        if self.status != "requested":
            raise InvalidInputError(
                f"Cannot deny request with status '{self.status}'"
            )
        try:
            self.status = "declined"
            await self.save()
        except InvalidInputError:
            raise
        except Exception as e:
            logger.error(f"Error denying enrollment request {self.id}: {str(e)}")
            raise DatabaseOperationError(e)

    async def decline(self) -> None:
        """Decline the invitation."""
        if self.status != "pending":
            raise InvalidInputError(
                f"Cannot decline invitation with status '{self.status}'"
            )
        self.status = "declined"
        await self.save()

    async def cancel(self) -> None:
        """Cancel the invitation (instructor action)."""
        if self.status != "pending":
            raise InvalidInputError(
                f"Cannot cancel invitation with status '{self.status}'"
            )
        self.status = "cancelled"
        await self.save()

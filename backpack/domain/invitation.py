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
        """Save the invitation, generating a token if new."""
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
            # Check if already a member
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
                # Already a member — just mark invitation as accepted
                self.status = "accepted"
                await self.save()
                return existing[0]

            # Create course membership
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

            # Mark invitation as accepted
            self.status = "accepted"
            await self.save()

            return result[0] if result else {}
        except InvalidInputError:
            raise
        except Exception as e:
            logger.error(f"Error accepting invitation {self.id}: {str(e)}")
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

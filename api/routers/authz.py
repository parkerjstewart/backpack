"""
Shared authorization helpers for course-scoped permissions.
"""

from typing import Optional

from fastapi import HTTPException

from backpack.database.repository import ensure_record_id, repo_query


def get_current_user_id_from_auth(authorization: Optional[str]) -> Optional[str]:
    """Extract current user ID from Authorization header token."""
    if not authorization:
        return None

    token = authorization.replace("Bearer ", "").strip()
    if token.startswith("user:"):
        return token

    return None


async def get_course_membership_role(course_id: str, user_id: str) -> Optional[str]:
    """Return the user's role in the target course, or None if not a member."""
    result = await repo_query(
        """
        SELECT role
        FROM course_membership
        WHERE in = $user_id AND out = $course_id
        LIMIT 1
        """,
        {
            "user_id": ensure_record_id(user_id),
            "course_id": ensure_record_id(course_id),
        },
    )

    if not result:
        return None
    return result[0].get("role")


def is_teaching_role(role: Optional[str]) -> bool:
    return role in {"instructor", "ta"}


def require_authenticated_user_id(authorization: Optional[str]) -> str:
    """Require an authenticated user and return their user ID token."""
    user_id = get_current_user_id_from_auth(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


async def require_course_membership_role(course_id: str, user_id: str) -> str:
    """Require course membership and return role for this course."""
    role = await get_course_membership_role(course_id, user_id)
    if not role:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this course",
        )
    return role


async def require_teaching_role(course_id: str, user_id: str) -> str:
    """Require teaching role (instructor/ta) for course-scoped mutations."""
    role = await require_course_membership_role(course_id, user_id)
    if not is_teaching_role(role):
        raise HTTPException(
            status_code=403,
            detail="Only instructors and TAs can perform this action",
        )
    return role

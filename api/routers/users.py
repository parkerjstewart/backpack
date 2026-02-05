"""
User API endpoints for authentication and profile management.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Header
from loguru import logger

from api.models import CourseResponse, UserLoginRequest, UserResponse
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.course import Course, User

router = APIRouter()


def _get_current_user_id(authorization: Optional[str] = None) -> Optional[str]:
    """
    Extract current user ID from authorization header.
    For now, the token contains "user_id:xxx" format after email login.
    Falls back to None if no user context.
    """
    if not authorization:
        return None
    # Token format: "Bearer user_id:xxx" or just the password
    token = authorization.replace("Bearer ", "").strip()
    if token.startswith("user:"):
        return token
    return None


@router.post("/users/login", response_model=UserResponse)
async def login_or_register(request: UserLoginRequest):
    """
    Login or register a user by email.

    If the email exists, returns the existing user.
    If not, creates a new user with the email.
    """
    try:
        email = request.email.lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        # Check if user exists
        existing_user = await User.get_by_email(email)
        if existing_user:
            return UserResponse(
                id=str(existing_user.id),
                email=existing_user.email,
                name=existing_user.name,
                role=existing_user.role,
                created=str(existing_user.created),
                updated=str(existing_user.updated),
            )

        # Create new user
        new_user = User(email=email, name=None, role="student")
        await new_user.save()

        return UserResponse(
            id=str(new_user.id),
            email=new_user.email,
            name=new_user.name,
            role=new_user.role,
            created=str(new_user.created),
            updated=str(new_user.updated),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in login/register: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during login: {str(e)}")


@router.get("/users/me", response_model=UserResponse)
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Get the current user's profile based on the auth token."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user = await User.get(user_id)
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            created=str(user.created),
            updated=str(user.updated),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}")
        raise HTTPException(status_code=404, detail="User not found")


@router.get("/users/me/courses", response_model=List[CourseResponse])
async def get_current_user_courses(authorization: Optional[str] = Header(None)):
    """Get courses for the current user."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        # Get courses where user is a member
        result = await repo_query(
            """
            SELECT
                out.* as course,
                count((SELECT * FROM module WHERE course = out.id)) as module_count,
                count((SELECT * FROM course_membership WHERE out = out.id AND role = 'student')) as student_count
            FROM course_membership
            WHERE in = $user_id
            FETCH course
            """,
            {"user_id": ensure_record_id(user_id)},
        )

        courses = []
        for r in result if result else []:
            c = r.get("course", {})
            courses.append(
                CourseResponse(
                    id=str(c.get("id", "")),
                    title=c.get("title", ""),
                    description=c.get("description"),
                    instructor_id=str(c.get("instructor_id")) if c.get("instructor_id") else None,
                    archived=c.get("archived", False),
                    created=str(c.get("created", "")),
                    updated=str(c.get("updated", "")),
                    module_count=r.get("module_count", 0),
                    student_count=r.get("student_count", 0),
                )
            )
        return courses
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user courses: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching courses: {str(e)}")


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get a user by ID."""
    try:
        user = await User.get(user_id)
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            created=str(user.created),
            updated=str(user.updated),
        )
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(status_code=404, detail="User not found")

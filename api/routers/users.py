"""
User API endpoints for authentication and profile management.
"""

import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Header, UploadFile
from fastapi.responses import FileResponse
from loguru import logger

from api.models import CourseResponse, UserLoginRequest, UserRegisterRequest, UserResponse
from backpack.config import AVATARS_FOLDER
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.course import Course, User

ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB

router = APIRouter()


def _build_user_response(user: User) -> UserResponse:
    """Build a UserResponse from a User domain model."""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        avatar_url=user.avatar_url,
        created=str(user.created),
        updated=str(user.updated),
    )


async def save_avatar_file(upload_file: UploadFile, user_id: str) -> str:
    """Save an avatar image file and return the relative filename."""
    if not upload_file.filename:
        raise ValueError("No filename provided")

    if upload_file.content_type not in ALLOWED_AVATAR_TYPES:
        raise ValueError(f"Invalid file type: {upload_file.content_type}. Allowed: JPEG, PNG, GIF, WebP")

    content = await upload_file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise ValueError("File too large. Maximum size is 5MB.")

    # Generate unique filename preserving extension
    ext = os.path.splitext(upload_file.filename)[1] or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(AVATARS_FOLDER, filename)

    try:
        with open(file_path, "wb") as f:
            f.write(content)
        logger.info(f"Saved avatar for user {user_id} to: {file_path}")
        return filename
    except Exception as e:
        logger.error(f"Failed to save avatar file: {e}")
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise


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
async def login(request: UserLoginRequest):
    """
    Login a user by email. Returns 404 if no account found.
    """
    try:
        email = request.email.lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        existing_user = await User.get_by_email(email)
        if not existing_user:
            raise HTTPException(status_code=404, detail="No account found with this email")

        return _build_user_response(existing_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during login: {str(e)}")


@router.post("/users/register", response_model=UserResponse)
async def register(request: UserRegisterRequest):
    """
    Register a new user with email and name.
    If the account already exists, returns the existing user.
    """
    try:
        email = request.email.lower().strip()
        name = request.name.strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")

        # Check if user already exists — forgiving, return existing
        existing_user = await User.get_by_email(email)
        if existing_user:
            return _build_user_response(existing_user)

        # Create new user
        new_user = User(email=email, name=name, role="student")
        await new_user.save()

        return _build_user_response(new_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in register: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during registration: {str(e)}")


@router.get("/users/me", response_model=UserResponse)
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Get the current user's profile based on the auth token."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user = await User.get(user_id)
        return _build_user_response(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}")
        raise HTTPException(status_code=404, detail="User not found")


@router.patch("/users/me", response_model=UserResponse)
async def update_current_user(
    name: Optional[str] = Form(None),
    avatar: Optional[UploadFile] = File(None),
    authorization: Optional[str] = Header(None),
):
    """Update current user's profile (name and/or avatar)."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user = await User.get(user_id)

        if name is not None:
            stripped = name.strip()
            if not stripped:
                raise HTTPException(status_code=400, detail="Name cannot be empty")
            user.name = stripped

        if avatar:
            try:
                filename = await save_avatar_file(avatar, user_id)
                user.avatar_url = f"/api/users/avatars/{filename}"
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))

        await user.save()
        return _build_user_response(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating current user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating profile: {str(e)}")


@router.get("/users/avatars/{filename}")
async def get_avatar(filename: str):
    """Serve an avatar image file."""
    file_path = os.path.join(AVATARS_FOLDER, filename)
    safe_root = os.path.realpath(AVATARS_FOLDER)
    resolved_path = os.path.realpath(file_path)

    if not resolved_path.startswith(safe_root):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="Avatar not found")

    return FileResponse(resolved_path)


@router.get("/users/me/courses", response_model=List[CourseResponse])
async def get_current_user_courses(authorization: Optional[str] = Header(None)):
    """Get courses for the current user."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        # Get courses where user is a member, including membership role
        result = await repo_query(
            """
            SELECT
                out.* as course,
                role as membership_role,
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
                    membership_role=r.get("membership_role"),
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
        return _build_user_response(user)
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(status_code=404, detail="User not found")

"""
User management API routes.

Provides CRUD operations for LMS users with role-based access.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.models import UserCreate, UserResponse, UserUpdate
from backpack.domain.lms import User
from backpack.exceptions import InvalidInputError

router = APIRouter()


@router.get("/users", response_model=List[UserResponse])
async def get_users(
    role: Optional[str] = Query(None, description="Filter by role"),
    order_by: str = Query("created desc", description="Order by field and direction"),
):
    """Get all users with optional filtering."""
    try:
        users = await User.get_all(order_by=order_by)
        
        # Filter by role if specified
        if role:
            users = [u for u in users if u.role == role]
        
        return [
            UserResponse(
                id=str(u.id),
                email=u.email,
                name=u.name,
                role=u.role,
                external_id=u.external_id,
                created=str(u.created),
                updated=str(u.updated),
            )
            for u in users
        ]
    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching users: {e}")


@router.post("/users", response_model=UserResponse)
async def create_user(user_data: UserCreate):
    """Create a new user."""
    try:
        user = User(
            email=user_data.email,
            name=user_data.name,
            role=user_data.role,
            external_id=user_data.external_id,
        )
        await user.save()
        
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            external_id=user.external_id,
            created=str(user.created),
            updated=str(user.updated),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating user: {e}")


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get a specific user by ID."""
    try:
        user = await User.get(user_id)
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            external_id=user.external_id,
            created=str(user.created),
            updated=str(user.updated),
        )
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {e}")
        raise HTTPException(status_code=404, detail="User not found")


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_data: UserUpdate):
    """Update a user."""
    try:
        user = await User.get(user_id)
        
        if user_data.name is not None:
            user.name = user_data.name
        if user_data.role is not None:
            user.role = user_data.role
        
        await user.save()
        
        return UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            external_id=user.external_id,
            created=str(user.created),
            updated=str(user.updated),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating user: {e}")


@router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    """Delete a user."""
    try:
        user = await User.get(user_id)
        await user.delete()
        return {"message": "User deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting user: {e}")


@router.get("/users/{user_id}/courses", response_model=List[dict])
async def get_user_courses(user_id: str):
    """Get all courses a user is enrolled in."""
    try:
        user = await User.get(user_id)
        courses = await user.get_enrolled_courses()
        
        return [
            {
                "id": str(c.id),
                "title": c.title,
                "description": c.description,
                "archived": c.archived,
            }
            for c in courses
        ]
    except Exception as e:
        logger.error(f"Error fetching courses for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching user courses: {e}")


@router.get("/users/{user_id}/progress", response_model=List[dict])
async def get_user_progress(
    user_id: str,
    course_id: Optional[str] = Query(None, description="Filter by course ID"),
):
    """Get learning progress for a user."""
    try:
        user = await User.get(user_id)
        progress = await user.get_progress(course_id=course_id)
        
        return [
            {
                "id": str(p.id),
                "learning_goal": p.learning_goal,
                "status": p.status,
                "confidence_score": p.confidence_score,
                "notes": p.notes,
                "last_activity": str(p.last_activity) if p.last_activity else None,
            }
            for p in progress
        ]
    except Exception as e:
        logger.error(f"Error fetching progress for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching user progress: {e}")


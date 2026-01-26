"""
Learning progress API routes.

Provides CRUD operations for learning goals and student progress tracking.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.models import (
    LearningGoalCreate,
    LearningGoalResponse,
    LearningGoalUpdate,
    ProgressResponse,
    ProgressUpdate,
)
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.lms import LearningGoal, StudentProgress, User
from backpack.domain.module import Module
from backpack.exceptions import InvalidInputError

router = APIRouter()


# Learning Goals
@router.get("/learning-goals", response_model=List[LearningGoalResponse])
async def get_learning_goals(
    module_id: Optional[str] = Query(None, description="Filter by module ID"),
    course_id: Optional[str] = Query(None, description="Filter by course ID"),
):
    """Get learning goals with optional filtering."""
    try:
        if module_id:
            query = """
                SELECT * FROM learning_goal 
                WHERE module == $module_id 
                ORDER BY order ASC
            """
            result = await repo_query(query, {"module_id": ensure_record_id(module_id)})
        elif course_id:
            query = """
                SELECT * FROM learning_goal 
                WHERE module.course == $course_id 
                ORDER BY module.order ASC, order ASC
            """
            result = await repo_query(query, {"course_id": ensure_record_id(course_id)})
        else:
            result = await repo_query("SELECT * FROM learning_goal ORDER BY created DESC")
        
        return [
            LearningGoalResponse(
                id=str(g.get("id", "")),
                module_id=str(g.get("module", "")),
                description=g.get("description", ""),
                mastery_criteria=g.get("mastery_criteria"),
                order=g.get("order", 0),
                created=str(g.get("created", "")),
            )
            for g in result
        ]
    except Exception as e:
        logger.error(f"Error fetching learning goals: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching learning goals: {e}")


@router.post("/learning-goals", response_model=LearningGoalResponse)
async def create_learning_goal(goal_data: LearningGoalCreate):
    """Create a new learning goal."""
    try:
        # Verify module exists
        await Module.get(goal_data.module_id)
        
        goal = LearningGoal(
            module=goal_data.module_id,
            description=goal_data.description,
            mastery_criteria=goal_data.mastery_criteria,
            order=goal_data.order,
        )
        await goal.save()
        
        return LearningGoalResponse(
            id=str(goal.id),
            module_id=goal.module,
            description=goal.description,
            mastery_criteria=goal.mastery_criteria,
            order=goal.order,
            created=str(goal.created),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating learning goal: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating learning goal: {e}")


@router.get("/learning-goals/{goal_id}", response_model=LearningGoalResponse)
async def get_learning_goal(goal_id: str):
    """Get a specific learning goal by ID."""
    try:
        goal = await LearningGoal.get(goal_id)
        return LearningGoalResponse(
            id=str(goal.id),
            module_id=goal.module,
            description=goal.description,
            mastery_criteria=goal.mastery_criteria,
            order=goal.order,
            created=str(goal.created),
        )
    except Exception as e:
        logger.error(f"Error fetching learning goal {goal_id}: {e}")
        raise HTTPException(status_code=404, detail="Learning goal not found")


@router.put("/learning-goals/{goal_id}", response_model=LearningGoalResponse)
async def update_learning_goal(goal_id: str, goal_data: LearningGoalUpdate):
    """Update a learning goal."""
    try:
        goal = await LearningGoal.get(goal_id)
        
        if goal_data.description is not None:
            goal.description = goal_data.description
        if goal_data.mastery_criteria is not None:
            goal.mastery_criteria = goal_data.mastery_criteria
        if goal_data.order is not None:
            goal.order = goal_data.order
        
        await goal.save()
        
        return LearningGoalResponse(
            id=str(goal.id),
            module_id=goal.module,
            description=goal.description,
            mastery_criteria=goal.mastery_criteria,
            order=goal.order,
            created=str(goal.created),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating learning goal {goal_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating learning goal: {e}")


@router.delete("/learning-goals/{goal_id}")
async def delete_learning_goal(goal_id: str):
    """Delete a learning goal."""
    try:
        goal = await LearningGoal.get(goal_id)
        await goal.delete()
        return {"message": "Learning goal deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting learning goal {goal_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting learning goal: {e}")


# Student Progress
@router.get("/progress", response_model=List[ProgressResponse])
async def get_progress(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    goal_id: Optional[str] = Query(None, description="Filter by learning goal ID"),
    module_id: Optional[str] = Query(None, description="Filter by module ID"),
    course_id: Optional[str] = Query(None, description="Filter by course ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
):
    """Get student progress with optional filtering."""
    try:
        conditions = []
        params = {}
        
        if user_id:
            conditions.append("user == $user_id")
            params["user_id"] = ensure_record_id(user_id)
        if goal_id:
            conditions.append("learning_goal == $goal_id")
            params["goal_id"] = ensure_record_id(goal_id)
        if module_id:
            conditions.append("learning_goal.module == $module_id")
            params["module_id"] = ensure_record_id(module_id)
        if course_id:
            conditions.append("learning_goal.module.course == $course_id")
            params["course_id"] = ensure_record_id(course_id)
        if status:
            conditions.append("status == $status")
            params["status"] = status
        
        query = "SELECT * FROM student_progress"
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY last_activity DESC"
        
        result = await repo_query(query, params if params else None)
        
        return [
            ProgressResponse(
                id=str(p.get("id", "")),
                user_id=str(p.get("user", "")),
                learning_goal_id=str(p.get("learning_goal", "")),
                status=p.get("status", "not_started"),
                confidence_score=p.get("confidence_score"),
                notes=p.get("notes"),
                last_activity=str(p.get("last_activity")) if p.get("last_activity") else None,
                created=str(p.get("created", "")),
            )
            for p in result
        ]
    except Exception as e:
        logger.error(f"Error fetching progress: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching progress: {e}")


@router.get("/progress/{user_id}/{goal_id}", response_model=ProgressResponse)
async def get_user_goal_progress(user_id: str, goal_id: str):
    """Get progress for a specific user and learning goal."""
    try:
        result = await repo_query(
            """
            SELECT * FROM student_progress 
            WHERE user == $user_id AND learning_goal == $goal_id
            LIMIT 1
            """,
            {
                "user_id": ensure_record_id(user_id),
                "goal_id": ensure_record_id(goal_id),
            },
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Progress record not found")
        
        p = result[0]
        return ProgressResponse(
            id=str(p.get("id", "")),
            user_id=str(p.get("user", "")),
            learning_goal_id=str(p.get("learning_goal", "")),
            status=p.get("status", "not_started"),
            confidence_score=p.get("confidence_score"),
            notes=p.get("notes"),
            last_activity=str(p.get("last_activity")) if p.get("last_activity") else None,
            created=str(p.get("created", "")),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching progress for user {user_id}, goal {goal_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching progress: {e}")


@router.put("/progress/{user_id}/{goal_id}", response_model=ProgressResponse)
async def update_progress(user_id: str, goal_id: str, progress_data: ProgressUpdate):
    """Update or create progress for a user and learning goal."""
    try:
        # Check if progress exists
        result = await repo_query(
            """
            SELECT * FROM student_progress 
            WHERE user == $user_id AND learning_goal == $goal_id
            LIMIT 1
            """,
            {
                "user_id": ensure_record_id(user_id),
                "goal_id": ensure_record_id(goal_id),
            },
        )
        
        if result:
            # Update existing
            progress = await StudentProgress.get(str(result[0]["id"]))
            progress.status = progress_data.status
            if progress_data.confidence_score is not None:
                progress.confidence_score = progress_data.confidence_score
            if progress_data.notes is not None:
                progress.notes = progress_data.notes
            await progress.save()
        else:
            # Create new
            progress = StudentProgress(
                user=user_id,
                learning_goal=goal_id,
                status=progress_data.status,
                confidence_score=progress_data.confidence_score,
                notes=progress_data.notes,
            )
            await progress.save()
        
        return ProgressResponse(
            id=str(progress.id),
            user_id=progress.user,
            learning_goal_id=progress.learning_goal,
            status=progress.status,
            confidence_score=progress.confidence_score,
            notes=progress.notes,
            last_activity=str(progress.last_activity) if progress.last_activity else None,
            created=str(progress.created),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating progress for user {user_id}, goal {goal_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating progress: {e}")


@router.delete("/progress/{progress_id}")
async def delete_progress(progress_id: str):
    """Delete a progress record."""
    try:
        progress = await StudentProgress.get(progress_id)
        await progress.delete()
        return {"message": "Progress record deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting progress {progress_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting progress: {e}")


# Summary endpoints
@router.get("/progress/summary/{user_id}")
async def get_user_progress_summary(
    user_id: str,
    course_id: Optional[str] = Query(None, description="Filter by course ID"),
):
    """Get a summary of a user's progress across learning goals."""
    try:
        conditions = ["user == $user_id"]
        params = {"user_id": ensure_record_id(user_id)}
        
        if course_id:
            conditions.append("learning_goal.module.course == $course_id")
            params["course_id"] = ensure_record_id(course_id)
        
        query = f"""
            SELECT 
                status,
                count() as count
            FROM student_progress
            WHERE {" AND ".join(conditions)}
            GROUP BY status
        """
        
        result = await repo_query(query, params)
        
        # Build summary
        summary = {
            "user_id": user_id,
            "not_started": 0,
            "in_progress": 0,
            "mastered": 0,
            "total": 0,
        }
        
        for r in result:
            status = r.get("status", "")
            count = r.get("count", 0)
            if status in summary:
                summary[status] = count
            summary["total"] += count
        
        # Calculate completion percentage
        if summary["total"] > 0:
            summary["completion_percentage"] = round(
                (summary["mastered"] / summary["total"]) * 100, 1
            )
        else:
            summary["completion_percentage"] = 0.0
        
        return summary
    except Exception as e:
        logger.error(f"Error fetching progress summary for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching progress summary: {e}")


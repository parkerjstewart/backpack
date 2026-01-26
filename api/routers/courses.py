"""
Course management API routes.

Provides CRUD operations for courses, modules within courses,
and enrollment management.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.models import (
    CourseCreate,
    CourseResponse,
    CourseUpdate,
    EnrollmentCreate,
    EnrollmentResponse,
    ModuleLMSResponse,
    PrerequisiteCreate,
    PrerequisiteResponse,
)
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.lms import Course, User
from backpack.domain.module import Module
from backpack.exceptions import InvalidInputError

router = APIRouter()


@router.get("/courses", response_model=List[CourseResponse])
async def get_courses(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    order_by: str = Query("created desc", description="Order by field and direction"),
):
    """Get all courses with optional filtering."""
    try:
        query = f"""
            SELECT *,
            count(<-module) as module_count,
            count(<-course_membership.in) as student_count
            FROM course
            ORDER BY {order_by}
        """
        result = await repo_query(query)
        
        # Filter by archived status if specified
        if archived is not None:
            result = [c for c in result if c.get("archived") == archived]
        
        return [
            CourseResponse(
                id=str(c.get("id", "")),
                title=c.get("title", ""),
                description=c.get("description"),
                instructor_id=str(c.get("instructor_id")) if c.get("instructor_id") else None,
                archived=c.get("archived", False),
                created=str(c.get("created", "")),
                updated=str(c.get("updated", "")),
                module_count=c.get("module_count", 0),
                student_count=c.get("student_count", 0),
            )
            for c in result
        ]
    except Exception as e:
        logger.error(f"Error fetching courses: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching courses: {e}")


@router.post("/courses", response_model=CourseResponse)
async def create_course(course_data: CourseCreate):
    """Create a new course."""
    try:
        course = Course(
            title=course_data.title,
            description=course_data.description,
            instructor_id=course_data.instructor_id,
        )
        await course.save()
        
        return CourseResponse(
            id=str(course.id),
            title=course.title,
            description=course.description,
            instructor_id=course.instructor_id,
            archived=course.archived,
            created=str(course.created),
            updated=str(course.updated),
            module_count=0,
            student_count=0,
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating course: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating course: {e}")


@router.get("/courses/{course_id}", response_model=CourseResponse)
async def get_course(course_id: str):
    """Get a specific course by ID."""
    try:
        query = """
            SELECT *,
            count(<-module) as module_count,
            count(<-course_membership.in) as student_count
            FROM $course_id
        """
        result = await repo_query(query, {"course_id": ensure_record_id(course_id)})
        
        if not result:
            raise HTTPException(status_code=404, detail="Course not found")
        
        c = result[0]
        return CourseResponse(
            id=str(c.get("id", "")),
            title=c.get("title", ""),
            description=c.get("description"),
            instructor_id=str(c.get("instructor_id")) if c.get("instructor_id") else None,
            archived=c.get("archived", False),
            created=str(c.get("created", "")),
            updated=str(c.get("updated", "")),
            module_count=c.get("module_count", 0),
            student_count=c.get("student_count", 0),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching course: {e}")


@router.put("/courses/{course_id}", response_model=CourseResponse)
async def update_course(course_id: str, course_data: CourseUpdate):
    """Update a course."""
    try:
        course = await Course.get(course_id)
        
        if course_data.title is not None:
            course.title = course_data.title
        if course_data.description is not None:
            course.description = course_data.description
        if course_data.instructor_id is not None:
            course.instructor_id = course_data.instructor_id
        if course_data.archived is not None:
            course.archived = course_data.archived
        
        await course.save()
        
        # Re-query with counts
        query = """
            SELECT *,
            count(<-module) as module_count,
            count(<-course_membership.in) as student_count
            FROM $course_id
        """
        result = await repo_query(query, {"course_id": ensure_record_id(course_id)})
        
        c = result[0] if result else {}
        return CourseResponse(
            id=str(course.id),
            title=course.title,
            description=course.description,
            instructor_id=course.instructor_id,
            archived=course.archived,
            created=str(course.created),
            updated=str(course.updated),
            module_count=c.get("module_count", 0),
            student_count=c.get("student_count", 0),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating course: {e}")


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str):
    """Delete a course."""
    try:
        course = await Course.get(course_id)
        await course.delete()
        return {"message": "Course deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting course: {e}")


# Course modules
@router.get("/courses/{course_id}/modules", response_model=List[ModuleLMSResponse])
async def get_course_modules(course_id: str):
    """Get all modules in a course."""
    try:
        course = await Course.get(course_id)
        modules = await course.get_modules()
        
        return [
            ModuleLMSResponse(
                id=str(m.id),
                name=m.name,
                description=m.description,
                archived=m.archived or False,
                created=str(m.created),
                updated=str(m.updated),
                source_count=0,  # TODO: add counts
                note_count=0,
                course_id=str(m.course) if m.course else None,
                overview=m.overview,
                order=m.order,
                due_date=str(m.due_date) if m.due_date else None,
                learning_goal_count=0,
                prerequisite_count=0,
            )
            for m in modules
        ]
    except Exception as e:
        logger.error(f"Error fetching modules for course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching course modules: {e}")


@router.post("/courses/{course_id}/modules/{module_id}")
async def add_module_to_course(course_id: str, module_id: str):
    """Add an existing module to a course."""
    try:
        # Verify course exists
        await Course.get(course_id)
        
        # Update module's course field
        module = await Module.get(module_id)
        module.course = course_id
        await module.save()
        
        return {"message": "Module added to course successfully"}
    except Exception as e:
        logger.error(f"Error adding module {module_id} to course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding module to course: {e}")


@router.delete("/courses/{course_id}/modules/{module_id}")
async def remove_module_from_course(course_id: str, module_id: str):
    """Remove a module from a course (sets course to null, doesn't delete module)."""
    try:
        module = await Module.get(module_id)
        module.course = None
        await module.save()
        
        return {"message": "Module removed from course successfully"}
    except Exception as e:
        logger.error(f"Error removing module {module_id} from course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error removing module from course: {e}")


# Enrollment management
@router.get("/courses/{course_id}/enrollments", response_model=List[EnrollmentResponse])
async def get_course_enrollments(
    course_id: str,
    role: Optional[str] = Query(None, description="Filter by role"),
):
    """Get all enrollments for a course."""
    try:
        query = """
            SELECT in.id as user_id, out.id as course_id, role, enrolled_at
            FROM course_membership
            WHERE out == $course_id
        """
        if role:
            query += " AND role == $role"
        
        result = await repo_query(
            query,
            {"course_id": ensure_record_id(course_id), "role": role} if role else {"course_id": ensure_record_id(course_id)},
        )
        
        return [
            EnrollmentResponse(
                user_id=str(r.get("user_id", "")),
                course_id=str(r.get("course_id", "")),
                role=r.get("role", "student"),
                enrolled_at=str(r.get("enrolled_at", "")),
            )
            for r in result
        ]
    except Exception as e:
        logger.error(f"Error fetching enrollments for course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching enrollments: {e}")


@router.post("/courses/{course_id}/enrollments", response_model=EnrollmentResponse)
async def enroll_user(course_id: str, enrollment: EnrollmentCreate):
    """Enroll a user in a course."""
    try:
        # Verify user and course exist
        user = await User.get(enrollment.user_id)
        course = await Course.get(course_id)
        
        # Create enrollment
        await course.enroll_user(enrollment.user_id, role=enrollment.role)
        
        return EnrollmentResponse(
            user_id=str(user.id),
            course_id=str(course.id),
            role=enrollment.role,
            enrolled_at=str(user.updated),  # Approximate
        )
    except Exception as e:
        logger.error(f"Error enrolling user in course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error enrolling user: {e}")


@router.delete("/courses/{course_id}/enrollments/{user_id}")
async def unenroll_user(course_id: str, user_id: str):
    """Remove a user's enrollment from a course."""
    try:
        await repo_query(
            "DELETE course_membership WHERE in == $user_id AND out == $course_id",
            {
                "user_id": ensure_record_id(user_id),
                "course_id": ensure_record_id(course_id),
            },
        )
        return {"message": "User unenrolled successfully"}
    except Exception as e:
        logger.error(f"Error unenrolling user {user_id} from course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error unenrolling user: {e}")


# Module prerequisites
@router.get("/modules/{module_id}/prerequisites", response_model=List[PrerequisiteResponse])
async def get_module_prerequisites(module_id: str):
    """Get prerequisites for a module."""
    try:
        module = await Module.get(module_id)
        prereqs = await module.get_prerequisites()
        
        # Get additional info about each prerequisite
        result = await repo_query(
            """
            SELECT id, in as module_id, out as prerequisite_module_id, 
                   out.name as prerequisite_module_name, is_required, notes
            FROM module_prerequisite
            WHERE in == $module_id
            """,
            {"module_id": ensure_record_id(module_id)},
        )
        
        return [
            PrerequisiteResponse(
                id=str(r.get("id", "")),
                module_id=str(r.get("module_id", "")),
                prerequisite_module_id=str(r.get("prerequisite_module_id", "")),
                prerequisite_module_name=r.get("prerequisite_module_name"),
                is_required=r.get("is_required", True),
                notes=r.get("notes"),
            )
            for r in result
        ]
    except Exception as e:
        logger.error(f"Error fetching prerequisites for module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching prerequisites: {e}")


@router.post("/modules/{module_id}/prerequisites", response_model=PrerequisiteResponse)
async def add_prerequisite(module_id: str, prereq: PrerequisiteCreate):
    """Add a prerequisite to a module."""
    try:
        module = await Module.get(module_id)
        
        # Verify prerequisite module exists
        prereq_module = await Module.get(prereq.prerequisite_module_id)
        
        # Create the prerequisite relationship
        await module.add_prerequisite(
            prereq.prerequisite_module_id,
            is_required=prereq.is_required,
            notes=prereq.notes,
        )
        
        return PrerequisiteResponse(
            id="",  # ID generated by database
            module_id=str(module.id),
            prerequisite_module_id=str(prereq_module.id),
            prerequisite_module_name=prereq_module.name,
            is_required=prereq.is_required,
            notes=prereq.notes,
        )
    except Exception as e:
        logger.error(f"Error adding prerequisite to module {module_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding prerequisite: {e}")


@router.delete("/modules/{module_id}/prerequisites/{prerequisite_id}")
async def remove_prerequisite(module_id: str, prerequisite_id: str):
    """Remove a prerequisite from a module."""
    try:
        await repo_query(
            "DELETE $prereq_id",
            {"prereq_id": ensure_record_id(prerequisite_id)},
        )
        return {"message": "Prerequisite removed successfully"}
    except Exception as e:
        logger.error(f"Error removing prerequisite {prerequisite_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error removing prerequisite: {e}")


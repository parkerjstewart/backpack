"""
Course API endpoints for CRUD and member management.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Header, Query
from loguru import logger

from api.models import (
    AddCourseMemberRequest,
    CourseCreate,
    CourseMemberResponse,
    CourseResponse,
    CourseUpdate,
    ModuleMasteryResponse,
    StudentWithMasteryResponse,
)
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.course import Course, User

router = APIRouter()


def _get_current_user_id(authorization: Optional[str] = None) -> Optional[str]:
    """
    Extract current user ID from authorization header.
    Token format: "Bearer user:xxx" after email login.
    """
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    if token.startswith("user:"):
        return token
    return None


# ============================================
# Course CRUD endpoints
# ============================================


@router.get("/courses", response_model=List[CourseResponse])
async def list_courses(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    authorization: Optional[str] = Header(None),
):
    """
    List all courses.
    If user is authenticated, only returns courses they're a member of.
    """
    try:
        user_id = _get_current_user_id(authorization)

        if user_id:
            # Get courses for authenticated user, including membership role
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
            courses_data = [
                {**r.get("course", {}), "module_count": r.get("module_count", 0), "student_count": r.get("student_count", 0), "membership_role": r.get("membership_role")}
                for r in (result or [])
            ]
        else:
            # Get all courses (unauthenticated or legacy mode)
            result = await repo_query(
                """
                SELECT *,
                    count(<-course_membership[WHERE role = 'student']) as student_count,
                    count((SELECT * FROM module WHERE course = parent.id)) as module_count
                FROM course
                ORDER BY updated DESC
                """
            )
            courses_data = result or []

        # Filter by archived status if specified
        if archived is not None:
            courses_data = [c for c in courses_data if c.get("archived") == archived]

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
                membership_role=c.get("membership_role"),
            )
            for c in courses_data
        ]
    except Exception as e:
        logger.error(f"Error listing courses: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing courses: {str(e)}")


@router.post("/courses", response_model=CourseResponse)
async def create_course(
    course_data: CourseCreate,
    authorization: Optional[str] = Header(None),
):
    """Create a new course. Auto-enrolls the creator as instructor."""
    try:
        user_id = _get_current_user_id(authorization)

        course = Course(
            title=course_data.title,
            description=course_data.description,
            instructor_id=user_id,
        )
        await course.save()

        # Auto-enroll creator as instructor if authenticated
        if user_id:
            await course.add_member(user_id, role="instructor")

        return CourseResponse(
            id=str(course.id),
            title=course.title,
            description=course.description,
            instructor_id=str(course.instructor_id) if course.instructor_id else None,
            archived=course.archived,
            created=str(course.created),
            updated=str(course.updated),
            module_count=0,
            student_count=0,
        )
    except Exception as e:
        logger.error(f"Error creating course: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating course: {str(e)}")


@router.get("/courses/{course_id}", response_model=CourseResponse)
async def get_course(course_id: str):
    """Get a specific course by ID."""
    try:
        result = await repo_query(
            """
            SELECT *,
                count(<-course_membership[WHERE role = 'student']) as student_count,
                count((SELECT * FROM module WHERE course = parent.id)) as module_count
            FROM $course_id
            """,
            {"course_id": ensure_record_id(course_id)},
        )

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
        logger.error(f"Error fetching course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching course: {str(e)}")


@router.put("/courses/{course_id}", response_model=CourseResponse)
async def update_course(course_id: str, course_update: CourseUpdate):
    """Update a course."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        if course_update.title is not None:
            course.title = course_update.title
        if course_update.description is not None:
            course.description = course_update.description
        if course_update.archived is not None:
            course.archived = course_update.archived

        await course.save()

        # Get counts
        result = await repo_query(
            """
            SELECT
                count(<-course_membership[WHERE role = 'student']) as student_count,
                count((SELECT * FROM module WHERE course = parent.id)) as module_count
            FROM $course_id
            """,
            {"course_id": ensure_record_id(course_id)},
        )
        counts = result[0] if result else {}

        return CourseResponse(
            id=str(course.id),
            title=course.title,
            description=course.description,
            instructor_id=str(course.instructor_id) if course.instructor_id else None,
            archived=course.archived,
            created=str(course.created),
            updated=str(course.updated),
            module_count=counts.get("module_count", 0),
            student_count=counts.get("student_count", 0),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating course: {str(e)}")


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str):
    """Delete a course."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        await course.delete()
        return {"message": "Course deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting course: {str(e)}")


# ============================================
# Course Member endpoints
# ============================================


@router.get("/courses/{course_id}/students", response_model=List[StudentWithMasteryResponse])
async def get_course_students(course_id: str):
    """Get all students in a course with their module mastery."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        students = await course.get_students()

        # Get modules for mastery tracking
        modules = await course.get_modules()

        result = []
        for s in students:
            user = s.get("user", {})
            user_id = str(user.get("id", ""))

            # Get mastery for each module
            mastery_list = []
            for module in modules:
                # Query progress for this student on this module's goals
                progress = await repo_query(
                    """
                    SELECT
                        count() as total,
                        count(IF status = 'mastered' THEN 1 ELSE NONE END) as mastered,
                        count(IF status = 'struggling' THEN 1 ELSE NONE END) as struggling
                    FROM student_progress
                    WHERE user = $user_id
                      AND learning_goal.module = $module_id
                    GROUP ALL
                    """,
                    {
                        "user_id": ensure_record_id(user_id),
                        "module_id": ensure_record_id(module.id),
                    },
                )

                # Determine status
                p = progress[0] if progress else {"total": 0, "mastered": 0, "struggling": 0}
                total = p.get("total", 0)
                mastered = p.get("mastered", 0)
                struggling = p.get("struggling", 0)

                if total == 0:
                    status = "incomplete"
                elif struggling > 0:
                    status = "struggling"
                elif mastered == total:
                    status = "mastered"
                else:
                    status = "progressing"

                mastery_list.append(
                    ModuleMasteryResponse(
                        module_id=str(module.id),
                        module_name=module.name,
                        status=status,
                    )
                )

            result.append(
                StudentWithMasteryResponse(
                    id=user_id,
                    email=user.get("email", ""),
                    name=user.get("name"),
                    avatar_url=user.get("avatar_url"),
                    module_mastery=mastery_list,
                )
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting students for course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching students: {str(e)}")


@router.get("/courses/{course_id}/teaching-team", response_model=List[CourseMemberResponse])
async def get_course_teaching_team(course_id: str):
    """Get all instructors and TAs for a course."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        team = await course.get_teaching_team()

        return [
            CourseMemberResponse(
                id=str(m.get("user", {}).get("id", "")),
                email=m.get("user", {}).get("email", ""),
                name=m.get("user", {}).get("name"),
                avatar_url=m.get("user", {}).get("avatar_url"),
                role=m.get("role", "instructor"),
                enrolled_at=str(m.get("enrolled_at", "")),
            )
            for m in team
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting teaching team for course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching teaching team: {str(e)}")


@router.get("/courses/{course_id}/needs-attention", response_model=List[CourseMemberResponse])
async def get_course_needs_attention(course_id: str):
    """Get students who need attention (struggling with learning goals)."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        students = await course.get_students_needing_attention()

        return [
            CourseMemberResponse(
                id=str(s.get("user", {}).get("id", "")),
                email=s.get("user", {}).get("email", ""),
                name=s.get("user", {}).get("name"),
                avatar_url=s.get("user", {}).get("avatar_url"),
                role="student",
                enrolled_at="",  # Not available from this query
            )
            for s in students
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting students needing attention for course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching students: {str(e)}")


@router.post("/courses/{course_id}/members", response_model=CourseMemberResponse)
async def add_course_member(course_id: str, request: AddCourseMemberRequest):
    """Add a member to a course by email. Creates user if doesn't exist."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        # Find or create user by email
        user = await User.get_by_email(request.email)
        if not user:
            user = User(email=request.email, name=request.name)
            await user.save()
        elif not user.name and request.name:
            # Update name if user exists but has no name
            user.name = request.name
            await user.save()

        # Add to course
        await course.add_member(str(user.id), role=request.role)

        # Get enrollment info
        result = await repo_query(
            """
            SELECT enrolled_at FROM course_membership
            WHERE in = $user_id AND out = $course_id
            """,
            {
                "user_id": ensure_record_id(user.id),
                "course_id": ensure_record_id(course_id),
            },
        )
        enrolled_at = result[0].get("enrolled_at", "") if result else ""

        return CourseMemberResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            avatar_url=user.avatar_url,
            role=request.role,
            enrolled_at=str(enrolled_at),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding member to course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding member: {str(e)}")


@router.delete("/courses/{course_id}/members/{user_id}")
async def remove_course_member(course_id: str, user_id: str):
    """Remove a member from a course."""
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        await course.remove_member(user_id)
        return {"message": "Member removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member from course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error removing member: {str(e)}")

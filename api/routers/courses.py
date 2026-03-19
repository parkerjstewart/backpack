"""
Course API endpoints for CRUD and member management.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Header, Query
from loguru import logger

from api.models import (
    AddCourseMemberRequest,
    CourseCreate,
    CourseInsightsResponse,
    CourseMemberResponse,
    CourseResponse,
    CourseUpdate,
    GoalAverageResponse,
    ModuleInsightsResponse,
    ModuleMasteryResponse,
    ModuleReorderRequest,
    StudentSessionSummary,
    StudentWithMasteryResponse,
)
from api.routers.authz import (
    get_course_membership_role,
    get_current_user_id_from_auth,
    require_authenticated_user_id,
    require_course_membership_role,
    require_instructor_role,
    require_teaching_role,
)
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.course import Course, User
from backpack.domain.invitation import Invitation
from backpack.domain.module import Module
from backpack.domain.student_progress import StudentProgress

router = APIRouter()


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
        user_id = get_current_user_id_from_auth(authorization)

        if user_id:
            # Get courses for authenticated user, including membership role
            result = await repo_query(
                """
                SELECT
                    out.* as course,
                    role as membership_role,
                    count((SELECT * FROM module WHERE course = out.id AND (status != "draft" OR status = NONE))) as module_count,
                    count((SELECT * FROM course_membership WHERE out = out.id AND role = 'student')) as student_count
                FROM course_membership
                WHERE in = $user_id
                FETCH course
                """,
                {"user_id": ensure_record_id(user_id)},
            )
            # r.get("course", {}) can be None when FETCH returns null; ensure we never spread None
            courses_data = [
                {**(r.get("course") or {}), "module_count": r.get("module_count", 0), "student_count": r.get("student_count", 0), "membership_role": r.get("membership_role")}
                for r in (result or [])
                if (r.get("course") or {}).get("id")  # skip rows with no valid course
            ]
        else:
            # Get all courses (unauthenticated or legacy mode)
            result = await repo_query(
                """
                SELECT *,
                    count(<-course_membership[WHERE role = 'student']) as student_count,
                    count((SELECT * FROM module WHERE course = parent.id AND (status != "draft" OR status = NONE))) as module_count
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
        user_id = get_current_user_id_from_auth(authorization)

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
async def get_course(course_id: str, authorization: Optional[str] = Header(None)):
    """Get a specific course by ID."""
    try:
        user_id = get_current_user_id_from_auth(authorization)
        membership_role = None
        if user_id:
            membership_role = await get_course_membership_role(course_id, user_id)
            if not membership_role:
                raise HTTPException(
                    status_code=403,
                    detail="You do not have access to this course",
                )

        result = await repo_query(
            """
            SELECT *,
                count(<-course_membership[WHERE role = 'student']) as student_count,
                count((SELECT * FROM module WHERE course = parent.id AND (status != "draft" OR status = NONE))) as module_count
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
            membership_role=membership_role,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching course: {str(e)}")


@router.put("/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: str,
    course_update: CourseUpdate,
    authorization: Optional[str] = Header(None),
):
    """Update a course. Archiving requires instructor role; title/description allow TA."""
    try:
        user_id = require_authenticated_user_id(authorization)

        # Archiving is a destructive action — instructor only
        if course_update.archived is not None:
            membership_role = await require_instructor_role(course_id, user_id)
        else:
            membership_role = await require_teaching_role(course_id, user_id)

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
                count((SELECT * FROM module WHERE course = parent.id AND (status != "draft" OR status = NONE))) as module_count
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
            membership_role=membership_role,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating course: {str(e)}")


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, authorization: Optional[str] = Header(None)):
    """Delete a course. Instructor only."""
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_instructor_role(course_id, user_id)

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
async def get_course_students(course_id: str, authorization: Optional[str] = Header(None)):
    """Get all students in a course with their module mastery.

    Mastery is derived from the latest session's goal_insights per module:
    - All goals with final_score >= 0.65 -> "mastered"
    - Any goal with final_score < 0.4 -> "struggling"
    - Has records but mixed -> "progressing"
    - No records -> "incomplete"
    """
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_course_membership_role(course_id, user_id)

        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        students = await course.get_students()
        modules = await course.get_modules()

        result = []
        for s in students:
            user = s.get("user", {})
            uid = str(user.get("id", ""))

            mastery_list = []
            for module in modules:
                latest = await StudentProgress.get_latest_for_student(
                    uid, str(module.id)
                )

                if not latest or not latest.goal_insights:
                    status = "incomplete"
                else:
                    scores = [
                        gi.get("final_score", 0.0)
                        for gi in latest.goal_insights
                    ]
                    if any(sc < 0.4 for sc in scores):
                        status = "struggling"
                    elif all(sc >= 0.65 for sc in scores):
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
                    id=uid,
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
async def get_course_teaching_team(
    course_id: str, authorization: Optional[str] = Header(None)
):
    """Get all instructors and TAs for a course."""
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_course_membership_role(course_id, user_id)

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
async def get_course_needs_attention(
    course_id: str, authorization: Optional[str] = Header(None)
):
    """Get students who need attention based on their latest session insights.

    A student needs attention if any learning goal in their latest session
    has a final_score below 0.4.
    """
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_teaching_role(course_id, user_id)

        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        students = await course.get_students()
        modules = await course.get_modules()

        attention_needed = []
        seen_user_ids: set[str] = set()

        for s in students:
            user = s.get("user", {})
            uid = str(user.get("id", ""))

            for module in modules:
                if uid in seen_user_ids:
                    break
                latest = await StudentProgress.get_latest_for_student(
                    uid, str(module.id)
                )
                if latest and latest.goal_insights:
                    has_struggling = any(
                        gi.get("final_score", 0.0) < 0.4
                        for gi in latest.goal_insights
                    )
                    if has_struggling:
                        seen_user_ids.add(uid)
                        attention_needed.append(
                            CourseMemberResponse(
                                id=uid,
                                email=user.get("email", ""),
                                name=user.get("name"),
                                avatar_url=user.get("avatar_url"),
                                role="student",
                                enrolled_at="",
                            )
                        )

        return attention_needed
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting students needing attention for course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching students: {str(e)}")


@router.get("/courses/{course_id}/insights", response_model=CourseInsightsResponse)
async def get_course_insights(
    course_id: str, authorization: Optional[str] = Header(None)
):
    """Get aggregated session insights for all modules and students in a course."""
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_teaching_role(course_id, user_id)

        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        modules = await course.get_modules()
        students = await course.get_students()

        # Build a lookup of user info keyed by user ID
        user_lookup: dict[str, dict] = {}
        for s in students:
            u = s.get("user", {})
            uid = str(u.get("id", ""))
            user_lookup[uid] = u

        module_insights_list = []
        for module in modules:
            mid = str(module.id)
            all_progress = await StudentProgress.get_for_module(mid)

            # Group by user and keep only the latest session per student
            latest_by_user: dict[str, StudentProgress] = {}
            for p in all_progress:
                uid = str(p.user)
                if uid not in latest_by_user:
                    latest_by_user[uid] = p

            # Build per-student summaries
            student_summaries = []
            for uid, p in latest_by_user.items():
                u = user_lookup.get(uid, {})
                student_summaries.append(
                    StudentSessionSummary(
                        user_id=uid,
                        user_name=u.get("name"),
                        user_email=u.get("email", ""),
                        session_id=p.session_id,
                        overall_summary=p.overall_summary,
                        strongest_goal_id=p.strongest_goal_id,
                        weakest_goal_id=p.weakest_goal_id,
                        goal_insights=p.goal_insights or [],
                        created=str(p.created) if p.created else None,
                    )
                )

            # Aggregate class-level goal averages from latest sessions
            goal_scores: dict[str, list[float]] = {}
            goal_descs: dict[str, str] = {}
            goal_gap_count: dict[str, int] = {}
            for p in latest_by_user.values():
                for gi in (p.goal_insights or []):
                    gid = gi.get("goal_id", "")
                    if not gid:
                        continue
                    score = gi.get("final_score", 0.0)
                    goal_scores.setdefault(gid, []).append(score)
                    if not goal_descs.get(gid):
                        goal_descs[gid] = gi.get("goal_description", "")
                    if gi.get("knowledge_gap"):
                        goal_gap_count[gid] = goal_gap_count.get(gid, 0) + 1

            goal_averages = []
            for gid, scores in goal_scores.items():
                avg = sum(scores) / len(scores) if scores else 0.0
                goal_averages.append(
                    GoalAverageResponse(
                        goal_id=gid,
                        goal_description=goal_descs.get(gid, ""),
                        avg_score=round(avg, 3),
                        students_with_gaps=goal_gap_count.get(gid, 0),
                    )
                )

            module_insights_list.append(
                ModuleInsightsResponse(
                    module_id=mid,
                    module_name=module.name,
                    student_progress=student_summaries,
                    goal_averages=goal_averages,
                )
            )

        return CourseInsightsResponse(
            course_id=course_id,
            course_title=course.title,
            modules=module_insights_list,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting insights for course {course_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching course insights: {str(e)}"
        )


@router.post("/courses/{course_id}/members", response_model=CourseMemberResponse)
async def add_course_member(
    course_id: str,
    request: AddCourseMemberRequest,
    authorization: Optional[str] = Header(None),
):
    """Add a member to a course by email. Creates user if doesn't exist."""
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_teaching_role(course_id, user_id)

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
async def remove_course_member(
    course_id: str,
    user_id: str,
    authorization: Optional[str] = Header(None),
):
    """Remove a member from a course."""
    try:
        current_user_id = require_authenticated_user_id(authorization)
        await require_teaching_role(course_id, current_user_id)

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


# ============================================
# Enrollment request endpoints (student-initiated)
# ============================================


@router.post("/courses/{course_id}/request-enrollment")
async def request_enrollment(
    course_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Student requests to join a course using the course ID.
    Creates an enrollment request for teaching staff to approve or deny.
    """
    try:
        user_id = require_authenticated_user_id(authorization)

        # Accept bare IDs (e.g. "sm9odef...") or full IDs ("course:sm9odef...")
        if ":" not in course_id:
            course_id = f"course:{course_id}"

        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        if course.archived:
            raise HTTPException(
                status_code=400, detail="Cannot request enrollment in an archived course"
            )

        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if already enrolled
        existing_role = await get_course_membership_role(course_id, user_id)
        if existing_role:
            raise HTTPException(
                status_code=409, detail="You are already enrolled in this course"
            )

        # Check for duplicate pending request (student-initiated) or existing invitation (instructor-sent)
        existing_request = await Invitation.get_request_by_user_and_course(
            user_id, course_id, email=user.email
        )
        if existing_request:
            raise HTTPException(
                status_code=409,
                detail="You already have a pending enrollment request for this course",
            )

        invitation = Invitation(
            course_id=course_id,
            email=user.email,
            name=user.name or user.email,
            role="student",
            status="requested",
            invited_by=user_id,
        )
        await invitation.save()

        return {"status": "requested", "message": "Enrollment request submitted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error requesting enrollment for course {course_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error submitting enrollment request: {str(e)}"
        )


@router.delete("/courses/{course_id}/leave")
async def leave_course(
    course_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Student or TA leaves a course (removes their own membership).
    Instructors cannot leave their own course; they must archive or delete it.
    """
    try:
        user_id = require_authenticated_user_id(authorization)

        # Normalize bare IDs (e.g. "sm9odef...") to full IDs ("course:sm9odef...")
        if ":" not in course_id:
            course_id = f"course:{course_id}"

        role = await require_course_membership_role(course_id, user_id)

        if role == "instructor":
            raise HTTPException(
                status_code=400,
                detail="Instructors cannot leave a course. Archive or delete it instead.",
            )

        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        await course.remove_member(user_id)
        return {"message": "You have left the course successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leaving course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error leaving course: {str(e)}")


@router.put("/courses/{course_id}/modules/reorder")
async def reorder_course_modules(
    course_id: str,
    request: ModuleReorderRequest,
    authorization: Optional[str] = Header(None),
):
    """Reorder modules within a course. Requires teaching role."""
    try:
        user_id = require_authenticated_user_id(authorization)
        await require_teaching_role(course_id, user_id)

        for item in request.modules:
            module = await Module.get(item.module_id)
            if module and str(module.course) == str(ensure_record_id(course_id)):
                module.order = item.order
                await module.save()

        return {"message": "Modules reordered successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reordering modules for course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reordering modules: {str(e)}")

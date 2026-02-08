"""
Invitation API endpoints for course invitation management.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Header
from loguru import logger

from api.models import CreateInvitationRequest, InvitationResponse
from api.email_service import get_invite_url, send_invite_email
from backpack.database.repository import ensure_record_id, repo_query
from backpack.domain.course import Course, User
from backpack.domain.invitation import Invitation
from backpack.exceptions import DatabaseOperationError, InvalidInputError

router = APIRouter()


def _get_current_user_id(authorization: Optional[str] = None) -> Optional[str]:
    """Extract current user ID from authorization header."""
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    if token.startswith("user:"):
        return token
    return None


def _invitation_to_response(
    invitation: Invitation, course_title: Optional[str] = None
) -> InvitationResponse:
    """Convert an Invitation domain model to an API response."""
    invite_url = get_invite_url(invitation.token) if invitation.token else None
    return InvitationResponse(
        id=str(invitation.id),
        token=invitation.token,
        course_id=str(invitation.course_id) if invitation.course_id else "",
        course_title=course_title,
        email=invitation.email,
        name=invitation.name,
        role=invitation.role,
        status=invitation.status,
        invited_by=str(invitation.invited_by) if invitation.invited_by else None,
        invite_url=invite_url,
        expires_at=str(invitation.expires_at) if invitation.expires_at else None,
        created=str(invitation.created) if invitation.created else None,
    )


@router.post("/courses/{course_id}/invite", response_model=InvitationResponse)
async def create_invitation(
    course_id: str,
    request: CreateInvitationRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Create a pending invitation for a user to join a course.
    If an invitation already exists for this email+course, returns the existing one.
    Optionally sends an email if RESEND_API_KEY is configured.
    """
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        email = request.email.lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        # Check for existing pending invitation
        existing = await Invitation.get_by_email_and_course(email, course_id)
        if existing:
            return _invitation_to_response(existing, course_title=course.title)

        # Get inviter info (available in email-auth mode, None in password-auth mode)
        user_id = _get_current_user_id(authorization)
        inviter_name = None
        if user_id:
            try:
                inviter = await User.get(user_id)
                inviter_name = inviter.name if inviter else None
            except Exception:
                pass

        # Create the invitation
        invitation = Invitation(
            course_id=course_id,
            email=email,
            name=request.name.strip(),
            role=request.role,
            invited_by=user_id,
        )
        await invitation.save()

        # Build response
        response = _invitation_to_response(invitation, course_title=course.title)

        # Try to send email (gracefully no-ops if not configured)
        if response.invite_url:
            await send_invite_email(
                to_email=email,
                invitee_name=request.name.strip(),
                course_title=course.title,
                invite_url=response.invite_url,
                invited_by_name=inviter_name,
            )

        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating invitation for course {course_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating invitation: {str(e)}"
        )


@router.get("/users/me/invitations", response_model=List[InvitationResponse])
async def get_my_pending_invitations(
    authorization: Optional[str] = Header(None),
):
    """
    Get all pending invitations for the current user's email.
    Used by the courses page to show invitations after login.
    """
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Query pending invitations for this email
        result = await repo_query(
            """
            SELECT * FROM invitation
            WHERE email = $email AND status = 'pending'
            ORDER BY created DESC
            """,
            {"email": user.email.lower().strip()},
        )

        invitations = []
        for r in result if result else []:
            inv = Invitation(**r)
            # Fetch course title
            course_title = None
            if inv.course_id:
                try:
                    course = await Course.get(inv.course_id)
                    course_title = course.title if course else None
                except Exception:
                    pass
            invitations.append(_invitation_to_response(inv, course_title=course_title))

        return invitations
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pending invitations: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching invitations: {str(e)}"
        )


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation(
    invitation_id: str,
    authorization: Optional[str] = Header(None),
):
    """Accept a pending invitation, creating the course membership."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        invitation = await Invitation.get(invitation_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        # Verify the invitation belongs to this user
        user = await User.get(user_id)
        if not user or user.email.lower() != invitation.email.lower():
            raise HTTPException(
                status_code=403, detail="This invitation is not for your account"
            )

        await invitation.accept(user_id)
        return {"status": "accepted", "message": "Invitation accepted successfully"}
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error accepting invitation {invitation_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error accepting invitation: {str(e)}"
        )


@router.post("/invitations/{invitation_id}/decline")
async def decline_invitation(
    invitation_id: str,
    authorization: Optional[str] = Header(None),
):
    """Decline a pending invitation."""
    try:
        user_id = _get_current_user_id(authorization)
        if not user_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        invitation = await Invitation.get(invitation_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        # Verify the invitation belongs to this user
        user = await User.get(user_id)
        if not user or user.email.lower() != invitation.email.lower():
            raise HTTPException(
                status_code=403, detail="This invitation is not for your account"
            )

        await invitation.decline()
        return {"status": "declined", "message": "Invitation declined"}
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error declining invitation {invitation_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error declining invitation: {str(e)}"
        )


@router.get(
    "/courses/{course_id}/invitations", response_model=List[InvitationResponse]
)
async def get_course_invitations(course_id: str):
    """
    Get all pending invitations for a course (instructor view).
    """
    try:
        course = await Course.get(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        pending = await Invitation.get_pending_for_course(course_id)
        return [
            _invitation_to_response(inv, course_title=course.title) for inv in pending
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error fetching invitations for course {course_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail=f"Error fetching invitations: {str(e)}"
        )


@router.post("/invitations/{invitation_id}/cancel")
async def cancel_invitation(invitation_id: str):
    """Cancel a pending invitation (instructor action)."""
    try:
        invitation = await Invitation.get(invitation_id)
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        await invitation.cancel()
        return {"status": "cancelled", "message": "Invitation cancelled"}
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error cancelling invitation {invitation_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error cancelling invitation: {str(e)}"
        )

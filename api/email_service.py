"""
Email service for sending course invitations via Resend.

If RESEND_API_KEY is not configured, emails are skipped with a warning log.
The invitation link is still returned in the API response so the instructor
can share it manually.
"""

import os
from typing import Optional

from loguru import logger


def _get_resend_client():
    """Lazily import and configure the Resend client."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        return None
    try:
        import resend

        resend.api_key = api_key
        return resend
    except ImportError:
        logger.warning(
            "resend package is not installed. Run: pip install resend"
        )
        return None


def get_invite_url(token: str) -> str:
    """Build the full invitation URL for the frontend."""
    base_url = os.environ.get("INVITE_BASE_URL", "http://localhost:3000")
    return f"{base_url.rstrip('/')}/invite/{token}"


async def send_invite_email(
    to_email: str,
    invitee_name: str,
    course_title: str,
    invite_url: str,
    invited_by_name: Optional[str] = None,
) -> bool:
    """
    Send a course invitation email via Resend.

    Returns True if the email was sent successfully, False otherwise.
    If RESEND_API_KEY is not configured, logs a warning and returns False.
    """
    resend = _get_resend_client()
    if resend is None:
        logger.warning(
            "RESEND_API_KEY is not configured. Invitation email not sent. "
            f"Share this link manually: {invite_url}"
        )
        return False

    from_email = os.environ.get("INVITE_FROM_EMAIL", "noreply@yourdomain.com")
    invited_by_text = f" by {invited_by_name}" if invited_by_name else ""

    subject = f"You've been invited to {course_title}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: #18181b; padding: 32px 40px;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Backpack</h1>
            </div>
            <div style="padding: 40px;">
                <p style="font-size: 16px; color: #27272a; margin: 0 0 8px 0;">Hi {invitee_name},</p>
                <p style="font-size: 16px; color: #52525b; margin: 0 0 24px 0;">
                    You've been invited{invited_by_text} to join <strong>{course_title}</strong>.
                </p>
                <a href="{invite_url}"
                   style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 500;">
                    Accept Invitation
                </a>
                <p style="font-size: 13px; color: #a1a1aa; margin: 32px 0 0 0;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="{invite_url}" style="color: #3b82f6; word-break: break-all;">{invite_url}</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        resend.Emails.send(
            {
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            }
        )
        logger.info(f"Invitation email sent to {to_email} for course '{course_title}'")
        return True
    except Exception as e:
        logger.error(f"Failed to send invitation email to {to_email}: {str(e)}")
        return False

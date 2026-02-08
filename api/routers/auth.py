"""
Authentication router for Backpack API.
Provides endpoints to check authentication status.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def get_auth_status():
    """
    Check if authentication is enabled.
    Email-based authentication is always required.
    """
    return {
        "auth_enabled": True,
        "message": "Authentication is required",
    }

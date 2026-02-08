from typing import Optional

from fastapi import Request
from fastapi.security import HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class UserAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to require email-based user authentication for all API requests.
    Validates that requests include a valid 'Bearer user:xxx' token.
    """

    def __init__(self, app, excluded_paths: Optional[list] = None, excluded_prefixes: Optional[list] = None):
        super().__init__(app)
        self.excluded_paths = excluded_paths or [
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]
        self.excluded_prefixes = excluded_prefixes or []

    async def dispatch(self, request: Request, call_next):
        # Skip authentication for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip authentication for excluded path prefixes
        if any(request.url.path.startswith(prefix) for prefix in self.excluded_prefixes):
            return await call_next(request)

        # Skip authentication for CORS preflight requests (OPTIONS)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Expected format: "Bearer user:xxx"
        try:
            scheme, credentials = auth_header.split(" ", 1)
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Validate token format: must start with "user:"
        if not credentials.startswith("user:"):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid token format. Email authentication required."},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Token is valid format, proceed with the request
        response = await call_next(request)
        return response


# Optional: HTTPBearer security scheme for OpenAPI documentation
security = HTTPBearer(auto_error=False)

# Remote debugging - remove in production
import debugpy
debugpy.listen(("0.0.0.0", 5678))
# debugpy.wait_for_client()  # Uncomment to pause until debugger attaches

# Load environment variables
from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.auth import UserAuthMiddleware
from api.routers import (
    auth,
    chat,
    config,
    context,
    courses,
    embedding,
    embedding_rebuild,
    episode_profiles,
    insights,
    invitations,
    models,
    modules,
    notes,
    podcasts,
    search,
    settings,
    source_chat,
    sources,
    speaker_profiles,
    study_tools,
    transformations,
    tutor,
    users,
    voice,
)
from api.routers import commands as commands_router
from backpack.database.async_migrate import AsyncMigrationManager
from backpack.database.repository import repo_query

logger.info("API process startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler for the FastAPI application.
    Runs database migrations automatically on startup.
    """
    # Startup: Run database migrations
    logger.info("Starting API initialization...")

    try:
        migration_manager = AsyncMigrationManager()
        current_version = await migration_manager.get_current_version()
        logger.info(f"Current database version: {current_version}")

        if await migration_manager.needs_migration():
            logger.warning("Database migrations are pending. Running migrations...")
            await migration_manager.run_migration_up()
            new_version = await migration_manager.get_current_version()
            logger.success(
                f"Migrations completed successfully. Database is now at version {new_version}"
            )
        else:
            logger.info(
                "Database is already at the latest version. No migrations needed."
            )

        # surreal-commands requires this table for worker LIVE queries.
        try:
            await repo_query("DEFINE TABLE command SCHEMALESS;")
            logger.info("Created surreal-commands `command` table")
        except Exception as command_table_err:
            # If the table already exists, continue startup.
            if "already exists" in str(command_table_err).lower():
                logger.info("surreal-commands `command` table already exists")
            else:
                raise
    except Exception as e:
        logger.error(f"CRITICAL: Database migration failed: {str(e)}")
        logger.exception(e)
        # Do not fail API startup hard in production deploys.
        # This keeps health/config endpoints reachable for diagnostics and allows
        # follow-up migrations/fixes without a full outage.
        logger.warning("Continuing API startup despite migration/setup failure")

    logger.success("API initialization completed successfully")

    # Yield control to the application
    yield

    # Shutdown: cleanup if needed
    logger.info("API shutdown complete")


app = FastAPI(
    title="Backpack API",
    description="API for Backpack - Research Assistant",
    version="0.2.2",
    lifespan=lifespan,
)

# Add user authentication middleware
# Exclude public paths and auth endpoints from authentication
app.add_middleware(
    UserAuthMiddleware,
    excluded_paths=[
        "/",
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/api/auth/status",
        "/api/config",
        "/api/users/login",
        "/api/users/register",
    ],
    excluded_prefixes=[
        "/api/users/avatars/",
        "/api/podcasts/episodes/",  # Audio file serving — episode IDs are unguessable UUIDs
    ],
)

# Add CORS middleware last (so it processes first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom exception handler to ensure CORS headers are included in error responses
# This helps when errors occur before the CORS middleware can process them
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Custom exception handler that ensures CORS headers are included in error responses.
    This is particularly important for 413 (Payload Too Large) errors during file uploads.

    Note: If a reverse proxy (nginx, traefik) returns 413 before the request reaches
    FastAPI, this handler won't be called. In that case, configure your reverse proxy
    to add CORS headers to error responses.
    """
    # Get the origin from the request
    origin = request.headers.get("origin", "*")

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            **(exc.headers or {}), "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


# Include routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(modules.router, prefix="/api", tags=["modules"])
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(models.router, prefix="/api", tags=["models"])
app.include_router(transformations.router, prefix="/api", tags=["transformations"])
app.include_router(notes.router, prefix="/api", tags=["notes"])
app.include_router(embedding.router, prefix="/api", tags=["embedding"])
app.include_router(
    embedding_rebuild.router, prefix="/api/embeddings", tags=["embeddings"]
)
app.include_router(settings.router, prefix="/api", tags=["settings"])
app.include_router(context.router, prefix="/api", tags=["context"])
app.include_router(sources.router, prefix="/api", tags=["sources"])
app.include_router(insights.router, prefix="/api", tags=["insights"])
app.include_router(commands_router.router, prefix="/api", tags=["commands"])
app.include_router(podcasts.router, prefix="/api", tags=["podcasts"])
app.include_router(episode_profiles.router, prefix="/api", tags=["episode-profiles"])
app.include_router(speaker_profiles.router, prefix="/api", tags=["speaker-profiles"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(source_chat.router, prefix="/api", tags=["source-chat"])
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(courses.router, prefix="/api", tags=["courses"])
app.include_router(invitations.router, prefix="/api", tags=["invitations"])
app.include_router(tutor.router, prefix="/api", tags=["tutor"])
app.include_router(study_tools.router, prefix="/api", tags=["study-tools"])
app.include_router(voice.router, prefix="/api", tags=["voice"])


@app.get("/")
async def root():
    return {"message": "Backpack API is running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

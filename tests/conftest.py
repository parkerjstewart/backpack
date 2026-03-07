"""
Pytest configuration file.

This file ensures that the project root is in the Python path,
allowing tests to import from the api and backpack modules.
It also provides fixtures for database testing, API client setup,
and test data factories.
"""

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncGenerator, Dict, Any
from unittest.mock import AsyncMock

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from surrealdb import AsyncSurreal

# Load .env so SURREAL_PASSWORD etc. are available before any imports
load_dotenv(Path(__file__).parent.parent / ".env")

# Ensure password auth is disabled for tests BEFORE any imports
# The PasswordAuthMiddleware skips auth when this env var is not set
# Set to empty string instead of deleting to prevent it from being reloaded
os.environ["BACKPACK_PASSWORD"] = ""

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


# ============================================================================
# DATABASE FIXTURES
# ============================================================================


@pytest.fixture
async def test_db_connection() -> AsyncGenerator[AsyncSurreal, None]:
    """Provide a test database connection with isolation."""
    from backpack.database.repository import get_database_url, get_database_password
    
    url = os.getenv("TEST_SURREAL_URL", get_database_url())
    user = os.getenv("TEST_SURREAL_USER", "root")
    password = os.getenv("TEST_SURREAL_PASS", get_database_password() or "root")
    namespace = os.getenv("TEST_SURREAL_NS", "test")
    db_name = os.getenv("TEST_SURREAL_DB", "test_db")
    
    db = AsyncSurreal(url)
    try:
        await db.signin({"username": user, "password": password})
        await db.use(namespace, db_name)
        yield db
    finally:
        # Cleanup: drop test database
        try:
            await db.execute(f"REMOVE DATABASE {db_name}")
            await db.close()
        except Exception:
            pass


@pytest.fixture
async def seeded_db(test_db_connection: AsyncSurreal) -> AsyncGenerator[AsyncSurreal, None]:
    """Provide a test database connection and redirect repo_* functions to the test namespace.

    This ensures repo_create/repo_query etc. operate on the isolated test DB
    rather than the production backpack namespace.
    """
    namespace = os.getenv("TEST_SURREAL_NS", "test")
    db_name = os.getenv("TEST_SURREAL_DB", "test_db")

    original_ns = os.environ.get("SURREAL_NAMESPACE")
    original_db = os.environ.get("SURREAL_DATABASE")

    os.environ["SURREAL_NAMESPACE"] = namespace
    os.environ["SURREAL_DATABASE"] = db_name

    try:
        yield test_db_connection
    finally:
        if original_ns is not None:
            os.environ["SURREAL_NAMESPACE"] = original_ns
        else:
            os.environ.pop("SURREAL_NAMESPACE", None)
        if original_db is not None:
            os.environ["SURREAL_DATABASE"] = original_db
        else:
            os.environ.pop("SURREAL_DATABASE", None)


@pytest.fixture
def api_client() -> TestClient:
    """Provide a FastAPI test client."""
    from api.main import app
    return TestClient(app)


@pytest.fixture
def authenticated_headers() -> Dict[str, str]:
    """Provide headers with Bearer token for authenticated requests."""
    return {
        "Authorization": "Bearer user:test_user_1",
        "Content-Type": "application/json"
    }


@pytest.fixture
def admin_headers() -> Dict[str, str]:
    """Provide headers for admin/instructor user."""
    return {
        "Authorization": "Bearer user:test_admin_1",
        "Content-Type": "application/json"
    }


# ============================================================================
# EVENT LOOP FIXTURE
# ============================================================================


@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============================================================================
# MOCK FIXTURES
# ============================================================================


@pytest.fixture
def mock_ai_model():
    """Provide a mocked AI model for testing."""
    mock = AsyncMock()
    mock.ainvoke = AsyncMock(return_value={"output": "mocked response"})
    return mock


@pytest.fixture
def mock_embeddings():
    """Provide a mocked embeddings model."""
    mock = AsyncMock()
    mock.aembed_documents = AsyncMock(return_value=[[0.1] * 384 for _ in range(3)])
    mock.aembed_query = AsyncMock(return_value=[0.1] * 384)
    return mock

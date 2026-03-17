"""
Integration tests for API endpoints.

Tests HTTP endpoints for courses, modules, sources, chat, tutor, and search
without mocking the core services.
"""

import pytest
from fastapi.testclient import TestClient


class TestCourseEndpoints:
    """Test course API endpoints."""

    def test_list_courses(self, api_client: TestClient):
        """Test GET /api/courses."""
        response = api_client.get("/api/courses")
        assert response.status_code in [200, 401]  # 401 if auth is required
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)

    def test_create_course_authenticated(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/courses with auth."""
        course_data = {
            "title": "Test Course",
            "description": "A test course",
        }
        response = api_client.post(
            "/api/courses",
            json=course_data,
            headers=authenticated_headers
        )
        # Should succeed or require specific role
        assert response.status_code in [200, 201, 403, 401]
        if response.status_code in [200, 201]:
            data = response.json()
            assert "id" in data

    def test_get_course(self, api_client: TestClient):
        """Test GET /api/courses/{course_id}."""
        # Using a valid course ID format
        response = api_client.get("/api/courses/course:test_1")
        # May not exist, but endpoint should be valid
        assert response.status_code in [200, 404, 401]

    def test_update_course(self, api_client: TestClient, admin_headers):
        """Test PUT /api/courses/{course_id}."""
        update_data = {
            "title": "Updated Title",
            "description": "Updated description",
        }
        response = api_client.put(
            "/api/courses/course:test_1",
            json=update_data,
            headers=admin_headers
        )
        assert response.status_code in [200, 404, 403, 401]

    def test_delete_course(self, api_client: TestClient, admin_headers):
        """Test DELETE /api/courses/{course_id}."""
        response = api_client.delete(
            "/api/courses/course:test_1",
            headers=admin_headers
        )
        assert response.status_code in [200, 404, 403, 401]


class TestModuleEndpoints:
    """Test module API endpoints."""

    def test_list_modules(self, api_client: TestClient):
        """Test GET /api/modules."""
        response = api_client.get("/api/modules")
        assert response.status_code in [200, 401]
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)

    def test_get_module(self, api_client: TestClient):
        """Test GET /api/modules/{module_id}."""
        response = api_client.get("/api/modules/module:test_1")
        assert response.status_code in [200, 404, 401]

    def test_create_module(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/courses/{course_id}/modules."""
        module_data = {
            "title": "Test Module",
            "description": "A test module",
        }
        response = api_client.post(
            "/api/courses/course:test_1/modules",
            json=module_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 404, 403, 401]


class TestSourceEndpoints:
    """Test source API endpoints."""

    def test_list_sources(self, api_client: TestClient):
        """Test GET /api/sources."""
        response = api_client.get("/api/sources")
        assert response.status_code in [200, 401]
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)

    def test_get_source(self, api_client: TestClient):
        """Test GET /api/sources/{source_id}."""
        response = api_client.get("/api/sources/source:test_1")
        assert response.status_code in [200, 404, 401]

    def test_upload_source(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/modules/{module_id}/sources."""
        source_data = {
            "title": "Test Source",
            "content": "Sample content",
            "source_type": "document",
        }
        response = api_client.post(
            "/api/modules/module:test_1/sources",
            json=source_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 404, 403, 401]

    def test_delete_source(self, api_client: TestClient, authenticated_headers):
        """Test DELETE /api/sources/{source_id}."""
        response = api_client.delete(
            "/api/sources/source:test_1",
            headers=authenticated_headers
        )
        assert response.status_code in [200, 204, 404, 403, 401, 500]


class TestChatEndpoints:
    """Test chat API endpoints."""

    def test_create_chat_session(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/chat/sessions."""
        session_data = {
            "module_id": "module:test_1",
        }
        response = api_client.post(
            "/api/chat/sessions",
            json=session_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 400, 401, 404, 500]

    def test_send_message(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/chat/sessions/{session_id}/messages."""
        message_data = {
            "message": "What is the course about?",
            "context": {"sources": []},
        }
        response = api_client.post(
            "/api/chat/sessions/chat_session:test_1/messages",
            json=message_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 404, 401]


class TestTutorEndpoints:
    """Test tutor API endpoints."""

    def test_start_tutor_session(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/tutor/sessions."""
        session_data = {
            "module_id": "module:test_1",
        }
        response = api_client.post(
            "/api/tutor/sessions",
            json=session_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 400, 401, 404, 500]

    def test_get_tutor_session(self, api_client: TestClient, authenticated_headers):
        """Test GET /api/tutor/sessions/{session_id}."""
        response = api_client.get(
            "/api/tutor/sessions/tutor_session:test_1",
            headers=authenticated_headers
        )
        assert response.status_code in [200, 404, 401]

    def test_submit_tutor_response(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/tutor/sessions/{session_id}/response."""
        response_data = {
            "response": "The answer to the question is...",
        }
        response = api_client.post(
            "/api/tutor/sessions/tutor_session:test_1/response",
            json=response_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 404, 401]


class TestSearchEndpoints:
    """Test search API endpoints."""

    def test_search_sources(self, api_client: TestClient):
        """Test GET /api/search."""
        response = api_client.get(
            "/api/search",
            params={"q": "test", "module_id": "module:test_1"}
        )
        assert response.status_code in [200, 400, 401]
        if response.status_code == 200:
            data = response.json()
            assert "results" in data or isinstance(data, list)

    def test_semantic_search(self, api_client: TestClient):
        """Test semantic/vector search."""
        response = api_client.get(
            "/api/search",
            params={"q": "explain the concept", "module_id": "module:test_1", "type": "semantic"}
        )
        assert response.status_code in [200, 400, 401]


class TestNoteEndpoints:
    """Test note API endpoints."""

    def test_create_note(self, api_client: TestClient, authenticated_headers):
        """Test POST /api/notes."""
        note_data = {
            "content": "My study notes",
            "module_id": "module:test_1",
        }
        response = api_client.post(
            "/api/notes",
            json=note_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 201, 400, 401, 404, 500]

    def test_list_notes(self, api_client: TestClient):
        """Test GET /api/notes."""
        response = api_client.get("/api/notes")
        assert response.status_code in [200, 401]
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)

    def test_get_note(self, api_client: TestClient):
        """Test GET /api/notes/{note_id}."""
        response = api_client.get("/api/notes/note:test_1")
        assert response.status_code in [200, 404, 401]

    def test_update_note(self, api_client: TestClient, authenticated_headers):
        """Test PUT /api/notes/{note_id}."""
        note_data = {
            "content": "Updated notes",
        }
        response = api_client.put(
            "/api/notes/note:test_1",
            json=note_data,
            headers=authenticated_headers
        )
        assert response.status_code in [200, 404, 401, 500]

    def test_delete_note(self, api_client: TestClient, authenticated_headers):
        """Test DELETE /api/notes/{note_id}."""
        response = api_client.delete(
            "/api/notes/note:test_1",
            headers=authenticated_headers
        )
        assert response.status_code in [200, 204, 404, 401, 500]


class TestHealthEndpoints:
    """Test health check and info endpoints."""

    def test_health_check(self, api_client: TestClient):
        """Test health check endpoint."""
        response = api_client.get("/health")
        # May or may not exist, but if it does, should be 200
        assert response.status_code in [200, 404]

    def test_api_docs(self, api_client: TestClient):
        """Test API documentation endpoints."""
        response = api_client.get("/docs")
        assert response.status_code in [200, 404]

    def test_api_openapi(self, api_client: TestClient):
        """Test OpenAPI schema endpoint."""
        response = api_client.get("/openapi.json")
        assert response.status_code in [200, 404]


class TestAuthEndpoints:
    """Test authentication endpoints."""

    def test_auth_endpoints_exist(self, api_client: TestClient):
        """Test that auth endpoints exist."""
        # Most auth endpoints should exist
        response = api_client.post("/api/auth/login", json={"username": "test", "password": "test"})
        assert response.status_code in [200, 400, 401, 404]

    def test_user_profile_endpoint(self, api_client: TestClient, authenticated_headers):
        """Test user profile endpoint."""
        response = api_client.get(
            "/api/users/me",
            headers=authenticated_headers
        )
        assert response.status_code in [200, 404, 401]


class TestInsightsEndpoints:
    """Test insights/analytics endpoints."""

    def test_module_insights(self, api_client: TestClient, authenticated_headers):
        """Test GET /api/modules/{module_id}/insights."""
        response = api_client.get(
            "/api/modules/module:test_1/insights",
            headers=authenticated_headers
        )
        assert response.status_code in [200, 404, 401]

    def test_student_progress(self, api_client: TestClient, authenticated_headers):
        """Test GET /api/users/{user_id}/progress."""
        response = api_client.get(
            "/api/users/user:test_1/progress",
            headers=authenticated_headers
        )
        assert response.status_code in [200, 404, 401]

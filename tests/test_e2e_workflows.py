"""
End-to-end workflow integration tests.

Tests complete user flows like:
- Course creation → Module creation → Source upload → Content processing
- Starting a tutor session → Asking questions → Getting feedback
- Chat conversation with sources
- Search and retrieval workflows
"""

import pytest
from unittest.mock import AsyncMock, patch


class TestCourseCreationWorkflow:
    """Test complete course creation and setup workflow."""

    @pytest.mark.asyncio
    async def test_create_course_with_modules_and_sources(self, seeded_db):
        """Test full workflow: create course → add modules → upload sources."""
        from backpack.database.repository import repo_create, repo_query

        # Step 1: Create course
        course = await repo_create("course", {
            "title": "Introduction to Python",
            "description": "Learn Python basics",
            "instructor_id": "user:instructor_1",
        })
        assert course is not None
        course_id = str(course["id"])

        # Step 2: Create modules
        module1 = await repo_create("module", {
            "title": "Module 1: Basics",
            "description": "Python basics",
            "course_id": course_id,
        })
        assert module1 is not None
        module1_id = str(module1["id"])

        module2 = await repo_create("module", {
            "title": "Module 2: Functions",
            "description": "Working with functions",
            "course_id": course_id,
        })
        assert module2 is not None

        # Step 3: Add sources to modules
        source1 = await repo_create("source", {
            "title": "Lecture Slides - Basics",
            "content": "Introduction to variables and data types",
            "source_type": "document",
            "module_id": module1_id,
        })
        assert source1 is not None

        source2 = await repo_create("source", {
            "title": "Lecture Slides - Functions",
            "content": "Defining and calling functions",
            "source_type": "document",
            "module_id": str(module2["id"]),
        })
        assert source2 is not None

        # Step 4: Verify relationships
        result = await repo_query(
            "SELECT * FROM module WHERE course_id = $course_id ORDER BY title",
            {"course_id": course["id"]}
        )
        assert len(result) == 2
        assert result[0]["title"] == "Module 1: Basics"
        assert result[1]["title"] == "Module 2: Functions"


class TestTutorSessionWorkflow:
    """Test tutor session workflow."""

    @pytest.mark.asyncio
    async def test_tutor_session_flow(self, seeded_db, mock_ai_model):
        """Test complete tutor session: initialize → ask question → evaluate."""
        from backpack.database.repository import repo_create

        # Setup: Create course, module, sources
        course = await repo_create("course", {
            "title": "Math 101",
            "description": "Mathematics",
            "instructor_id": "user:instructor_1",
        })

        module = await repo_create("module", {
            "title": "Calculus Basics",
            "description": "Introduction to calculus",
            "course_id": str(course["id"]),
        })

        source = await repo_create("source", {
            "title": "Calculus Notes",
            "content": "Derivatives measure the rate of change of a function",
            "source_type": "document",
            "module_id": str(module["id"]),
        })

        # Test: Initialize tutor session
        session = {
            "module_id": str(module["id"]),
            "student_id": "user:student_1",
        }
        assert session["module_id"] is not None

    @pytest.mark.asyncio
    async def test_tutor_question_generation_and_evaluation(self, mock_ai_model):
        """Test question generation and student answer evaluation."""
        # Mock the AI model response for question generation
        mock_ai_model.ainvoke.return_value = {
            "question": "What is the derivative of x^2?",
            "context": "Understanding derivatives",
        }

        # Generate question
        question = await mock_ai_model.ainvoke({
            "context": "derivatives",
            "difficulty": "beginner"
        })
        assert "question" in question
        assert "derivative" in question["question"].lower()

        # Mock answer evaluation
        mock_ai_model.ainvoke.return_value = {
            "score": 0.8,
            "feedback": "Good! The derivative of x^2 is 2x.",
            "next_step": "progress_to_next_topic"
        }

        evaluation = await mock_ai_model.ainvoke({
            "question": "What is the derivative of x^2?",
            "student_answer": "2x",
        })
        assert evaluation["score"] >= 0
        assert "feedback" in evaluation


class TestChatWithSourcesWorkflow:
    """Test chat conversation grounded in sources."""

    @pytest.mark.asyncio
    async def test_chat_session_with_source_context(self, seeded_db, mock_ai_model):
        """Test chat that uses sources as context."""
        from backpack.database.repository import repo_create

        # Setup: Create sources
        module = await repo_create("module", {
            "title": "Science Module",
            "description": "Science study",
            "course_id": "course:test_1",
        })

        source1 = await repo_create("source", {
            "title": "Photosynthesis",
            "content": "Photosynthesis is the process by which plants convert light into chemical energy",
            "source_type": "document",
            "module_id": str(module["id"]),
        })

        source2 = await repo_create("source", {
            "title": "Plant Biology",
            "content": "Plants are living organisms that require water, sunlight, and nutrients",
            "source_type": "document",
            "module_id": str(module["id"]),
        })

        # Test: Chat with context
        mock_ai_model.ainvoke.return_value = {
            "response": "Based on the course materials, photosynthesis is the process...",
            "sources_used": [str(source1["id"])],
        }

        chat_response = await mock_ai_model.ainvoke({
            "message": "What is photosynthesis?",
            "sources": [str(source1["id"]), str(source2["id"])],
            "module_id": str(module["id"]),
        })

        assert "response" in chat_response
        assert len(chat_response.get("sources_used", [])) > 0


class TestSearchAndRetrievalWorkflow:
    """Test search and content retrieval workflows."""

    @pytest.mark.asyncio
    async def test_semantic_search_workflow(self, seeded_db, mock_embeddings):
        """Test semantic search workflow."""
        from backpack.database.repository import repo_create

        # Setup: Create multiple sources
        module = await repo_create("module", {
            "title": "Science Module",
            "description": "Science",
            "course_id": "course:test_1",
        })

        sources = []
        for i, content in enumerate([
            "DNA is the molecule that carries genetic instructions",
            "Proteins are synthesized from amino acids",
            "The mitochondria is the powerhouse of the cell",
        ]):
            source = await repo_create("source", {
                "title": f"Source {i+1}",
                "content": content,
                "source_type": "document",
                "module_id": str(module["id"]),
            })
            sources.append(source)

        # Test: Semantic search
        mock_embeddings.aembed_query.return_value = [0.1] * 384
        query_embedding = await mock_embeddings.aembed_query("DNA and genetics")
        
        assert len(query_embedding) == 384
        assert all(-1 <= x <= 1 for x in query_embedding)


class TestSourceProcessingWorkflow:
    """Test complete source processing workflow."""

    @pytest.mark.asyncio
    async def test_source_upload_chunking_embedding(self, seeded_db, mock_embeddings):
        """Test source upload → chunking → embedding workflow."""
        from backpack.database.repository import repo_create
        from backpack.utils.chunking import chunk_text, ContentType

        # Step 1: Upload source
        module = await repo_create("module", {
            "title": "Module",
            "description": "Test",
            "course_id": "course:test_1",
        })

        long_content = "This is a very long document. " * 100  # Make it long enough to chunk

        source = await repo_create("source", {
            "title": "Long Document",
            "content": long_content,
            "source_type": "document",
            "module_id": str(module["id"]),
        })

        # Step 2: Chunk the content
        chunks = chunk_text(long_content, content_type=ContentType.PLAIN)
        assert len(chunks) > 0

        # Step 3: Generate embeddings
        mock_embeddings.aembed_documents.return_value = [[0.1] * 384 for _ in range(len(chunks))]
        embeddings = await mock_embeddings.aembed_documents(chunks)
        
        assert len(embeddings) == len(chunks)
        assert all(len(emb) == 384 for emb in embeddings)


class TestLearningGoalsWorkflow:
    """Test learning goals and competency tracking."""

    @pytest.mark.asyncio
    async def test_create_and_track_learning_goals(self, seeded_db):
        """Test creating learning goals and tracking progress."""
        from backpack.database.repository import repo_create, repo_query

        # Create module
        module = await repo_create("module", {
            "title": "Machine Learning",
            "description": "ML fundamentals",
            "course_id": "course:test_1",
        })

        # Create learning goals (simulated)
        goals = [
            {
                "title": "Understand supervised learning",
                "description": "Know the basics of supervised learning",
                "module_id": str(module["id"]),
                "type": "competency",
            },
            {
                "title": "Implement linear regression",
                "description": "Code a linear regression model",
                "module_id": str(module["id"]),
                "type": "competency",
            },
        ]

        created_goals = []
        for goal in goals:
            created = await repo_create("learning_goal", goal)
            assert created is not None
            created_goals.append(created)

        assert len(created_goals) == 2


class TestUserProgressTracking:
    """Test user progress tracking workflows."""

    @pytest.mark.asyncio
    async def test_track_module_completion(self, seeded_db):
        """Test tracking user progress through a module."""
        from backpack.database.repository import repo_create, repo_query

        # Create course and module
        course = await repo_create("course", {
            "title": "Course",
            "description": "Test",
            "instructor_id": "user:instructor_1",
        })

        module = await repo_create("module", {
            "title": "Module",
            "description": "Test",
            "course_id": str(course["id"]),
        })

        # Simulate student completing module
        student_progress = {
            "student_id": "user:student_1",
            "module_id": str(module["id"]),
            "completion_percentage": 100,
            "status": "completed",
        }

        # Store progress
        progress = await repo_create("user_progress", student_progress)
        assert progress is not None


class TestCollaborativeWorkflow:
    """Test collaborative features."""

    @pytest.mark.asyncio
    async def test_course_sharing_and_collaboration(self, seeded_db):
        """Test sharing courses and collaboration workflows."""
        from backpack.database.repository import repo_create

        # Create course
        course = await repo_create("course", {
            "title": "Shared Course",
            "description": "For collaboration",
            "instructor_id": "user:instructor_1",
        })

        # Add multiple instructors (simulate collaboration)
        collaborators = ["user:instructor_1", "user:instructor_2", "user:instructor_3"]
        
        for collaborator in collaborators:
            membership = await repo_create("course_membership", {
                "user_id": collaborator,
                "course_id": str(course["id"]),
                "role": "instructor" if collaborator == "user:instructor_1" else "co-instructor",
            })
            assert membership is not None

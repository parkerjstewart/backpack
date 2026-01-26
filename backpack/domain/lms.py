"""
LMS (Learning Management System) domain models.

Provides models for courses, users, learning goals, progress tracking,
and multi-model embedding support.
"""

from datetime import datetime
from typing import Any, ClassVar, Dict, List, Literal, Optional

from loguru import logger
from pydantic import field_validator

from backpack.database.repository import ensure_record_id, repo_query, repo_relate
from backpack.domain.base import ObjectModel
from backpack.exceptions import DatabaseOperationError, InvalidInputError


class User(ObjectModel):
    """
    User model for LMS authentication and authorization.
    
    Supports role-based access: student, instructor, admin.
    """
    table_name: ClassVar[str] = "user"
    
    email: str
    name: Optional[str] = None
    role: str = "student"
    external_id: Optional[str] = None  # For OAuth/SSO integration
    
    @field_validator("email")
    @classmethod
    def email_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise InvalidInputError("User email cannot be empty")
        return v.strip().lower()
    
    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, v):
        valid_roles = {"student", "instructor", "admin"}
        if v not in valid_roles:
            raise InvalidInputError(f"Role must be one of: {valid_roles}")
        return v
    
    async def get_enrolled_courses(self) -> List["Course"]:
        """Get all courses this user is enrolled in."""
        try:
            result = await repo_query(
                """
                SELECT out.* as course FROM course_membership 
                WHERE in == $user_id
                FETCH out
                """,
                {"user_id": ensure_record_id(self.id)},
            )
            return [Course(**r["course"]) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching enrolled courses for user {self.id}: {e}")
            raise DatabaseOperationError(e)
    
    async def get_teaching_courses(self) -> List["Course"]:
        """Get all courses this user is teaching (instructor role)."""
        try:
            result = await repo_query(
                """
                SELECT out.* as course FROM course_membership 
                WHERE in == $user_id AND role == 'instructor'
                FETCH out
                """,
                {"user_id": ensure_record_id(self.id)},
            )
            return [Course(**r["course"]) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching teaching courses for user {self.id}: {e}")
            raise DatabaseOperationError(e)
    
    async def enroll_in_course(self, course_id: str, role: str = "student") -> Any:
        """Enroll this user in a course with specified role."""
        if not course_id:
            raise InvalidInputError("Course ID must be provided")
        return await repo_relate(
            source=str(self.id),
            relationship="course_membership",
            target=course_id,
            data={"role": role},
        )
    
    async def get_progress(self, course_id: Optional[str] = None) -> List["StudentProgress"]:
        """Get learning progress, optionally filtered by course."""
        try:
            if course_id:
                result = await repo_query(
                    """
                    SELECT * FROM student_progress 
                    WHERE user == $user_id 
                    AND learning_goal.module.course == $course_id
                    """,
                    {
                        "user_id": ensure_record_id(self.id),
                        "course_id": ensure_record_id(course_id),
                    },
                )
            else:
                result = await repo_query(
                    "SELECT * FROM student_progress WHERE user == $user_id",
                    {"user_id": ensure_record_id(self.id)},
                )
            return [StudentProgress(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching progress for user {self.id}: {e}")
            raise DatabaseOperationError(e)


class Course(ObjectModel):
    """
    Course container for organizing modules.
    """
    table_name: ClassVar[str] = "course"
    nullable_fields: ClassVar[set[str]] = {"instructor_id", "description"}
    
    title: str
    description: Optional[str] = None
    instructor_id: Optional[str] = None
    archived: bool = False
    
    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise InvalidInputError("Course title cannot be empty")
        return v.strip()
    
    async def get_modules(self) -> List["Module"]:
        """Get all modules in this course, ordered by position."""
        try:
            # Import here to avoid circular import
            from backpack.domain.module import Module
            
            result = await repo_query(
                """
                SELECT * FROM module 
                WHERE course == $course_id 
                ORDER BY order ASC
                """,
                {"course_id": ensure_record_id(self.id)},
            )
            return [Module(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching modules for course {self.id}: {e}")
            raise DatabaseOperationError(e)
    
    async def get_enrolled_users(self, role: Optional[str] = None) -> List[User]:
        """Get all users enrolled in this course, optionally filtered by role."""
        try:
            if role:
                result = await repo_query(
                    """
                    SELECT in.* as user FROM course_membership 
                    WHERE out == $course_id AND role == $role
                    FETCH in
                    """,
                    {"course_id": ensure_record_id(self.id), "role": role},
                )
            else:
                result = await repo_query(
                    """
                    SELECT in.* as user FROM course_membership 
                    WHERE out == $course_id
                    FETCH in
                    """,
                    {"course_id": ensure_record_id(self.id)},
                )
            return [User(**r["user"]) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching enrolled users for course {self.id}: {e}")
            raise DatabaseOperationError(e)
    
    async def enroll_user(self, user_id: str, role: str = "student") -> Any:
        """Enroll a user in this course."""
        if not user_id:
            raise InvalidInputError("User ID must be provided")
        return await repo_relate(
            source=user_id,
            relationship="course_membership",
            target=str(self.id),
            data={"role": role},
        )


class LearningGoal(ObjectModel):
    """
    Learning objective within a module.
    """
    table_name: ClassVar[str] = "learning_goal"
    nullable_fields: ClassVar[set[str]] = {"mastery_criteria"}
    
    module: str  # record<module>
    description: str
    mastery_criteria: Optional[str] = None
    order: int = 0
    
    @field_validator("description")
    @classmethod
    def description_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise InvalidInputError("Learning goal description cannot be empty")
        return v.strip()
    
    async def get_student_progress(self, user_id: str) -> Optional["StudentProgress"]:
        """Get progress for a specific student on this goal."""
        try:
            result = await repo_query(
                """
                SELECT * FROM student_progress 
                WHERE user == $user_id AND learning_goal == $goal_id
                LIMIT 1
                """,
                {
                    "user_id": ensure_record_id(user_id),
                    "goal_id": ensure_record_id(self.id),
                },
            )
            return StudentProgress(**result[0]) if result else None
        except Exception as e:
            logger.error(f"Error fetching progress for goal {self.id}: {e}")
            raise DatabaseOperationError(e)


class StudentProgress(ObjectModel):
    """
    Tracks student progress toward learning goals.
    """
    table_name: ClassVar[str] = "student_progress"
    nullable_fields: ClassVar[set[str]] = {"confidence_score", "notes"}
    
    user: str  # record<user>
    learning_goal: str  # record<learning_goal>
    status: str = "not_started"  # not_started, in_progress, mastered
    confidence_score: Optional[float] = None
    notes: Optional[str] = None
    last_activity: Optional[datetime] = None
    
    @field_validator("status")
    @classmethod
    def status_must_be_valid(cls, v):
        valid_statuses = {"not_started", "in_progress", "mastered"}
        if v not in valid_statuses:
            raise InvalidInputError(f"Status must be one of: {valid_statuses}")
        return v
    
    @field_validator("confidence_score")
    @classmethod
    def confidence_must_be_valid(cls, v):
        if v is not None and (v < 0 or v > 1):
            raise InvalidInputError("Confidence score must be between 0 and 1")
        return v


class ModuleDocument(ObjectModel):
    """
    Links a source document to a module for LMS context.
    """
    table_name: ClassVar[str] = "module_document"
    nullable_fields: ClassVar[set[str]] = {"title"}
    
    module: str  # record<module>
    source: str  # record<source>
    title: Optional[str] = None
    order: int = 0
    
    async def get_chunks(self) -> List["DocumentChunk"]:
        """Get all chunks for this document."""
        try:
            result = await repo_query(
                """
                SELECT * FROM document_chunk 
                WHERE document == $doc_id 
                ORDER BY chunk_order ASC
                """,
                {"doc_id": ensure_record_id(self.id)},
            )
            return [DocumentChunk(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching chunks for document {self.id}: {e}")
            raise DatabaseOperationError(e)


class DocumentChunk(ObjectModel):
    """
    A chunk of a document with position tracking for lineage.
    """
    table_name: ClassVar[str] = "document_chunk"
    nullable_fields: ClassVar[set[str]] = {"content_hash", "char_start", "char_end"}
    
    document: str  # record<module_document>
    chunk_order: int
    content: str
    content_hash: Optional[str] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    
    async def get_embeddings(self) -> List["ChunkEmbedding"]:
        """Get all embeddings for this chunk (may have multiple for different models)."""
        try:
            result = await repo_query(
                "SELECT * FROM chunk_embedding WHERE chunk == $chunk_id",
                {"chunk_id": ensure_record_id(self.id)},
            )
            return [ChunkEmbedding(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching embeddings for chunk {self.id}: {e}")
            raise DatabaseOperationError(e)


class EmbeddingModelConfig(ObjectModel):
    """
    Configuration for an embedding model.
    
    Tracks model metadata for multi-model embedding support.
    """
    table_name: ClassVar[str] = "embedding_model_config"
    
    name: str
    provider: str
    model_name: str
    dimensions: int
    is_active: bool = True
    
    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, v):
        if not v or not v.strip():
            raise InvalidInputError("Embedding model config name cannot be empty")
        return v.strip()
    
    @classmethod
    async def get_active(cls) -> List["EmbeddingModelConfig"]:
        """Get all active embedding model configurations."""
        try:
            result = await repo_query(
                "SELECT * FROM embedding_model_config WHERE is_active == true"
            )
            return [cls(**r) for r in result] if result else []
        except Exception as e:
            logger.error(f"Error fetching active embedding configs: {e}")
            raise DatabaseOperationError(e)


class ChunkEmbedding(ObjectModel):
    """
    Embedding for a document chunk with model lineage.
    """
    table_name: ClassVar[str] = "chunk_embedding"
    
    chunk: str  # record<document_chunk>
    model_config: str  # record<embedding_model_config>
    embedding: List[float]


# Helper function for course-scoped vector search
async def lms_vector_search(
    query_embedding: List[float],
    course_id: str,
    model_config_id: str,
    match_count: int = 10,
    min_similarity: float = 0.2,
) -> List[Dict[str, Any]]:
    """
    Perform vector search scoped to a specific course and embedding model.
    
    Args:
        query_embedding: The query vector
        course_id: Course to search within
        model_config_id: Embedding model configuration to use
        match_count: Maximum results to return
        min_similarity: Minimum cosine similarity threshold
    
    Returns:
        List of matching chunks with similarity scores
    """
    try:
        result = await repo_query(
            """
            SELECT * FROM fn::lms_vector_search(
                $query, $course_id, $model_config_id, $match_count, $min_similarity
            )
            """,
            {
                "query": query_embedding,
                "course_id": ensure_record_id(course_id),
                "model_config_id": ensure_record_id(model_config_id),
                "match_count": match_count,
                "min_similarity": min_similarity,
            },
        )
        return result if result else []
    except Exception as e:
        logger.error(f"Error performing LMS vector search: {e}")
        raise DatabaseOperationError(e)


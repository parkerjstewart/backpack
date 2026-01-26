"""
Domain models for Backpack.

Provides Pydantic models for database entities with async CRUD operations.
"""

from backpack.domain.base import ObjectModel, RecordModel
from backpack.domain.module import (
    Asset,
    ChatSession,
    Module,
    Note,
    Source,
    SourceEmbedding,
    SourceInsight,
    text_search,
    vector_search,
)
from backpack.domain.lms import (
    ChunkEmbedding,
    Course,
    DocumentChunk,
    EmbeddingModelConfig,
    LearningGoal,
    ModuleDocument,
    StudentProgress,
    User,
    lms_vector_search,
)
from backpack.domain.transformation import DefaultPrompts, Transformation
from backpack.domain.content_settings import ContentSettings

__all__ = [
    # Base
    "ObjectModel",
    "RecordModel",
    # Module (formerly Notebook)
    "Asset",
    "ChatSession",
    "Module",
    "Note",
    "Source",
    "SourceEmbedding",
    "SourceInsight",
    "text_search",
    "vector_search",
    # LMS
    "ChunkEmbedding",
    "Course",
    "DocumentChunk",
    "EmbeddingModelConfig",
    "LearningGoal",
    "ModuleDocument",
    "StudentProgress",
    "User",
    "lms_vector_search",
    # Transformation
    "DefaultPrompts",
    "Transformation",
    # Settings
    "ContentSettings",
]


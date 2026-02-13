from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# Module models
class ModuleCreate(BaseModel):
    name: str = Field(..., description="Name of the module")
    description: str = Field(default="", description="Description of the module")
    course_id: Optional[str] = Field(None, description="ID of the course this module belongs to")


class ModuleUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Name of the module")
    description: Optional[str] = Field(None, description="Description of the module")
    archived: Optional[bool] = Field(
        None, description="Whether the module is archived"
    )
    overview: Optional[str] = Field(None, description="AI-generated overview of the module")
    course_id: Optional[str] = Field(None, description="ID of the course this module belongs to")


class ModuleResponse(BaseModel):
    id: str
    name: str
    description: str
    archived: bool
    overview: Optional[str] = None
    created: str
    updated: str
    source_count: int
    note_count: int
    course_id: Optional[str] = None


# Learning Goals models
class LearningGoalPreview(BaseModel):
    description: str = Field(..., description="Action-verb learning goal statement")
    takeaways: str = Field(default="", description="Key concepts or ideas")
    competencies: str = Field(default="", description="Demonstrable skills")


class LearningGoalCreate(LearningGoalPreview):
    order: Optional[int] = Field(None, description="Display order (auto-assigned if not provided)")


class LearningGoalUpdate(BaseModel):
    description: Optional[str] = Field(None, description="Learning goal description")
    takeaways: Optional[str] = Field(
        None, description="Key concepts or skills to be learned"
    )
    competencies: Optional[str] = Field(
        None, description="Abilities that demonstrate mastery"
    )
    order: Optional[int] = Field(None, description="Display order")


class LearningGoalResponse(BaseModel):
    id: str
    module: str
    description: str
    takeaways: str = ""
    competencies: str = ""
    order: int
    created: str
    updated: str


# Search models
class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    type: Literal["text", "vector"] = Field("text", description="Search type")
    limit: int = Field(100, description="Maximum number of results", le=1000)
    search_sources: bool = Field(True, description="Include sources in search")
    search_notes: bool = Field(True, description="Include notes in search")
    minimum_score: float = Field(
        0.2, description="Minimum score for vector search", ge=0, le=1
    )


class SearchResponse(BaseModel):
    results: List[Dict[str, Any]] = Field(..., description="Search results")
    total_count: int = Field(..., description="Total number of results")
    search_type: str = Field(..., description="Type of search performed")


class AskRequest(BaseModel):
    question: str = Field(..., description="Question to ask the knowledge base")
    # Model fields are optional - defaults from environment will be used if not specified
    strategy_model: Optional[str] = Field(
        None, description="Model spec (provider/model) for query strategy (uses default if not set)"
    )
    answer_model: Optional[str] = Field(
        None, description="Model spec (provider/model) for individual answers (uses default if not set)"
    )
    final_answer_model: Optional[str] = Field(
        None, description="Model spec (provider/model) for final answer (uses default if not set)"
    )


class AskResponse(BaseModel):
    answer: str = Field(..., description="Final answer from the knowledge base")
    question: str = Field(..., description="Original question")


# Provider availability response (models are now configured via environment variables)
class ProviderAvailabilityResponse(BaseModel):
    available: List[str] = Field(..., description="List of available providers")
    unavailable: List[str] = Field(..., description="List of unavailable providers")
    supported_types: Dict[str, List[str]] = Field(
        ..., description="Provider to supported model types mapping"
    )


# Transformations API models
class TransformationCreate(BaseModel):
    name: str = Field(..., description="Transformation name")
    title: str = Field(..., description="Display title for the transformation")
    description: str = Field(
        ..., description="Description of what this transformation does"
    )
    prompt: str = Field(..., description="The transformation prompt")
    apply_default: bool = Field(
        False, description="Whether to apply this transformation by default"
    )


class TransformationUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Transformation name")
    title: Optional[str] = Field(
        None, description="Display title for the transformation"
    )
    description: Optional[str] = Field(
        None, description="Description of what this transformation does"
    )
    prompt: Optional[str] = Field(None, description="The transformation prompt")
    apply_default: Optional[bool] = Field(
        None, description="Whether to apply this transformation by default"
    )


class TransformationResponse(BaseModel):
    id: str
    name: str
    title: str
    description: str
    prompt: str
    apply_default: bool
    created: str
    updated: str


class TransformationExecuteRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    transformation_id: str = Field(
        ..., description="ID of the transformation to execute"
    )
    input_text: str = Field(..., description="Text to transform")
    model_id: Optional[str] = Field(
        None, description="Model spec (provider/model) to use for the transformation (uses default if not set)"
    )


class TransformationExecuteResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    output: str = Field(..., description="Transformed text")
    transformation_id: str = Field(..., description="ID of the transformation used")
    model_id: str = Field(..., description="Model ID used")


# Default Prompt API models
class DefaultPromptResponse(BaseModel):
    transformation_instructions: str = Field(
        ..., description="Default transformation instructions"
    )


class DefaultPromptUpdate(BaseModel):
    transformation_instructions: str = Field(
        ..., description="Default transformation instructions"
    )


# Notes API models
class NoteCreate(BaseModel):
    title: Optional[str] = Field(None, description="Note title")
    content: str = Field(..., description="Note content")
    note_type: Optional[str] = Field("human", description="Type of note (human, ai)")
    module_id: Optional[str] = Field(
        None, description="Module ID to add the note to"
    )


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(None, description="Note title")
    content: Optional[str] = Field(None, description="Note content")
    note_type: Optional[str] = Field(None, description="Type of note (human, ai)")


class NoteResponse(BaseModel):
    id: str
    title: Optional[str]
    content: Optional[str]
    note_type: Optional[str]
    created: str
    updated: str


# Embedding API models
class EmbedRequest(BaseModel):
    item_id: str = Field(..., description="ID of the item to embed")
    item_type: str = Field(..., description="Type of item (source, note)")
    async_processing: bool = Field(
        False, description="Process asynchronously in background"
    )


class EmbedResponse(BaseModel):
    success: bool = Field(..., description="Whether embedding was successful")
    message: str = Field(..., description="Result message")
    item_id: str = Field(..., description="ID of the item that was embedded")
    item_type: str = Field(..., description="Type of item that was embedded")
    command_id: Optional[str] = Field(
        None, description="Command ID for async processing"
    )


# Rebuild request/response models
class RebuildRequest(BaseModel):
    mode: Literal["existing", "all"] = Field(
        ...,
        description="Rebuild mode: 'existing' only re-embeds items with embeddings, 'all' embeds everything",
    )
    include_sources: bool = Field(True, description="Include sources in rebuild")
    include_notes: bool = Field(True, description="Include notes in rebuild")
    include_insights: bool = Field(True, description="Include insights in rebuild")


class RebuildResponse(BaseModel):
    command_id: str = Field(..., description="Command ID to track progress")
    total_items: int = Field(..., description="Estimated number of items to process")
    message: str = Field(..., description="Status message")


class RebuildProgress(BaseModel):
    processed: int = Field(..., description="Number of items processed")
    total: int = Field(..., description="Total items to process")
    percentage: float = Field(..., description="Progress percentage")


class RebuildStats(BaseModel):
    sources: int = Field(0, description="Sources processed")
    notes: int = Field(0, description="Notes processed")
    insights: int = Field(0, description="Insights processed")
    failed: int = Field(0, description="Failed items")


class RebuildStatusResponse(BaseModel):
    command_id: str = Field(..., description="Command ID")
    status: str = Field(..., description="Status: queued, running, completed, failed")
    progress: Optional[RebuildProgress] = None
    stats: Optional[RebuildStats] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


# Settings API models
class SettingsResponse(BaseModel):
    default_content_processing_engine_doc: Optional[str] = None
    default_content_processing_engine_url: Optional[str] = None
    default_embedding_option: Optional[str] = None
    auto_delete_files: Optional[str] = None
    youtube_preferred_languages: Optional[List[str]] = None


class SettingsUpdate(BaseModel):
    default_content_processing_engine_doc: Optional[str] = None
    default_content_processing_engine_url: Optional[str] = None
    default_embedding_option: Optional[str] = None
    auto_delete_files: Optional[str] = None
    youtube_preferred_languages: Optional[List[str]] = None


# Sources API models
class AssetModel(BaseModel):
    file_path: Optional[str] = None
    url: Optional[str] = None


class SourceCreate(BaseModel):
    # Backward compatibility: support old single module_id
    module_id: Optional[str] = Field(
        None, description="Module ID to add the source to (deprecated, use modules)"
    )
    # New multi-module support
    modules: Optional[List[str]] = Field(
        None, description="List of module IDs to add the source to"
    )
    # Required fields
    type: str = Field(..., description="Source type: link, upload, or text")
    url: Optional[str] = Field(None, description="URL for link type")
    file_path: Optional[str] = Field(None, description="File path for upload type")
    content: Optional[str] = Field(None, description="Text content for text type")
    title: Optional[str] = Field(None, description="Source title")
    transformations: Optional[List[str]] = Field(
        default_factory=list, description="Transformation IDs to apply"
    )
    embed: bool = Field(False, description="Whether to embed content for vector search")
    delete_source: bool = Field(
        False, description="Whether to delete uploaded file after processing"
    )
    # New async processing support
    async_processing: bool = Field(
        False, description="Whether to process source asynchronously"
    )

    @model_validator(mode="after")
    def validate_module_fields(self):
        # Ensure only one of module_id or modules is provided
        if self.module_id is not None and self.modules is not None:
            raise ValueError(
                "Cannot specify both 'module_id' and 'modules'. Use 'modules' for multi-module support."
            )

        # Convert single module_id to modules array for internal processing
        if self.module_id is not None:
            self.modules = [self.module_id]
            # Keep module_id for backward compatibility in response

        # Set empty array if no modules specified (allow sources without modules)
        if self.modules is None:
            self.modules = []

        return self


class SourceUpdate(BaseModel):
    title: Optional[str] = Field(None, description="Source title")
    topics: Optional[List[str]] = Field(None, description="Source topics")


class SourceResponse(BaseModel):
    id: str
    title: Optional[str]
    topics: Optional[List[str]]
    asset: Optional[AssetModel]
    full_text: Optional[str]
    embedded: bool
    embedded_chunks: int
    file_available: Optional[bool] = None
    created: str
    updated: str
    # New fields for async processing
    command_id: Optional[str] = None
    status: Optional[str] = None
    processing_info: Optional[Dict] = None
    # Module associations
    modules: Optional[List[str]] = None


class SourceListResponse(BaseModel):
    id: str
    title: Optional[str]
    topics: Optional[List[str]]
    asset: Optional[AssetModel]
    embedded: bool  # Boolean flag indicating if source has embeddings
    embedded_chunks: int  # Number of embedded chunks
    insights_count: int
    created: str
    updated: str
    file_available: Optional[bool] = None
    # Status fields for async processing
    command_id: Optional[str] = None
    status: Optional[str] = None
    processing_info: Optional[Dict[str, Any]] = None


# Context API models
class ContextConfig(BaseModel):
    sources: Dict[str, str] = Field(
        default_factory=dict, description="Source inclusion config {source_id: level}"
    )
    notes: Dict[str, str] = Field(
        default_factory=dict, description="Note inclusion config {note_id: level}"
    )


class ContextRequest(BaseModel):
    module_id: str = Field(..., description="Module ID to get context for")
    context_config: Optional[ContextConfig] = Field(
        None, description="Context configuration"
    )


class ContextResponse(BaseModel):
    module_id: str
    sources: List[Dict[str, Any]] = Field(..., description="Source context data")
    notes: List[Dict[str, Any]] = Field(..., description="Note context data")
    total_tokens: Optional[int] = Field(None, description="Estimated token count")


# Insights API models
class SourceInsightResponse(BaseModel):
    id: str
    source_id: str
    insight_type: str
    content: str
    created: str
    updated: str


class SaveAsNoteRequest(BaseModel):
    module_id: Optional[str] = Field(None, description="Module ID to add note to")


class CreateSourceInsightRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    transformation_id: str = Field(..., description="ID of transformation to apply")
    model_id: Optional[str] = Field(
        None, description="Model ID (uses default if not provided)"
    )


# Source status response
class SourceStatusResponse(BaseModel):
    status: Optional[str] = Field(None, description="Processing status")
    message: str = Field(..., description="Descriptive message about the status")
    processing_info: Optional[Dict[str, Any]] = Field(
        None, description="Detailed processing information"
    )
    command_id: Optional[str] = Field(None, description="Command ID if available")


# Batch delete request/response
class BatchDeleteSourcesRequest(BaseModel):
    source_ids: List[str] = Field(..., description="List of source IDs to delete")


class BatchDeleteSourcesResponse(BaseModel):
    deleted: int = Field(..., description="Number of sources deleted")
    failed: int = Field(0, description="Number of sources that failed to delete")
    errors: Optional[List[str]] = Field(None, description="Error messages for failed deletions")


# Preview module content request/response
class PreviewModuleContentRequest(BaseModel):
    source_ids: List[str] = Field(..., description="List of source IDs to generate content from")
    name: str = Field(..., description="Module name for context")


class PreviewModuleContentResponse(BaseModel):
    name: Optional[str] = Field(None, description="AI-generated module name")
    overview: Optional[str] = Field(None, description="Generated module overview")
    learning_goals: List[LearningGoalPreview] = Field(
        default_factory=list, description="Generated learning goals"
    )


# Unified generation request (replaces separate preview/generate models)
class GenerateContentRequest(BaseModel):
    """Unified request for generating overview or learning goals.
    Provide module_id to generate from an existing module (saves result),
    or source_ids to generate from specific sources (preview mode, no save).
    """
    module_id: Optional[str] = Field(
        None, description="Module ID (uses module's sources+notes, saves result)"
    )
    source_ids: Optional[List[str]] = Field(
        None, description="Source IDs (preview mode, no save)"
    )
    name: str = Field("", description="Module name for context")

    @model_validator(mode="after")
    def validate_source(self):
        if self.module_id is None and self.source_ids is None:
            raise ValueError("Either 'module_id' or 'source_ids' must be provided")
        if self.module_id is not None and self.source_ids is not None:
            raise ValueError("Cannot specify both 'module_id' and 'source_ids'")
        return self


class GenerateOverviewResponse(BaseModel):
    overview: str = Field(..., description="Generated module overview")


class GenerateLearningGoalsResponse(BaseModel):
    learning_goals: List[LearningGoalPreview] = Field(
        default_factory=list, description="Generated learning goals"
    )


# Error response
class ErrorResponse(BaseModel):
    error: str
    message: str


# ============================================
# User API models
# ============================================
class UserLoginRequest(BaseModel):
    email: str = Field(..., description="User's email address")


class UserRegisterRequest(BaseModel):
    email: str = Field(..., description="User's email address")
    name: str = Field(..., description="User's display name")


class UpdateUserProfileRequest(BaseModel):
    name: Optional[str] = Field(None, description="User's display name")


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str
    avatar_url: Optional[str] = None
    created: str
    updated: str


# ============================================
# Course API models
# ============================================
class CourseCreate(BaseModel):
    title: str = Field(..., description="Course title/code (e.g., 'CS 224N')")
    description: Optional[str] = Field(None, description="Course description/name")


class CourseUpdate(BaseModel):
    title: Optional[str] = Field(None, description="Course title/code")
    description: Optional[str] = Field(None, description="Course description/name")
    archived: Optional[bool] = Field(None, description="Whether the course is archived")


class CourseResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    instructor_id: Optional[str] = None
    archived: bool
    created: str
    updated: str
    module_count: int = 0
    student_count: int = 0
    membership_role: Optional[str] = None


class CourseMemberResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str  # Course membership role: 'student', 'instructor', 'ta'
    enrolled_at: str


class AddCourseMemberRequest(BaseModel):
    name: str = Field(..., description="Name of the user to add")
    email: str = Field(..., description="Email of the user to add")
    role: Literal["student", "instructor", "ta"] = Field(
        "student", description="Role in the course"
    )


class ModuleMasteryResponse(BaseModel):
    module_id: str
    module_name: str
    status: Literal["mastered", "progressing", "struggling", "incomplete"]


class StudentWithMasteryResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    module_mastery: List[ModuleMasteryResponse] = Field(default_factory=list)


# ============================================
# Invitation API models
# ============================================
class CreateInvitationRequest(BaseModel):
    name: str = Field(..., description="Name of the invitee")
    email: str = Field(..., description="Email of the invitee")
    role: Literal["student", "instructor", "ta"] = Field(
        "student", description="Role in the course"
    )


class InvitationResponse(BaseModel):
    id: str
    token: str
    course_id: str
    course_title: Optional[str] = None
    email: str
    name: str
    role: str
    status: str
    invited_by: Optional[str] = None
    invite_url: Optional[str] = None
    expires_at: Optional[str] = None
    created: Optional[str] = None

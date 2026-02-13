export interface ModuleResponse {
  id: string
  name: string
  description: string
  archived: boolean
  overview: string | null
  created: string
  updated: string
  source_count: number
  note_count: number
  course_id?: string | null
}

export interface NoteResponse {
  id: string
  title: string | null
  content: string | null
  note_type: string | null
  created: string
  updated: string
}

export interface SourceListResponse {
  id: string
  title: string | null
  topics?: string[]                  // Make optional to match Python API
  asset: {
    file_path?: string
    url?: string
  } | null
  embedded: boolean
  embedded_chunks: number            // ADD: From Python API
  insights_count: number
  created: string
  updated: string
  file_available?: boolean
  // ADD: Async processing fields from Python API
  command_id?: string
  status?: string
  processing_info?: Record<string, unknown>
}

export interface SourceDetailResponse extends SourceListResponse {
  full_text: string
  modules?: string[]  // List of module IDs this source is linked to
}

export type SourceResponse = SourceDetailResponse

export interface SourceStatusResponse {
  status?: string
  message: string
  processing_info?: Record<string, unknown>
  command_id?: string
}

export interface SettingsResponse {
  default_content_processing_engine_doc?: string
  default_content_processing_engine_url?: string
  default_embedding_option?: string
  auto_delete_files?: string
  youtube_preferred_languages?: string[]
}

export interface CreateModuleRequest {
  name: string
  description?: string
  course_id?: string
}

export interface UpdateModuleRequest {
  name?: string
  description?: string
  archived?: boolean
  overview?: string
  course_id?: string | null
}

// Learning Goals Types
export interface LearningGoalResponse {
  id: string
  module: string
  description: string
  takeaways: string
  competencies: string
  order: number
  created: string
  updated: string
}

export interface CreateLearningGoalRequest {
  description: string
  takeaways?: string
  competencies?: string
  order?: number
}

export interface UpdateLearningGoalRequest {
  description?: string
  takeaways?: string
  competencies?: string
  order?: number
}

export interface CreateNoteRequest {
  title?: string
  content: string
  note_type?: string
  module_id?: string
}

export interface CreateSourceRequest {
  // Backward compatibility: support old single module_id
  module_id?: string
  // New multi-module support
  modules?: string[]
  // Required fields
  type: 'link' | 'upload' | 'text'
  url?: string
  file_path?: string
  content?: string
  title?: string
  transformations?: string[]
  embed?: boolean
  delete_source?: boolean
  // New async processing support
  async_processing?: boolean
}

export interface UpdateNoteRequest {
  title?: string
  content?: string
  note_type?: string
}

export interface UpdateSourceRequest {
  title?: string
  type?: 'link' | 'upload' | 'text'
  url?: string
  content?: string
}

export interface APIError {
  detail: string
}

// Source Chat Types
// Base session interface with common fields
export interface BaseChatSession {
  id: string
  title: string
  created: string
  updated: string
  message_count?: number
  model_override?: string | null
}

export interface SourceChatSession extends BaseChatSession {
  source_id: string
  model_override?: string
}

export interface SourceChatMessage {
  id: string
  type: 'human' | 'ai'
  content: string
  timestamp?: string
}

export interface SourceChatContextIndicator {
  sources: string[]
  insights: string[]
  notes: string[]
}

export interface SourceChatSessionWithMessages extends SourceChatSession {
  messages: SourceChatMessage[]
  context_indicators?: SourceChatContextIndicator
}

export interface CreateSourceChatSessionRequest {
  source_id: string
  title?: string
  model_override?: string
}

export interface UpdateSourceChatSessionRequest {
  title?: string
  model_override?: string
}

export interface SendMessageRequest {
  message: string
  model_override?: string
}

export interface SourceChatStreamEvent {
  type: 'user_message' | 'ai_message' | 'context_indicators' | 'complete' | 'error'
  content?: string
  data?: unknown
  message?: string
  timestamp?: string
}

// Module Chat Types
export interface ModuleChatSession extends BaseChatSession {
  module_id: string
}

export interface ModuleChatMessage {
  id: string
  type: 'human' | 'ai'
  content: string
  timestamp?: string
}

export interface ModuleChatSessionWithMessages extends ModuleChatSession {
  messages: ModuleChatMessage[]
}

export interface CreateModuleChatSessionRequest {
  module_id: string
  title?: string
  model_override?: string
}

export interface UpdateModuleChatSessionRequest {
  title?: string
  model_override?: string | null
}

export interface SendModuleChatMessageRequest {
  session_id: string
  message: string
  context: {
    sources: Array<Record<string, unknown>>
    notes: Array<Record<string, unknown>>
  }
  model_override?: string
}

export interface BuildContextRequest {
  module_id: string
  context_config: {
    sources: Record<string, string>
    notes: Record<string, string>
  }
}

export interface BuildContextResponse {
  context: {
    sources: Array<Record<string, unknown>>
    notes: Array<Record<string, unknown>>
  }
  token_count: number
  char_count: number
}

// Batch Delete Sources Types
export interface BatchDeleteSourcesRequest {
  source_ids: string[]
}

export interface BatchDeleteSourcesResponse {
  deleted: number
  failed: number
  errors?: string[]
}

// Preview Module Content Types (for draft module creation)
export interface PreviewModuleContentRequest {
  source_ids: string[]
  name: string
}

export interface LearningGoalPreview {
  description: string
  takeaways: string
  competencies: string
}

export interface PreviewModuleContentResponse {
  name: string | null
  overview: string | null
  learning_goals: LearningGoalPreview[]
}

// Unified generation request (replaces separate preview/generate models)
export interface GenerateContentRequest {
  module_id?: string
  source_ids?: string[]
  name?: string
}

export interface GenerateOverviewResponse {
  overview: string
}

export interface GenerateLearningGoalsResponse {
  learning_goals: LearningGoalPreview[]
}

// ============================================
// User Types
// ============================================
export interface UserResponse {
  id: string
  email: string
  name: string | null
  role: string
  avatar_url: string | null
  created: string
  updated: string
}

export interface UserLoginRequest {
  email: string
}

export interface UserRegisterRequest {
  email: string
  name: string
}

// ============================================
// Course Types
// ============================================
export interface CourseResponse {
  id: string
  title: string
  description: string | null
  instructor_id: string | null
  archived: boolean
  created: string
  updated: string
  module_count: number
  student_count: number
  membership_role?: string | null
}

export interface CreateCourseRequest {
  title: string
  description?: string
}

export interface UpdateCourseRequest {
  title?: string
  description?: string
  archived?: boolean
}

export interface CourseMemberResponse {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: string  // 'student', 'instructor', 'ta'
  enrolled_at: string
}

export interface AddCourseMemberRequest {
  name: string
  email: string
  role?: 'student' | 'instructor' | 'ta'
}

// ============================================
// Invitation Types
// ============================================
export interface InvitationResponse {
  id: string
  token: string
  course_id: string
  course_title?: string
  email: string
  name: string
  role: string
  status: string
  invited_by?: string
  invite_url?: string
  expires_at?: string
  created?: string
}

export interface CreateInvitationRequest {
  name: string
  email: string
  role?: 'student' | 'instructor' | 'ta'
}

export type MasteryStatus = 'mastered' | 'progressing' | 'struggling' | 'incomplete'

export interface ModuleMasteryResponse {
  module_id: string
  module_name: string
  status: MasteryStatus
}

export interface StudentWithMasteryResponse {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  module_mastery: ModuleMasteryResponse[]
}

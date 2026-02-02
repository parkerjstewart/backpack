import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CourseColor = 'sage' | 'amber' | 'sky' | 'coral'

export interface Course {
  id: string
  name: string
  description?: string
  archived?: boolean
  createdAt: string
  updatedAt: string
  /** Filename of uploaded syllabus (stored locally for display) */
  syllabusFileName?: string
  /** Card color variant for visual distinction */
  color?: CourseColor
}

export interface ModuleMetadata {
  overview?: string
  dueDate?: string
  prerequisites?: string
  learningGoals?: string[]
}

interface CoursesState {
  courses: Course[]
  /** Maps module ID -> course ID */
  moduleCourseMap: Record<string, string>
  /** Maps module ID -> module metadata */
  moduleMetadata: Record<string, ModuleMetadata>
  createCourse: (name: string, description?: string) => Course
  updateCourse: (id: string, data: Partial<Omit<Course, 'id'>>) => void
  archiveCourse: (id: string, archived?: boolean) => void
  assignModuleToCourse: (moduleId: string, courseId: string) => void
  removeModuleFromCourse: (moduleId: string) => void
  getModuleMetadata: (moduleId: string) => ModuleMetadata
  updateModuleMetadata: (moduleId: string, data: Partial<ModuleMetadata>) => void
}

const createInitialCourses = (): Course[] => {
  const now = new Date().toISOString()

  return [
    {
      id: 'cs-224n',
      name: 'CS 224N',
      description: 'Natural Language Processing with Deep Learning',
      createdAt: now,
      updatedAt: now,
      color: 'sage',
    },
    {
      id: 'cee-33b',
      name: 'CEE 33B',
      description: 'Japanese Modern Architecture',
      createdAt: now,
      updatedAt: now,
      color: 'amber',
    },
    {
      id: 'arthist-129',
      name: 'ARTHIST 129',
      description: 'Fashion',
      createdAt: now,
      updatedAt: now,
      color: 'sky',
    },
    {
      id: 'cs-111',
      name: 'CS 111',
      description: 'Operating Systems Principles',
      createdAt: now,
      updatedAt: now,
      color: 'coral',
    },
  ]
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useCoursesStore = create<CoursesState>()(
  persist(
    (set, get) => ({
      courses: createInitialCourses(),
      moduleCourseMap: {},
      moduleMetadata: {},

      createCourse: (name, description) => {
        const id = generateId()
        const now = new Date().toISOString()
        const course: Course = {
          id,
          name,
          description,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          courses: [...state.courses, course],
        }))

        return course
      },

      updateCourse: (id, data) => {
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id === id
              ? {
                  ...course,
                  ...data,
                  updatedAt: new Date().toISOString(),
                }
              : course
          ),
        }))
      },

      archiveCourse: (id, archived = true) => {
        const { updateCourse } = get()
        updateCourse(id, { archived })
      },

      assignModuleToCourse: (moduleId, courseId) => {
        set((state) => ({
          moduleCourseMap: {
            ...state.moduleCourseMap,
            [moduleId]: courseId,
          },
        }))
      },

      removeModuleFromCourse: (moduleId) => {
        set((state) => {
          const next = { ...state.moduleCourseMap }
          delete next[moduleId]
          return { moduleCourseMap: next }
        })
      },

      getModuleMetadata: (moduleId) => {
        const state = get()
        return state.moduleMetadata[moduleId] || {}
      },

      updateModuleMetadata: (moduleId, data) => {
        set((state) => ({
          moduleMetadata: {
            ...state.moduleMetadata,
            [moduleId]: {
              ...state.moduleMetadata[moduleId],
              ...data,
            },
          },
        }))
      },
    }),
    {
      name: 'courses-storage',
    }
  )
)


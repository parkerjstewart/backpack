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
  /** User's role in this course from course_membership */
  membershipRole?: string | null
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
  /** Maps course ID -> color (persisted locally for consistent colors) */
  courseColors: Record<string, CourseColor>
  setCourses: (courses: Course[]) => void
  createCourse: (name: string, description?: string) => Course
  updateCourse: (id: string, data: Partial<Omit<Course, 'id'>>) => void
  archiveCourse: (id: string, archived?: boolean) => void
  assignModuleToCourse: (moduleId: string, courseId: string) => void
  removeModuleFromCourse: (moduleId: string) => void
  getModuleMetadata: (moduleId: string) => ModuleMetadata
  updateModuleMetadata: (moduleId: string, data: Partial<ModuleMetadata>) => void
  getCourseColor: (courseId: string) => CourseColor
}

// Colors cycle through these options for new courses
const COURSE_COLORS: CourseColor[] = ['sage', 'amber', 'sky', 'coral']

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useCoursesStore = create<CoursesState>()(
  persist(
    (set, get) => ({
      courses: [],  // Courses now loaded from backend via useCourses hook
      moduleCourseMap: {},
      moduleMetadata: {},
      courseColors: {},

      setCourses: (courses) => {
        // Assign colors to new courses that don't have one
        const { courseColors } = get()
        const updatedColors = { ...courseColors }
        let colorIndex = Object.keys(courseColors).length

        courses.forEach((course) => {
          if (!updatedColors[course.id]) {
            updatedColors[course.id] = COURSE_COLORS[colorIndex % COURSE_COLORS.length]
            colorIndex++
          }
        })

        set({ courses, courseColors: updatedColors })
      },

      createCourse: (name, description) => {
        const id = generateId()
        const now = new Date().toISOString()
        const { courses } = get()

        // Assign a color to the new course
        const colorIndex = courses.length % COURSE_COLORS.length
        const color = COURSE_COLORS[colorIndex]

        const course: Course = {
          id,
          name,
          description,
          createdAt: now,
          updatedAt: now,
          color,
        }

        set((state) => ({
          courses: [...state.courses, course],
          courseColors: { ...state.courseColors, [id]: color },
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

      getCourseColor: (courseId) => {
        const { courseColors, courses } = get()
        if (courseColors[courseId]) {
          return courseColors[courseId]
        }
        // Fallback: assign color based on index
        const index = courses.findIndex((c) => c.id === courseId)
        return COURSE_COLORS[Math.max(0, index) % COURSE_COLORS.length]
      },
    }),
    {
      name: 'courses-storage',
    }
  )
)


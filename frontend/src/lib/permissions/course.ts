export type CourseMembershipRole = 'student' | 'instructor' | 'ta' | null | undefined

export function isTeachingRole(role: CourseMembershipRole): boolean {
  return role === 'instructor' || role === 'ta'
}

export interface CoursePermissions {
  canManageMembers: boolean
  canManageCourseSettings: boolean
  canCreateModules: boolean
  canEditModuleContent: boolean
}

export function getCoursePermissions(role: CourseMembershipRole): CoursePermissions {
  const canTeach = isTeachingRole(role)

  return {
    canManageMembers: canTeach,
    canManageCourseSettings: canTeach,
    canCreateModules: canTeach,
    canEditModuleContent: canTeach,
  }
}

export type CourseMembershipRole = 'student' | 'instructor' | 'ta' | null | undefined

export function normalizeCourseMembershipRole(role: string | null | undefined): CourseMembershipRole {
  if (role === 'student' || role === 'instructor' || role === 'ta') {
    return role
  }
  return undefined
}

export function isTeachingRole(role: CourseMembershipRole): boolean {
  return role === 'instructor' || role === 'ta'
}

export interface CoursePermissions {
  canManageMembers: boolean
  canManageCourseSettings: boolean  // archive, delete, edit details — instructor only
  canCreateModules: boolean
  canEditModuleContent: boolean
  canLeaveCourse: boolean           // students and TAs can leave; instructors cannot
}

export function getCoursePermissions(role: CourseMembershipRole): CoursePermissions {
  const canTeach = isTeachingRole(role)

  return {
    canManageMembers: canTeach,
    canManageCourseSettings: role === 'instructor',
    canCreateModules: canTeach,
    canEditModuleContent: canTeach,
    canLeaveCourse: role === 'student' || role === 'ta',
  }
}

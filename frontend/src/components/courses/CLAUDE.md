# Courses Components

Course management UI components for the dashboard, including course cards and creation dialogs.

## Components

### `CourseCard.tsx`

Displays a single course as a clickable card with animated hover effect.

**Features:**
- Colored band with "briefcase-lift" hover animation (band shrinks to simulate lifting)
- Four color variants: sage (green), amber (yellow), sky (blue), coral (orange)
- Links to course detail page (`/courses/{id}`)
- Uses `text-card-title` (28px EB Garamond) for course code
- Uses `text-body` for course description

**Props:**
```typescript
interface CourseCardProps {
  course: Course        // From courses-store
  className?: string    // Additional classes
}
```

**Color Configuration:**
```typescript
const colorConfig = {
  sage:  { bg: 'bg-sage-500',  borderDark: 'border-sage-700' },
  amber: { bg: 'bg-amber-400', borderDark: 'border-amber-600' },
  sky:   { bg: 'bg-sky-500',   borderDark: 'border-sky-700' },
  coral: { bg: 'bg-coral-500', borderDark: 'border-coral-700' },
}
```

**Hover Animation:**
- Default: `h-[119px]` band with `border-b-8`
- Hover: `h-[103px]` band with `border-b-[16px]` and `rounded-b-xl`
- Creates illusion of colored "lid" lifting up while white card stays static

### `CreateCourseDialog.tsx`

Modal dialog for creating new courses with form validation.

**Features:**
- Course Code field (required) — stored as `course.name`
- Course Name field (required) — stored as `course.description`
- Syllabus upload (optional) — uses `FileUploadZone`
- Form validation via `react-hook-form` + `zod`
- Button changes from `variant="light"` (disabled) to `variant="accent"` (valid)

**Props:**
```typescript
interface CreateCourseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (course: Course) => void
}
```

**Dialog Styling (matches Figma node 199:1245):**
- `max-w-[806px]` width
- `rounded-[32px]` border radius
- `px-16 pt-8 pb-16` padding
- Close button positioned top-left (not default top-right)

### `index.ts`

Barrel export for cleaner imports:
```typescript
import { CourseCard, CreateCourseDialog } from '@/components/courses'
```

## Usage Example

```tsx
import { CourseCard, CreateCourseDialog } from '@/components/courses'
import { useCoursesStore } from '@/lib/stores/courses-store'

function CoursesPage() {
  const { courses } = useCoursesStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-6">
        {courses.map(course => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
      
      <CreateCourseDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        onCreated={(course) => console.log('Created:', course)}
      />
    </>
  )
}
```

## Dependencies

- `@/lib/stores/courses-store`: Course state management
- `@/components/ui/dialog`: Dialog primitives
- `@/components/ui/form-label`: Serif form labels
- `@/components/ui/file-upload-zone`: File upload component
- `react-hook-form` + `zod`: Form validation
- `lucide-react`: Icons (X for close button)

## Important Notes

- Course colors are stored in the `course.color` field (type `CourseColor`)
- Default color is `'sage'` if not specified
- Dialog form resets automatically when closed
- Syllabus upload is UI-only (no backend integration yet)

---
name: Fix Courses Page UI
overview: Redesign the courses page to match Figma by first adding missing design system components (FormLabel, FileUploadZone), then creating CourseCard and CreateCourseDialog, and finally updating the page layout.
todos:
  - id: ds-form-label
    content: Add FormLabel component to design system for EB Garamond 24px form labels
    status: completed
  - id: ds-file-upload
    content: Extract FileUploadZone as reusable design system component
    status: completed
  - id: course-card
    content: Create CourseCard component using existing typography classes
    status: completed
  - id: create-dialog
    content: Create CreateCourseDialog with FormLabel and FileUploadZone
    status: completed
  - id: update-page
    content: Update courses page layout with welcome header and CourseCard grid
    status: completed
  - id: store-updates
    content: Add syllabus and color fields to courses store
    status: completed
isProject: false
---

# Fix Courses Page to Match Figma Design

## Design System Analysis

### Existing Components/Tokens That CAN Be Reused


| What                       | Where           | Usage                                      |
| -------------------------- | --------------- | ------------------------------------------ |
| `.text-hero`               | globals.css     | 48px EB Garamond for "Welcome back, Ryan!" |
| `.text-section`            | globals.css     | 32px EB Garamond for dialog title          |
| `.text-title`              | globals.css     | 24px EB Garamond for section headings      |
| `.text-card-title`         | globals.css     | 28px EB Garamond for course code           |
| `.text-body`               | globals.css     | 16px Figtree for descriptions              |
| `Button variant="outline"` | button.tsx      | 2px dashed for "+ Create New Course"       |
| `Button variant="accent"`  | button.tsx      | Sage green for valid form submit           |
| `Button variant="light"`   | button.tsx      | Neutral for disabled submit                |
| `Input`                    | input.tsx       | With sage focus ring already styled        |
| `Dialog*` components       | dialog.tsx      | Full modal primitives                      |
| `--sage-300/500/700`       | globals.css     | Card accent colors                         |
| `--radius-md` (16px)       | globals.css     | Card border radius                         |
| `--card-gap` (24px)        | tailwind.config | Spacing between cards                      |


### Components to ADD to Design System First

#### 1. FormLabel Component

**Problem:** Current `Label` is 14px sans-serif. Figma shows form labels in EB Garamond 24px.

Create `components/ui/form-label.tsx`:

```tsx
// Uses existing .text-title class but as a label element
function FormLabel({ className, required, ...props }) {
  return (
    <label className={cn("text-title text-teal-800", className)} {...props}>
      {props.children}
      {required && "*"}
    </label>
  )
}
```

#### 2. FileUploadZone Component

**Problem:** File upload UI in CreateModuleDialog is inline. Extract as reusable component.

Create `components/ui/file-upload-zone.tsx`:

```tsx
// Matches Figma node 199:1161 (empty) and 199:1163 (uploaded)
interface FileUploadZoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  accept?: string
  maxSize?: number
  placeholder?: string
}
```

Two states:

- **Empty:** Dashed border, upload icon, "Upload Your Syllabus Here" text
- **Uploaded:** Solid border, file icon, filename, X to remove

## Implementation Plan

### Phase 1: Design System Additions

**File: `components/ui/form-label.tsx**`

- Create FormLabel with `text-title` class (24px EB Garamond)
- Support `required` prop for asterisk
- Use `text-teal-800` for 80% opacity teal color

**File: `components/ui/file-upload-zone.tsx**`

- Extract from CreateModuleDialog
- Empty state: `bg-secondary border-2 border-dashed rounded-lg`
- Uploaded state: `border border-solid rounded-lg` with file list
- Drag-and-drop support via `onDrop`/`onDragOver`

### Phase 2: Course Components

**File: `components/courses/CourseCard.tsx**`

Key structure matching Figma node 85:945:

```tsx
<Link href={`/courses/${id}`}>
  <div className="w-72 rounded-md border bg-card overflow-hidden hover:bg-secondary transition-all">
    {/* Colored band with 3D effect */}
    <div className="h-[119px] -scale-y-100">
      <div className="h-full bg-sage-500 border-l-8 border-r-8 border-t-8 border-sage-700 rounded-md shadow-md" />
    </div>
    {/* Content */}
    <div className="p-4 flex flex-col gap-3">
      <h3 className="text-card-title">{courseCode}</h3>
      <p className="text-body text-teal-800">{description}</p>
    </div>
  </div>
</Link>
```

**File: `components/courses/CreateCourseDialog.tsx**`

Structure matching Figma node 199:1245:

```tsx
<Dialog>
  <DialogContent className="max-w-[806px] rounded-xl p-16 pb-16">
    {/* Custom positioned close button (top-left) */}
    <DialogClose className="absolute left-16 top-8" />
    
    {/* Title centered */}
    <DialogTitle className="text-section text-center">Create Course</DialogTitle>
    
    {/* Form fields with FormLabel */}
    <div className="space-y-8">
      <div className="space-y-3">
        <FormLabel required>Course Name</FormLabel>
        <Input placeholder="Input text here..." />
      </div>
      
      <div className="space-y-3">
        <FormLabel>Description</FormLabel>
        <Input placeholder="Input text here..." />
      </div>
      
      <div className="space-y-3">
        <FormLabel>Syllabus (optional)</FormLabel>
        <FileUploadZone files={files} onFilesChange={setFiles} />
      </div>
    </div>
    
    {/* Submit button - accent when valid, light when disabled */}
    <Button variant={isValid ? "accent" : "light"} className="w-full">
      Create
    </Button>
  </DialogContent>
</Dialog>
```

### Phase 3: Page Layout Update

**File: `app/(dashboard)/courses/page.tsx**`

```tsx
<AppShell>
  <div className="flex-1 overflow-y-auto">
    <div className="p-page flex flex-col gap-4 items-center">
      {/* Hero */}
      <div className="pt-[48px] pb-8">
        <h1 className="text-hero text-center">Welcome back, Ryan!</h1>
      </div>
      
      {/* Action buttons */}
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          + Create New Course
        </Button>
      </div>
      
      {/* Courses section */}
      <div className="w-full space-y-4">
        <h2 className="text-title text-teal-800">Courses</h2>
        <div className="flex gap-card-gap overflow-x-auto">
          {courses.map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </div>
    </div>
  </div>
  
  <CreateCourseDialog open={dialogOpen} onOpenChange={setDialogOpen} />
</AppShell>
```

### Phase 4: Store Updates

**File: `lib/stores/courses-store.ts**`

Add to Course interface:

```typescript
interface Course {
  // ... existing fields
  syllabusFileName?: string  // Store just the name for display
  color?: 'sage' | 'yellow' | 'blue' | 'coral'  // Card color variant
}
```

## Files Summary


| File                                        | Action                     |
| ------------------------------------------- | -------------------------- |
| `components/ui/form-label.tsx`              | **Create** - DS addition   |
| `components/ui/file-upload-zone.tsx`        | **Create** - DS addition   |
| `components/courses/CourseCard.tsx`         | **Create**                 |
| `components/courses/CreateCourseDialog.tsx` | **Create**                 |
| `components/courses/index.ts`               | **Create** - barrel export |
| `app/(dashboard)/courses/page.tsx`          | **Modify**                 |
| `lib/stores/courses-store.ts`               | **Modify**                 |


## Typography Mapping (Figma to Code)


| Figma Style   | CSS Class          | Font        | Size | Weight |
| ------------- | ------------------ | ----------- | ---- | ------ |
| Title Hero    | `.text-hero`       | EB Garamond | 48px | 400    |
| Title Section | `.text-section`    | EB Garamond | 32px | 500    |
| Title         | `.text-title`      | EB Garamond | 24px | 500    |
| Card Title    | `.text-card-title` | EB Garamond | 28px | 500    |
| Body Standard | `.text-body`       | Figtree     | 16px | 400    |
| Body Small    | `.text-body-sm`    | Figtree     | 14px | 400    |
| Title Small   | `.text-title-sm`   | Figtree     | 18px | 500    |


## Future Backend Changes Needed

Currently courses are stored only in frontend Zustand (localStorage). For production:

1. **Course CRUD API endpoints** - `/api/courses` for persistence
2. **Syllabus file upload** - `/api/courses/{id}/syllabus`
  - Store files in object storage (S3, GCS, etc.)
  - Return file URL/reference
3. **Course-Module relationship** - Already partially modeled in store
4. **User association** - "Welcome back, {userName}!" requires auth context

These are NOT blocking for the UI work but should be noted for future sprints.
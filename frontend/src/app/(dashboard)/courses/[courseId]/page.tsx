"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus, GripVertical } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseHeader, CourseModuleCard } from "@/components/courses";
import { useModules, useUpdateModule, useReorderModules } from "@/lib/hooks/use-modules";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useCourse, useCourseStudents } from "@/lib/hooks/use-courses";
import { CreateModuleWizard } from "@/components/modules/CreateModuleWizard";
import { getCoursePermissions } from "@/lib/permissions/course";
import type { ModuleResponse } from "@/lib/types/api";

// Sortable wrapper for drag-to-reorder (instructor/TA only)
function SortableModuleCard({
  module,
  courseId,
  stats,
  variant,
  goalScores,
  canReorder,
  isTeacher,
  showCompleted,
}: {
  module: ModuleResponse;
  courseId: string;
  stats: { completed: number; total: number; struggling: number };
  variant: "expanded" | "collapsed";
  goalScores?: Record<string, number>;
  canReorder: boolean;
  isTeacher?: boolean;
  showCompleted?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      {canReorder && (
        <button
          {...attributes}
          {...listeners}
          className="mt-4 p-1 text-primary/40 hover:text-primary/70 cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-5" />
        </button>
      )}
      <div className="flex-1">
        <CourseModuleCard
          module={module}
          courseId={courseId}
          stats={stats}
          variant={isDragging ? "collapsed" : variant}
          goalScores={goalScores ?? {}}
          isTeacher={isTeacher}
          showCompleted={showCompleted}
        />
      </div>
    </div>
  );
}

export default function CoursePage() {
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";

  const { moduleCourseMap } = useCoursesStore();

  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: modules, isLoading: modulesLoading } = useModules(false);
  const { data: students } = useCourseStudents(courseId);
  const updateModule = useUpdateModule();
  const reorderModules = useReorderModules();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  // Filter modules that belong to this course
  const courseModules = useMemo(
    () =>
      (modules ?? []).filter(
        (m) => m.course_id === courseId || moduleCourseMap[m.id] === courseId,
      ),
    [modules, moduleCourseMap, courseId],
  );

  // Sort by order field
  const sortedModules = useMemo(
    () => [...courseModules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [courseModules],
  );

  // Local state for optimistic DnD reordering
  const [localModules, setLocalModules] = useState<ModuleResponse[]>([]);
  useEffect(() => {
    setLocalModules(sortedModules);
  }, [sortedModules]);

  // Sync modules that are in the store but not in the backend
  useEffect(() => {
    if (!modules || !courseId) return;
    const modulesToSync = modules.filter((m) => {
      const inStoreForThisCourse = moduleCourseMap[m.id] === courseId;
      const notInBackend = !m.course_id;
      return inStoreForThisCourse && notInBackend;
    });
    modulesToSync.forEach((m) => {
      updateModule.mutate({ id: m.id, data: { course_id: courseId } });
    });
  }, [modules, courseId, moduleCourseMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const permissions = course ? getCoursePermissions(course.membership_role) : null;

  // Per-module completion stats
  const moduleStats = useMemo(() => {
    const stats: Record<string, { completed: number; total: number; struggling: number }> = {};
    for (const module of localModules) {
      const total = students?.length ?? 0;
      const completed =
        students?.filter((s) =>
          s.module_mastery.some(
            (m) => m.module_id === module.id && m.status !== "incomplete",
          ),
        ).length ?? 0;
      const struggling =
        students?.filter((s) =>
          s.module_mastery.some(
            (m) => m.module_id === module.id && m.status === "struggling",
          ),
        ).length ?? 0;
      stats[module.id] = { completed, total, struggling };
    }
    return stats;
  }, [localModules, students]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(_event: DragStartEvent) {
    setIsDragActive(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragActive(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localModules.findIndex((m) => m.id === active.id);
    const newIndex = localModules.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(localModules, oldIndex, newIndex);
    setLocalModules(reordered);

    reorderModules.mutate({
      courseId,
      modules: reordered.map((m, i) => ({ module_id: m.id, order: i + 1 })),
    });
  }

  const isLoading = courseLoading || modulesLoading;

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-800" />
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-2">Course not found</h1>
          <p className="text-muted-foreground mb-4">
            This course does not exist in the current instructor workspace.
          </p>
          <Button asChild>
            <Link href="/courses">Back to courses</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const canReorder = permissions?.canCreateModules ?? false;

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-8">
          <CourseHeader
            courseId={courseId}
            courseName={course.title}
            membershipRole={course.membership_role}
          />

          <div className="flex flex-col gap-8 items-center justify-center px-4">
            {permissions?.canCreateModules && (
              <Button size="wide" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="size-6" />
              </Button>
            )}

            {localModules.length === 0 ? (
              <p className="font-heading text-2xl font-medium tracking-[-0.48px] text-primary/80 text-center">
                No modules yet
              </p>
            ) : canReorder ? (
              /* Instructor / TA: first module expanded, rest collapsed, all draggable */
              <div className="flex flex-col gap-4 w-full">
                <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary/80">
                  Current Module
                </h2>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={localModules.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-6 w-full">
                      {localModules[0] && (
                        <SortableModuleCard
                          module={localModules[0]}
                          courseId={courseId}
                          stats={moduleStats[localModules[0].id] ?? { completed: 0, total: 0, struggling: 0 }}
                          variant={isDragActive ? "collapsed" : "expanded"}
                          canReorder={true}
                          isTeacher={true}
                        />
                      )}
                      {localModules.length > 1 && (
                        <>
                          {!isDragActive && <hr className="border-t border-dashed border-border" />}
                          {localModules.slice(1).map((module) => (
                            <SortableModuleCard
                              key={module.id}
                              module={module}
                              courseId={courseId}
                              stats={moduleStats[module.id] ?? { completed: 0, total: 0, struggling: 0 }}
                              variant="collapsed"
                              canReorder={true}
                              isTeacher={true}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            ) : (
              /* Student: "Current Module" heading, first module expanded (no goals), rest collapsed */
              <div className="flex flex-col gap-4 w-full">
                <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary/80">
                  Current Module
                </h2>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={localModules.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-6 w-full">
                      {localModules[0] && (
                        <SortableModuleCard
                          module={localModules[0]}
                          courseId={courseId}
                          stats={moduleStats[localModules[0].id] ?? { completed: 0, total: 0, struggling: 0 }}
                          variant="expanded"
                          canReorder={false}
                          isTeacher={false}
                          showCompleted={false}
                        />
                      )}
                      {localModules.length > 1 && (
                        <>
                          <hr className="border-t border-dashed border-border" />
                          {localModules.slice(1).map((module) => (
                            <SortableModuleCard
                              key={module.id}
                              module={module}
                              courseId={courseId}
                              stats={moduleStats[module.id] ?? { completed: 0, total: 0, struggling: 0 }}
                              variant="collapsed"
                              canReorder={false}
                              isTeacher={false}
                              showCompleted={false}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        </div>
      </div>

      {permissions?.canCreateModules && (
        <CreateModuleWizard
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          courseId={course.id}
        />
      )}
    </AppShell>
  );
}

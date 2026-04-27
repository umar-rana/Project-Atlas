"use client";

import { useParams } from "next/navigation";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";

export default function TagDetailPage() {
  const params = useParams<{ tagName: string }>();
  const raw = params?.tagName;
  if (!raw) return null;
  const tagName = decodeURIComponent(raw);

  return (
    <TasksShell>
      <TaskList
        perspective="tag"
        tagName={tagName}
        title={`#${tagName}`}
        description="All tasks tagged with this label."
        emptyTitle={`No tasks with #${tagName}`}
        emptyBody="Tag a task to see it here."
      />
    </TasksShell>
  );
}

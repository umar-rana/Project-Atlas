"use client";

import { useParams } from "next/navigation";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectDetailHeader } from "@/components/tasks/project-detail-header";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  if (!projectId) return null;

  return (
    <TasksShell>
      <div className="flex h-full flex-col">
        <ProjectDetailHeader projectId={projectId} />
        <div className="flex-1 overflow-hidden">
          <TaskList
            perspective="project"
            projectId={projectId}
            title=""
            emptyTitle="No tasks in this project"
            emptyBody="Add a task above to get started."
          />
        </div>
      </div>
    </TasksShell>
  );
}

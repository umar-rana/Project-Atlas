"use client";

import { useParams } from "next/navigation";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectDetailHeader } from "@/components/tasks/project-detail-header";
import { ProjectBriefDisplay } from "@/components/projects/project-brief-display";
import { ProjectNotesSection } from "@/components/projects/project-notes-section";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  if (!projectId) return null;

  return (
    <TasksShell>
      <div className="flex h-full flex-col">
        <ProjectDetailHeader projectId={projectId} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-3">
            <ProjectBriefDisplay projectId={projectId} />
          </div>
          <div className="flex-1 overflow-hidden">
            <TaskList
              perspective="project"
              projectId={projectId}
              title=""
              emptyTitle="No tasks in this project"
              emptyBody="Add a task above to get started."
            />
          </div>
          <div className="max-h-72 overflow-y-auto border-t border-border-subtle px-4 py-3">
            <ProjectNotesSection projectId={projectId} />
          </div>
        </div>
      </div>
    </TasksShell>
  );
}

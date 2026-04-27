"use client";

import { useParams } from "next/navigation";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";
import { ContextDetailHeader } from "@/components/tasks/context-detail-header";

export default function ContextDetailPage() {
  const params = useParams<{ contextId: string }>();
  const contextId = params?.contextId;

  if (!contextId) return null;

  return (
    <TasksShell>
      <div className="flex h-full flex-col">
        <ContextDetailHeader contextId={contextId} />
        <div className="flex-1 overflow-hidden">
          <TaskList
            perspective="context"
            contextId={contextId}
            title=""
            description="Tasks tagged with this context."
            emptyTitle="No tasks in this context"
            emptyBody="Tag a task with this context to see it here."
          />
        </div>
      </div>
    </TasksShell>
  );
}

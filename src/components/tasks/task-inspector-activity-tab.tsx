"use client";

import * as React from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc/client";

interface ActivityEvent {
  id: string;
  action: string;
  created_at: Date | string;
  diff: unknown;
}

interface TaskInspectorActivityTabProps {
  taskId: string;
}

export function TaskInspectorActivityTab({ taskId }: TaskInspectorActivityTabProps) {
  const activity = trpc.tasks.activity.useQuery({ id: taskId, limit: 30 });
  const events: ActivityEvent[] = activity.data ?? [];

  if (events.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-3">
        <p className="font-ui text-2xs text-text-tertiary">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <ol className="flex flex-col gap-2">
        {events.map((a) => (
          <li key={a.id} className="rounded-sm border border-border-subtle p-2 font-ui text-2xs">
            <div className="flex items-center justify-between text-text-tertiary">
              <span className="font-medium uppercase tracking-caps">{a.action}</span>
              <time>{format(new Date(a.created_at), "MMM d, HH:mm")}</time>
            </div>
            {a.diff ? (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-text-secondary">
                {JSON.stringify(a.diff, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";
import { TodayEventsWidget } from "@/components/calendar/today-events-widget";

export default function TodayPage() {
  return (
    <TasksShell>
      <div className="flex h-full flex-col overflow-hidden">
        <TodayEventsWidget />
        <div className="flex-1 overflow-auto">
          <TaskList
            perspective="today"
            title="Today"
            description="Due today, deferred to today, or flagged."
            emptyTitle="Nothing due today"
            emptyBody="Looking good. Capture something or jump to your inbox."
          />
        </div>
      </div>
    </TasksShell>
  );
}

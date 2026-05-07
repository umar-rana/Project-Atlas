"use client";

import * as React from "react";
import { isToday, isYesterday } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { WorklogEntry } from "./worklog-entry";
import { WorklogCreateForm } from "./worklog-create-form";
import { useLocale } from "@/core/locale/hooks";
import { formatDate, formatTime } from "@/core/locale/formatters";
import type { LocaleSettings } from "@/core/locale/formatters";

interface TaskInspectorActivityTabProps {
  taskId: string;
}

function formatTimestamp(date: Date | string, locale: LocaleSettings): string {
  const d = new Date(date);
  const timePart = formatTime(d, locale);
  if (isToday(d)) return `Today ${timePart}`;
  if (isYesterday(d)) return `Yesterday ${timePart}`;
  return `${formatDate(d, locale)} ${timePart}`;
}

export function TaskInspectorActivityTab({ taskId }: TaskInspectorActivityTabProps) {
  const locale = useLocale();
  const utils = trpc.useUtils();

  const feed = trpc.worklogs.feed.useQuery({ task_id: taskId, limit: 100 });
  const createMutation = trpc.worklogs.create.useMutation({
    onSuccess: () => {
      void utils.worklogs.feed.invalidate({ task_id: taskId });
      setShowForm(false);
    },
  });
  const updateMutation = trpc.worklogs.update.useMutation({
    onSuccess: () => {
      void utils.worklogs.feed.invalidate({ task_id: taskId });
      setEditingId(null);
    },
  });
  const deleteMutation = trpc.worklogs.delete.useMutation({
    onSuccess: () => {
      void utils.worklogs.feed.invalidate({ task_id: taskId });
    },
  });

  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const items = feed.data ?? [];

  const editingEntry = editingId
    ? items.find((i) => i.type === "worklog" && i.id === editingId)
    : null;
  const editingWorklog = editingEntry?.type === "worklog" ? editingEntry : null;

  function handleSaveNew(body: string, durationMinutes: number | null) {
    createMutation.mutate({ task_id: taskId, body, duration_minutes: durationMinutes });
  }

  function handleSaveEdit(body: string, durationMinutes: number | null) {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, body, duration_minutes: durationMinutes });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate({ id });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        {showForm && !editingId ? (
          <WorklogCreateForm
            onSave={handleSaveNew}
            onCancel={() => setShowForm(false)}
            saving={createMutation.isPending}
          />
        ) : (
          <button
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
            }}
            className="hover:bg-bg-hover flex items-center gap-1 rounded px-1.5 py-1 font-ui text-xs text-text-secondary hover:text-text-primary"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            Add update
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {feed.isLoading ? (
          <p className="font-ui text-2xs text-text-tertiary">Loading activity…</p>
        ) : items.length === 0 ? (
          <p className="font-ui text-2xs text-text-tertiary">No activity yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((item) => {
              if (item.type === "worklog" && editingId === item.id) {
                return (
                  <li key={item.id}>
                    <WorklogCreateForm
                      initialBody={editingWorklog?.body ?? ""}
                      initialDurationMinutes={editingWorklog?.duration_minutes ?? null}
                      onSave={handleSaveEdit}
                      onCancel={() => setEditingId(null)}
                      saving={updateMutation.isPending}
                    />
                  </li>
                );
              }

              if (item.type === "worklog") {
                return (
                  <li key={item.id}>
                    <div className="mb-0.5 font-ui text-2xs text-text-tertiary">
                      {formatTimestamp(item.created_at, locale)}
                    </div>
                    <WorklogEntry
                      id={item.id}
                      body={item.body}
                      durationMinutes={item.duration_minutes}
                      onEdit={(id) => {
                        setShowForm(false);
                        setEditingId(id);
                      }}
                      onDelete={handleDelete}
                    />
                  </li>
                );
              }

              return (
                <li key={item.id} className="flex gap-2">
                  <div className="bg-bg-subtle mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-tertiary">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm.5 2h-1v3.25l2.5 1.5.5-.87-2-1.2V5.5z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-xs text-text-secondary">{item.sentence}</p>
                    <p className="mt-0.5 font-ui text-2xs text-text-tertiary">
                      {formatTimestamp(item.created_at, locale)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

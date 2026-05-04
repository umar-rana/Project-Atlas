"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface ParserProposal {
  title?: string;
  project_hint?: string | null;
}

interface DispositionProjectFormProps {
  captureId: string;
  rawText: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

type ProjectMode = "existing" | "new";
type TargetType = "task" | "note" | "brief";
type ProjectType = "project" | "area";

export function DispositionProjectForm({
  captureId,
  rawText,
  proposal,
  onConfirm,
  onCancel,
}: DispositionProjectFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery({ status: "active" }, { staleTime: 60_000 });

  const [mode, setMode] = React.useState<ProjectMode>("existing");
  const [existingProjectId, setExistingProjectId] = React.useState("");
  const [newProjectName, setNewProjectName] = React.useState("");
  const [newProjectType, setNewProjectType] = React.useState<ProjectType>("project");
  const [targetType, setTargetType] = React.useState<TargetType>("task");
  const [title, setTitle] = React.useState(proposal?.title ?? rawText.slice(0, 80));

  React.useEffect(() => {
    if (!proposal) return;
    if (proposal.title) setTitle(proposal.title);
    if (proposal.project_hint && projects.data) {
      const match = projects.data.find(
        (p) => p.title.toLowerCase() === (proposal.project_hint ?? "").toLowerCase(),
      );
      if (match) {
        setMode("existing");
        setExistingProjectId(match.id);
      } else if (proposal.project_hint) {
        setMode("new");
        setNewProjectName(proposal.project_hint);
      }
    }
  }, [proposal, projects.data]);

  const mut = trpc.capture.processToProject.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.projects.list.invalidate();
      onConfirm();
    },
  });

  function submit() {
    if (!title.trim()) return;
    if (mode === "existing" && !existingProjectId) return;
    if (mode === "new" && !newProjectName.trim()) return;

    mut.mutate({
      capture_id: captureId,
      existing_project_id: mode === "existing" ? existingProjectId : undefined,
      new_project_name: mode === "new" ? newProjectName.trim() : undefined,
      new_project_type: mode === "new" ? newProjectType : undefined,
      target_type: targetType,
      title: title.trim(),
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA" && target.tagName !== "SELECT") {
        e.preventDefault();
        submit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  const inputCls = "w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus";
  const labelCls = "mb-1 block font-ui text-2xs font-medium text-text-secondary";
  const chipCls = (active: boolean) => cn(
    "rounded-full border px-3 py-1 font-ui text-xs transition-colors",
    active
      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
      : "border-border-default text-text-secondary hover:bg-surface-hover",
  );

  const canSubmit = title.trim() && (
    (mode === "existing" && !!existingProjectId) ||
    (mode === "new" && !!newProjectName.trim())
  );

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKey}>
      <div>
        <label className={labelCls}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="Title…"
        />
      </div>

      <div>
        <label className={labelCls}>Project</label>
        <div className="flex gap-2 mb-2">
          {(["existing", "new"] as ProjectMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={chipCls(mode === m)}
            >
              {m === "existing" ? "Existing project" : "Create new project"}
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <select
            value={existingProjectId}
            onChange={(e) => setExistingProjectId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select a project…</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className={inputCls}
              placeholder="New project name…"
            />
            <div>
              <label className={labelCls}>Project type</label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "project" as ProjectType, label: "Project" },
                    { value: "area" as ProjectType, label: "Area of Responsibility" },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewProjectType(opt.value)}
                    className={chipCls(newProjectType === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Add as</label>
        <div className="flex gap-2">
          {(
            [
              { value: "task", label: "Task" },
              { value: "note", label: "Note" },
              { value: "brief", label: "Project Brief" },
            ] as { value: TargetType; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTargetType(opt.value)}
              className={chipCls(targetType === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <button type="button" onClick={onCancel} className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={mut.isPending || !canSubmit} className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50">
          {mut.isPending ? "Creating…" : "Confirm ↵"}
        </button>
      </div>
    </div>
  );
}

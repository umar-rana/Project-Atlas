"use client";

import * as React from "react";
import { Pencil, GitMerge, Check, X, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { displayType } from "@/core/projects/type-suggestions";
import { validateProjectType, normalizeProjectType } from "@/core/projects/type-validation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TypeCount {
  type: string;
  count: number;
}

type Mode = { kind: "idle" } | { kind: "rename"; type: string } | { kind: "merge"; source: string };

export function ManageTypesDialog({
  open,
  onOpenChange,
  typeCounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  typeCounts: TypeCount[];
}) {
  const [mode, setMode] = React.useState<Mode>({ kind: "idle" });
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = React.useState<string | null>(null);

  const utils = trpc.useUtils();

  const renameType = trpc.projects.renameType.useMutation({
    onSuccess: () => {
      utils.projects.distinctTypes.invalidate();
      utils.projects.list.invalidate();
      setMode({ kind: "idle" });
      setRenameValue("");
      setRenameError(null);
    },
  });

  const mergeTypes = trpc.projects.mergeTypes.useMutation({
    onSuccess: () => {
      utils.projects.distinctTypes.invalidate();
      utils.projects.list.invalidate();
      setMode({ kind: "idle" });
      setMergeTarget(null);
    },
  });

  function startRename(type: string) {
    setMode({ kind: "rename", type });
    setRenameValue(displayType(type));
    setRenameError(null);
  }

  function startMerge(source: string) {
    setMode({ kind: "merge", source });
    setMergeTarget(null);
  }

  function cancelMode() {
    setMode({ kind: "idle" });
    setRenameValue("");
    setRenameError(null);
    setMergeTarget(null);
  }

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind !== "rename") return;
    const { valid, error } = validateProjectType(renameValue);
    if (!valid) {
      setRenameError(error ?? "Invalid type");
      return;
    }
    const normalized = normalizeProjectType(renameValue);
    if (normalized === mode.type) {
      cancelMode();
      return;
    }
    renameType.mutate({ from: mode.type, to: normalized });
  }

  function handleMergeConfirm() {
    if (mode.kind !== "merge" || !mergeTarget) return;
    mergeTypes.mutate({ source: mode.source, target: mergeTarget });
  }

  const mergeTargets = typeCounts.filter(
    (t) => mode.kind === "merge" && t.type !== mode.source,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Manage project types</DialogTitle>
        </DialogHeader>

        <div className="mt-1 text-text-secondary font-ui text-xs">
          Rename a type across all projects, or merge one type into another.
        </div>

        {typeCounts.length === 0 ? (
          <div className="py-8 text-center font-ui text-sm text-text-disabled">
            No project types yet
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle rounded-md border border-border-default">
            {typeCounts.map(({ type, count }) => {
              const isRenaming = mode.kind === "rename" && mode.type === type;
              const isMerging = mode.kind === "merge" && mode.source === type;

              const isBuiltIn = type === "project" || type === "goal";

              return (
                <li key={type} className="px-3 py-2">
                  {isRenaming ? (
                    <form onSubmit={handleRenameSubmit} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => {
                            setRenameValue(e.target.value);
                            setRenameError(null);
                          }}
                          maxLength={32}
                          className="flex-1 rounded-sm border border-border-default bg-surface-base px-2 py-0.5 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
                        />
                        <button
                          type="submit"
                          disabled={renameType.isPending || !renameValue.trim()}
                          className="rounded-sm bg-accent-primary p-1 text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
                          title="Confirm rename"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelMode}
                          className="rounded-sm border border-border-default p-1 text-text-secondary hover:bg-surface-hover"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {renameError && (
                        <p className="font-ui text-2xs text-accent-danger">{renameError}</p>
                      )}
                      <p className="font-ui text-2xs text-text-disabled">
                        Renames &quot;{displayType(type)}&quot; across all {count} project{count !== 1 ? "s" : ""}
                      </p>
                    </form>
                  ) : isMerging ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5">
                        <GitMerge size={12} className="shrink-0 text-accent-primary" />
                        <span className="font-ui text-xs font-medium text-text-primary">
                          Merge &quot;{displayType(type)}&quot; into…
                        </span>
                        <button
                          type="button"
                          onClick={cancelMode}
                          className="ml-auto rounded-sm border border-border-default p-0.5 text-text-secondary hover:bg-surface-hover"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {mergeTargets.map(({ type: tgt, count: tgtCount }) => (
                          <button
                            key={tgt}
                            type="button"
                            onClick={() => setMergeTarget(tgt === mergeTarget ? null : tgt)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-ui text-2xs font-medium transition-colors",
                              mergeTarget === tgt
                                ? "bg-accent-primary text-text-on-accent"
                                : "border border-border-default text-text-secondary hover:bg-surface-hover",
                            )}
                          >
                            {displayType(tgt)}
                            <span className={cn(
                              "font-mono text-3xs tabular-nums",
                              mergeTarget === tgt ? "text-text-on-accent opacity-70" : "text-text-disabled",
                            )}>
                              {tgtCount}
                            </span>
                          </button>
                        ))}
                      </div>
                      {mergeTarget && (
                        <div className="flex items-start gap-1.5 rounded-sm bg-surface-raised px-2 py-1.5">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-accent-warning" />
                          <p className="font-ui text-2xs text-text-secondary">
                            All {count} project{count !== 1 ? "s" : ""} in &quot;{displayType(type)}&quot; will move to &quot;{displayType(mergeTarget)}&quot;. This cannot be undone.
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={!mergeTarget || mergeTypes.isPending}
                        onClick={handleMergeConfirm}
                        className="self-start rounded-sm bg-accent-primary px-2.5 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
                      >
                        {mergeTypes.isPending ? "Merging…" : "Merge"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-ui text-sm text-text-primary">
                        {displayType(type)}
                      </span>
                      <span className="font-mono text-2xs text-text-disabled tabular-nums">
                        {count}
                      </span>
                      <div className={cn("flex items-center gap-1", mode.kind !== "idle" && !isBuiltIn && "opacity-30 pointer-events-none")}>
                        <span
                          title={isBuiltIn ? `"${type}" is a built-in type and cannot be renamed` : undefined}
                          className={cn(isBuiltIn && "cursor-default")}
                        >
                          <button
                            type="button"
                            onClick={() => startRename(type)}
                            disabled={mode.kind !== "idle" || isBuiltIn}
                            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary disabled:pointer-events-none disabled:opacity-30"
                            title={isBuiltIn ? undefined : "Rename type"}
                          >
                            <Pencil size={12} />
                          </button>
                        </span>
                        {typeCounts.length > 1 && (
                          <span
                            title={isBuiltIn ? `"${type}" is a built-in type and cannot be merged` : undefined}
                            className={cn(isBuiltIn && "cursor-default")}
                          >
                            <button
                              type="button"
                              onClick={() => startMerge(type)}
                              disabled={mode.kind !== "idle" || isBuiltIn}
                              className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary disabled:pointer-events-none disabled:opacity-30"
                              title={isBuiltIn ? undefined : "Merge into another type"}
                            >
                              <GitMerge size={12} />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

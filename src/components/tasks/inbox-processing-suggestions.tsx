"use client";

import * as React from "react";
import { Sparkles, Check, ChevronDown, ChevronRight, Tag } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

interface InboxProcessingSuggestionsProps {
  taskId: string;
  currentProjectId: string | null;
  currentContextIds: string[];
  currentTagIds: string[];
  onProjectAccepted?: (projectId: string) => void;
  onContextAccepted?: (contextIds: string[]) => void;
  onTagAccepted?: (tagIds: string[]) => void;
  disabled?: boolean;
}

export function InboxProcessingSuggestions({
  taskId,
  currentProjectId,
  currentContextIds,
  currentTagIds,
  onProjectAccepted,
  onContextAccepted,
  onTagAccepted,
  disabled,
}: InboxProcessingSuggestionsProps): React.ReactElement | null {
  const utils = trpc.useUtils();

  const { data: parseLog } = trpc.capture.getLogForTask.useQuery(
    { task_id: taskId },
    { staleTime: 30_000 },
  );
  const projects = trpc.projects.list.useQuery({ status: "active" }, { staleTime: 60_000 });
  const contexts = trpc.contexts.list.useQuery(undefined, { staleTime: 60_000 });
  const tags = trpc.tags.list.useQuery({ limit: 500 }, { staleTime: 60_000 });

  const logOverride = trpc.capture.logParseOverride.useMutation();
  const updateTask = trpc.tasks.update.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
    },
  });
  const tagCreate = trpc.tags.create.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
  });
  const contextCreate = trpc.contexts.create.useMutation({
    onSuccess: () => utils.contexts.list.invalidate(),
  });

  const [collapsed, setCollapsed] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());
  const [differentOpen, setDifferentOpen] = React.useState<string | null>(null);
  const [differentProjectId, setDifferentProjectId] = React.useState("");
  const [differentContexts, setDifferentContexts] = React.useState("");
  const [differentTags, setDifferentTags] = React.useState("");
  const [pickWhichOpen, setPickWhichOpen] = React.useState(false);
  const [pickedNewTags, setPickedNewTags] = React.useState<Set<string>>(new Set());

  if (!parseLog) return null;

  const suggestions: Array<{
    key: string;
    label: string;
    hint: string;
    type: "project" | "context" | "tag" | "new_tag";
    ids?: string[];
    newNames?: string[];
    projectId?: string;
  }> = [];

  if (parseLog.project_hint && !currentProjectId) {
    const matchedProject = (projects.data ?? []).find(
      (p) => p.title.toLowerCase() === parseLog.project_hint!.toLowerCase(),
    );
    suggestions.push({
      key: "project",
      label: "Project",
      hint: parseLog.project_hint,
      type: "project",
      projectId: matchedProject?.id,
    });
  }

  if (parseLog.contexts.length > 0) {
    const pendingContextNames = parseLog.contexts.filter((cName: string) => {
      const ctx = (contexts.data ?? []).find((c) => c.name.toLowerCase() === cName.toLowerCase());
      return !ctx || !currentContextIds.includes(ctx.id);
    });
    if (pendingContextNames.length > 0) {
      const existingIds = pendingContextNames
        .map(
          (cName: string) =>
            (contexts.data ?? []).find((c) => c.name.toLowerCase() === cName.toLowerCase())?.id,
        )
        .filter((id): id is string => !!id);
      const newNames = pendingContextNames.filter(
        (cName: string) =>
          !(contexts.data ?? []).some((c) => c.name.toLowerCase() === cName.toLowerCase()),
      );
      suggestions.push({
        key: "contexts",
        label: "Contexts",
        hint: pendingContextNames.map((n: string) => `@${n}`).join(", "),
        type: "context",
        ids: existingIds,
        newNames,
      });
    }
  }

  if (parseLog.tags.length > 0) {
    const pendingTagNames = parseLog.tags.filter((tName: string) => {
      const t = (tags.data ?? []).find((tag) => tag.name.toLowerCase() === tName.toLowerCase());
      return !t || !currentTagIds.includes(t.id);
    });
    if (pendingTagNames.length > 0) {
      // Split into: already-existing (unapplied) vs brand-new (AI-suggested, never created)
      const existingUnappliedNames = pendingTagNames.filter((tName: string) =>
        (tags.data ?? []).some((t) => t.name.toLowerCase() === tName.toLowerCase()),
      );
      const brandNewNames = pendingTagNames.filter(
        (tName: string) =>
          !(tags.data ?? []).some((t) => t.name.toLowerCase() === tName.toLowerCase()),
      );

      // Existing but unapplied: show as normal "Apply tags" suggestion
      if (existingUnappliedNames.length > 0) {
        const existingIds = existingUnappliedNames
          .map(
            (tName: string) =>
              (tags.data ?? []).find((tag) => tag.name.toLowerCase() === tName.toLowerCase())?.id,
          )
          .filter((id): id is string => !!id);
        suggestions.push({
          key: "tags",
          label: "Tags",
          hint: existingUnappliedNames.map((n: string) => `#${n}`).join(", "),
          type: "tag",
          ids: existingIds,
          newNames: [],
        });
      }

      // Brand-new AI-suggested tags: show as "Create new tags" suggestion
      if (brandNewNames.length > 0) {
        suggestions.push({
          key: "new_tags",
          label: "Create new tags",
          hint: brandNewNames.map((n: string) => `#${n}`).join(" "),
          type: "new_tag",
          ids: [],
          newNames: brandNewNames,
        });
      }
    }
  }

  const activeSuggestions = suggestions.filter(
    (s) => !dismissed.has(s.key) && !accepted.has(s.key),
  );

  if (activeSuggestions.length === 0) return null;

  const tier =
    parseLog.parse_tier === "local_only"
      ? "local"
      : parseLog.parse_tier === "local_plus_ai"
        ? "local+AI"
        : "AI";
  const confidence = parseLog.local_confidence;

  async function resolveOrCreateContext(name: string): Promise<string | null> {
    const freshList = await utils.contexts.list.fetch();
    const race = freshList.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (race) return race.id;
    try {
      const created = await contextCreate.mutateAsync({ name });
      return created.id;
    } catch {
      return null;
    }
  }

  async function resolveOrCreateTag(name: string): Promise<string | null> {
    const lower = name.toLowerCase();
    const freshList = await utils.tags.list.fetch({ limit: 500 });
    const race = freshList.find((t) => t.name.toLowerCase() === lower);
    if (race) return race.id;
    try {
      const created = await tagCreate.mutateAsync({ name: lower });
      return created.id;
    } catch {
      return null;
    }
  }

  function optimisticAccept(key: string) {
    setAccepted((prev) => new Set([...prev, key]));
  }

  function rollbackAccept(key: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function handleAccept(s: (typeof suggestions)[number]) {
    if (disabled) return;
    if (s.type === "project" && s.projectId) {
      optimisticAccept(s.key);
      try {
        await updateTask.mutateAsync({ id: taskId, project_id: s.projectId });
        onProjectAccepted?.(s.projectId);
      } catch {
        rollbackAccept(s.key);
        toast.error("Could not apply project — please try again.");
      }
    } else if (s.type === "context") {
      const createdIds: string[] = [];
      const failed: string[] = [];
      for (const name of s.newNames ?? []) {
        const id = await resolveOrCreateContext(name);
        if (id) createdIds.push(id);
        else failed.push(name);
      }
      if (failed.length > 0) {
        toast.error(
          `Could not create context${failed.length > 1 ? "s" : ""}: ${failed.map((n) => `@${n}`).join(", ")}`,
        );
        return;
      }
      const allIds = [...(s.ids ?? []), ...createdIds];
      const next = [...new Set([...currentContextIds, ...allIds])];
      optimisticAccept(s.key);
      try {
        await updateTask.mutateAsync({ id: taskId, context_ids: next });
        onContextAccepted?.(next);
      } catch {
        rollbackAccept(s.key);
        toast.error("Could not apply contexts — please try again.");
      }
    } else if (s.type === "tag") {
      const createdIds: string[] = [];
      const failed: string[] = [];
      for (const name of s.newNames ?? []) {
        const id = await resolveOrCreateTag(name);
        if (id) createdIds.push(id);
        else failed.push(name);
      }
      if (failed.length > 0) {
        toast.error(
          `Could not create tag${failed.length > 1 ? "s" : ""}: ${failed.map((n) => `#${n}`).join(", ")}`,
        );
        return;
      }
      const allIds = [...(s.ids ?? []), ...createdIds];
      const next = [...new Set([...currentTagIds, ...allIds])];
      optimisticAccept(s.key);
      try {
        await updateTask.mutateAsync({ id: taskId, tag_ids: next });
        onTagAccepted?.(next);
      } catch {
        rollbackAccept(s.key);
        toast.error("Could not apply tags — please try again.");
      }
    } else if (s.type === "new_tag") {
      // Accept all: create every suggested new tag and apply to the task
      const namesToCreate = s.newNames ?? [];
      const createdIds: string[] = [];
      const failed: string[] = [];
      for (const name of namesToCreate) {
        const id = await resolveOrCreateTag(name);
        if (id) createdIds.push(id);
        else failed.push(name);
      }
      if (failed.length > 0) {
        toast.error(
          `Could not create tag${failed.length > 1 ? "s" : ""}: ${failed.map((n) => `#${n}`).join(", ")}`,
        );
        return;
      }
      const newTagsNext = [...new Set([...currentTagIds, ...createdIds])];
      optimisticAccept(s.key);
      try {
        await updateTask.mutateAsync({ id: taskId, tag_ids: newTagsNext });
        onTagAccepted?.(newTagsNext);
        setPickWhichOpen(false);
      } catch {
        rollbackAccept(s.key);
        toast.error("Could not create tags — please try again.");
      }
    }
  }

  async function handleAcceptPickedNewTags(s: (typeof suggestions)[number]) {
    if (disabled || s.type !== "new_tag") return;
    const namesToCreate = (s.newNames ?? []).filter((n) => pickedNewTags.has(n));
    if (namesToCreate.length === 0) return;
    const createdIds: string[] = [];
    const failed: string[] = [];
    for (const name of namesToCreate) {
      const id = await resolveOrCreateTag(name);
      if (id) createdIds.push(id);
      else failed.push(name);
    }
    if (failed.length > 0) {
      toast.error(
        `Could not create tag${failed.length > 1 ? "s" : ""}: ${failed.map((n) => `#${n}`).join(", ")}`,
      );
      return;
    }
    const next = [...new Set([...currentTagIds, ...createdIds])];
    optimisticAccept(s.key);
    try {
      await updateTask.mutateAsync({ id: taskId, tag_ids: next });
      onTagAccepted?.(next);
      setPickWhichOpen(false);
      setPickedNewTags(new Set());
    } catch {
      rollbackAccept(s.key);
      toast.error("Could not create tags — please try again.");
    }
  }

  function handleDifferentOpen(s: (typeof suggestions)[number]) {
    setDifferentOpen(s.key === differentOpen ? null : s.key);
    if (s.type === "project") setDifferentProjectId("");
    if (s.type === "context") setDifferentContexts("");
    if (s.type === "tag") setDifferentTags("");
  }

  async function handleDifferentApply(s: (typeof suggestions)[number]) {
    if (disabled) return;
    if (s.type === "project" && differentProjectId) {
      try {
        await updateTask.mutateAsync({ id: taskId, project_id: differentProjectId });
        logOverride.mutate({
          task_id: taskId,
          field: "project",
          original: s.hint,
          new_value:
            (projects.data ?? []).find((p) => p.id === differentProjectId)?.title ??
            differentProjectId,
        });
        onProjectAccepted?.(differentProjectId);
        setAccepted((prev) => new Set([...prev, s.key]));
        setDifferentOpen(null);
      } catch {
        toast.error("Could not apply project — please try again.");
      }
    } else if (s.type === "context" && differentContexts.trim()) {
      const typedNames = differentContexts
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const resolvedIds: string[] = [];
      const failed: string[] = [];
      for (const name of typedNames) {
        const id = await resolveOrCreateContext(name);
        if (id) resolvedIds.push(id);
        else failed.push(name);
      }
      if (failed.length > 0) {
        toast.error(
          `Could not create context${failed.length > 1 ? "s" : ""}: ${failed.map((n) => `@${n}`).join(", ")}`,
        );
        return;
      }
      if (resolvedIds.length > 0) {
        const next = [...new Set([...currentContextIds, ...resolvedIds])];
        try {
          await updateTask.mutateAsync({ id: taskId, context_ids: next });
          logOverride.mutate({
            task_id: taskId,
            field: "contexts",
            original: s.hint,
            new_value: typedNames.map((n) => `@${n}`).join(", "),
          });
          onContextAccepted?.(next);
          setAccepted((prev) => new Set([...prev, s.key]));
          setDifferentOpen(null);
        } catch {
          toast.error("Could not apply contexts — please try again.");
        }
      }
    } else if (s.type === "tag" && differentTags.trim()) {
      const typedNames = differentTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const resolvedIds: string[] = [];
      const failed: string[] = [];
      for (const name of typedNames) {
        const id = await resolveOrCreateTag(name);
        if (id) resolvedIds.push(id);
        else failed.push(name);
      }
      if (failed.length > 0) {
        toast.error(
          `Could not create tag${failed.length > 1 ? "s" : ""}: ${failed.map((n) => `#${n}`).join(", ")}`,
        );
        return;
      }
      if (resolvedIds.length > 0) {
        const next = [...new Set([...currentTagIds, ...resolvedIds])];
        try {
          await updateTask.mutateAsync({ id: taskId, tag_ids: next });
          logOverride.mutate({
            task_id: taskId,
            field: "tags",
            original: s.hint,
            new_value: typedNames.map((n) => `#${n}`).join(", "),
          });
          onTagAccepted?.(next);
          setAccepted((prev) => new Set([...prev, s.key]));
          setDifferentOpen(null);
        } catch {
          toast.error("Could not apply tags — please try again.");
        }
      }
    }
  }

  function handleDismiss(key: string) {
    setDismissed((prev) => new Set([...prev, key]));
    if (differentOpen === key) setDifferentOpen(null);
  }

  return (
    <section className="border-accent-info/30 bg-accent-info/5 mt-3 rounded-md border p-2.5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5"
      >
        <Sparkles size={11} className="text-accent-info" aria-hidden />
        <span className="font-ui text-2xs font-semibold text-accent-info">Suggestions</span>
        <span className="ml-auto flex items-center gap-1 font-ui text-2xs text-text-tertiary">
          {tier} · {(confidence * 100).toFixed(0)}%
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {activeSuggestions.map((s) => (
            <div key={s.key} className="flex flex-col gap-1">
              {s.type === "new_tag" ? (
                // Special rendering for AI-suggested new tags
                <div className="flex flex-col gap-1 rounded-sm bg-surface-base px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <Tag size={9} className="shrink-0 text-accent-info" aria-hidden />
                      <span className="font-ui text-2xs text-text-tertiary">Create new tags: </span>
                      <span className="truncate font-ui text-2xs font-medium text-text-primary">
                        {s.hint}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void handleAccept(s);
                        }}
                        disabled={disabled || updateTask.isPending || tagCreate.isPending}
                        className={cn(
                          "border-accent-success/40 bg-accent-success/10 flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5 font-ui text-2xs font-medium text-accent-success",
                          "hover:bg-accent-success/20 disabled:cursor-not-allowed disabled:opacity-40",
                        )}
                      >
                        <Check size={9} />
                        Accept all
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPickWhichOpen((v) => !v);
                          setPickedNewTags(new Set());
                        }}
                        disabled={disabled}
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:text-text-secondary",
                          pickWhichOpen
                            ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                            : "border-border-subtle hover:border-border-default",
                        )}
                      >
                        Pick which
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(s.key)}
                        disabled={disabled}
                        className="rounded-sm border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:border-border-default hover:text-text-secondary"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                  {pickWhichOpen && (
                    <div className="mt-0.5 flex flex-col gap-1 rounded border border-border-subtle bg-surface-overlay px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {(s.newNames ?? []).map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() =>
                              setPickedNewTags((prev) => {
                                const next = new Set(prev);
                                if (next.has(name)) next.delete(name);
                                else next.add(name);
                                return next;
                              })
                            }
                            className={cn(
                              "rounded-sm border px-1.5 py-0.5 font-ui text-2xs transition-colors",
                              pickedNewTags.has(name)
                                ? "border-accent-primary/50 bg-accent-primary/15 font-medium text-accent-primary"
                                : "border-border-subtle text-text-tertiary hover:border-border-default hover:text-text-secondary",
                            )}
                          >
                            #{name}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void handleAcceptPickedNewTags(s);
                          }}
                          disabled={
                            pickedNewTags.size === 0 ||
                            disabled ||
                            updateTask.isPending ||
                            tagCreate.isPending
                          }
                          className="rounded-sm bg-accent-primary px-2 py-0.5 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
                        >
                          Add selected
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPickWhichOpen(false);
                            setPickedNewTags(new Set());
                          }}
                          className="rounded-sm border border-border-subtle px-2 py-0.5 font-ui text-2xs text-text-tertiary hover:border-border-default"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Standard rendering for project, context, and existing-tag suggestions
                <div className="flex items-center justify-between gap-2 rounded-sm bg-surface-base px-2 py-1.5">
                  <div className="min-w-0">
                    <span className="font-ui text-2xs text-text-tertiary">{s.label}: </span>
                    <span className="truncate font-ui text-2xs font-medium text-text-primary">
                      {s.hint}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        void handleAccept(s);
                      }}
                      disabled={
                        disabled || updateTask.isPending || (s.type === "project" && !s.projectId)
                      }
                      title={
                        s.type === "project" && !s.projectId
                          ? `No project matches "${s.hint}" — use Different… to choose one`
                          : undefined
                      }
                      className={cn(
                        "border-accent-success/40 bg-accent-success/10 flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5 font-ui text-2xs font-medium text-accent-success",
                        "hover:bg-accent-success/20 disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <Check size={9} />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDifferentOpen(s)}
                      disabled={disabled}
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:text-text-secondary",
                        differentOpen === s.key
                          ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                          : "border-border-subtle hover:border-border-default",
                      )}
                    >
                      Different…
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(s.key)}
                      disabled={disabled}
                      className="rounded-sm border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:border-border-default hover:text-text-secondary"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {differentOpen === s.key && s.type !== "new_tag" && (
                <div className="rounded-sm border border-border-subtle bg-surface-overlay px-2 py-2">
                  {s.type === "project" && (
                    <div className="flex items-center gap-2">
                      <select
                        value={differentProjectId}
                        onChange={(e) => setDifferentProjectId(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-border-default bg-surface-base px-2 py-1 font-ui text-2xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
                      >
                        <option value="">Choose a project…</option>
                        {(projects.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDifferentApply(s);
                        }}
                        disabled={!differentProjectId || updateTask.isPending}
                        className="shrink-0 rounded-sm bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  {s.type === "context" && (
                    <div className="flex items-center gap-2">
                      <input
                        value={differentContexts}
                        onChange={(e) => setDifferentContexts(e.target.value)}
                        placeholder="context1, context2…"
                        className="min-w-0 flex-1 rounded border border-border-default bg-surface-base px-2 py-1 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void handleDifferentApply(s);
                        }}
                        disabled={!differentContexts.trim() || updateTask.isPending}
                        className="shrink-0 rounded-sm bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  {s.type === "tag" && (
                    <div className="flex items-center gap-2">
                      <input
                        value={differentTags}
                        onChange={(e) => setDifferentTags(e.target.value)}
                        placeholder="tag1, tag2…"
                        className="min-w-0 flex-1 rounded border border-border-default bg-surface-base px-2 py-1 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void handleDifferentApply(s);
                        }}
                        disabled={!differentTags.trim() || updateTask.isPending}
                        className="shrink-0 rounded-sm bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

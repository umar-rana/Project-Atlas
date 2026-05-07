"use client";

import * as React from "react";
import {
  Tag as TagIcon,
  Search,
  Trash2,
  Merge,
  MoreHorizontal,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  Palette,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { colorDotClass } from "./folder-tree-node";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";

type SortKey = "usage" | "name" | "last_used";
type SortDir = "asc" | "desc";

type TagStat = {
  id: string;
  name: string;
  usage_count: number;
  last_used_at: Date | string | null;
  color: string | null;
};

function RenameInline({ tag, onDone }: { tag: TagStat; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [value, setValue] = React.useState(tag.name);
  const rename = trpc.tags.rename.useMutation({
    onSuccess: () => {
      utils.tags.usageStats.invalidate();
      utils.tags.list.invalidate();
      utils.tasks.list.invalidate();
      toast.success("Tag renamed");
      onDone();
    },
    onError: (err) => toast.error(err.message ?? "Failed to rename tag"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === tag.name) {
      onDone();
      return;
    }
    rename.mutate({ id: tag.id, new_name: trimmed });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        size="sm"
        autoFocus
        className="h-6 w-40 text-xs"
      />
      <button
        type="submit"
        disabled={rename.isPending}
        className="inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        onClick={onDone}
        className="inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
      >
        <X size={13} />
      </button>
    </form>
  );
}

function MergeDialog({
  source,
  allTags,
  onClose,
}: {
  source: TagStat;
  allTags: TagStat[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [intoId, setIntoId] = React.useState<string>("");
  const merge = trpc.tags.merge.useMutation({
    onSuccess: () => {
      utils.tags.usageStats.invalidate();
      utils.tags.list.invalidate();
      utils.tags.count.invalidate();
      utils.tasks.list.invalidate();
      toast.success(`Merged #${source.name} into selected tag`);
      onClose();
    },
    onError: (err) => toast.error(err.message ?? "Failed to merge tags"),
  });

  const options = allTags.filter((t) => t.id !== source.id);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Merge #{source.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          All tasks tagged <strong>#{source.name}</strong> will be re-tagged with the target tag.
          The source tag will be deleted.
        </p>
        <div className="mt-2">
          <label className="mb-1 block font-ui text-xs font-medium text-text-primary">
            Merge into
          </label>
          <select
            value={intoId}
            onChange={(e) => setIntoId(e.target.value)}
            className="w-full rounded-md border border-border-default bg-surface-sunken px-2 py-1.5 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
          >
            <option value="">Select target tag…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name} ({t.usage_count})
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="md"
            disabled={!intoId || merge.isPending}
            onClick={() => merge.mutate({ from_id: source.id, into_id: intoId })}
          >
            Merge & delete #{source.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ tag, onClose }: { tag: TagStat; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.tags.delete.useMutation({
    onSuccess: () => {
      utils.tags.usageStats.invalidate();
      utils.tags.list.invalidate();
      utils.tags.count.invalidate();
      utils.tasks.list.invalidate();
      toast.success(`Deleted #${tag.name}`);
      onClose();
    },
    onError: () => toast.error("Failed to delete tag"),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Delete #{tag.name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          This tag is used on{" "}
          <strong>
            {tag.usage_count} {tag.usage_count === 1 ? "task" : "tasks"}
          </strong>
          . Deleting it will remove it from all those tasks. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="md"
            disabled={del.isPending}
            onClick={() => del.mutate({ id: tag.id })}
          >
            Delete tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteDialog({
  ids,
  allTags,
  onClose,
}: {
  ids: string[];
  allTags: TagStat[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const bulkDelete = trpc.tags.bulkDelete.useMutation({
    onSuccess: (res) => {
      utils.tags.usageStats.invalidate();
      utils.tags.list.invalidate();
      utils.tags.count.invalidate();
      utils.tasks.list.invalidate();
      toast.success(`Deleted ${res.deleted} tag${res.deleted !== 1 ? "s" : ""}`);
      onClose();
    },
    onError: () => toast.error("Failed to delete tags"),
  });

  const totalUsage = allTags
    .filter((t) => ids.includes(t.id))
    .reduce((sum, t) => sum + t.usage_count, 0);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Delete {ids.length} tags?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          These tags are used across{" "}
          <strong>
            {totalUsage} task association{totalUsage !== 1 ? "s" : ""}
          </strong>
          . Deleting them will remove them from all affected tasks. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="md"
            disabled={bulkDelete.isPending}
            onClick={() => bulkDelete.mutate({ ids })}
          >
            Delete {ids.length} tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkMergeDialog({
  ids,
  allTags,
  onClose,
}: {
  ids: string[];
  allTags: TagStat[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [intoId, setIntoId] = React.useState<string>("");
  const merge = trpc.tags.merge.useMutation();

  async function handleMerge() {
    if (!intoId) return;
    const sources = ids.filter((id) => id !== intoId);
    let succeeded = 0;
    const errors: string[] = [];
    for (const from_id of sources) {
      try {
        await merge.mutateAsync({ from_id, into_id: intoId });
        succeeded++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(msg);
      }
    }
    utils.tags.usageStats.invalidate();
    utils.tags.list.invalidate();
    utils.tags.count.invalidate();
    utils.tasks.list.invalidate();
    if (errors.length === 0) {
      toast.success(`Merged ${succeeded} tag${succeeded !== 1 ? "s" : ""}`);
      onClose();
    } else if (succeeded > 0) {
      toast.error(
        `Merged ${succeeded} tag${succeeded !== 1 ? "s" : ""}, but ${errors.length} failed: ${errors[0]}`,
      );
      onClose();
    } else {
      toast.error(`Merge failed: ${errors[0]}`);
    }
  }

  const options = allTags.filter((t) => ids.includes(t.id));

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Merge {ids.length} tags</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          All selected tags will be merged into the target tag. Source tags will be deleted.
        </p>
        <div className="mt-2">
          <label className="mb-1 block font-ui text-xs font-medium text-text-primary">
            Keep this tag
          </label>
          <select
            value={intoId}
            onChange={(e) => setIntoId(e.target.value)}
            className="w-full rounded-md border border-border-default bg-surface-sunken px-2 py-1.5 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
          >
            <option value="">Select tag to keep…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name} ({t.usage_count})
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!intoId || merge.isPending}
            onClick={handleMerge}
          >
            Merge tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TAG_COLORS = ["blue", "green", "amber", "red", "purple", "teal", "pink", "orange"] as const;

function CreateTagDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<string | null>(null);

  const create = trpc.tags.create.useMutation({
    onSuccess: () => {
      utils.tags.usageStats.invalidate();
      utils.tags.list.invalidate();
      utils.tags.count.invalidate();
      toast.success("Tag created");
      onClose();
    },
    onError: (err) => toast.error(err.message ?? "Failed to create tag"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, color: color ?? undefined });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Create tag</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-ui text-xs font-medium text-text-primary">Tag name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. urgent"
              autoFocus
              size="sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-ui text-xs font-medium text-text-primary">
              Color <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <div className="flex items-center gap-1.5">
              {TAG_COLORS.map((c) => (
                <Hint key={c} label={c}>
                  <button
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(color === c ? null : c)}
                    className={cn(
                      "size-5 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1",
                      colorDotClass(c),
                      color === c && "ring-2 ring-accent-primary ring-offset-1",
                    )}
                  />
                </Hint>
              ))}
              <Hint label="No color">
                <button
                  type="button"
                  aria-label="No color"
                  onClick={() => setColor(null)}
                  className={cn(
                    "size-5 rounded-full border border-dashed border-border-default bg-transparent transition-transform hover:scale-110",
                    color === null && "ring-2 ring-accent-primary ring-offset-1",
                  )}
                />
              </Hint>
              {color ? (
                <span className="ml-1 font-ui text-xs capitalize text-text-secondary">{color}</span>
              ) : (
                <span className="ml-1 font-ui text-xs text-text-tertiary">None</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={!name.trim() || create.isPending}
            >
              Create tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TagManagement(): React.ReactElement {
  const locale = useLocale();
  const stats = trpc.tags.usageStats.useQuery();
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("usage");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [mergingTag, setMergingTag] = React.useState<TagStat | null>(null);
  const [deletingTag, setDeletingTag] = React.useState<TagStat | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkMerging, setBulkMerging] = React.useState(false);
  const [cleanupExpanded, setCleanupExpanded] = React.useState(true);
  const [coloringTagId, setColoringTagId] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  const utils = trpc.useUtils();
  const updateColor = trpc.tags.update.useMutation({
    onSuccess: () => {
      utils.tags.usageStats.invalidate();
      utils.tags.list.invalidate();
      utils.tasks.list.invalidate();
      setColoringTagId(null);
      toast.success("Tag color updated");
    },
    onError: () => toast.error("Failed to update tag color"),
  });

  const allTags: TagStat[] = (stats.data ?? []) as TagStat[];

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = q ? allTags.filter((t) => t.name.includes(q)) : allTags;
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "usage") cmp = a.usage_count - b.usage_count;
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "last_used") {
        const da = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const db2 = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        cmp = da - db2;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [allTags, search, sortKey, sortDir]);

  const cleanupCandidates = React.useMemo(
    () => allTags.filter((t) => t.usage_count === 1),
    [allTags],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const SortButton = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(col)}
      className={cn(
        "inline-flex items-center gap-0.5 font-ui text-3xs font-semibold uppercase tracking-caps",
        sortKey === col ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
      )}
    >
      {label}
      {sortKey === col ? (
        <ChevronDown
          size={10}
          className={cn("transition-transform", sortDir === "asc" && "rotate-180")}
        />
      ) : null}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-subtle px-6 py-4">
        <TagIcon size={18} className="text-text-tertiary" />
        <h1 className="font-ui text-lg font-semibold text-text-primary">Manage tags</h1>
        <span className="ml-1 rounded-full bg-surface-raised px-2 py-0.5 font-mono text-2xs tabular-nums text-text-secondary">
          {allTags.length}
        </span>
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus size={13} />
          New tag
        </Button>
      </div>

      {/* Cleanup candidates section */}
      {cleanupCandidates.length > 0 ? (
        <div className="bg-surface-raised/50 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setCleanupExpanded((v) => !v)}
            className="flex w-full items-center gap-2 px-6 py-2.5 text-left"
          >
            <AlertTriangle size={13} className="shrink-0 text-accent-warning" />
            <span className="flex-1 font-ui text-xs font-medium text-text-secondary">
              {cleanupCandidates.length} single-use tag{cleanupCandidates.length !== 1 ? "s" : ""}{" "}
              (used exactly once) — review candidates
            </span>
            <ChevronDown
              size={12}
              className={cn(
                "text-text-tertiary transition-transform",
                !cleanupExpanded && "rotate-180",
              )}
            />
          </button>
          {cleanupExpanded ? (
            <div className="flex flex-wrap gap-1.5 px-6 pb-3">
              {cleanupCandidates.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border-default bg-surface-base px-2 py-0.5 font-ui text-xs text-text-secondary"
                >
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", colorDotClass(t.color))}
                    aria-hidden
                  />
                  #{t.name}
                  <span className="font-mono text-3xs text-text-tertiary">({t.usage_count})</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="flex items-center gap-2 border-b border-border-subtle bg-accent-primary-subtle px-6 py-2">
          <span className="font-ui text-xs font-medium text-text-primary">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setBulkMerging(true)}>
            <Merge size={13} />
            Merge into…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setBulkDeleting(true)}>
            <Trash2 size={13} />
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X size={13} />
            Clear
          </Button>
        </div>
      ) : null}

      {/* Search + controls */}
      <div className="flex items-center gap-3 px-6 py-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags…"
          size="sm"
          leftIcon={<Search size={13} />}
          containerClassName="flex-1"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6">
        {stats.isLoading ? (
          <p className="py-8 text-center font-ui text-sm text-text-tertiary">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center font-ui text-sm text-text-tertiary">No tags found</p>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="pb-2 pr-3 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    ref={(el) => {
                      if (el)
                        el.indeterminate = selected.size > 0 && selected.size < filtered.length;
                    }}
                    onChange={toggleAll}
                    className="size-3.5 rounded-sm accent-accent-primary"
                  />
                </th>
                <th className="pb-2 text-left">
                  <SortButton col="name" label="Tag" />
                </th>
                <th className="pb-2 pl-4 text-right">
                  <SortButton col="usage" label="Uses" />
                </th>
                <th className="pb-2 pl-4 text-right">
                  <SortButton col="last_used" label="Last used" />
                </th>
                <th className="pb-2 pl-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((tag) => (
                <tr
                  key={tag.id}
                  className={cn(
                    "group border-b border-border-subtle",
                    selected.has(tag.id) && "bg-accent-primary-subtle/40",
                  )}
                >
                  <td className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      checked={selected.has(tag.id)}
                      onChange={() => toggleOne(tag.id)}
                      className="size-3.5 rounded-sm accent-accent-primary"
                    />
                  </td>
                  <td className="py-1.5">
                    {renamingId === tag.id ? (
                      <RenameInline tag={tag} onDone={() => setRenamingId(null)} />
                    ) : coloringTagId === tag.id ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="flex items-center gap-1.5 font-ui text-sm text-text-primary">
                          <span
                            className={cn("size-2 shrink-0 rounded-full", colorDotClass(tag.color))}
                            aria-hidden
                          />
                          #{tag.name}
                        </span>
                        <div className="flex items-center gap-1">
                          {[
                            "blue",
                            "green",
                            "amber",
                            "red",
                            "purple",
                            "teal",
                            "pink",
                            "orange",
                          ].map((c) => (
                            <Hint key={c} label={c}>
                              <button
                                type="button"
                                aria-label={c}
                                onClick={() => updateColor.mutate({ id: tag.id, color: c })}
                                disabled={updateColor.isPending}
                                className={cn(
                                  "size-4 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1",
                                  colorDotClass(c),
                                  tag.color === c && "ring-2 ring-accent-primary ring-offset-1",
                                )}
                              />
                            </Hint>
                          ))}
                          <Hint label="Remove color">
                            <button
                              type="button"
                              aria-label="Remove color"
                              onClick={() => updateColor.mutate({ id: tag.id, color: null })}
                              disabled={updateColor.isPending}
                              className="size-4 rounded-full border border-dashed border-border-default bg-transparent transition-transform hover:scale-110"
                            />
                          </Hint>
                          <button
                            type="button"
                            onClick={() => setColoringTagId(null)}
                            className="ml-1 inline-flex size-5 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 font-ui text-sm text-text-primary">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", colorDotClass(tag.color))}
                          aria-hidden
                        />
                        #{tag.name}
                        {tag.usage_count === 1 ? (
                          <AlertTriangle
                            size={11}
                            className="text-accent-warning"
                            aria-label="Low use"
                          />
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pl-4 text-right font-mono text-xs tabular-nums text-text-secondary">
                    {tag.usage_count}
                  </td>
                  <td className="py-1.5 pl-4 text-right font-ui text-xs text-text-tertiary">
                    {tag.last_used_at ? localeFormatDate(tag.last_used_at, locale) : "—"}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary opacity-0 hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRenamingId(tag.id)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setColoringTagId(tag.id)}>
                          <Palette size={13} />
                          Change color
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMergingTag(tag)}>
                          <Merge size={13} />
                          Merge into…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-accent-danger focus:text-accent-danger"
                          onClick={() => setDeletingTag(tag)}
                        >
                          <Trash2 size={13} />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mergingTag ? (
        <MergeDialog source={mergingTag} allTags={allTags} onClose={() => setMergingTag(null)} />
      ) : null}
      {deletingTag ? <DeleteDialog tag={deletingTag} onClose={() => setDeletingTag(null)} /> : null}
      {bulkDeleting ? (
        <BulkDeleteDialog
          ids={Array.from(selected)}
          allTags={allTags}
          onClose={() => {
            setBulkDeleting(false);
            setSelected(new Set());
          }}
        />
      ) : null}
      {bulkMerging ? (
        <BulkMergeDialog
          ids={Array.from(selected)}
          allTags={allTags}
          onClose={() => {
            setBulkMerging(false);
            setSelected(new Set());
          }}
        />
      ) : null}
      {showCreateDialog ? <CreateTagDialog onClose={() => setShowCreateDialog(false)} /> : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { Hash, Search, Trash2, MoreHorizontal, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
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

type ContextItem = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  task_count: number;
};

const COLOR_OPTIONS = [
  { value: "red", label: "Red", cls: "bg-red-500" },
  { value: "orange", label: "Orange", cls: "bg-orange-500" },
  { value: "yellow", label: "Yellow", cls: "bg-yellow-400" },
  { value: "green", label: "Green", cls: "bg-green-500" },
  { value: "blue", label: "Blue", cls: "bg-blue-500" },
  { value: "purple", label: "Purple", cls: "bg-purple-500" },
  { value: "pink", label: "Pink", cls: "bg-pink-500" },
  { value: "gray", label: "Gray", cls: "bg-gray-400" },
];

function colorDotClass(color: string | null) {
  const match = COLOR_OPTIONS.find((c) => c.value === color);
  return match ? match.cls : "bg-gray-400";
}

function RenameInline({ context, onDone }: { context: ContextItem; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [value, setValue] = React.useState(context.name);
  const rename = trpc.contexts.rename.useMutation({
    onSuccess: () => {
      utils.contexts.list.invalidate();
      toast.success("Context renamed");
      onDone();
    },
    onError: (err) => toast.error(err.message ?? "Failed to rename context"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === context.name) {
      onDone();
      return;
    }
    rename.mutate({ id: context.id, new_name: trimmed });
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

function EditDialog({ context, onClose }: { context: ContextItem; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = React.useState(context.name);
  const [icon, setIcon] = React.useState(context.icon ?? "");
  const [color, setColor] = React.useState(context.color ?? "");
  const update = trpc.contexts.update.useMutation({
    onSuccess: () => {
      utils.contexts.list.invalidate();
      toast.success("Context updated");
      onClose();
    },
    onError: (err) => toast.error(err.message ?? "Failed to update context"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate({
      id: context.id,
      name: name.trim() || context.name,
      icon: icon.trim() || null,
      color: color || null,
    });
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
          <DialogTitle>Edit context</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-primary">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} size="md" required />
          </div>
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-primary">
              Icon <span className="text-text-tertiary">(emoji)</span>
            </label>
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              size="md"
              placeholder="e.g. 🏠"
              maxLength={4}
            />
          </div>
          <div>
            <label className="mb-2 block font-ui text-xs font-medium text-text-primary">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(color === c.value ? "" : c.value)}
                  className={cn(
                    "size-6 rounded-full transition-transform hover:scale-110",
                    c.cls,
                    color === c.value && "ring-2 ring-accent-primary ring-offset-2",
                  )}
                />
              ))}
              {color ? (
                <button
                  type="button"
                  onClick={() => setColor("")}
                  className="flex size-6 items-center justify-center rounded-full border border-border-default text-text-tertiary hover:bg-surface-hover"
                >
                  <X size={11} />
                </button>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ context, onClose }: { context: ContextItem; onClose: () => void }) {
  const utils = trpc.useUtils();
  const del = trpc.contexts.delete.useMutation({
    onSuccess: () => {
      utils.contexts.list.invalidate();
      toast.success(`Deleted context "${context.name}"`);
      onClose();
    },
    onError: () => toast.error("Failed to delete context"),
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
          <DialogTitle>Delete &quot;{context.name}&quot;?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          This context is used on{" "}
          <strong>
            {context.task_count} {context.task_count === 1 ? "task" : "tasks"}
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
            onClick={() => del.mutate({ id: context.id })}
          >
            Delete context
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddContextInline({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = React.useState("");
  const create = trpc.contexts.create.useMutation({
    onSuccess: () => {
      utils.contexts.list.invalidate();
      toast.success("Context added");
      onDone();
    },
    onError: (err) => toast.error(err.message ?? "Failed to add context"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-6 py-2">
      <Hash size={14} className="text-text-tertiary" />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        size="sm"
        placeholder="Context name…"
        autoFocus
        className="flex-1"
      />
      <Button variant="primary" size="sm" type="submit" disabled={create.isPending || !name.trim()}>
        Add
      </Button>
      <Button variant="ghost" size="sm" type="button" onClick={onDone}>
        <X size={13} />
      </Button>
    </form>
  );
}

export function ContextManagement(): React.ReactElement {
  const contexts = trpc.contexts.list.useQuery();
  const [search, setSearch] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [editingContext, setEditingContext] = React.useState<ContextItem | null>(null);
  const [deletingContext, setDeletingContext] = React.useState<ContextItem | null>(null);
  const [addingContext, setAddingContext] = React.useState(false);

  const allContexts: ContextItem[] = (contexts.data ?? []) as ContextItem[];

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? allContexts.filter((c) => c.name.toLowerCase().includes(q)) : allContexts;
  }, [allContexts, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-subtle px-6 py-4">
        <Hash size={18} className="text-text-tertiary" />
        <h1 className="font-ui text-lg font-semibold text-text-primary">Manage contexts</h1>
        <span className="ml-1 rounded-full bg-surface-raised px-2 py-0.5 font-mono text-2xs tabular-nums text-text-secondary">
          {allContexts.length}
        </span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 px-6 py-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contexts…"
          size="sm"
          leftIcon={<Search size={13} />}
          containerClassName="flex-1"
        />
        <Button variant="secondary" size="sm" onClick={() => setAddingContext(true)}>
          <Plus size={13} />
          Add context
        </Button>
      </div>

      {addingContext ? <AddContextInline onDone={() => setAddingContext(false)} /> : null}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6">
        {contexts.isLoading ? (
          <p className="py-8 text-center font-ui text-sm text-text-tertiary">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center font-ui text-sm text-text-tertiary">No contexts found</p>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="pb-2 text-left font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Context
                </th>
                <th className="pb-2 pl-4 text-right font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
                  Tasks
                </th>
                <th className="pb-2 pl-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ctx) => (
                <tr key={ctx.id} className="group border-b border-border-subtle">
                  <td className="py-2">
                    {renamingId === ctx.id ? (
                      <RenameInline context={ctx} onDone={() => setRenamingId(null)} />
                    ) : (
                      <span className="flex items-center gap-2 font-ui text-sm text-text-primary">
                        {ctx.icon ? (
                          <span className="text-base leading-none">{ctx.icon}</span>
                        ) : (
                          <span
                            className={cn(
                              "size-2.5 shrink-0 rounded-full",
                              colorDotClass(ctx.color),
                            )}
                          />
                        )}
                        {ctx.name}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-4 text-right font-mono text-xs tabular-nums text-text-secondary">
                    {ctx.task_count}
                  </td>
                  <td className="py-2 pl-3 text-right">
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
                        <DropdownMenuItem onClick={() => setRenamingId(ctx.id)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingContext(ctx)}>
                          Change icon / color
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-accent-danger focus:text-accent-danger"
                          onClick={() => setDeletingContext(ctx)}
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

      {editingContext ? (
        <EditDialog context={editingContext} onClose={() => setEditingContext(null)} />
      ) : null}
      {deletingContext ? (
        <DeleteDialog context={deletingContext} onClose={() => setDeletingContext(null)} />
      ) : null}
    </div>
  );
}

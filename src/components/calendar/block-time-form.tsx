"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";

interface BlockTimeFormProps {
  open: boolean;
  onClose: () => void;
  defaultStart?: Date;
  defaultEnd?: Date;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultTaskId?: string;
  defaultProjectId?: string;
}

function roundToNext30Min(date: Date): Date {
  const d = new Date(date);
  const minutes = d.getMinutes();
  const remainder = minutes % 30;
  if (remainder === 0) return d;
  d.setMinutes(minutes + (30 - remainder), 0, 0);
  return d;
}

function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultStart(): Date {
  return roundToNext30Min(new Date());
}

function getDefaultEnd(start: Date): Date {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 60);
  return end;
}

export function BlockTimeForm({
  open,
  onClose,
  defaultStart,
  defaultEnd,
  defaultTitle = "",
  defaultDescription = "",
  defaultTaskId,
  defaultProjectId,
}: BlockTimeFormProps) {
  const utils = trpc.useUtils();
  const createMutation = trpc.calendar.events.create.useMutation({
    onSuccess: () => {
      utils.calendar.events.list.invalidate();
      utils.calendar.events.today.invalidate();
      toast.success("Time block created");
      onClose();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to create time block");
    },
  });

  const defaultS = defaultStart ?? getDefaultStart();
  const defaultE = defaultEnd ?? getDefaultEnd(defaultS);

  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState(defaultDescription);
  const [startVal, setStartVal] = React.useState(toDateTimeLocal(defaultS));
  const [endVal, setEndVal] = React.useState(toDateTimeLocal(defaultE));
  const [allDay, setAllDay] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      const s = defaultStart ?? getDefaultStart();
      const e = defaultEnd ?? getDefaultEnd(s);
      setTitle(defaultTitle);
      setDescription(defaultDescription);
      setStartVal(toDateTimeLocal(s));
      setEndVal(toDateTimeLocal(e));
      setAllDay(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      start_at: new Date(startVal),
      end_at: new Date(endVal),
      all_day: allDay,
      linked_task_id: defaultTaskId,
      linked_project_id: defaultProjectId,
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-surface-raised p-5 shadow-4 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="font-ui text-base font-semibold text-text-primary">
              Block time
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
              <X size={16} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                Title <span className="text-accent-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are you working on?"
                required
                className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="all-day"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="rounded border-border-default"
              />
              <label htmlFor="all-day" className="font-ui text-sm text-text-secondary cursor-pointer">
                All day
              </label>
            </div>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Start</label>
                  <input
                    type="datetime-local"
                    value={startVal}
                    onChange={(e) => setStartVal(e.target.value)}
                    className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">End</label>
                  <input
                    type="datetime-local"
                    value={endVal}
                    onChange={(e) => setEndVal(e.target.value)}
                    className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
              </div>
            )}

            {allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Start date</label>
                  <input
                    type="date"
                    value={startVal.slice(0, 10)}
                    onChange={(e) => setStartVal(e.target.value + "T00:00")}
                    className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">End date</label>
                  <input
                    type="date"
                    value={endVal.slice(0, 10)}
                    onChange={(e) => setEndVal(e.target.value + "T23:59")}
                    className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary focus:border-border-focus focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Notes for this block…"
                className="w-full resize-none rounded-lg border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || createMutation.isPending}
                className="rounded-lg bg-accent-primary px-4 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
              >
                {createMutation.isPending ? "Saving…" : "Block time"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

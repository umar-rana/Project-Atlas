"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { STRATUM_CALENDAR_TOKENS } from "@/core/calendar/validation";

const COLOR_LABELS: Record<string, string> = {
  "cal-1": "Blue",
  "cal-2": "Green",
  "cal-3": "Amber",
  "cal-4": "Red",
  "cal-5": "Purple",
  "cal-6": "Teal",
  "cal-7": "Pink",
  "cal-8": "Orange",
  "cal-9": "Cyan",
  "cal-10": "Violet",
  "cal-11": "Yellow",
  "cal-12": "Gray",
};

interface CalendarManageDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CalendarManageDialog({ open, onClose }: CalendarManageDialogProps) {
  const utils = trpc.useUtils();
  const { data: calendars = [], isLoading } = trpc.calendar.calendars.list.useQuery(undefined, {
    enabled: open,
  });

  const updateMutation = trpc.calendar.calendars.update.useMutation({
    onSuccess: () => utils.calendar.calendars.list.invalidate(),
    onError: (err: { message?: string }) => toast.error(err.message ?? "Update failed"),
  });

  const purgeMutation = trpc.calendar.calendars.purge.useMutation({
    onSuccess: (data) => {
      utils.calendar.calendars.list.invalidate();
      toast.success(`Purged ${data.purged} event${data.purged !== 1 ? "s" : ""}`);
    },
    onError: (err: { message?: string }) => toast.error(err.message ?? "Purge failed"),
  });

  const [purgeConfirm, setPurgeConfirm] = React.useState<string | null>(null);
  const [colorPicker, setColorPicker] = React.useState<string | null>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-surface-raised p-5 shadow-4 focus:outline-none">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-ui text-base font-semibold text-text-primary">
              Manage calendars
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
              <X size={16} />
            </Dialog.Close>
          </div>

          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <span className="font-ui text-sm text-text-tertiary">Loading…</span>
            </div>
          ) : calendars.length === 0 ? (
            <p className="py-8 text-center font-ui text-sm text-text-tertiary">
              No calendars synced yet.
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {calendars.map((cal: (typeof calendars)[0]) => {
                const effectiveColor = cal.color_override ?? `cal-${cal.google_color_id ?? "1"}`;
                return (
                  <div
                    key={cal.id}
                    className="rounded-lg border border-border-default bg-surface-base p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <button
                          onClick={() => setColorPicker(colorPicker === cal.id ? null : cal.id)}
                          className="flex-shrink-0"
                          title="Change color"
                        >
                          <span
                            className="block size-3.5 rounded-full border border-border-default hover:ring-2 hover:ring-border-focus"
                            style={{ background: `var(--${effectiveColor}-fill)` }}
                          />
                        </button>
                        <div className="min-w-0">
                          <p className="truncate font-ui text-sm font-medium text-text-primary">
                            {cal.name}
                          </p>
                          <p className="font-ui text-2xs text-text-tertiary">
                            {cal.event_count} events
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <span className="font-ui text-2xs text-text-tertiary">Visible</span>
                          <button
                            role="switch"
                            aria-checked={cal.is_visible}
                            onClick={() =>
                              updateMutation.mutate({ id: cal.id, is_visible: !cal.is_visible })
                            }
                            className={cn(
                              "relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors",
                              cal.is_visible ? "bg-accent-primary" : "bg-border-subtle",
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block size-3 transform rounded-full bg-white shadow-sm transition-transform",
                                cal.is_visible ? "translate-x-3" : "translate-x-0",
                              )}
                            />
                          </button>
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <span className="font-ui text-2xs text-text-tertiary">Sync</span>
                          <button
                            role="switch"
                            aria-checked={cal.is_synced}
                            onClick={() =>
                              updateMutation.mutate({ id: cal.id, is_synced: !cal.is_synced })
                            }
                            className={cn(
                              "relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors",
                              cal.is_synced ? "bg-accent-primary" : "bg-border-subtle",
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block size-3 transform rounded-full bg-white shadow-sm transition-transform",
                                cal.is_synced ? "translate-x-3" : "translate-x-0",
                              )}
                            />
                          </button>
                        </label>
                        <button
                          onClick={() => setPurgeConfirm(purgeConfirm === cal.id ? null : cal.id)}
                          className="rounded p-1 text-text-tertiary hover:text-accent-danger"
                          title="Purge events"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {colorPicker === cal.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border-subtle pt-2">
                        <button
                          onClick={() => {
                            updateMutation.mutate({ id: cal.id, color_override: null });
                            setColorPicker(null);
                          }}
                          className="rounded border border-border-default px-2 py-0.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
                        >
                          Default
                        </button>
                        {STRATUM_CALENDAR_TOKENS.map((token) => (
                          <button
                            key={token}
                            onClick={() => {
                              updateMutation.mutate({ id: cal.id, color_override: token });
                              setColorPicker(null);
                            }}
                            title={COLOR_LABELS[token] ?? token}
                            className={cn(
                              "size-5 rounded-full border-2 transition-transform hover:scale-110",
                              cal.color_override === token
                                ? "border-border-focus"
                                : "border-transparent",
                            )}
                            style={{ background: `var(--${token}-fill)` }}
                          />
                        ))}
                      </div>
                    )}

                    {purgeConfirm === cal.id && (
                      <div className="mt-2 rounded-lg border border-accent-danger bg-accent-danger-muted p-2.5">
                        <p className="mb-2 font-ui text-xs text-accent-danger">
                          This will soft-delete all {cal.event_count} Google events from this
                          calendar. They will return on next sync unless you disable sync.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              purgeMutation.mutate({ id: cal.id });
                              setPurgeConfirm(null);
                            }}
                            className="rounded bg-accent-danger px-3 py-1 font-ui text-xs font-medium text-white hover:opacity-90"
                          >
                            Purge events
                          </button>
                          <button
                            onClick={() => setPurgeConfirm(null)}
                            className="rounded px-3 py-1 font-ui text-xs text-text-secondary hover:bg-surface-hover"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

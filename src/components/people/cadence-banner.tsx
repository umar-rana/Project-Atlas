"use client";

import React from "react";
import { trpc } from "@/lib/trpc/client";
import { shouldShowCadenceSuggestion, suggestCadence } from "@/core/people/cadence-suggestion";

const CADENCE_LABELS: Record<number, string> = {
  7: "Weekly",
  30: "Monthly",
  90: "Quarterly",
  180: "Semi-annually",
  365: "Yearly",
};

function cadenceLabel(days: number): string {
  return CADENCE_LABELS[days] ?? `Every ${days} days`;
}

interface Props {
  personId: string;
  cadenceDays: number | null;
  interactions: { occurred_at: Date | string; deleted_at?: Date | string | null }[];
  dismissedAt: Date | string | null;
  dismissedValue: number | null;
  dismissedInteractionCount: number | null;
}

export function CadenceSuggestionBanner({ personId, cadenceDays, interactions, dismissedAt, dismissedValue, dismissedInteractionCount }: Props) {
  const utils = trpc.useUtils();

  const nonDeleted = interactions.filter((i) => !i.deleted_at);
  const occurredAts = nonDeleted.map((i) => new Date(i.occurred_at));
  const suggestedValue = suggestCadence(occurredAts);

  const show = shouldShowCadenceSuggestion({
    cadenceDays,
    interactionCount: nonDeleted.length,
    suggestedValue,
    dismissedAt: dismissedAt ? new Date(dismissedAt as string) : null,
    dismissedValue,
    interactionCountAtDismissal: dismissedInteractionCount ?? 0,
  });

  const updateMutation = trpc.people.update.useMutation({
    onSuccess: () => {
      void utils.people.get.invalidate({ id: personId });
    },
  });

  const dismissMutation = trpc.people.dismissCadenceSuggestion.useMutation({
    onSuccess: () => {
      void utils.people.get.invalidate({ id: personId });
    },
  });

  if (!show || suggestedValue === null) return null;

  return (
    <div className="mt-3 rounded-md border border-border-subtle bg-surface-sunken px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-secondary">
          Based on your interaction history, a{" "}
          <span className="font-medium text-text-primary">{cadenceLabel(suggestedValue)}</span> cadence
          ({suggestedValue} days) looks right.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            updateMutation.mutate({ id: personId, cadence_days: suggestedValue });
          }}
          disabled={updateMutation.isPending || dismissMutation.isPending}
          className="text-xs text-accent-primary hover:underline disabled:opacity-50"
        >
          Set
        </button>
        <button
          type="button"
          onClick={() => {
            dismissMutation.mutate({
              id: personId,
              suggested_value: suggestedValue,
              interaction_count: nonDeleted.length,
            });
          }}
          disabled={updateMutation.isPending || dismissMutation.isPending}
          className="text-xs text-text-disabled hover:text-text-tertiary transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

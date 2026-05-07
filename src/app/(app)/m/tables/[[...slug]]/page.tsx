"use client";

import * as React from "react";
import { Monitor, Table2, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatDistanceToNow } from "date-fns";
import { switchToDesktop } from "@/lib/mobile/switch-to-desktop";

export default function MobileTablesPage() {
  const { data: tables = [], isLoading } = trpc.search.tables.useQuery({ query: "" });

  function handleSwitchToDesktop() {
    switchToDesktop("/tables");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-[56px] items-center justify-between border-b border-border-subtle px-4">
        <h1 className="font-ui text-base font-semibold text-text-primary">Tables</h1>
        <button
          type="button"
          onClick={handleSwitchToDesktop}
          className="flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-1.5 font-ui text-xs font-medium text-text-secondary active:bg-surface-hover"
        >
          <Monitor size={13} aria-hidden />
          Switch to desktop
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-3 px-4 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-raised" />
            ))}
          </div>
        )}

        {!isLoading && tables.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <Table2 size={32} className="text-text-disabled" aria-hidden />
            <p className="font-ui text-sm text-text-tertiary">No tables yet</p>
            <button
              type="button"
              onClick={handleSwitchToDesktop}
              className="font-ui text-sm text-accent-primary"
            >
              Create one on desktop
            </button>
          </div>
        )}

        {!isLoading && tables.length > 0 && (
          <div className="px-4 pt-4">
            <p className="mb-3 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
              {tables.length} table{tables.length !== 1 ? "s" : ""}
            </p>
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
            >
              {tables.map((table) => (
                <li key={table.id}>
                  <button
                    type="button"
                    onClick={handleSwitchToDesktop}
                    className="flex min-h-[56px] w-full items-center gap-3 bg-surface-base px-3 py-3 text-left active:bg-surface-hover"
                  >
                    <Table2 size={18} className="shrink-0 text-text-tertiary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-sm font-medium text-text-primary">
                        {table.name}
                      </p>
                      {table.updated_at && (
                        <p className="font-ui text-xs text-text-tertiary">
                          Updated {formatDistanceToNow(new Date(table.updated_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-text-disabled" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-center font-ui text-xs text-text-tertiary">
              Full table editing is available on desktop
            </p>
            <button
              type="button"
              onClick={handleSwitchToDesktop}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-raised font-ui text-sm text-text-secondary active:bg-surface-hover"
            >
              <Monitor size={16} aria-hidden />
              Open Tables on desktop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

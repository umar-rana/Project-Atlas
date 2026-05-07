"use client";

import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { CURATED_RELATIONSHIP_TYPES } from "@/core/people/validation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  value?: string;
  onChange: (type: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

const CURATED = [...CURATED_RELATIONSHIP_TYPES];

export function RelationshipTypePicker({
  value,
  onChange,
  className,
  placeholder = "Relationship type",
  disabled,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [open, setOpen] = useState(false);

  const { data: suggested = [] } = trpc.people.getSuggestedRelationshipTypes.useQuery();

  const adaptedList = React.useMemo(() => {
    const result: string[] = [];
    for (const s of suggested) {
      if (!CURATED.includes(s as (typeof CURATED)[number]) && !result.includes(s)) {
        result.unshift(s);
      }
    }
    return [...result, ...CURATED];
  }, [suggested]);

  function handleSelect(type: string) {
    onChange(type);
    setOpen(false);
  }

  function handleCustomSubmit() {
    const val = customInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!val) return;
    onChange(val);
    setCustomOpen(false);
    setCustomInput("");
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex w-full items-center justify-between rounded-md border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary transition-colors hover:border-border-strong focus-visible:focus-ring",
            !value && "text-text-tertiary",
            className,
          )}
        >
          <span>{value ?? placeholder}</span>
          <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-dropdown top-full mt-1 w-full overflow-hidden rounded-md border border-border-default bg-surface-raised shadow-2">
            <div className="max-h-56 overflow-y-auto py-1">
              {adaptedList.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleSelect(type)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm capitalize transition-colors hover:bg-surface-hover",
                    value === type ? "text-accent-primary" : "text-text-primary",
                  )}
                >
                  {type.replace(/-/g, " ")}
                </button>
              ))}
              <div className="border-t border-border-subtle mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setCustomOpen(true); }}
                  className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover"
                >
                  Custom type…
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Custom relationship type</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="e.g. investor, therapist…"
              onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCustomSubmit} disabled={!customInput.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClaudeConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoice: (mode: "single" | "assistant_only" | "plain") => void;
}

const OPTIONS: {
  mode: "single" | "assistant_only" | "plain";
  label: string;
  description: string;
}[] = [
  {
    mode: "single",
    label: "Full conversation",
    description: "Import the entire conversation with both your messages and Claude's responses, separated by dividers.",
  },
  {
    mode: "assistant_only",
    label: "Assistant responses only",
    description: "Import only Claude's responses, leaving out your questions and prompts.",
  },
  {
    mode: "plain",
    label: "Treat as plain markdown",
    description: "Ignore the conversation structure and import the content as regular markdown.",
  },
];

export function ClaudeConversationDialog({
  open,
  onOpenChange,
  onChoice,
}: ClaudeConversationDialogProps): React.ReactElement {
  const [selected, setSelected] = React.useState<"single" | "assistant_only" | "plain">("single");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-surface-base p-6 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-accent-primary" />
              <Dialog.Title className="font-ui text-sm font-semibold text-text-primary">
                Claude conversation detected
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-text-disabled hover:text-text-primary focus-visible:focus-ring"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          <p className="mb-4 font-ui text-xs text-text-secondary">
            This file looks like a Claude conversation export. How would you like to import it?
          </p>

          <div className="flex flex-col gap-2 mb-6">
            {OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setSelected(opt.mode)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors",
                  selected === opt.mode
                    ? "border-accent-primary bg-accent-primary-subtle/20"
                    : "border-border-default hover:border-border-focus",
                )}
              >
                <span className="font-ui text-xs font-medium text-text-primary">{opt.label}</span>
                <span className="font-ui text-2xs text-text-disabled">{opt.description}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChoice(selected)}
              className="flex-1 rounded-md bg-accent-primary px-4 py-2 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
            >
              Import
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-border-default px-4 py-2 font-ui text-xs text-text-secondary hover:bg-surface-raised focus-visible:focus-ring"
              >
                Cancel
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Hint } from "@/components/ui/hint";

const EMOJI_OPTIONS = [
  "📁",
  "🎯",
  "✈️",
  "📚",
  "💪",
  "📖",
  "💼",
  "🏠",
  "💰",
  "🏃",
  "🛒",
  "🍽️",
  "🎵",
  "🎨",
  "✍️",
  "🔬",
  "🏡",
  "👨‍👩‍👧",
  "🤝",
  "🎮",
  "⭐",
  "🚀",
  "💡",
  "🔧",
  "📊",
  "🌱",
  "🏆",
  "🎓",
  "❤️",
  "🌍",
  "📂",
  "📝",
  "📌",
  "🔖",
  "🗂️",
  "📋",
  "🗓️",
  "⏰",
  "🔔",
  "💬",
];

const COLOR_OPTIONS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Emerald", value: "#10b981" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Pink", value: "#ec4899" },
  { label: "Orange", value: "#f97316" },
  { label: "Green", value: "#22c55e" },
  { label: "Red", value: "#ef4444" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Rose", value: "#f43f5e" },
];

interface TypeConfigEditorProps {
  type: string;
  currentIcon: string;
  currentColor: string;
  onClose: () => void;
}

export function TypeConfigEditor({
  type,
  currentIcon,
  currentColor,
  onClose,
}: TypeConfigEditorProps) {
  const utils = trpc.useUtils();
  const setConfig = trpc.projects.setTypeConfig.useMutation({
    onSuccess: () => {
      utils.projects.typeConfigs.invalidate();
    },
  });

  function handleIconSelect(icon: string) {
    setConfig.mutate({ type, icon });
  }

  function handleColorSelect(color: string) {
    setConfig.mutate({ type, color });
  }

  function handleReset() {
    setConfig.mutate({ type, icon: null, color: null });
    onClose();
  }

  return (
    <div
      className="absolute left-full top-0 z-[60] ml-1 w-64 rounded-md border border-border-default bg-surface-overlay p-3 shadow-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-ui text-2xs font-semibold text-text-primary">
          Customize icon &amp; color
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <X size={12} />
        </button>
      </div>

      <p className="mb-1.5 font-ui text-3xs uppercase tracking-caps text-text-disabled">Icon</p>
      <div className="mb-3 flex flex-wrap gap-1">
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleIconSelect(emoji)}
            className={cn(
              "flex size-7 items-center justify-center rounded text-base transition-colors hover:bg-surface-hover",
              currentIcon === emoji ? "bg-accent-primary-subtle ring-1 ring-accent-primary" : "",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>

      <p className="mb-1.5 font-ui text-3xs uppercase tracking-caps text-text-disabled">Color</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {COLOR_OPTIONS.map((c) => (
          <Hint key={c.value} label={c.label}>
            <button
              type="button"
              aria-label={c.label}
              onClick={() => handleColorSelect(c.value)}
              className={cn(
                "size-5 rounded-full transition-transform hover:scale-110",
                currentColor === c.value ? "ring-2 ring-border-focus ring-offset-1" : "",
              )}
              style={{ backgroundColor: c.value }}
            />
          </Hint>
        ))}
      </div>

      <button
        type="button"
        onClick={handleReset}
        className="w-full rounded-sm py-1 font-ui text-2xs text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
      >
        Reset to default
      </button>
    </div>
  );
}

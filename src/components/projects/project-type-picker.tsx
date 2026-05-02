"use client";

import * as React from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { getSuggestedTypes, displayType } from "@/core/projects/type-suggestions";
import { useTypeConfig } from "@/core/projects/type-config-context";
import { TypeConfigEditor } from "./type-config-editor";
import { CustomTypeDialog } from "./custom-type-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function TypeRow({ type, isSelected, children }: { type: string; isSelected: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("group flex items-center gap-1.5", isSelected ? "font-semibold text-accent-primary" : "")}>
      {children}
    </div>
  );
}

export function ProjectTypePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (type: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [showCustom, setShowCustom] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editingType, setEditingType] = React.useState<string | null>(null);
  const typesQuery = trpc.projects.distinctTypes.useQuery(undefined, {
    staleTime: 30_000,
  });
  const existingTypes = (typesQuery.data ?? []).map((t) => t.type);
  const suggestions = getSuggestedTypes(typesQuery.data ?? []);
  const { getIcon, getColor } = useTypeConfig();

  function handleSelect(type: string) {
    setOpen(false);
    onChange(type);
  }

  function handleCustomConfirm(type: string) {
    setShowCustom(false);
    setOpen(false);
    onChange(type);
  }

  const customTypes = existingTypes.filter((t) => t !== "project" && t !== "goal" && !suggestions.includes(t));

  return (
    <div className="relative">
      <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingType(null); }}>
        <DropdownMenuTrigger
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-ui text-2xs font-medium transition-colors",
            "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: getColor(value) }}
            aria-hidden
          />
          <span>{getIcon(value)}</span>
          <span>{displayType(value)}</span>
          <ChevronDown size={10} className="text-text-tertiary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="font-ui text-3xs uppercase tracking-caps text-text-disabled">Core</DropdownMenuLabel>
          {["project", "goal"].map((t) => (
            <DropdownMenuItem
              key={t}
              onSelect={() => handleSelect(t)}
              className={value === t ? "font-semibold text-accent-primary" : ""}
            >
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: getColor(t) }}
                aria-hidden
              />
              <span>{getIcon(t)}</span>
              {displayType(t)}
            </DropdownMenuItem>
          ))}

          {suggestions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-ui text-3xs uppercase tracking-caps text-text-disabled">Suggested</DropdownMenuLabel>
              {suggestions.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => handleSelect(s)}
                  className={value === s ? "font-semibold text-accent-primary" : ""}
                >
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: getColor(s) }}
                    aria-hidden
                  />
                  <span>{getIcon(s)}</span>
                  {displayType(s)}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {customTypes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-ui text-3xs uppercase tracking-caps text-text-disabled">Your types</DropdownMenuLabel>
              {customTypes.map((t) => (
                <div key={t} className="relative flex items-center">
                  <DropdownMenuItem
                    onSelect={() => handleSelect(t)}
                    className={cn("flex-1", value === t ? "font-semibold text-accent-primary" : "")}
                  >
                    <span
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getColor(t) }}
                      aria-hidden
                    />
                    <span>{getIcon(t)}</span>
                    {displayType(t)}
                  </DropdownMenuItem>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditingType(editingType === t ? null : t); }}
                    className="mr-1 shrink-0 rounded p-0.5 text-text-disabled opacity-0 transition-opacity hover:bg-surface-hover hover:text-text-tertiary group-hover:opacity-100 peer-hover:opacity-100 focus:opacity-100"
                    style={{ opacity: editingType === t ? 1 : undefined }}
                    title="Customize icon & color"
                  >
                    <Settings2 size={11} />
                  </button>
                  {editingType === t && (
                    <TypeConfigEditor
                      type={t}
                      currentIcon={getIcon(t)}
                      currentColor={getColor(t)}
                      onClose={() => setEditingType(null)}
                    />
                  )}
                </div>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setShowCustom(true);
            }}
            className="text-text-tertiary"
          >
            Custom type…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCustom && (
        <CustomTypeDialog
          existingTypes={existingTypes}
          onConfirm={handleCustomConfirm}
          onCancel={() => setShowCustom(false)}
        />
      )}
    </div>
  );
}

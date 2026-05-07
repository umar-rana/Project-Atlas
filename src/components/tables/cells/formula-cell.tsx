"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { isFormulaError } from "@/core/tables/formula-shared";
import type { FormulaReturnType } from "@/core/tables/formula-shared";
import type { CellValue } from "@/core/tables/types";

interface FormulaCellProps {
  value: CellValue;
  returnType: FormulaReturnType;
  decimals?: number;
  currencySymbol?: string;
  isSelected: boolean;
}

export function FormulaCell({
  value,
  returnType,
  decimals = 2,
  currencySymbol = "$",
  isSelected,
}: FormulaCellProps) {
  // Formula cells are read-only — no editing
  if (isFormulaError(value)) {
    const errorMsg = (value as { __formula_error: string }).__formula_error;
    return (
      <Hint label={errorMsg} side="top">
        <div
          className={cn(
            "flex h-full w-full cursor-default items-center px-2 font-ui text-sm",
            isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
          )}
        >
          <span className="font-medium text-accent-danger">#ERROR</span>
        </div>
      </Hint>
    );
  }

  if (value === null || value === undefined) {
    return (
      <div
        className={cn(
          "flex h-full w-full cursor-default items-center px-2",
          isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
        )}
      />
    );
  }

  switch (returnType) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      const formatted = isNaN(n)
        ? ""
        : n.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
          });
      return (
        <div
          className={cn(
            "flex h-full w-full cursor-default items-center justify-end px-2 font-ui text-sm tabular-nums text-text-primary",
            isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
          )}
        >
          {formatted}
        </div>
      );
    }

    case "date": {
      let display = "";
      if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          display = d.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        }
      }
      return (
        <div
          className={cn(
            "flex h-full w-full cursor-default items-center px-2 font-ui text-sm text-text-primary",
            isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
          )}
        >
          {display}
        </div>
      );
    }

    case "boolean": {
      const checked = value === true || value === "true";
      return (
        <div
          className={cn(
            "flex h-full w-full cursor-default items-center justify-center",
            isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
          )}
        >
          {checked ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-accent-primary bg-accent-primary">
              <Check size={10} className="text-text-on-accent" />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-sm border border-border-default bg-surface-base" />
          )}
        </div>
      );
    }

    case "text":
    default: {
      const text = typeof value === "string" ? value : String(value);
      return (
        <div
          className={cn(
            "flex h-full w-full cursor-default items-center px-2 font-ui text-sm text-text-primary",
            isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
          )}
        >
          <span className="truncate">{text}</span>
        </div>
      );
    }
  }
}

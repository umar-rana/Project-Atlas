"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplateForm } from "./template-form";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: {
    name?: string;
    notes?: string | null;
    estimated_minutes?: number | null;
    flagged?: boolean;
    recurrence_rule?: string | null;
    context_ids?: string[];
    tag_ids?: string[];
    checklist_items?: Array<{ title: string; position: string }>;
    default_project_id?: string | null;
  };
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  prefill,
}: SaveAsTemplateDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <TemplateForm
            initialValues={{
              name: prefill?.name ?? "",
              notes: prefill?.notes ?? "",
              estimated_minutes: prefill?.estimated_minutes?.toString() ?? "",
              flagged: prefill?.flagged ?? false,
              recurrence_rule: prefill?.recurrence_rule ?? "",
              context_ids: prefill?.context_ids ?? [],
              tag_ids: prefill?.tag_ids ?? [],
              checklist_items: prefill?.checklist_items ?? [],
              default_project_id: prefill?.default_project_id ?? "",
            }}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

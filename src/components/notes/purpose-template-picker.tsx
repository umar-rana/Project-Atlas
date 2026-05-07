"use client";

import * as React from "react";
import { FileText, Users, BookOpen, Glasses } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { withRetry, handleTrpcError } from "@/core/errors/error-handler";
import { toast } from "@/lib/toast";

type Purpose = "note" | "meeting_note" | "project_brief" | "reading_note";

const PURPOSES: {
  id: Purpose;
  label: string;
  description: string;
  icon: React.ElementType;
  template: object;
}[] = [
  {
    id: "note",
    label: "Note",
    description: "A general-purpose note for anything.",
    icon: FileText,
    template: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
  },
  {
    id: "meeting_note",
    label: "Meeting Note",
    description: "Capture attendees, agenda, and action items.",
    icon: Users,
    template: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Attendees" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Agenda" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Action items" }] },
        { type: "paragraph" },
      ],
    },
  },
  {
    id: "project_brief",
    label: "Project Brief",
    description: "Define goals, scope, and success criteria for a project.",
    icon: BookOpen,
    template: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Overview" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Goals" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Scope" }] },
        { type: "paragraph" },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Success criteria" }],
        },
        { type: "paragraph" },
      ],
    },
  },
  {
    id: "reading_note",
    label: "Reading Note",
    description: "Summarise a book, article, or resource.",
    icon: Glasses,
    template: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Source" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Summary" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Key ideas" }] },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "My thoughts" }] },
        { type: "paragraph" },
      ],
    },
  },
];

interface PurposeTemplatePickerProps {
  folderId?: string | null;
  projectId?: string | null;
  defaultPurpose?: Purpose;
  onCancel?: () => void;
}

export function PurposeTemplatePicker({
  folderId,
  projectId,
  defaultPurpose: _defaultPurpose,
  onCancel,
}: PurposeTemplatePickerProps): React.ReactElement {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [isPending, setIsPending] = React.useState(false);

  const createNote = trpc.notes.create.useMutation({
    meta: { suppressGlobalError: true },
  });

  async function handleSelect(purpose: Purpose) {
    if (isPending) return;
    const template = PURPOSES.find((p) => p.id === purpose)!.template;
    setIsPending(true);
    try {
      const note = await withRetry(() =>
        createNote.mutateAsync({
          purpose,
          folder_id: folderId ?? undefined,
          project_id: projectId ?? undefined,
          body_json: JSON.stringify(template),
        }),
      );
      await utils.notes.list.invalidate();
      router.push(`/notes/${note.id}`);
    } catch (err) {
      toast.error(handleTrpcError(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h2 className="font-ui text-base font-semibold text-text-primary">New note</h2>
        <p className="mt-1 font-ui text-sm text-text-tertiary">Choose a starting template</p>
      </div>

      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {PURPOSES.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              disabled={isPending}
              onClick={() => handleSelect(p.id)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border border-border-default p-4 text-left transition-colors",
                "hover:border-accent-primary hover:bg-accent-primary-subtle",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className="shrink-0 text-accent-primary" />
                <span className="font-ui text-sm font-medium text-text-primary">{p.label}</span>
              </div>
              <p className="font-ui text-xs text-text-tertiary">{p.description}</p>
            </button>
          );
        })}
      </div>

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="font-ui text-xs text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

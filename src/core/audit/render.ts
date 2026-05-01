import type { AuditLog } from "@prisma/client";
import { formatDateUTCSafe, type LocaleSettings } from "@/core/locale/formatters";

type DiffEntry = { from: unknown; to: unknown };
type Diff = Record<string, DiffEntry>;

const FALLBACK_LOCALE: LocaleSettings = {
  date_format: "DD/MM/YYYY",
  time_format: "12h",
  number_format: "1,234.56",
  currency_code: "PKR",
  currency_symbol: "₨",
};

function fmtDate(val: unknown, locale: LocaleSettings): string {
  if (!val) return "none";
  try {
    return formatDateUTCSafe(new Date(val as string), locale);
  } catch {
    return String(val);
  }
}

function fmtMinutes(val: unknown): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return "none";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function renderDiffField(field: string, entry: DiffEntry, locale: LocaleSettings): string | null {
  const { from, to } = entry;

  switch (field) {
    case "title":
      return `Renamed to "${to}"`;
    case "notes":
      if (!from && to) return "Added notes";
      if (from && !to) return "Removed notes";
      return "Updated notes";
    case "status": {
      if (to === "completed") return "Marked as completed";
      if (to === "active" && from === "completed") return "Reopened task";
      if (to === "dropped") return "Dropped task";
      return `Changed status to ${to}`;
    }
    case "flagged":
      return to ? "Flagged this task" : "Unflagged this task";
    case "due_date":
      return to ? `Set due date to ${fmtDate(to, locale)}` : "Removed due date";
    case "defer_date":
      return to ? `Set defer date to ${fmtDate(to, locale)}` : "Removed defer date";
    case "estimated_minutes":
      return to ? `Set estimate to ${fmtMinutes(to)}` : "Removed estimate";
    case "project_id":
      return to ? "Moved to a project" : "Moved out of project";
    case "parent_id":
      return to ? "Nested under a parent task" : "Moved to top level";
    case "completed_at":
      return null;
    case "updated_at":
      return null;
    case "position":
      return null;
    case "search_vector":
      return null;
    case "referenced_person_ids":
    case "referenced_tag_ids":
    case "referenced_entity_refs":
      return null;
    default:
      return `Updated ${field.replace(/_/g, " ")}`;
  }
}

export function renderAuditEntry(entry: AuditLog, locale?: LocaleSettings): string {
  const loc = locale ?? FALLBACK_LOCALE;
  const action = entry.action;
  const meta = entry.meta as Record<string, unknown> | null;

  if (action === "create") {
    const title = meta?.title as string | undefined;
    return title ? `Created task "${title}"` : "Created this task";
  }

  if (action === "complete") {
    const nextDate = meta?.next_occurrence_date as string | undefined;
    if (nextDate) {
      return `Completed; next occurrence created for ${fmtDate(nextDate, loc)}`;
    }
    const msg = meta?.message as string | undefined;
    if (msg) return msg;
    return "Marked as completed";
  }
  if (action === "uncomplete") return "Reopened task";
  if (action === "delete") return "Moved to trash";
  if (action === "restore") return "Restored from trash";
  if (action === "bulk_permanent_delete") return "Permanently deleted";

  if (action === "attachment_uploaded") {
    const filename = meta?.filename as string | undefined;
    return filename ? `Attached file: ${filename}` : "Attached a file";
  }
  if (action === "attachment_deleted") {
    const filename = meta?.filename as string | undefined;
    return filename ? `Removed attachment: ${filename}` : "Removed an attachment";
  }
  if (action === "attachment_detached") {
    const filename = meta?.filename as string | undefined;
    return filename ? `Detached file: ${filename}` : "Detached a file";
  }
  if (action === "attachment_reattached") {
    const filename = meta?.filename as string | undefined;
    return filename ? `Re-attached file: ${filename}` : "Re-attached a file";
  }
  if (action === "attachment_marked_reviewed") {
    const filename = meta?.filename as string | undefined;
    return filename ? `Marked "${filename}" as reviewed` : "Marked attachment as reviewed";
  }
  if (action === "attachment_metadata_updated") {
    const filename = meta?.filename as string | undefined;
    return filename ? `Updated attachment: ${filename}` : "Updated attachment metadata";
  }

  if (action === "update") {
    const diff = entry.diff as Diff | null;
    if (!diff) return "Updated this task";

    const sentences: string[] = [];
    for (const [field, change] of Object.entries(diff)) {
      const sentence = renderDiffField(field, change, loc);
      if (sentence) sentences.push(sentence);
    }

    if (sentences.length === 0) return "Updated this task";
    if (sentences.length === 1) return sentences[0]!;
    if (sentences.length === 2) return `${sentences[0]} and ${sentences[1]}`;
    const last = sentences[sentences.length - 1];
    const rest = sentences.slice(0, -1).join(", ");
    return `${rest}, and ${last}`;
  }

  return "Updated this task";
}

import { format } from "date-fns";
import type { AuditLog } from "@prisma/client";

type DiffEntry = { from: unknown; to: unknown };
type Diff = Record<string, DiffEntry>;

function fmtDate(val: unknown): string {
  if (!val) return "none";
  try {
    return format(new Date(val as string), "MMM d, yyyy");
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

function renderDiffField(field: string, entry: DiffEntry): string | null {
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
      return to ? `Set due date to ${fmtDate(to)}` : "Removed due date";
    case "defer_date":
      return to ? `Set defer date to ${fmtDate(to)}` : "Removed defer date";
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

export function renderAuditEntry(entry: AuditLog): string {
  const action = entry.action;
  const meta = entry.meta as Record<string, unknown> | null;

  if (action === "create") {
    const title = meta?.title as string | undefined;
    return title ? `Created task "${title}"` : "Created this task";
  }

  if (action === "complete") return "Marked as completed";
  if (action === "uncomplete") return "Reopened task";
  if (action === "delete") return "Moved to trash";
  if (action === "restore") return "Restored from trash";
  if (action === "bulk_permanent_delete") return "Permanently deleted";

  if (action === "update") {
    const diff = entry.diff as Diff | null;
    if (!diff) return "Updated this task";

    const sentences: string[] = [];
    for (const [field, change] of Object.entries(diff)) {
      const sentence = renderDiffField(field, change);
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

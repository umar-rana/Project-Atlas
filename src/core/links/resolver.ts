import { db } from "@/core/db";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient | typeof db;

export type ResolvedLink = {
  target_type: string;
  target_id: string;
};

/**
 * Resolve a reference text and optional type hint to a { target_type, target_id }
 * pair by querying the appropriate table. Returns null if no match is found.
 *
 * type_hint values:
 *   "note"    → search Note by title
 *   "task"    → search Task by title
 *   "project" → search Project by title
 *   "tag"     → search Tag by name
 *   "context" → search Context by name
 *   undefined → search Note, Task, Project in that order (first match wins)
 */
export async function resolveReference(
  text: string,
  type_hint: "note" | "task" | "project" | "tag" | "context" | undefined,
  userId: string,
  tx?: Tx,
): Promise<ResolvedLink | null> {
  const client = tx ?? db;
  const q = text.trim();
  if (!q) return null;

  if (type_hint === "tag") {
    const tag = await client.tag.findFirst({
      where: { user_id: userId, name: { equals: q.toLowerCase() }, deleted_at: null },
      select: { id: true },
    });
    return tag ? { target_type: "Tag", target_id: tag.id } : null;
  }

  if (type_hint === "context") {
    const ctx = await client.context.findFirst({
      where: { user_id: userId, name: { contains: q, mode: "insensitive" }, deleted_at: null },
      select: { id: true },
    });
    return ctx ? { target_type: "Context", target_id: ctx.id } : null;
  }

  if (type_hint === "note" || type_hint === undefined) {
    const note = await client.note.findFirst({
      where: { user_id: userId, title: { equals: q, mode: "insensitive" }, deleted_at: null },
      select: { id: true },
    });
    if (note) return { target_type: "Note", target_id: note.id };
    if (type_hint === "note") return null;
  }

  if (type_hint === "task" || type_hint === undefined) {
    const task = await client.task.findFirst({
      where: { user_id: userId, title: { equals: q, mode: "insensitive" }, deleted_at: null },
      select: { id: true },
    });
    if (task) return { target_type: "Task", target_id: task.id };
    if (type_hint === "task") return null;
  }

  if (type_hint === "project" || type_hint === undefined) {
    const project = await client.project.findFirst({
      where: { user_id: userId, title: { equals: q, mode: "insensitive" }, deleted_at: null },
      select: { id: true },
    });
    if (project) return { target_type: "Project", target_id: project.id };
  }

  return null;
}

/**
 * Extract reference nodes from a TipTap body_json document tree.
 * Traverses the ProseMirror JSON recursively, collecting all nodes with
 * type === "reference" that carry a valid target_id.
 */
export function extractReferenceNodes(bodyJson: string): ResolvedLink[] {
  let doc: unknown;
  try {
    doc = JSON.parse(bodyJson);
  } catch {
    return [];
  }

  const refs: ResolvedLink[] = [];
  const seen = new Set<string>();

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "reference" && n.attrs && typeof n.attrs === "object") {
      const attrs = n.attrs as Record<string, unknown>;
      const raw_type = attrs.target_type;
      const target_id = attrs.target_id;
      if (typeof raw_type === "string" && typeof target_id === "string" && target_id) {
        const target_type = capitalizeTargetType(raw_type);
        const key = `${target_type}:${target_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ target_type, target_id });
        }
      }
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
    if (Array.isArray(n.marks)) {
      for (const mark of n.marks) walk(mark);
    }
  }

  walk(doc);
  return refs;
}

function capitalizeTargetType(raw: string): string {
  const map: Record<string, string> = {
    note: "Note",
    task: "Task",
    project: "Project",
    tag: "Tag",
    context: "Context",
  };
  return map[raw.toLowerCase()] ?? raw;
}

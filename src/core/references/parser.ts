/**
 * Reference parser — extracts `@person`, `#tag`, `[[entity]]` references from
 * markdown body text. Handles edge cases:
 *   - Skips fenced code blocks (``` … ```) and inline code (` … `)
 *   - Skips escaped refs (`\@foo`, `\#bar`, `\[[baz]]`)
 *   - Ignores empty refs (`@`, `#`, `[[]]`)
 *   - Handles nested brackets gracefully (innermost match wins)
 */

export interface ParsedReferences {
  people: string[];
  tags: string[];
  entities: string[];
}

const PERSON_RE = /(^|[^\\\w])@([a-zA-Z0-9_][a-zA-Z0-9_.-]*)/g;
const TAG_RE = /(^|[^\\\w])#([a-zA-Z0-9][a-zA-Z0-9_-]*)/g;
const ENTITY_RE = /(^|[^\\])\[\[([^\[\]\n]+?)\]\]/g;

/**
 * Strip fenced code blocks and inline code from text so refs inside them are
 * ignored.
 */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ");
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function parseReferences(text: string | null | undefined): ParsedReferences {
  const empty: ParsedReferences = { people: [], tags: [], entities: [] };
  if (!text) return empty;

  const stripped = stripCode(text);
  const people: string[] = [];
  const tags: string[] = [];
  const entities: string[] = [];

  for (const match of stripped.matchAll(PERSON_RE)) {
    const handle = match[2];
    if (handle && handle.length > 0) people.push(handle);
  }
  for (const match of stripped.matchAll(TAG_RE)) {
    const tag = match[2];
    if (tag && tag.length > 0) tags.push(tag);
  }
  for (const match of stripped.matchAll(ENTITY_RE)) {
    const entity = match[2]?.trim();
    if (entity && entity.length > 0) entities.push(entity);
  }

  return {
    people: dedupe(people),
    tags: dedupe(tags),
    entities: dedupe(entities),
  };
}

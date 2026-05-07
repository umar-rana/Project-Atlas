/**
 * Shared color palettes for the note editor (editor-block-menu and editor-bubble-menu).
 *
 * Storage note: TipTap persists highlight and text-color marks as literal hex values
 * inside its ProseMirror JSON document model. We therefore export both:
 *   - `value`  — the hex string passed to TipTap's setColor / toggleHighlight API
 *                and written into stored JSON.
 *   - `cssVar` — the CSS custom-property reference used for UI chrome (swatches, etc.)
 *                so those surfaces reference Stratum tokens rather than inline hex.
 *
 * Existing notes already saved with literal hex values continue to render correctly
 * because TipTap resolves them directly from the stored document JSON.
 */

export const NOTE_HIGHLIGHT_COLORS: ReadonlyArray<{
  label: string;
  value: string;
  cssVar: string;
}> = [
  { label: "Yellow", value: "#fef08a", cssVar: "--note-highlight-yellow" },
  { label: "Green", value: "#bbf7d0", cssVar: "--note-highlight-green" },
  { label: "Blue", value: "#bfdbfe", cssVar: "--note-highlight-blue" },
  { label: "Pink", value: "#fbcfe8", cssVar: "--note-highlight-pink" },
  { label: "Orange", value: "#fed7aa", cssVar: "--note-highlight-orange" },
  { label: "Purple", value: "#e9d5ff", cssVar: "--note-highlight-purple" },
] as const;

export const NOTE_TEXT_COLORS: ReadonlyArray<{
  label: string;
  value: string | null;
  cssVar: string | null;
}> = [
  { label: "Default", value: null, cssVar: null },
  { label: "Red", value: "#ef4444", cssVar: "--note-text-red" },
  { label: "Orange", value: "#f97316", cssVar: "--note-text-orange" },
  { label: "Yellow", value: "#ca8a04", cssVar: "--note-text-yellow" },
  { label: "Green", value: "#16a34a", cssVar: "--note-text-green" },
  { label: "Blue", value: "#2563eb", cssVar: "--note-text-blue" },
  { label: "Purple", value: "#9333ea", cssVar: "--note-text-purple" },
  { label: "Pink", value: "#db2777", cssVar: "--note-text-pink" },
  { label: "Gray", value: "#6b7280", cssVar: "--note-text-gray" },
] as const;

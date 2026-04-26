# Reading-mode UI kit

A long-form journal/notebook recreation in Stratum's reading mode — Day One / Bear / iA Writer lineage. Three panes:

1. **Notebooks sidebar** — collections, notebooks, tags. Same dense list-item grammar as the productivity app's left rail.
2. **Entry list** — chronological, grouped by day. Each row shows time, title, two-line excerpt, word count, location, and a tag.
3. **Reader** — Source Serif 4 at 17 px / 1.7 line-height, max 65ch column. Drop-cap on the first paragraph in `--accent-primary`. H2 in display sans, H3 as small caps. Pull-quotes get a 2 px primary-color rule. Footer chips show tags. A weather strip pins the entry to a moment in space and time.

This is the **complement** to the dense productivity kit — same tokens, same iconography rules, completely different rhythm. Use it as the reference when the user asks for a journaling, blogging, note-reading, or long-form-document UI.

## Files

- `index.html` — entry point
- `style.css` — all three-pane layout + `.r-entry` typography
- `App.jsx` — three-pane composition, sample interactions
- `data.js` — five sample entries, all original prose

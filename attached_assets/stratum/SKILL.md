---
name: stratum-design
description: Use this skill to generate well-branded interfaces and assets for Stratum, a dense, desktop-first productivity design system (lineage of Linear, Superhuman, Things, Bear, Notion). Either for production or throwaway prototypes/mocks/etc. Contains complete OKLCH color tokens for both dark and light themes, typography (Inter / Source Serif 4 / JetBrains Mono), spacing/radius/elevation/motion scales, component primitives, and a full productivity-app UI kit for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key files:
- `colors_and_type.css` — every token (colors, type, spacing, radius, shadows, motion). Always reference tokens, never raw values.
- `preview/` — one HTML card per token group or component cluster. Lift markup directly.
- `ui_kits/productivity-app/` — clickable recreation showing how primitives compose into Today / Inbox / Calendar / Project / Notes screens.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. `colors_and_type.css` is self-contained — copy it alongside your HTML and `@import` it.

If working on production code, read the rules in README.md (especially the Content Fundamentals and Visual Foundations sections) to become an expert in designing with this brand. Hard rules:
- **No emoji.** No gradients. No images for backgrounds.
- **Dark by default.** Light theme is a token swap, not a redesign.
- **Sentence case** everywhere. Calm, terse copy. No marketing-ese.
- **13 px** is the default body size. Density is the brief.
- Every interactive element has a **keyboard shortcut**, shown in tooltip + cheat sheet.
- Lucide icons only (1.5 px stroke), inline SVG with `currentColor`.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

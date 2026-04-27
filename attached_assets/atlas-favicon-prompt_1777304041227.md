# Replit Agent Prompt — Atlas Favicon and App Icons (Thematic Direction)

## Quick context

Atlas currently has no custom favicon. This task creates a thematic icon that gives Atlas visual identity in browser tabs, bookmarks, and PWA installations.

**This is a 1-2 hour task** (longer than a simple letter mark because we're exploring thematic concepts). Do not expand scope beyond icon generation and asset packaging.

---

## Design direction

Atlas is a personal command center. The icon should carry meaning — not just initials. We want a thematic mark that connects to what Atlas actually does and what the name evokes.

The user wants to compare **three thematic concepts** at favicon size before choosing one. Generate all three, present them side-by-side at 32x32 and 64x64, and let the user pick.

### Concept 1: Compass Rose

**Theme:** Atlas literally means "book of maps." A compass rose suggests navigation, direction, finding your way through the territory of your work and life.

**Visual specifications:**
- A simplified four-pointed compass rose (just the four cardinal direction markers)
- Two crossed lines forming a plus/star shape, with the points slightly elongated
- Optional: a subtle dot or ring at the center
- Modern, geometric, NOT decorative or vintage
- White or near-white on the brand accent blue background

**Reference style:** Clean, geometric, like a modern navigation app. Think the Apple Maps icon's compass — simplified, not literal.

### Concept 2: Knowledge Graph

**Theme:** Atlas's `@`, `#`, `[[` system creates a real graph connecting your tasks, notes, people, and journals. The icon represents this interconnection.

**Visual specifications:**
- Three dots arranged in a triangular formation
- Connected by thin lines forming a triangle
- Each dot equal in size; lines slightly thinner than dot diameter
- Centered with breathing room around the shape
- White dots and lines on the brand accent blue background

**Reference style:** Minimalist node graph, like simplified network diagrams. Should read as "things connected" at a glance.

### Concept 3: Stratum / Layered Foundation

**Theme:** Atlas accumulates knowledge over time, layer by layer. The icon evokes geological strata — layers of accumulated meaning. Also a subtle nod to the design system's name (Stratum).

**Visual specifications:**
- Three horizontal bars stacked vertically, each slightly different width
- Bottom bar widest, middle bar medium, top bar narrowest (or similar progression)
- Bars have rounded ends, modest gap between each
- Centered horizontally and vertically with breathing room
- White bars on the brand accent blue background

**Reference style:** Like a minimalist data visualization or a stylized "F" without the vertical stem. Clean horizontals, geometric.

---

## Common specifications across all three concepts

**Background:**
- Color: the brand accent blue used throughout Atlas (check Stratum tokens — likely something close to `--accent-primary`, the same blue as the primary buttons and capture button)
- Shape: rounded square (squircle), 8px radius for 32x32, scaled proportionally
- Solid fill, no gradient

**Foreground glyph:**
- Color: white or near-white (98%-100% lightness)
- Stroke weight: where applicable, thicker rather than thinner — must be readable at 16x16
- Padding: ~15-18% of canvas size on all sides; glyph should not touch edges

**What NOT to do (any concept):**
- No gradients, drop shadows, glows, or 3D effects
- No outline-only versions; all glyphs are solid white on solid blue
- No text or letters
- No multi-color glyphs (only white + accent blue background)
- No photographic or skeuomorphic elements
- No animations (static SVG only)

---

## Process

### Step 1: Generate three concepts

Create SVG versions of all three concepts at 256x256 working size (will be scaled to other sizes later).

### Step 2: Render previews

Generate PNG previews at three sizes for each concept:
- 16x16 (smallest favicon — readability test)
- 32x32 (standard favicon size)
- 64x64 (Retina favicon size — appearance test)

Display all three concepts side-by-side at each size. The user picks one based on:
- Readability at 16x16 (does it still register?)
- Distinctiveness at 32x32 (does it have presence?)
- Beauty at 64x64 (does it look polished?)

### Step 3: User confirmation

Show all three concepts in a single comparison view. Wait for user to select one before proceeding.

The user may also ask for variations of a chosen concept (e.g., "compass rose but thicker," "knowledge graph with bigger dots"). Iterate as needed before finalizing.

### Step 4: Generate full asset set

Once confirmed, package the chosen concept into the full icon set:

1. **`/public/favicon.ico`** — Multi-resolution ICO file containing 16x16, 32x32, 48x48
2. **`/public/icon.png`** — 512x512 PNG (Next.js will derive smaller sizes if needed)
3. **`/public/apple-icon.png`** — 180x180 PNG for iOS home screen pinning
4. **`/public/icon-192.png`** — 192x192 PNG for PWA manifest
5. **`/public/icon-512.png`** — 512x512 PNG for PWA manifest
6. **`/public/icon.svg`** — Original vector source, clean (single path or small group of paths)

### Step 5: Wire up references

**Update `/app/layout.tsx`** metadata:
```typescript
export const metadata = {
  title: 'Atlas',
  description: 'Personal command center',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
}
```

**Create or update `/public/manifest.json`:**
```json
{
  "name": "Atlas",
  "short_name": "Atlas",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#YOUR_ACCENT_BLUE_HEX",
  "background_color": "#YOUR_DARK_BG_HEX",
  "display": "standalone",
  "start_url": "/"
}
```

Substitute the actual hex values from Stratum tokens.

---

## Verification

1. Hard refresh browser → favicon visible in browser tab (Cmd+Shift+R)
2. Bookmark page → bookmark shows favicon
3. iOS Safari "Add to Home Screen" → home screen icon shows the apple-icon
4. Chrome DevTools → Application → Manifest → all icon entries resolve
5. The chosen icon is recognizable at 16x16 in browser tab

---

## Stop and ask if

- The accent blue hex value isn't documented in Stratum tokens (need to extract it before generating)
- The user wants a fourth concept beyond the three above
- The user wants to combine elements of two concepts (e.g., compass rose with three dots) — this is fine but takes design judgment to keep clean
- The user prefers a different background color than accent blue (e.g., dark surface to match the dark theme)

---

## Out of scope

- Splash screens (Phase 2 PWA polish)
- Marketing graphics or logo for non-icon contexts (commercial phase)
- Animated icons (Phase 2 if ever)
- Multiple themed variations (e.g., dark mode favicon — modern browsers handle this differently anyway)

---

## Final note

Of the three concepts, my recommendation if forced to pick one is **Compass Rose** — it ties most directly to the Atlas name's meaning, has the strongest navigation/command-center metaphor, and is the most universally legible at small sizes.

But the point of generating three is to let the user choose based on actually seeing them. Render them carefully and present them as equal options.

## Goal
Add a light/dark theme toggle to the global header so users can switch between dark (current) and light mode.

## Approach

### 1. Theme infrastructure
- Add `next-themes` provider in `src/App.tsx` wrapping the app, configured with `attribute="class"`, `defaultTheme="dark"`, and `enableSystem` so we can also support "system".
- Tailwind already has `darkMode: ["class"]` configured — no change needed there.

### 2. Light theme tokens in `src/index.css`
- Keep existing `:root` values as the **light** palette baseline, OR (cleaner) move current dark values under `.dark` and define a fresh light palette under `:root`.
- Define light values for every token currently used:
  - Core: `background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring`
  - App-specific: `canvas, node, node-border, connection, toolbar, palette, badge-bg, badge-text`
  - Sidebar: `sidebar-*`
  - Marketing Studio: `ms-bg, ms-surface, ms-surface-2, ms-border, ms-cta, ms-cta-2, ms-glow`
- Audit gradient/glass utility classes (`.ms-glass`, `.ms-hero-glow`, `.ms-grid-bg`, etc.) that hard-code dark hsl values and add `.dark` / light variants where needed so the marketing studio surfaces don't look broken in light mode.

### 3. Theme toggle component
- New `src/components/ThemeToggle.tsx` — icon button using `Sun` / `Moon` from lucide-react, calls `setTheme` from `next-themes`. Shows current state, animates the icon swap.
- Mounted in `src/components/GlobalHeader.tsx` in the right-side action cluster (before Pricing/Login when logged out, before notification bell when logged in). Also surfaced in the mobile menu.

### 4. Persistence
Handled automatically by `next-themes` via `localStorage` (`theme` key). No custom store needed.

## Out of scope
- Re-skinning every page pixel-perfectly for light mode (the auth video showcase, marketing studio gradients, canvas spaces) — we'll do a first-pass that is functional and readable in light mode; deep visual polish per page can be a follow-up.
- Adding the toggle inside Marketing Studio's own `TopHeader` (separate header component) — can be added in a follow-up if you want it there too.

## Files touched
- `src/App.tsx` — wrap with `ThemeProvider`
- `src/index.css` — add light palette + audit hardcoded utilities
- `src/components/ThemeToggle.tsx` — new
- `src/components/GlobalHeader.tsx` — mount toggle (desktop + mobile)
- `package.json` — add `next-themes`

## Question
Should the toggle also appear inside the **Marketing Studio** header (`src/components/marketingstudio/TopHeader.tsx`), or only the global header for now?

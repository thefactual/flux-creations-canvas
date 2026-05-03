
## Goal

Turn "Marketing Studio" into a third **mode** of the unified `/image` generator instead of a separate route. Clicking the tab swaps the prompt bar in-place to the full Marketing Studio prompt bar (with the Product/App pill on the left, references, format picker, avatar/product pickers, duration, resolution, etc.). Backend (orchestrator, Claude script writer, Seedance, AtlasCloud asset registration) is **untouched** — same `marketing-orchestrate` call, same project creation, same navigation to `/marketingstudio/:slug` to view the result.

The standalone `/marketingstudio` landing page (hero + "Generate across formats" grid) is fully removed. Project detail pages (`/marketingstudio/:slug`) stay as-is — that's where renders show up.

## Decisions (you confirmed / I picked)

1. **`/marketingstudio` route**: fully removed. Any link there now goes to `/image` with marketing mode preselected. `/marketingstudio/:slug` (project view) stays.
2. **State persistence between tabs**: persist within the session. Lift the marketing prompt bar state (prompt text, product/avatar selections, references, format, aspect, duration, res) into the existing `marketingStudioStore`. Tabbing Image → Marketing → Image keeps everything; only "New project" or successful generate clears it. Uploaded references persist too.
3. **Layout**: marketing mode is heavier, so on `/image`:
   - The bottom prompt-bar dock auto-grows to fit (no vertical clipping).
   - The left **Product/App** vertical pill stays attached to the left of the prompt bar (same as today on `/marketingstudio`), as a floating element — not a full sidebar. On viewports < `md`, it collapses into a small toggle button at the top-left of the prompt bar that opens it as a popover, so the prompt bar height matches Image/Video on mobile.
   - The page body above the prompt bar shows the existing image grid in Image/Video modes, and the **"Generate across formats"** video grid (the 10 format cards) in Marketing mode — so Recreate still works without leaving the page.

## Changes

### 1. `src/store/promptModeStore.ts`
Add `'marketing'` to `PromptMode`:
```ts
export type PromptMode = 'image' | 'video' | 'marketing';
```

### 2. `src/components/PromptNavBar.tsx`
Convert the Marketing Studio item from a `NavLink` to an `onClick` that calls `setMode('marketing')` and `navigate('/image')` if not already there. Active when `onImageRoute && mode === 'marketing'`. Remove the `to: '/marketingstudio'` branch.

### 3. `src/pages/Generator.tsx`
Render based on `mode`:
- `mode === 'image'` → `<PromptBar />` + `<ImageGrid />` (today's behavior)
- `mode === 'video'` → `<VideoPromptBarInline />` + `<ImageGrid />` (today's behavior)
- `mode === 'marketing'` → `<MarketingPromptBar />` + `<FormatsGrid />` (the 10 format cards extracted from the old landing page)

The prompt-bar dock keeps the same fixed-bottom + framer-motion blur/layout swap.

### 4. `src/components/marketingstudio/PromptBar.tsx`
Two small adjustments — no logic changes:
- Lift local `useState` for `prompt`, `surface`, `mode` (format), `aspect`, `res`, `duration`, `productId/Thumb/Name`, `avatarId/Thumb/Name`, `extraRefs`, `exactVoiceover` into `marketingStudioStore` (new `draft` slice). This way Image ↔ Marketing tab swaps don't reset.
- The component already navigates to `/marketingstudio/:slug` after a successful generate — keep as-is. After navigation, the tab is no longer relevant (we're on the project page).

A new wrapper export `MarketingPromptBar` in `src/components/generator/MarketingPromptBar.tsx` simply re-renders `<PromptBar />` (from `marketingstudio/`) so it lives next to the other generator bars and matches naming.

### 5. New `src/components/generator/FormatsGrid.tsx`
Extract the `FORMATS` array, `FormatCard` component, and `BoltIcon` from the deleted `MarketingStudio.tsx`. Render the same grid above the prompt-bar dock when `mode === 'marketing'`. Recreate button still dispatches `RECREATE_EVENT`, which the marketing prompt bar already listens for.

### 6. Routes (`src/App.tsx`)
- Remove `<Route path="/marketingstudio" element={<MarketingStudio />} />`.
- Add `<Route path="/marketingstudio" element={<Navigate to="/image" replace />} />` so old links don't 404. The mode defaults to whatever the store currently holds; if you want the redirect to also force marketing mode, the navigate target becomes `/image` and a tiny effect on Generator reads a `?mode=marketing` query param.
- Keep `<Route path="/marketingstudio/:slug" element={<MarketingStudioProject />} />` exactly as-is.

### 7. Sidebar references
- `marketingstudio/Sidebar.tsx` "New project" button currently does `navigate('/marketingstudio')` — change to `navigate('/image')` and `setMode('marketing')`.
- `MarketingStudioProject.tsx` "Back" button (in `TopHeader` with `showBack`) currently goes to `/marketingstudio` — repoint to `/image` with marketing mode.

### 8. Delete
- `src/pages/MarketingStudio.tsx` (landing page no longer needed; format grid + prompt bar live on `/image`).

## Layout sketch (Marketing mode on `/image`)

```text
┌─────────────────────────────── /image ───────────────────────────────┐
│  GlobalHeader                                                         │
│                                                                       │
│   ┌──────────── Generate across formats (10 cards) ───────────┐      │
│   │  [card] [card] [card] [card] [card]                       │      │
│   │  [card] [card] [card] [card] [card]                       │      │
│   └────────────────────────────────────────────────────────────┘      │
│                                                                       │
│        [ Image | Video | Motion | Marketing Studio ]   ← nav bar      │
│  ┌──┐  ┌──────────────────────────────────────────────────────┐       │
│  │Pr│  │ + | refs / @mentions / textarea          [Product]   │       │
│  │od│  │     prompt …                              [Avatar]   │       │
│  │──│  │ Format ▾  Aspect ▾  Res ▾  Duration ▾   [Generate]   │       │
│  │Ap│  │                                                       │       │
│  │p │  └──────────────────────────────────────────────────────┘       │
│  └──┘                                                                  │
└───────────────────────────────────────────────────────────────────────┘
```

## What does NOT change

- `marketing-orchestrate` edge function, Claude Sonnet 4.5 script writer, Higgsfield prompt rules, Unboxing two-lane logic, AtlasCloud asset registration — all untouched.
- `MarketingStudioProject` page (`/marketingstudio/:slug`) and its sidebar with project list — untouched. After clicking Generate, the user still lands on that page to watch the render.
- Image and Video modes — untouched.

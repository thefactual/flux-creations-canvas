# Images

Drop image files here and they appear automatically (no code change needed).
Until a file exists, the app falls back to a colored gradient placeholder.

## Expected filenames

Current files are `.webp` (provided). Tiles 5–6 have no file yet, so they
show a gradient until you add `post-5.webp` / `post-6.webp`.

| File           | Where it shows                          |
| -------------- | --------------------------------------- |
| `avatar.webp`  | Creator avatar (profile + chat header)  |
| `post-1.webp`  | Content tile 1                          |
| `post-2.webp`  | Content tile 2                          |
| `post-3.webp`  | Content tile 3                          |
| `post-4.webp`  | Content tile 4                          |
| `post-5.webp`  | Content tile 5 (not added yet)          |
| `post-6.webp`  | Content tile 6 (not added yet)          |

Notes:
- Use `.jpg` (or change the extension in `src/store/contentStore.ts` /
  `ProfileHeader.tsx` if you prefer `.png`/`.webp`).
- Recommended: square-ish avatar (~600px), portrait content tiles (4:5, ~1000px).
- Files placed in `public/` are served from the site root, so `avatar.jpg`
  here is referenced as `/images/avatar.jpg`.

# Images

Drop image files here and they appear automatically (no code change needed).
Until a file exists, the app falls back to a colored gradient placeholder.

## Expected filenames

| File                  | Where it shows                          |
| --------------------- | --------------------------------------- |
| `avatar.jpg`          | Creator avatar (profile + chat header)  |
| `post-1.jpg`          | Content tile 1                          |
| `post-2.jpg`          | Content tile 2                          |
| `post-3.jpg`          | Content tile 3                          |
| `post-4.jpg`          | Content tile 4                          |
| `post-5.jpg`          | Content tile 5                          |
| `post-6.jpg`          | Content tile 6                          |

Notes:
- Use `.jpg` (or change the extension in `src/store/contentStore.ts` /
  `ProfileHeader.tsx` if you prefer `.png`/`.webp`).
- Recommended: square-ish avatar (~600px), portrait content tiles (4:5, ~1000px).
- Files placed in `public/` are served from the site root, so `avatar.jpg`
  here is referenced as `/images/avatar.jpg`.

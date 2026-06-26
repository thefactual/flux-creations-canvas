# Move HottiesOnly into its own repo (`thefactual/Hottiesonly`)

The app currently lives in `flux-creations-canvas`, on branch
`claude/pay-to-chat-frontend-j8apfg`, inside this `hottiesonly/` folder.
The dedicated repo `thefactual/Hottiesonly` already exists but is empty.

Run these on your own machine to populate it (the agent's environment is
network-scoped to `flux-creations-canvas` and can't push elsewhere):

```bash
# 1. get the app from the feature branch
git clone https://github.com/thefactual/flux-creations-canvas.git
cd flux-creations-canvas
git checkout claude/pay-to-chat-frontend-j8apfg

# 2. make hottiesonly/ the root of the new repo, with clean history
cd hottiesonly
git init -b main
git add .
git commit -m "Initial commit: HottiesOnly creator + chat frontend"
git remote add origin https://github.com/thefactual/Hottiesonly.git
git push -u origin main
```

If the push is rejected because the repo isn't empty (e.g. a README was
added at creation), force the first push:

```bash
git push -u origin main --force
```

## Then deploy (live URL)

1. https://vercel.com/new → sign in with GitHub
2. Import **`thefactual/Hottiesonly`**
3. Framework auto-detects **Vite**; build + output come from `vercel.json`.
   Root Directory is the repo root — no change needed.
4. **Deploy** → you get `https://hottiesonly.vercel.app`

Run it locally first if you want:

```bash
npm install
npm run dev      # http://127.0.0.1:5180
```

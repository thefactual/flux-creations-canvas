# HottiesOnly (HO.com)

Pay-to-chat creator monetization frontend — the **creator profile + chat** slice
of HO.com. The creator profile doubles as the landing page (the funnel entry
point ads point to); the chat is where engagement and spend happen via messages,
tips, gifts, and PPV unlocks.

> Standalone app. No dependency on the Korsola/HO.ai codebase.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS (custom brand theme, no component-library runtime deps)
- Zustand for state (wallet, chat, UI), persisted to `localStorage`
- Lightweight hand-rolled UI primitives (Modal, Button) — no Radix

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5180
npm run build    # typecheck + production build
npm run test     # unit tests (vitest)
```

## Routes

| Path            | Screen                                            |
| --------------- | ------------------------------------------------- |
| `/`             | Creator profile / landing (also `/:handle`)       |
| `/chat`         | Pay-to-chat conversation (also `/:handle/chat`)   |

## What's implemented

- **Creator profile**: banner, avatar, AI-disclosure badge, bio, live stats,
  subscription CTA, locked content grid with PPV unlock + subscribe gating.
- **Pay-to-chat**: message thread with typing indicator, 1-credit-per-message
  gating, out-of-credits paywall, gifts + tips inline, mock creator replies.
- **Billing**: buy-credits modal (4 packs) and subscribe modal (Monthly / VIP),
  both with mock checkout. Credits + subscription + unlocked posts persist locally.

## Stubs to wire for production

1. **Payments** — `BuyCreditsModal` / `SubscribeModal` mock checkout. Swap for an
   adult-friendly PSP (CCBill / Segpay) + a backend ledger. The platform takes
   20%, creators keep 80%.
2. **Chat backend** — `chatStore.mockReply` returns canned text. Replace with a
   fine-tuned LLM call carrying per-subscriber memory (or route to a VA/hybrid).
3. **Creator data** — `src/data/creator.ts` is hardcoded for one profile. Fetch
   per-`:handle` from the creator/operator dashboard.
4. **Auth + age gate (18+)** and **compliance** (operator ID on file, AI badge,
   FTC disclosure) per the business doc.

## Project layout

```
src/
  data/            creator + credit-pack mock data
  store/           walletStore, chatStore, uiStore (+ tests)
  components/
    layout/        Header, Footer
    creator/       ProfileHeader, ContentGrid
    chat/          MessageList, Composer, GiftBar
    billing/       BuyCreditsModal, SubscribeModal
    ui/            Modal, Button
  pages/           CreatorProfile, Chat
```

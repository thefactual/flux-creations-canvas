import { useState } from "react";
import { Gift as GiftIcon, X } from "lucide-react";
import { GIFTS, type Gift } from "@/data/creator";
import { useWallet } from "@/store/walletStore";
import { useChat } from "@/store/chatStore";
import { useUI } from "@/store/uiStore";
import { cn } from "@/lib/utils";

const TIP_PRESETS = [5, 10, 20, 50];

export function GiftBar() {
  const [open, setOpen] = useState(false);
  const credits = useWallet((s) => s.credits);
  const spend = useWallet((s) => s.spend);
  const pushEvent = useChat((s) => s.pushEvent);
  const openBuyCredits = useUI((s) => s.openBuyCredits);

  const sendGift = (gift: Gift) => {
    if (!spend(gift.credits)) return openBuyCredits();
    pushEvent("gift", `Sent ${gift.emoji} ${gift.label} · ${gift.credits} cr`);
    setOpen(false);
  };

  const sendTip = (amount: number) => {
    if (!spend(amount)) return openBuyCredits();
    pushEvent("tip", `Tipped ${amount} credits 💸`);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-semibold text-white/80 transition-colors hover:border-brand-500/50 hover:text-white"
      >
        <GiftIcon className="h-4 w-4 text-brand-500" /> Gift
      </button>
    );
  }

  return (
    <div className="animate-slide-up rounded-2xl border border-ink-700 bg-ink-850 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Send a gift or tip</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {GIFTS.map((gift) => {
          const afford = credits >= gift.credits;
          return (
            <button
              key={gift.id}
              onClick={() => sendGift(gift)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border border-ink-700 bg-ink-900 py-2.5 transition-colors hover:border-brand-500/50",
                !afford && "opacity-50",
              )}
            >
              <span className="text-xl">{gift.emoji}</span>
              <span className="text-[11px] font-semibold text-white/70">{gift.credits} cr</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-white/40">Tip:</span>
        {TIP_PRESETS.map((amt) => (
          <button
            key={amt}
            onClick={() => sendTip(amt)}
            className="flex-1 rounded-lg bg-ink-700 py-1.5 text-xs font-bold transition-colors hover:brand-gradient"
          >
            {amt}
          </button>
        ))}
      </div>
    </div>
  );
}

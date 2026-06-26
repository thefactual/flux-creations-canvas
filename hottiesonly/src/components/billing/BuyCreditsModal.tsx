import { useState } from "react";
import { Gem, Loader2, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CREDIT_PACKS, type CreditPack } from "@/data/credits";
import { useUI } from "@/store/uiStore";
import { useWallet } from "@/store/walletStore";
import { formatPrice, cn } from "@/lib/utils";

export function BuyCreditsModal() {
  const open = useUI((s) => s.buyCreditsOpen);
  const closeAll = useUI((s) => s.closeAll);
  const addCredits = useWallet((s) => s.addCredits);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Mock checkout — production hands off to CCBill/Segpay (adult-friendly PSPs).
  const buy = (pack: CreditPack) => {
    if (pendingId) return;
    setPendingId(pack.id);
    window.setTimeout(() => {
      addCredits(pack.credits);
      setPendingId(null);
      closeAll();
    }, 1000);
  };

  return (
    <Modal
      open={open}
      onClose={() => !pendingId && closeAll()}
      title={
        <span className="flex items-center gap-2">
          <Gem className="h-5 w-5 text-brand-500" /> Get credits
        </span>
      }
      description="Credits power your messages, tips, gifts, and PPV unlocks."
    >
      <div className="grid gap-2.5">
        {CREDIT_PACKS.map((pack) => {
          const pending = pendingId === pack.id;
          return (
            <button
              key={pack.id}
              disabled={!!pendingId}
              onClick={() => buy(pack)}
              className={cn(
                "group flex items-center justify-between rounded-2xl border border-ink-700 bg-ink-850 px-4 py-3 text-left transition-colors hover:border-brand-500/60 disabled:opacity-60",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15">
                  <Gem className="h-5 w-5 text-brand-500" />
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{pack.credits} credits</span>
                  {pack.badge && (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {pack.badge}
                    </span>
                  )}
                </div>
              </div>
              <span className="min-w-[68px] text-right">
                {pending ? (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin text-brand-500" />
                ) : (
                  <span className="rounded-xl bg-ink-700 px-3 py-1.5 text-sm font-bold group-hover:brand-gradient">
                    {formatPrice(pack.priceCents)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
        <ShieldCheck className="h-3.5 w-3.5" /> Discreet billing · Demo checkout, no real charge
      </p>
    </Modal>
  );
}

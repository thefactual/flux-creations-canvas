import { useState } from "react";
import { Check, Loader2, Crown, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SUB_TIERS, CREATOR, type SubTier } from "@/data/creator";
import { useUI } from "@/store/uiStore";
import { useWallet } from "@/store/walletStore";
import { formatPrice, cn } from "@/lib/utils";

export function SubscribeModal() {
  const open = useUI((s) => s.subscribeOpen);
  const closeAll = useUI((s) => s.closeAll);
  const subscribe = useWallet((s) => s.subscribe);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const choose = (tier: SubTier) => {
    if (pendingId) return;
    setPendingId(tier.id);
    window.setTimeout(() => {
      subscribe(tier.id);
      setPendingId(null);
      closeAll();
    }, 1100);
  };

  return (
    <Modal
      open={open}
      onClose={() => !pendingId && closeAll()}
      title={`Subscribe to ${CREATOR.name}`}
      description="Unlock everything, message her anytime, and skip the line."
    >
      <div className="grid gap-3">
        {SUB_TIERS.map((tier) => {
          const pending = pendingId === tier.id;
          return (
            <div
              key={tier.id}
              className={cn(
                "rounded-2xl border p-4",
                tier.highlighted
                  ? "border-brand-500/70 bg-brand-500/[0.07]"
                  : "border-ink-700 bg-ink-850",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {tier.highlighted && <Crown className="h-4 w-4 text-brand-500" />}
                  <span className="font-bold">{tier.name}</span>
                  {tier.highlighted && (
                    <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      Most popular
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-lg font-extrabold">{formatPrice(tier.priceCents)}</span>
                  <span className="text-xs text-white/40">/mo</span>
                </div>
              </div>
              <p className="mt-1 text-sm text-white/50">{tier.blurb}</p>
              <ul className="mt-3 space-y-1.5">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-white/80">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                disabled={!!pendingId}
                onClick={() => choose(tier)}
                className={cn(
                  "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl font-semibold transition-all disabled:opacity-50",
                  tier.highlighted
                    ? "brand-gradient text-white hover:opacity-90"
                    : "bg-ink-700 text-white hover:bg-ink-600",
                )}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Subscribe · ${formatPrice(tier.priceCents)}/mo`
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
        <ShieldCheck className="h-3.5 w-3.5" /> Cancel anytime · Discreet billing · Demo, no real charge
      </p>
    </Modal>
  );
}

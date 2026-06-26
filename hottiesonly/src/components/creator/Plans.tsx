import { Check, Minus, Crown, MessageCircle, Mic, Image as ImageIcon, Video } from "lucide-react";
import { SUB_TIERS, FEATURE_LADDER, type SubTier } from "@/data/creator";
import { useWallet } from "@/store/walletStore";
import { formatPrice, cn } from "@/lib/utils";

const LADDER_ICONS = [MessageCircle, Mic, ImageIcon, Video];

function PlanCard({ tier }: { tier: SubTier }) {
  const subscribedTierId = useWallet((s) => s.subscribedTierId);
  const subscribe = useWallet((s) => s.subscribe);
  const isCurrent = subscribedTierId === tier.id;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border p-5 transition-shadow",
        tier.highlighted
          ? "border-brand-500 bg-brand-50 shadow-xl shadow-brand-500/10"
          : "border-zinc-200 bg-white hover:shadow-lg",
      )}
    >
      {tier.highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full brand-gradient px-3 py-1 text-[11px] font-bold text-white">
          <Crown className="h-3 w-3" /> Most popular
        </span>
      )}

      <h3 className="text-base font-extrabold text-ink-900">{tier.name}</h3>
      <p className="text-sm text-zinc-500">{tier.tagline}</p>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-ink-900">{formatPrice(tier.priceCents)}</span>
        <span className="text-sm text-zinc-500">/mo</span>
      </div>

      <ul className="mt-4 flex-1 space-y-2.5">
        {FEATURE_LADDER.map((feat, i) => {
          const included = i < tier.level;
          const Icon = LADDER_ICONS[i];
          return (
            <li
              key={feat}
              className={cn("flex items-start gap-2 text-sm", included ? "text-ink-900" : "text-zinc-400")}
            >
              {included ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              ) : (
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
              )}
              <span className="flex items-center gap-1.5">
                <Icon className={cn("h-4 w-4 shrink-0", included ? "text-brand-500" : "text-zinc-300")} />
                {feat}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => subscribe(tier.id)}
        disabled={isCurrent}
        className={cn(
          "mt-5 h-11 w-full rounded-2xl text-sm font-bold transition-all disabled:opacity-100",
          isCurrent
            ? "cursor-default bg-zinc-100 text-zinc-500"
            : tier.highlighted
              ? "brand-gradient text-white hover:opacity-90"
              : "bg-ink-900 text-white hover:bg-ink-800",
        )}
      >
        {isCurrent ? "Current plan ✓" : `Subscribe · ${formatPrice(tier.priceCents)}/mo`}
      </button>
    </div>
  );
}

export function Plans() {
  return (
    <section id="plans" className="scroll-mt-20 bg-zinc-50 py-12">
      <div className="mx-auto max-w-5xl px-5">
        <div className="mx-auto mb-8 max-w-xl text-center">
          <h2 className="text-2xl font-extrabold text-ink-900 sm:text-3xl">Choose your access</h2>
          <p className="mt-2 text-zinc-500">
            Every tier includes chat. Level up for voice, photos, and videos — all inside our chat.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {SUB_TIERS.map((tier) => (
            <PlanCard key={tier.id} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}

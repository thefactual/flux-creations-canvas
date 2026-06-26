import { useState } from 'react';
import { Gem, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CREDIT_PACKS, formatPrice, type CreditPack } from '@/store/chatStore';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: (pack: CreditPack) => void;
};

export function BuyCreditsModal({ open, onOpenChange, onPurchase }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Mock checkout — in production this hands off to Stripe / a Supabase edge function.
  const handleBuy = (pack: CreditPack) => {
    if (pendingId) return;
    setPendingId(pack.id);
    window.setTimeout(() => {
      onPurchase(pack);
      setPendingId(null);
      onOpenChange(false);
    }, 1100);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pendingId && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gem className="w-5 h-5 text-[#9C3FED]" />
            Buy credits
          </DialogTitle>
          <DialogDescription>
            Each message costs 1 credit. Top up to keep the conversation going.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-3">
          {CREDIT_PACKS.map((pack) => {
            const isPending = pendingId === pack.id;
            return (
              <button
                key={pack.id}
                disabled={!!pendingId}
                onClick={() => handleBuy(pack)}
                className={cn(
                  'group flex items-center justify-between rounded-2xl border border-ms-border bg-ms-surface-2 px-4 py-3 text-left transition-colors',
                  'hover:border-[#9C3FED]/60 disabled:opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#9C3FED]/15">
                    <Gem className="w-5 h-5 text-[#9C3FED]" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">
                        {pack.credits} credits
                      </span>
                      {pack.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-lime-300 text-black">
                          {pack.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatPrice(Math.round(pack.priceCents / pack.credits))} per message
                    </span>
                  </div>
                </div>
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="rounded-xl bg-[#9C3FED] px-3 py-1.5 text-white group-hover:bg-[#8a2fda] transition-colors">
                      {formatPrice(pack.priceCents)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-primary" />
          Demo checkout — no real charge is made.
        </p>
      </DialogContent>
    </Dialog>
  );
}

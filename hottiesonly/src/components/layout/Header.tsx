import { Link, useLocation } from "react-router-dom";
import { Flame, Gem, Plus } from "lucide-react";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";

export function Header() {
  const credits = useWallet((s) => s.credits);
  const openBuyCredits = useUI((s) => s.openBuyCredits);
  const location = useLocation();
  const onChat = location.pathname.includes("/chat");

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl brand-gradient">
            <Flame className="h-4 w-4 text-white" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            Hotties<span className="brand-text">Only</span>
          </span>
        </Link>

        <button
          onClick={openBuyCredits}
          className="flex items-center gap-2 rounded-2xl border border-ink-700 bg-ink-850 py-2 pl-3 pr-2 text-sm font-semibold transition-colors hover:border-brand-500/50"
          title="Get credits"
        >
          <Gem className="h-4 w-4 text-brand-500" />
          <span className="tabular-nums">{credits}</span>
          {!onChat && (
            <span className="grid h-6 w-6 place-items-center rounded-lg brand-gradient">
              <Plus className="h-3.5 w-3.5 text-white" />
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

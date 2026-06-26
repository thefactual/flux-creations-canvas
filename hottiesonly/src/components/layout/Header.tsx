import { Link, useLocation } from "react-router-dom";
import { Flame, Gem, Sparkles } from "lucide-react";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";

export function Header() {
  const credits = useWallet((s) => s.credits);
  const openBuyCredits = useUI((s) => s.openBuyCredits);
  const location = useLocation();
  const onChat = location.pathname.includes("/chat");

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl brand-gradient">
            <Flame className="h-4 w-4 text-white" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-ink-900">
            Hotties<span className="brand-text">Only</span>
          </span>
        </Link>

        {onChat ? (
          <button
            onClick={openBuyCredits}
            className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 py-2 px-3 text-sm font-semibold text-ink-900 transition-colors hover:border-brand-500/50"
            title="Get credits"
          >
            <Gem className="h-4 w-4 text-brand-500" />
            <span className="tabular-nums">{credits}</span>
          </button>
        ) : (
          <a
            href="#plans"
            className="inline-flex items-center gap-1.5 rounded-2xl brand-gradient px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> Subscribe
          </a>
        )}
      </div>
    </header>
  );
}

import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Sparkles, Gem } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { CREATOR } from "@/data/creator";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";

export default function Chat() {
  const credits = useWallet((s) => s.credits);
  const openBuyCredits = useUI((s) => s.openBuyCredits);

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col">
      {/* Conversation header */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/80 px-3 py-2.5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            to="/"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/60 transition-colors hover:bg-ink-800 hover:text-white"
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="relative shrink-0">
            <div
              className="h-10 w-10 rounded-full"
              style={{
                backgroundImage: `linear-gradient(135deg, hsl(${CREATOR.avatarHue} 85% 60%), hsl(${
                  CREATOR.avatarHue - 40
                } 80% 40%))`,
              }}
            />
            {CREATOR.online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-green-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate font-bold">{CREATOR.name}</span>
              {CREATOR.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-500" />}
              {CREATOR.isAi && (
                <span className="flex items-center gap-0.5 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-400">
                  <Sparkles className="h-2.5 w-2.5" /> AI
                </span>
              )}
            </div>
            <span className="text-xs text-green-400">{CREATOR.online ? "Online now" : "Offline"}</span>
          </div>
        </div>

        <button
          onClick={openBuyCredits}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-semibold transition-colors hover:border-brand-500/50"
        >
          <Gem className="h-4 w-4 text-brand-500" />
          <span className="tabular-nums">{credits}</span>
        </button>
      </div>

      <MessageList />
      <Composer />
    </div>
  );
}

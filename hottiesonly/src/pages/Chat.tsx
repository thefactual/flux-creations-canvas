import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Gem } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";
import { useProfile } from "@/store/profileStore";
import { Avatar } from "@/components/ui/Avatar";

export default function Chat() {
  const credits = useWallet((s) => s.credits);
  const openBuyCredits = useUI((s) => s.openBuyCredits);
  const profile = useProfile((s) => s.profile);

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
            <Avatar
              src={profile.avatarDataUrl ?? "/images/avatar.jpg"}
              hue={profile.avatarHue}
              className="h-10 w-10 rounded-full"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-green-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate font-bold">{profile.name}</span>
              <BadgeCheck className="h-4 w-4 shrink-0 text-brand-500" />
            </div>
            <span className="text-xs text-green-400">Online now</span>
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

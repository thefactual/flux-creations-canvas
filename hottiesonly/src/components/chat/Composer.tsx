import { useState } from "react";
import { Send, Lock } from "lucide-react";
import { useChat, COST_PER_MESSAGE } from "@/store/chatStore";
import { useWallet, canSpend } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";
import { useProfile } from "@/store/profileStore";
import { GiftBar } from "./GiftBar";

export function Composer() {
  const [draft, setDraft] = useState("");
  const credits = useWallet((s) => s.credits);
  const sendText = useChat((s) => s.sendText);
  const openBuyCredits = useUI((s) => s.openBuyCredits);
  const name = useProfile((s) => s.profile.name);

  const affordable = canSpend(credits, COST_PER_MESSAGE);

  const send = () => {
    if (!affordable) return openBuyCredits();
    if (sendText(draft)) setDraft("");
  };

  return (
    <div className="border-t border-ink-800 bg-ink-950 px-4 py-3">
      {!affordable && (
        <button
          onClick={openBuyCredits}
          className="mb-2 flex w-full items-center justify-between rounded-2xl border border-brand-500/40 bg-brand-500/[0.08] px-4 py-2.5 text-left transition-colors hover:bg-brand-500/[0.14]"
        >
          <span className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-brand-500" /> You're out of credits.
          </span>
          <span className="rounded-xl brand-gradient px-3 py-1.5 text-sm font-bold">Get credits</span>
        </button>
      )}

      <div className="flex items-end gap-2">
        <GiftBar />
        <div className="flex flex-1 items-end gap-2 rounded-2xl border border-ink-700 bg-ink-850 p-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={affordable ? `Message ${name}…` : "Top up to keep chatting…"}
            className="max-h-28 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] placeholder:text-white/35 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={affordable && !draft.trim()}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl brand-gradient text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {affordable ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-white/35">
        {COST_PER_MESSAGE} credit per message · {credits} left
      </p>
    </div>
  );
}

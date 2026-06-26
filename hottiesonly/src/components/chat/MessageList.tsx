import { useEffect, useRef } from "react";
import { Sparkles, Gift, DollarSign } from "lucide-react";
import { useChat, type ChatMessage } from "@/store/chatStore";
import { useProfile } from "@/store/profileStore";
import { cn } from "@/lib/utils";

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.role === "user";

  // Tips and gifts render as centered system-style chips.
  if (m.kind !== "text") {
    return (
      <div className="flex justify-center">
        <span className="flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
          {m.kind === "gift" ? <Gift className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
          {m.text}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
          mine
            ? "brand-gradient rounded-br-md text-white"
            : "rounded-bl-md bg-ink-800 text-white",
        )}
      >
        {m.text}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
      style={{ animationDelay: delay }}
    />
  );
}

export function MessageList() {
  const messages = useChat((s) => s.messages);
  const isTyping = useChat((s) => s.isTyping);
  const profile = useProfile((s) => s.profile);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div ref={ref} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center text-center">
          {profile.avatarDataUrl ? (
            <img src={profile.avatarDataUrl} alt="" className="mb-3 h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <div
              className="mb-3 h-16 w-16 rounded-2xl"
              style={{
                backgroundImage: `linear-gradient(135deg, hsl(${profile.avatarHue} 85% 60%), hsl(${
                  profile.avatarHue - 40
                } 80% 40%))`,
              }}
            />
          )}
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-4 w-4 text-brand-500" /> Say hi to {profile.name}
          </p>
          <p className="mt-1 max-w-xs text-sm text-white/50">
            She replies to every message and remembers what you tell her. 1 credit per message.
          </p>
        </div>
      )}

      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}

      {isTyping && (
        <div className="flex justify-start">
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-ink-800 px-4 py-3">
            <Dot delay="0s" />
            <Dot delay="0.15s" />
            <Dot delay="0.3s" />
          </div>
        </div>
      )}
    </div>
  );
}

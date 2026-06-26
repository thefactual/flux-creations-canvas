import { useEffect, useRef, useState } from 'react';
import { Gem, Send, Lock, BadgeCheck, Sparkles } from 'lucide-react';
import { BuyCreditsModal } from '@/components/chat/BuyCreditsModal';
import {
  useChatStore,
  canAfford,
  COST_PER_MESSAGE,
  type CreditPack,
} from '@/store/chatStore';
import { cn } from '@/lib/utils';

// The persona users pay to chat with. Swap these for real creator data later.
const PERSONA = {
  name: 'Luna',
  handle: '@luna.korsola',
  tagline: 'Your AI companion. Always online, always yours.',
  avatar: 'https://api.dicebear.com/9.x/glass/svg?seed=Luna&backgroundType=gradientLinear',
};

export default function PayToChat() {
  const credits = useChatStore((s) => s.credits);
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const send = useChatStore((s) => s.send);
  const addCredits = useChatStore((s) => s.addCredits);

  const [draft, setDraft] = useState('');
  const [buyOpen, setBuyOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const affordable = canAfford(credits);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!affordable) {
      setBuyOpen(true);
      return;
    }
    if (send(draft)) setDraft('');
  };

  const handlePurchase = (pack: CreditPack) => {
    addCredits(pack.credits);
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background">
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-2xl flex-col px-4">
        {/* Persona header */}
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={PERSONA.avatar}
              alt={PERSONA.name}
              className="h-12 w-12 shrink-0 rounded-full bg-ms-surface-2 object-cover ring-2 ring-[#9C3FED]/40"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-base font-semibold text-foreground">{PERSONA.name}</h1>
                <BadgeCheck className="h-4 w-4 shrink-0 text-[#9C3FED]" />
              </div>
              <p className="truncate text-xs text-muted-foreground">{PERSONA.tagline}</p>
            </div>
          </div>
          <button
            onClick={() => setBuyOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-ms-surface-2 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
            title="Buy credits"
          >
            <Gem className="h-4 w-4 text-[#9C3FED]" />
            {credits}
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-ms-border bg-ms-surface/40 p-4"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Sparkles className="mb-3 h-8 w-8 text-[#9C3FED]" />
              <p className="text-sm font-medium text-foreground">Say hi to {PERSONA.name}</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Your first {credits} message{credits === 1 ? '' : 's'} are on the house. Each
                message after costs {COST_PER_MESSAGE} credit.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-[#9C3FED] text-white rounded-br-md'
                    : 'bg-ms-surface-2 text-foreground rounded-bl-md',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-ms-surface-2 px-4 py-3">
                <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="py-4">
          {!affordable && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-[#9C3FED]/40 bg-[#9C3FED]/10 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Lock className="h-4 w-4 text-[#9C3FED]" />
                You're out of credits.
              </span>
              <button
                onClick={() => setBuyOpen(true)}
                className="rounded-xl bg-[#9C3FED] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#8a2fda]"
              >
                Buy credits
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-ms-border bg-ms-surface-2 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={affordable ? `Message ${PERSONA.name}…` : 'Top up to keep chatting…'}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() && affordable}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#9C3FED] text-white transition-colors hover:bg-[#8a2fda] disabled:opacity-40"
              aria-label="Send message"
            >
              {affordable ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {COST_PER_MESSAGE} credit per message · {credits} remaining
          </p>
        </div>
      </div>

      <BuyCreditsModal open={buyOpen} onOpenChange={setBuyOpen} onPurchase={handlePurchase} />
    </div>
  );
}

function Dot({ delay = '0s' }: { delay?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}

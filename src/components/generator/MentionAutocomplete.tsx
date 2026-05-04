// Reusable @-mention autocomplete dropdown + hook for textarea-based prompt bars.
// Matches the visual style of Marketing Studio's mention popover.
import { useCallback, useState, type RefObject } from 'react';

export type MentionItem = {
  id: string;          // tag identifier inserted into prompt as "@<id>"
  label: string;       // human label shown in dropdown (e.g. "Image 1")
  thumbUrl?: string;   // optional preview thumbnail
  kind?: 'image' | 'video' | 'audio' | 'frame';
};

type DetectArgs = {
  value: string;
  caret: number;
};

/**
 * useMentionAutocomplete — manages "@query" detection on a textarea.
 * Insertion replaces the in-progress "@query" with "@<id> ".
 */
export function useMentionAutocomplete(
  textareaRef: RefObject<HTMLTextAreaElement>,
  setPrompt: (next: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState(0); // index of '@' in prompt

  const detect = useCallback(({ value, caret }: DetectArgs) => {
    const upto = value.slice(0, caret);
    // Match @ followed by alnum / underscore — we only insert ids without spaces
    const m = upto.match(/(?:^|\s)@([A-Za-z0-9_]{0,32})$/);
    if (m) {
      setOpen(true);
      setQuery(m[1] || '');
      setAnchor(caret - (m[1]?.length ?? 0) - 1);
      return true;
    }
    setOpen(false);
    return false;
  }, []);

  const insert = useCallback((item: MentionItem, currentPrompt: string) => {
    const ta = textareaRef.current;
    const before = currentPrompt.slice(0, anchor);
    // Skip past whatever the user already typed after '@'
    const afterStart = anchor + 1 + query.length;
    const after = currentPrompt.slice(afterStart);
    const sep = after.startsWith(' ') || after.length === 0 ? '' : ' ';
    const next = `${before}@${item.id}${sep || ' '}${after.startsWith(' ') ? after.slice(1) : after}`;
    setPrompt(next);
    setOpen(false);
    setQuery('');
    requestAnimationFrame(() => {
      const pos = (before + `@${item.id} `).length;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  }, [anchor, query.length, setPrompt, textareaRef]);

  const close = useCallback(() => setOpen(false), []);

  return { open, query, anchor, detect, insert, close };
}

export function MentionDropdown({
  open, query, items, onPick,
}: {
  open: boolean;
  query: string;
  items: MentionItem[];
  onPick: (item: MentionItem) => void;
}) {
  if (!open) return null;
  const q = query.toLowerCase();
  const filtered = items.filter(
    (i) => i.id.toLowerCase().includes(q) || i.label.toLowerCase().includes(q),
  );
  return (
    <div className="absolute left-0 bottom-full mb-2 z-30 w-64 rounded-xl ms-glass shadow-2xl overflow-hidden">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5">
        Reference an upload
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
        ) : (
          filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/5 text-left"
            >
              {i.thumbUrl ? (
                i.kind === 'video' ? (
                  <video src={i.thumbUrl} className="w-7 h-7 rounded-md object-cover" muted />
                ) : (
                  <img src={i.thumbUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
                )
              ) : (
                <span className="w-7 h-7 rounded-md bg-white/5 grid place-items-center text-[10px] text-white/70 font-mono">
                  @
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">@{i.id}</div>
                <div className="text-[10px] text-muted-foreground truncate">{i.label}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

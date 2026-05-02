import { useGeneratorStore, MODELS, QUALITIES, ASPECT_RATIOS } from '@/store/generatorStore';
import { ImagePlus, Minus, Plus, Check, Search, Sparkles, Heart, X } from 'lucide-react';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ReferenceImageStrip } from '@/components/generator/ReferenceImageStrip';
import { ChevronDownIcon } from '@/components/marketingstudio/FormatIcons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ModelIcon } from '@/components/generator/ModelIcons';

export function PromptBar() {
  const {
    prompt, setPrompt, referenceImages, addReferenceImage, removeReferenceImage, reorderReferenceImages,
    model, setModel, quality, setQuality, aspectRatio, setAspectRatio,
    quantity, setQuantity, generate,
  } = useGeneratorStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // @-mention autocomplete
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<number>(0);

  const refNames = referenceImages.map((_, i) => `Image ${i + 1}`);

  const insertMention = (name: string) => {
    setPrompt(
      (() => {
        const p = prompt;
        const sep = p.length === 0 || p.endsWith(' ') || p.endsWith('\n') ? '' : ' ';
        return `${p}${sep}@${name} `;
      })()
    );
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const selectedModel = MODELS.find((m) => m.id === model);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [prompt]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    arr.slice(0, 5 - referenceImages.length).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => addReferenceImage(reader.result as string);
      reader.readAsDataURL(file);
    });
  }, [referenceImages.length, addReferenceImage]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) setDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  }, [handleFiles]);

  const handleSubmit = () => {
    if (prompt.trim()) generate();
  };

  return (
    <div className="relative w-full max-w-[1100px] mx-auto">
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-[22px] ms-glass p-2.5 flex flex-col gap-2 transition-all ${
          dragging ? 'ring-2 ring-[#FF2D78]' : ''
        }`}
      >
        {dragging && (
          <div className="absolute inset-0 rounded-[22px] bg-[#FF2D78]/10 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-sm font-semibold text-[#FF2D78]">Drop images here</span>
          </div>
        )}

        {referenceImages.length > 0 && (
          <ReferenceImageStrip
            images={referenceImages}
            onAdd={() => fileInputRef.current?.click()}
            onPreview={setPreviewImg}
            onRemove={(idx) => {
              const removedName = `Image ${idx + 1}`;
              removeReferenceImage(idx);
              setPrompt(prompt.replace(new RegExp(`@${removedName}\\b`, 'g'), '').replace(/\s{2,}/g, ' ').trim());
            }}
            onReorder={reorderReferenceImages}
            onChipClick={(idx) => insertMention(`Image ${idx + 1}`)}
          />
        )}

        <div className="flex items-center gap-2">
          {/* Left + button (upload reference) — only when no refs yet */}
          {referenceImages.length === 0 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="grid place-items-center w-9 h-9 self-start mt-1 rounded-lg ms-chip-glass text-foreground shrink-0"
              aria-label="Add reference"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />

          {/* Prompt area */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1 pr-1">
            <div className="relative">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                const val = e.target.value;
                setPrompt(val);
                const caret = e.currentTarget.selectionStart ?? val.length;
                const upto = val.slice(0, caret);
                const m = upto.match(/(?:^|\s)@([A-Za-z0-9 ]{0,20})$/);
                if (m && referenceImages.length > 0) {
                  setMentionOpen(true);
                  setMentionQuery(m[1] || '');
                  setMentionAnchor(caret - (m[1]?.length ?? 0) - 1);
                } else {
                  setMentionOpen(false);
                }
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (mentionOpen && (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  setMentionOpen(false);
                }
                if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={2}
              placeholder={referenceImages.length > 0 ? 'Describe the scene… type @ to reference an image' : 'Describe the scene you imagine'}
              className="w-full bg-transparent border-0 text-sm leading-[1.6] text-foreground placeholder:text-muted-foreground/70 focus:outline-none resize-none ms-prompt-scroll min-h-[44px] max-h-[220px] overflow-y-auto"
            />

            {mentionOpen && (
              <div className="absolute left-0 bottom-full mb-2 z-30 w-56 rounded-xl ms-glass shadow-2xl overflow-hidden">
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5">
                  Reference an image
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {refNames
                    .map((name, idx) => ({ name, idx }))
                    .filter((r) => r.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                    .map((r) => (
                      <button
                        key={r.idx}
                        type="button"
                        onClick={() => {
                          const before = prompt.slice(0, mentionAnchor);
                          const after = prompt.slice(mentionAnchor).replace(/^@[A-Za-z0-9 ]*/, '');
                          const next = `${before}@${r.name} ${after.replace(/^\s+/, '')}`;
                          setPrompt(next);
                          setMentionOpen(false);
                          setTimeout(() => {
                            const pos = (before + `@${r.name} `).length;
                            textareaRef.current?.focus();
                            textareaRef.current?.setSelectionRange(pos, pos);
                          }, 0);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/5 text-left"
                      >
                        <img src={referenceImages[r.idx]} alt="" className="w-7 h-7 rounded-md object-cover" />
                        <span className="text-sm text-foreground">@{r.name}</span>
                      </button>
                    ))}
                  {refNames.filter((n) => n.toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Generate CTA */}
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className="ms-cta self-center flex items-center justify-center gap-2 h-[72px] px-7 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Generate
            <Sparkles className="w-4 h-4" />
            <span className="text-[15px] font-bold opacity-95">{quantity}</span>
          </button>
        </div>

        {/* Bottom chips row */}
        <div className="flex items-center gap-2 flex-wrap pl-1">
          {/* Model */}
          <Popover open={modelOpen} onOpenChange={setModelOpen}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <span className="grid place-items-center w-4 h-4 text-foreground/90">
                  <ModelIcon id={model} className="size-3.5" />
                </span>
                {selectedModel?.name || model}
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={10}
              className="w-72 p-0 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] overflow-hidden"
            >
              <ModelDropdownContent
                model={model}
                setModel={(m) => { setModel(m); setModelOpen(false); }}
                search={modelSearch}
                setSearch={setModelSearch}
              />
            </PopoverContent>
          </Popover>

          {/* Aspect ratio */}
          <Popover open={aspectOpen} onOpenChange={setAspectOpen}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <AspectIcon ratio={aspectRatio} className="text-[#FF2D78]" />
                {aspectRatio}
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={10}
              className="w-[280px] p-3 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
            >
              <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase px-2 pt-1 pb-2">
                Aspect Ratio
              </div>
              <div className="grid grid-cols-2 gap-1">
                {ASPECT_RATIOS.map((ar) => {
                  const active = aspectRatio === ar;
                  return (
                    <button
                      key={ar}
                      onClick={() => { setAspectRatio(ar); setAspectOpen(false); }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        active ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                      }`}
                    >
                      <AspectIcon ratio={ar} />
                      <span className="font-medium">{ar}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Quality */}
          <Popover open={qualityOpen} onOpenChange={setQualityOpen}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <Heart className="w-3.5 h-3.5 text-[#FF2D78] fill-[#FF2D78]" />
                {quality}
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={10}
              className="w-44 p-1.5 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">Quality</div>
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  onClick={() => { setQuality(q); setQualityOpen(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    quality === q ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                  }`}
                >
                  {q}
                  {quality === q && <Check className="w-4 h-4 text-[#FF2D78]" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Quantity */}
          <div className="ms-chip-glass flex items-center gap-0.5 px-2 h-9 rounded-full text-xs text-foreground">
            <button
              onClick={() => setQuantity(quantity - 1)}
              className="w-6 h-6 grid place-items-center rounded-full hover:bg-white/10 transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center tabular-nums">{quantity}/4</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-6 h-6 grid place-items-center rounded-full hover:bg-white/10 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="flex-1" />
        </div>
      </div>

      {/* Image preview overlay */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in"
          onClick={() => setPreviewImg(null)}
        >
          <img
            src={previewImg}
            alt="Preview"
            className="max-h-[92vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewImg(null)}
            aria-label="Close"
            className="absolute top-5 right-5 grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function ModelDropdownContent({
  model, setModel, search, setSearch,
}: { model: string; setModel: (m: string) => void; search: string; setSearch: (s: string) => void }) {
  const filtered = MODELS.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const featured = filtered.filter((m) => m.featured);
  const all = filtered.filter((m) => !m.featured);

  return (
    <>
      <div className="p-2 border-b border-white/5">
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 border-0 focus:outline-none flex-1"
          />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto px-1 pb-1 ms-prompt-scroll">
        {featured.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Featured</div>
            {featured.map((m) => (
              <ModelRow key={m.id} m={m} selected={model === m.id} onClick={() => setModel(m.id)} />
            ))}
          </>
        )}
        {all.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">All models</div>
            {all.map((m) => (
              <ModelRow key={m.id} m={m} selected={model === m.id} onClick={() => setModel(m.id)} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function ModelRow({
  m, selected, onClick,
}: { m: { id: string; name: string; desc: string; featured: boolean; badge?: string }; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors ${selected ? 'bg-white/10' : ''}`}
    >
      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${selected ? 'bg-[#FF2D78]/15 text-[#FF2D78]' : 'bg-white/5 text-foreground/90'}`}>
        <ModelIcon id={m.id} className="size-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-foreground">{m.name}</span>
          {m.badge && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FF2D78]/20 text-[#FF2D78]">
              {m.badge}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate block">{m.desc}</span>
      </div>
      {selected && <Check className="w-4 h-4 text-[#FF2D78] shrink-0" />}
    </button>
  );
}

function AspectIcon({ ratio, className = '' }: { ratio: string; className?: string }) {
  if (ratio === 'Auto') return <span className={`w-4 h-4 border border-current rounded-sm opacity-70 ${className}`} />;
  const [w, h] = ratio.split(':').map(Number);
  const maxSize = 14;
  const scale = maxSize / Math.max(w, h);
  return (
    <span className={`w-4 h-4 flex items-center justify-center ${className}`}>
      <span className="border border-current rounded-sm opacity-90" style={{ width: w * scale, height: h * scale }} />
    </span>
  );
}

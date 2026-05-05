import { useVideoStore, VIDEO_MODELS, VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS, getDurationsForModel, getResolutionsForModel } from '@/store/videoStore';
import { ImagePlus, ChevronDown, Check, Search, Play, Video, Film, Wand2 } from 'lucide-react';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';

export function VideoPromptBar() {
  const {
    prompt, setPrompt, referenceImages, addReferenceImage, removeReferenceImage,
    model, setModel, mode, setMode, aspectRatio, setAspectRatio,
    duration, setDuration, resolution, setResolution, generate,
  } = useVideoStore();
  const modelResolutions = useMemo(() => getResolutionsForModel(model), [model]);
  const modelDurations = useMemo(() => getDurationsForModel(model), [model]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  const selectedModel =
    VIDEO_MODELS.find(m => m.id === model && (m.modes as readonly string[]).includes(mode)) ??
    VIDEO_MODELS.find(m => (m.modes as readonly string[]).includes(mode));

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [prompt]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    arr.slice(0, 3 - referenceImages.length).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => addReferenceImage(reader.result as string);
      reader.readAsDataURL(file);
    });
  }, [referenceImages.length, addReferenceImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) { e.preventDefault(); handleFiles(files); }
  }, [handleFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleSubmit = () => {
    generate();
  };

  const modeButtons = [
    { id: 'text-to-video' as const, label: 'Text to Video', icon: Video },
    { id: 'image-to-video' as const, label: 'Image to Video', icon: Film },
    { id: 'motion-control' as const, label: 'Motion Control', icon: Wand2 },
  ];

  return (
    <div className="shrink-0 flex justify-center px-4 pb-4 pt-2">
      <div className="w-full max-w-3xl bg-popover border border-border rounded-2xl shadow-2xl">
        <div className="relative px-4 pt-3 pb-2">
          {/* Mode tabs */}
          <div className="flex items-center gap-1 mb-3">
            {modeButtons.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors border ${
                  mode === m.id
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground border-border/50 hover:bg-muted'
                }`}
              >
                <m.icon className="w-3 h-3" />
                {m.label}
              </button>
            ))}
          </div>

          {/* Reference images */}
          {(mode === 'image-to-video' || mode === 'motion-control') && (
            <div className="flex items-center gap-2 mb-2">
              {referenceImages.map((img, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeReferenceImage(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
              {referenceImages.length < 3 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-14 h-14 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-foreground/30 transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
            </div>
          )}

          {/* Prompt */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={mode === 'text-to-video' ? 'Describe the video you want to create...' : 'Describe how to animate this image...'}
                rows={1}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 resize-none border-0 focus:outline-none py-1 leading-5"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() && mode === 'text-to-video'}
              className="ms-cta shrink-0 flex items-center gap-1.5 font-semibold text-sm text-white px-5 py-2.5 rounded-xl transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              Generate
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 mt-1.5 border-t border-border/50 pt-2 flex-wrap">
            {/* Model */}
            <div className="relative">
              <button
                onClick={() => setModelOpen(!modelOpen)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-full hover:bg-muted transition-colors border border-border/50"
              >
                <span className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">V</span>
                {selectedModel?.name || model}
                <ChevronDown className="w-3 h-3" />
              </button>
              {modelOpen && (
                <VideoModelDropdown
                  model={model}
                  setModel={m => { setModel(m); setModelOpen(false); }}
                  search={modelSearch}
                  setSearch={setModelSearch}
                  onClose={() => setModelOpen(false)}
                  mode={mode}
                />
              )}
            </div>

            {/* Aspect ratio */}
            <div className="flex items-center gap-0.5 border border-border/50 rounded-full px-1">
              {VIDEO_ASPECT_RATIOS.map(ar => (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${aspectRatio === ar ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {ar}
                </button>
              ))}
            </div>

            {/* Duration */}
            <div className="flex items-center gap-0.5 border border-border/50 rounded-full px-1">
              {(modelDurations.length ? modelDurations : VIDEO_DURATIONS).map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${duration === d ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {d}s
                </button>
              ))}
            </div>

            {/* Resolution — only when the active model exposes a resolution control */}
            {modelResolutions.length > 0 && (
              <div className="flex items-center gap-0.5 border border-border/50 rounded-full px-1">
                {modelResolutions.map(r => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${resolution === r ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoModelDropdown({ model, setModel, search, setSearch, onClose, mode }: {
  model: string; setModel: (m: string) => void; search: string; setSearch: (s: string) => void; onClose: () => void; mode: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = VIDEO_MODELS
    .filter(m => (m.modes as readonly string[]).includes(mode))
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const featured = filtered.filter(m => m.featured);
  const all = filtered.filter(m => !m.featured);

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 w-80 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden z-50">
      <div className="p-2">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search models..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 border-0 focus:outline-none flex-1" />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto px-1 pb-1">
        {featured.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
              <ChevronDown className="w-3 h-3" /> Featured
            </div>
            {featured.map(m => (
              <button key={m.id} onClick={() => setModel(m.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-muted transition-colors ${model === m.id ? 'bg-muted' : ''}`}>
                <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-primary shrink-0">V</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-foreground">{m.name}</span>
                    {m.badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">{m.badge}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground truncate block">{m.desc}</span>
                </div>
                {model === m.id && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            ))}
          </>
        )}
        {all.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <ChevronDown className="w-3 h-3" /> All models
            </div>
            {all.map(m => (
              <button key={m.id} onClick={() => setModel(m.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-muted transition-colors ${model === m.id ? 'bg-muted' : ''}`}>
                <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-primary shrink-0">V</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground truncate block">{m.desc}</span>
                </div>
                {model === m.id && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

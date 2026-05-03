import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import { useVideoStore, VIDEO_MODELS, VIDEO_CATALOG, VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS, type VideoCatalogEntry } from '@/store/videoStore';
import { usePromptModeStore, type VideoSubMode } from '@/store/promptModeStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDownIcon } from '@/components/marketingstudio/FormatIcons';
import {
  Sparkles, Search, Check, ImagePlus, Film, Wand2, Move3d, X, Volume2, ChevronRight, ChevronLeft, Image as ImageIcon, Clock, Tag, Video as VideoIcon, Plus,
} from 'lucide-react';

const SUB_MODES: { id: VideoSubMode; label: string; Icon: any; desc: string }[] = [
  { id: 'text-to-video', label: 'Create Video', Icon: Film, desc: 'Generate video from prompt' },
  { id: 'video-edit', label: 'Edit Video', Icon: Wand2, desc: 'Edit existing video with prompts' },
  { id: 'motion-control', label: 'Motion Control', Icon: Move3d, desc: 'Transfer motion from a reference' },
];

// Models that natively support a start + end frame composition for image-to-video.
const START_END_FRAME_MODELS = new Set([
  'kling-v3-pro',
  'kling-v2.5-turbo-pro',
  'kling-v2.6-pro',
  'kling-o3-pro',
  'veo-3.1',
  'veo-3.1-fast',
  'veo-3.1-lite',
  'pixverse-v6',
  'ltx-2-19b',
  'minimax-video',
]);

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function VideoPromptBarInline() {
  const {
    prompt, setPrompt, referenceImages, setReferenceImageAt, removeReferenceImage,
    model, setModel, aspectRatio, setAspectRatio, duration, setDuration, generate,
    characterOrientation, setCharacterOrientation,
  } = useVideoStore();
  const { videoSubMode, setVideoSubMode } = usePromptModeStore();
  const setStoreMode = useVideoStore(s => s.setMode);
  useEffect(() => { setStoreMode(videoSubMode); }, [videoSubMode, setStoreMode]);
  const [sceneControlOn, setSceneControlOn] = useState(true);

  const [modelOpen, setModelOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [enhance, setEnhance] = useState(true);
  const [sound, setSound] = useState(true);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  const isCreate = videoSubMode === 'text-to-video';

  // Catalog entry for the currently-selected model (Create Video uses VIDEO_CATALOG)
  const catalogEntry: VideoCatalogEntry | undefined = useMemo(
    () => VIDEO_CATALOG.find(e => e.id === model),
    [model],
  );

  const filteredModels = VIDEO_MODELS.filter(m =>
    (m.modes as readonly string[]).includes(videoSubMode) &&
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedModel =
    VIDEO_MODELS.find(m => m.id === model && (m.modes as readonly string[]).includes(videoSubMode)) ??
    VIDEO_MODELS.find(m => (m.modes as readonly string[]).includes(videoSubMode));

  // Display name: prefer catalog entry (clean, no provider) for Create Video
  const displayModelName =
    (isCreate && catalogEntry?.name) || selectedModel?.name || 'Select model';

  const isVideoEdit = videoSubMode === 'video-edit';
  const isMotion = videoSubMode === 'motion-control';
  const isGrokEdit = isVideoEdit && model === 'grok-imagine-edit';
  const editSupportsImageRefs = isVideoEdit && (model === 'kling-omni-edit' || model === 'kling-o1-edit-pro');

  // Create Video upload layout comes from the catalog entry
  const createLayout = isCreate ? (catalogEntry?.uploadLayout ?? 'start-end') : 'none';

  const showFrames =
    (isCreate && createLayout !== 'none') ||
    isMotion ||
    isVideoEdit;

  const handleSubmit = () => generate();

  const onUploadAt = (idx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (isVideoEdit) {
      input.accept = idx === 0 ? 'video/*' : 'image/*';
    } else {
      input.accept = idx === 0 && isMotion ? 'video/*,image/*' : 'image/*';
    }
    input.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) {
        const url = await readFile(f);
        setReferenceImageAt(idx, url);
      }
    };
    input.click();
  };

  const SubIcon = SUB_MODES.find(s => s.id === videoSubMode)!.Icon;
  const subLabel = SUB_MODES.find(s => s.id === videoSubMode)!.label;

  return (
    <LayoutGroup>
    <motion.div layout className="relative w-full max-w-[1100px] mx-auto">
      <motion.div
        layout
        transition={{ layout: { duration: 0.42, ease: [0.32, 0.72, 0, 1] } }}
        className="relative rounded-[22px] ms-glass p-2.5 flex flex-col gap-2.5"
      >
        {/* Frame uploaders */}
        <AnimatePresence initial={false}>
          {showFrames && (
            <motion.div
              key={`frames-${videoSubMode}-${createLayout}`}
              layout
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 px-1 pt-1">
                {(() => {
                  // Create Video — drive layout from the catalog entry
                  if (isCreate) {
                    if (createLayout === 'start-end') {
                      return ['Start frame', 'End frame'].map((label, idx) => (
                        <FrameSlot
                          key={label}
                          label={label}
                          optional
                          url={referenceImages[idx]}
                          onUpload={() => onUploadAt(idx)}
                          onRemove={() => removeReferenceImage(idx)}
                        />
                      ));
                    }
                    if (createLayout === 'single-required' || createLayout === 'single-optional') {
                      return (
                        <SingleUploadTile
                          optional={createLayout === 'single-optional'}
                          url={referenceImages[0]}
                          onUpload={() => onUploadAt(0)}
                          onRemove={() => removeReferenceImage(0)}
                        />
                      );
                    }
                    return null;
                  }

                  // Edit Video — existing behavior
                  if (isVideoEdit) {
                    const labels = editSupportsImageRefs
                      ? ['Source video', 'Image 1', 'Image 2', 'Image 3', 'Image 4']
                      : ['Source video'];
                    return labels.map((label, idx) => (
                      <FrameSlot
                        key={label}
                        label={label}
                        optional={idx > 0}
                        url={referenceImages[idx]}
                        onUpload={() => onUploadAt(idx)}
                        onRemove={() => removeReferenceImage(idx)}
                      />
                    ));
                  }
                  // Motion Control — two rich tiles (video + character)
                  if (isMotion) {
                    return (
                      <>
                        <MotionSlot
                          kind="video"
                          title="Add motion to copy"
                          subtitle={<>Video duration:<br/>3–30 seconds</>}
                          url={referenceImages[0]}
                          onUpload={() => onUploadAt(0)}
                          onRemove={() => removeReferenceImage(0)}
                        />
                        <MotionSlot
                          kind="character"
                          title="Add your character"
                          subtitle={<>Image with visible<br/>face and body</>}
                          url={referenceImages[1]}
                          onUpload={() => onUploadAt(1)}
                          onRemove={() => removeReferenceImage(1)}
                        />
                        <SceneControlCard
                          on={sceneControlOn}
                          setOn={setSceneControlOn}
                          source={characterOrientation ?? 'image'}
                          setSource={setCharacterOrientation}
                        />
                      </>
                    );
                  }
                  return (
                    <FrameSlot
                      label="Image"
                      url={referenceImages[0]}
                      onUpload={() => onUploadAt(0)}
                      onRemove={() => removeReferenceImage(0)}
                    />
                  );

                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt + CTA */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1 pr-1">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isMotion
                ? 'Describe additional motion guidance (optional)…'
                : isVideoEdit
                  ? 'Describe how to edit the video…'
                  : 'Describe your video, like "A woman walking through a neon-lit city"'}
              rows={2}
              className="w-full bg-transparent border-0 text-sm leading-[1.6] text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none ms-prompt-scroll min-h-[44px] max-h-[160px]"
              style={{ scrollbarWidth: 'none' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            {!isMotion && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEnhance(!enhance)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-colors ${
                    enhance ? 'text-[#FF2D78] bg-[#FF2D78]/10' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3 h-3" /> Enhance {enhance ? 'on' : 'off'}
                </button>
                <button
                  onClick={() => setSound(!sound)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-colors ${
                    sound ? 'text-[#FF2D78] bg-[#FF2D78]/10' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Volume2 className="w-3 h-3" /> Sound {sound ? 'on' : 'off'}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() && !isMotion && referenceImages.length === 0}
            className="ms-cta self-center flex items-center justify-center gap-2 h-[72px] px-7 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Generate
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom chips row */}
        <div className="flex items-center gap-2 flex-wrap pl-1">
          {/* Sub-mode dropdown */}
          <Popover open={subOpen} onOpenChange={setSubOpen}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <SubIcon className="w-3.5 h-3.5 text-[#FF2D78]" />
                {subLabel}
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start" side="top" sideOffset={10}
              className="w-64 p-1.5 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">Mode</div>
              {SUB_MODES.map(({ id, label, Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => { setVideoSubMode(id); setSubOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    videoSubMode === id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg grid place-items-center bg-white/5 text-foreground/90">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground">{label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{desc}</div>
                  </div>
                  {videoSubMode === id && <Check className="w-3.5 h-3.5 text-[#FF2D78] shrink-0" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Model */}
          <Popover open={modelOpen} onOpenChange={(o) => { setModelOpen(o); if (!o) setExpandedFamily(null); }}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <Film className="w-3.5 h-3.5 text-foreground/80" />
                {displayModelName}
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start" side="top" sideOffset={10}
              className="w-[360px] p-0 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] overflow-hidden"
            >
              {isCreate ? (
                <CreateModelPicker
                  search={search}
                  setSearch={setSearch}
                  selectedId={model}
                  expandedFamily={expandedFamily}
                  setExpandedFamily={setExpandedFamily}
                  onPick={(id) => { setModel(id); setModelOpen(false); setExpandedFamily(null); }}
                />
              ) : (
                <>
                  <div className="p-2 border-b border-white/5">
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search video models…"
                        className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 border-0 focus:outline-none flex-1"
                      />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto px-1 pb-1 ms-prompt-scroll">
                    {filteredModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setModel(m.id); setModelOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors ${model === m.id ? 'bg-white/10' : ''}`}
                      >
                        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${model === m.id ? 'bg-[#FF2D78]/15 text-[#FF2D78]' : 'bg-white/5 text-foreground/90'}`}>
                          <Film className="size-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-foreground">{m.name}</span>
                            {m.badge && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FF2D78]/20 text-[#FF2D78]">{m.badge}</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground truncate block">{m.desc}</span>
                        </div>
                        {model === m.id && <Check className="w-4 h-4 text-[#FF2D78] shrink-0" />}
                      </button>
                    ))}
                    {filteredModels.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">No models for this mode</div>
                    )}
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>

          {/* Aspect */}
          <Popover open={aspectOpen} onOpenChange={setAspectOpen}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <AspectIcon ratio={aspectRatio} className="text-[#FF2D78]" />
                {aspectRatio}
                <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" sideOffset={10}
              className="w-[260px] p-3 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase px-2 pt-1 pb-2">
                Aspect Ratio
              </div>
              <div className="grid grid-cols-3 gap-1">
                {VIDEO_ASPECT_RATIOS.map((ar) => {
                  const active = aspectRatio === ar;
                  return (
                    <button
                      key={ar}
                      onClick={() => { setAspectRatio(ar); setAspectOpen(false); }}
                      className={`flex items-center gap-1.5 justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
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

          {/* Duration */}
          {!isMotion && (
            <Popover open={durationOpen} onOpenChange={setDurationOpen}>
              <PopoverTrigger asChild>
                <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                  {duration}s
                  <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" sideOffset={10}
                className="w-32 p-1.5 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">Duration</div>
                {VIDEO_DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDuration(d); setDurationOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      duration === d ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                    }`}
                  >
                    {d}s
                    {duration === d && <Check className="w-4 h-4 text-[#FF2D78]" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}

          <div className="flex-1" />
        </div>
      </motion.div>
    </motion.div>
    </LayoutGroup>
  );
}

function FrameSlot({
  label, optional, url, onUpload, onRemove,
}: { label: string; optional?: boolean; url?: string; onUpload: () => void; onRemove: () => void }) {
  if (url) {
    return (
      <div className="relative flex-1 max-w-[180px] rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/40">
        {url.startsWith('data:video') || url.match(/\.(mp4|mov|webm)$/i) ? (
          <video src={url} className="w-full h-full object-cover" muted />
        ) : (
          <img src={url} alt="" className="w-full h-full object-cover" />
        )}
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] grid place-items-center hover:bg-black/90 transition"
        >
          <X className="w-3 h-3" />
        </button>
        <div className="absolute bottom-1 left-2 text-[10px] text-white/80">{label}</div>
      </div>
    );
  }
  return (
    <button
      onClick={onUpload}
      className="relative flex-1 max-w-[180px] aspect-video rounded-xl bg-white/[0.03] border border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.06] transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground"
    >
      {optional && (
        <span className="absolute top-1.5 right-2 text-[9px] text-muted-foreground/70 bg-white/5 rounded-full px-1.5 py-0.5">Optional</span>
      )}
      <div className="w-8 h-8 rounded-full bg-white/5 grid place-items-center">
        <ImagePlus className="w-4 h-4" />
      </div>
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function MotionSlot({
  kind, title, subtitle, url, onUpload, onRemove,
}: {
  kind: 'video' | 'character';
  title: string;
  subtitle: React.ReactNode;
  url?: string;
  onUpload: () => void;
  onRemove: () => void;
}) {
  const isVideo = !!url && (url.startsWith('data:video') || /\.(mp4|mov|webm)(\?|$)/i.test(url));
  if (url) {
    return (
      <div className="relative flex-1 max-w-[180px] rounded-xl overflow-hidden border border-white/10 aspect-[3/4] bg-black/40">
        {isVideo ? (
          <video src={url} className="w-full h-full object-cover" muted autoPlay loop playsInline />
        ) : (
          <img src={url} alt="" className="w-full h-full object-cover" />
        )}
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white grid place-items-center hover:bg-black/90 transition"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  const Icon = kind === 'video' ? VideoIcon : Plus;
  return (
    <button
      onClick={onUpload}
      className="relative flex-1 max-w-[180px] aspect-[3/4] rounded-xl bg-white/[0.03] border border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.06] transition-colors flex flex-col items-center justify-center gap-2 px-3 text-muted-foreground"
    >
      <div className="w-9 h-9 rounded-full bg-white/5 grid place-items-center">
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-[12px] font-semibold text-foreground text-center leading-tight">{title}</span>
      <span className="text-[10px] text-muted-foreground/70 text-center leading-tight">{subtitle}</span>
    </button>
  );
}

function SceneControlCard({
  on, setOn, source, setSource,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  source: 'video' | 'image';
  setSource: (v: 'video' | 'image') => void;
}) {
  return (
    <div className="flex-1 min-w-[220px] max-w-[280px] rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-foreground">Scene control mode</span>
        <button
          onClick={() => setOn(!on)}
          className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${on ? 'bg-emerald-500' : 'bg-white/15'}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {on && (
        <>
          <div className="grid grid-cols-2 gap-1 bg-black/30 rounded-lg p-1">
            <button
              onClick={() => setSource('video')}
              className={`flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-md transition-colors ${source === 'video' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <VideoIcon className="w-3 h-3" /> Video
            </button>
            <button
              onClick={() => setSource('image')}
              className={`flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-md transition-colors ${source === 'image' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <ImageIcon className="w-3 h-3" /> Image
            </button>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Choose where the background should come from: the character image or the motion video
          </p>
        </>
      )}
    </div>
  );
}

function AspectIcon({ ratio, className = '' }: { ratio: string; className?: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const max = 14;
  const scale = max / Math.max(w, h);
  return (
    <span className={`w-4 h-4 flex items-center justify-center ${className}`}>
      <span className="border border-current rounded-sm opacity-90" style={{ width: w * scale, height: h * scale }} />
    </span>
  );
}

// =============================================================
// Single wide upload tile (Veo 3.1 Lite, Grok Imagine, Sora 2…)
// =============================================================
function SingleUploadTile({
  optional, url, onUpload, onRemove,
}: { optional?: boolean; url?: string; onUpload: () => void; onRemove: () => void }) {
  if (url) {
    return (
      <div className="relative w-full max-w-[560px] rounded-2xl overflow-hidden border border-white/10 aspect-[16/7] bg-black/40">
        <img src={url} alt="" className="w-full h-full object-cover" />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center hover:bg-black/90 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onUpload}
      className="relative w-full max-w-[560px] aspect-[16/7] rounded-2xl bg-white/[0.03] border border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.06] transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground"
    >
      {optional && (
        <span className="absolute top-2.5 right-3 text-[10px] text-muted-foreground/80 bg-white/5 rounded-full px-2 py-0.5">Optional</span>
      )}
      <div className="w-9 h-9 rounded-full bg-white/5 grid place-items-center">
        <ImageIcon className="w-4.5 h-4.5" />
      </div>
      <div className="text-[13px] text-foreground/90">
        Upload image or <span className="text-white underline underline-offset-2">generate it</span>
      </div>
      <div className="text-[11px] text-muted-foreground/70">PNG, JPG or Paste from clipboard</div>
    </button>
  );
}

// =============================================================
// Higgsfield-style Create Video model picker
// Featured + All models (collapsible families)
// =============================================================
function CreateModelPicker({
  search, setSearch, selectedId, expandedFamily, setExpandedFamily, onPick,
}: {
  search: string;
  setSearch: (v: string) => void;
  selectedId: string;
  expandedFamily: string | null;
  setExpandedFamily: (f: string | null) => void;
  onPick: (id: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const all = VIDEO_CATALOG.filter(e => (e.modes as readonly string[]).includes('text-to-video'));
  const matches = q ? all.filter(e => e.name.toLowerCase().includes(q) || e.familyLabel.toLowerCase().includes(q)) : null;

  const featured = all.filter(e => e.featured);

  // Group non-featured by family
  const families: { family: string; familyLabel: string; familyDesc: string; entries: VideoCatalogEntry[] }[] = [];
  for (const e of all) {
    let f = families.find(x => x.family === e.family);
    if (!f) {
      f = { family: e.family, familyLabel: e.familyLabel, familyDesc: e.familyDesc, entries: [] };
      families.push(f);
    }
    f.entries.push(e);
  }

  const expanded = expandedFamily ? families.find(f => f.family === expandedFamily) : null;

  return (
    <>
      <div className="p-2 border-b border-white/5">
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
          {expanded ? (
            <button onClick={() => setExpandedFamily(null)} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={expanded ? expanded.familyLabel : 'Search…'}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 border-0 focus:outline-none flex-1"
          />
        </div>
      </div>

      <div className="max-h-[440px] overflow-y-auto px-1.5 pb-2 ms-prompt-scroll">
        {/* Search results override sections */}
        {matches ? (
          <div className="pt-2">
            {matches.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No models found</div>
            )}
            {matches.map(e => (
              <CatalogRow key={e.id} entry={e} selected={selectedId === e.id} onPick={() => onPick(e.id)} />
            ))}
          </div>
        ) : expanded ? (
          <div className="pt-2">
            {expanded.entries.map(e => (
              <CatalogRow key={e.id} entry={e} selected={selectedId === e.id} onPick={() => onPick(e.id)} />
            ))}
          </div>
        ) : (
          <>
            {/* Featured */}
            <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">
              <Sparkles className="w-3 h-3" /> Featured models
            </div>
            {featured.map(e => (
              <CatalogRow key={e.id} entry={e} selected={selectedId === e.id} onPick={() => onPick(e.id)} />
            ))}

            {/* All models */}
            <div className="flex items-center gap-1.5 px-2.5 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">
              <Film className="w-3 h-3" /> All models
            </div>
            {families.map(f => {
              const single = f.entries.length === 1;
              if (single) {
                return <CatalogRow key={f.family} entry={f.entries[0]} selected={selectedId === f.entries[0].id} onPick={() => onPick(f.entries[0].id)} />;
              }
              const hasSelected = f.entries.some(e => e.id === selectedId);
              return (
                <button
                  key={f.family}
                  onClick={() => setExpandedFamily(f.family)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors ${hasSelected ? 'bg-white/[0.06]' : ''}`}
                >
                  <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-white/5 text-foreground/90">
                    <Film className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground">{f.familyLabel}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{f.familyDesc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

function CatalogRow({ entry, selected, onPick }: { entry: VideoCatalogEntry; selected: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors ${selected ? 'bg-white/10' : ''}`}
    >
      <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${selected ? 'bg-[#FF2D78]/15 text-[#FF2D78]' : 'bg-white/5 text-foreground/90'}`}>
        <Film className="size-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-foreground font-medium">{entry.name}</span>
          {entry.hasAudio && <Volume2 className="w-3 h-3 text-muted-foreground" />}
          {entry.badge && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${entry.badge === 'EXCLUSIVE' ? 'bg-[#D4FF3F] text-black' : 'bg-[#D4FF3F] text-black'}`}>
              {entry.badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-white/5 rounded-md px-1.5 py-0.5">
            <Tag className="w-2.5 h-2.5" /> {entry.resolution}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-white/5 rounded-md px-1.5 py-0.5">
            <Clock className="w-2.5 h-2.5" /> {entry.durationRange}
          </span>
        </div>
      </div>
      {selected && <Check className="w-4 h-4 text-[#FF2D78] shrink-0 mt-1" />}
    </button>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import { useVideoStore, VIDEO_MODELS, VIDEO_CATALOG, VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS, getDurationsForModel, getResolutionsForModel, type VideoCatalogEntry } from '@/store/videoStore';
import { usePromptModeStore, type VideoSubMode } from '@/store/promptModeStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { ChevronDownIcon } from '@/components/marketingstudio/FormatIcons';
import {
  Sparkles, Search, Check, ImagePlus, Film, Wand2, Move3d, X, Volume2, ChevronRight, ChevronLeft, Image as ImageIcon, Clock, Tag, Video as VideoIcon, Plus,
} from 'lucide-react';
import { VideoModelIcon } from './VideoModelIcons';
import { GenerateButton } from './GenerateButton';

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
    characterOrientation, setCharacterOrientation, resolution, setResolution,
  } = useVideoStore();
  const { videoSubMode, setVideoSubMode } = usePromptModeStore();
  const setStoreMode = useVideoStore(s => s.setMode);
  useEffect(() => { setStoreMode(videoSubMode); }, [videoSubMode, setStoreMode]);
  const [sceneControlOn, setSceneControlOn] = useState(true);

  const modelDurations = useMemo(() => getDurationsForModel(model), [model]);
  const nativeResolutionOptions = useMemo(() => getResolutionsForModel(model), [model]);

  const [modelOpen, setModelOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
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

  const resolutionOptions = useMemo(() => {
    if (nativeResolutionOptions.length > 0) return nativeResolutionOptions;
    return isCreate && catalogEntry?.resolution ? [catalogEntry.resolution] : [];
  }, [catalogEntry?.resolution, isCreate, nativeResolutionOptions]);

  useEffect(() => {
    if (resolutionOptions.length > 0 && !resolutionOptions.includes(resolution)) {
      setResolution(resolutionOptions.includes('720p') ? '720p' : resolutionOptions[0]);
    }
  }, [resolution, resolutionOptions, setResolution]);

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

  const acceptForIdx = (idx: number) => {
    if (isVideoEdit) return idx === 0 ? 'video/*' : 'image/*';
    return idx === 0 && isMotion ? 'video/*,image/*' : 'image/*';
  };

  const handleFileForIdx = async (idx: number, file: File) => {
    const accept = acceptForIdx(idx);
    const isVid = file.type.startsWith('video/');
    const isImg = file.type.startsWith('image/');
    if (accept.includes('video') && isVid) {
      // ok
    } else if (accept.includes('image') && isImg) {
      // ok
    } else if (!accept.includes('video') && !isImg) {
      return;
    }
    const url = await readFile(file);
    setReferenceImageAt(idx, url);
  };

  const onUploadAt = (idx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptForIdx(idx);
    input.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) await handleFileForIdx(idx, f);
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
                          optional={idx === 1}
                          portrait
                          url={referenceImages[idx]}
                          onUpload={() => onUploadAt(idx)}
                          onRemove={() => removeReferenceImage(idx)}
                          onDropFile={(f) => handleFileForIdx(idx, f)}
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
                          onDropFile={(f) => handleFileForIdx(0, f)}
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
                        onDropFile={(f) => handleFileForIdx(idx, f)}
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
                          onDropFile={(f) => handleFileForIdx(0, f)}
                        />
                        <MotionSlot
                          kind="character"
                          title="Add your character"
                          subtitle={<>Image with visible<br/>face and body</>}
                          url={referenceImages[1]}
                          onUpload={() => onUploadAt(1)}
                          onRemove={() => removeReferenceImage(1)}
                          onDropFile={(f) => handleFileForIdx(1, f)}
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
                      onDropFile={(f) => handleFileForIdx(0, f)}
                    />
                  );

                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt + CTA */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1 pr-1 pl-3">
            <textarea
              ref={(el) => {
                if (!el) return;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 220) + 'px';
              }}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 220) + 'px';
              }}
              placeholder={isMotion
                ? 'Describe additional motion guidance (optional)…'
                : isVideoEdit
                  ? 'Describe how to edit the video…'
                  : 'Describe your video, like "A woman walking through a neon-lit city"'}
              rows={3}
              className="w-full bg-transparent border-0 text-sm leading-[1.6] text-foreground placeholder:text-muted-foreground/70 focus:outline-none resize-none ms-prompt-scroll min-h-[72px] max-h-[220px] overflow-y-auto"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            {!isMotion && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEnhance(!enhance)}
                  className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors ${enhance ? 'text-white' : 'text-white/50'}`}
                >
                  <EnhanceIcon className="w-3.5 h-3.5" /> Enhance {enhance ? 'on' : 'off'}
                </button>
                <button
                  onClick={() => setSound(!sound)}
                  className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors ${sound ? 'text-white' : 'text-white/50'}`}
                >
                  <SpeakerIcon className="w-3.5 h-3.5" /> {sound ? 'On' : 'Off'}
                </button>
              </div>
            )}
          </div>

          <GenerateButton
            onClick={handleSubmit}
            disabled={!prompt.trim() && !isMotion && referenceImages.length === 0}
            className="self-center h-[72px] px-7 text-[15px]"
          />
        </div>

        {/* Bottom chips row */}
        <div className="flex items-center gap-2 flex-wrap pl-1">
          {/* Sub-mode dropdown */}
          <Popover open={subOpen} onOpenChange={setSubOpen}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <SubIcon className="w-3.5 h-3.5 text-white" />
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
                  {videoSubMode === id && <Check className="w-3.5 h-3.5 text-[#9C3FED] shrink-0" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Model */}
          <Popover open={modelOpen} onOpenChange={(o) => { setModelOpen(o); if (!o) setExpandedFamily(null); }}>
            <PopoverTrigger asChild>
              <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                <VideoModelIcon family={catalogEntry?.family} id={model} className="w-3.5 h-3.5 text-white" />
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
                        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${model === m.id ? 'bg-[#9C3FED]/15 text-[#9C3FED]' : 'bg-white/5 text-white'}`}>
                          <VideoModelIcon id={m.id} className="size-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-foreground">{m.name}</span>
                            {m.badge && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#9C3FED]/20 text-[#9C3FED]">{m.badge}</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground truncate block">{m.desc}</span>
                        </div>
                        {model === m.id && <Check className="w-4 h-4 text-[#9C3FED] shrink-0" />}
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
                <AspectIcon ratio={aspectRatio} className="text-white ml-0.5" />
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
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  {duration}s
                  <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="top"
                sideOffset={10}
                className="w-[320px] p-4 rounded-2xl border border-white/10 bg-[hsl(0_0%_8%)]/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
              >
                <div className="text-xs font-medium text-white/60 mb-2.5 px-0.5">Duration</div>
                <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-center gap-3">
                  <div className="text-base font-semibold text-white tabular-nums w-12 shrink-0">{duration}s</div>
                  {(() => {
                    const nums = modelDurations.map((d) => parseInt(d)).filter((n) => !isNaN(n));
                    const min = Math.min(...nums);
                    const max = Math.max(...nums);
                    const cur = parseInt(duration) || min;
                    return (
                      <Slider
                        value={[cur]}
                        min={min}
                        max={max}
                        step={1}
                        onValueChange={(v) => {
                          const target = v[0];
                          const snapped = nums.reduce((p, c) => Math.abs(c - target) < Math.abs(p - target) ? c : p, nums[0]);
                          setDuration(String(snapped));
                        }}
                        className="flex-1"
                      />
                    );
                  })()}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Resolution */}
          {resolutionOptions.length > 0 && (
            <Popover open={resolutionOpen} onOpenChange={setResolutionOpen}>
              <PopoverTrigger asChild>
                <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  {resolutionOptions.includes(resolution) ? resolution : resolutionOptions[0]}
                  <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" sideOffset={10}
                className="w-32 p-1.5 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">Resolution</div>
                {resolutionOptions.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setResolution(r); setResolutionOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      resolution === r ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                    }`}
                  >
                    {r}
                    {resolution === r && <Check className="w-4 h-4 text-[#9C3FED]" />}
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
  label, optional, url, onUpload, onRemove, onDropFile, portrait,
}: { label: string; optional?: boolean; url?: string; onUpload: () => void; onRemove: () => void; onDropFile?: (f: File) => void; portrait?: boolean }) {
  const [over, setOver] = useState(false);
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f && onDropFile) onDropFile(f);
    },
  };
  const shape = portrait ? 'aspect-[3/4] max-w-[200px]' : 'aspect-video max-w-[180px]';
  if (url) {
    return (
      <div {...dropProps} className={`relative flex-1 ${shape} rounded-xl overflow-hidden border bg-black/40 ${over ? 'border-[#9C3FED]' : 'border-white/10'}`}>
        {url.startsWith('data:video') || url.match(/\.(mp4|mov|webm)$/i) ? (
          <video src={url} className="w-full h-full object-cover" muted />
        ) : (
          <img src={url} alt="" className="w-full h-full object-cover" />
        )}
        <button
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center hover:bg-black/90 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="absolute bottom-2 left-2.5 text-[12px] font-semibold text-white drop-shadow">{label}</div>
      </div>
    );
  }
  return (
    <button
      onClick={onUpload}
      {...dropProps}
      className={`relative flex-1 ${shape} rounded-xl bg-white/[0.03] border border-dashed transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground ${over ? 'border-[#9C3FED] bg-white/[0.08]' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.06]'}`}
    >
      {optional && (
        <span className="absolute top-2 right-2 text-[10px] text-muted-foreground/80 bg-white/5 rounded-full px-2 py-0.5">Optional</span>
      )}
      <div className={`${portrait ? 'w-10 h-10' : 'w-8 h-8'} rounded-full bg-white/5 grid place-items-center`}>
        <ImagePlus className={portrait ? 'w-5 h-5' : 'w-4 h-4'} />
      </div>
      <span className={`${portrait ? 'text-[13px] font-semibold text-foreground' : 'text-[11px]'}`}>{label}</span>
    </button>
  );
}

function MotionSlot({
  kind, title, subtitle, url, onUpload, onRemove, onDropFile,
}: {
  kind: 'video' | 'character';
  title: string;
  subtitle: React.ReactNode;
  url?: string;
  onUpload: () => void;
  onRemove: () => void;
  onDropFile?: (f: File) => void;
}) {
  const [over, setOver] = useState(false);
  const isVideo = !!url && (url.startsWith('data:video') || /\.(mp4|mov|webm)(\?|$)/i.test(url));
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f && onDropFile) onDropFile(f);
    },
  };
  if (url) {
    return (
      <div {...dropProps} className={`relative flex-1 max-w-[180px] rounded-xl overflow-hidden border aspect-[3/4] bg-black/40 ${over ? 'border-[#9C3FED]' : 'border-white/10'}`}>
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
      {...dropProps}
      className={`relative flex-1 max-w-[180px] aspect-[3/4] rounded-xl bg-white/[0.03] border border-dashed transition-colors flex flex-col items-center justify-center gap-2 px-3 text-muted-foreground ${over ? 'border-[#9C3FED] bg-white/[0.08]' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.06]'}`}
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
    <div className={`self-start w-[280px] rounded-xl border border-white/10 bg-white/[0.03] ${on ? 'p-3' : 'px-3 py-2'} flex flex-col gap-2`}>
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
      <span className="border-2 border-white rounded-sm" style={{ width: w * scale, height: h * scale }} />
    </span>
  );
}

// =============================================================
// Single wide upload tile (Veo 3.1 Lite, Grok Imagine, Sora 2…)
// =============================================================
function SingleUploadTile({
  optional, url, onUpload, onRemove, onDropFile,
}: { optional?: boolean; url?: string; onUpload: () => void; onRemove: () => void; onDropFile?: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f && onDropFile) onDropFile(f);
    },
  };
  if (url) {
    return (
      <div {...dropProps} className={`relative w-full max-w-[260px] rounded-xl overflow-hidden border aspect-video bg-black/40 ${over ? 'border-[#9C3FED]' : 'border-white/10'}`}>
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
      {...dropProps}
      className={`relative w-full max-w-[260px] aspect-video rounded-xl bg-white/[0.03] border border-dashed transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground px-3 ${over ? 'border-[#9C3FED] bg-white/[0.08]' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.06]'}`}
    >
      {optional && (
        <span className="absolute top-1.5 right-2 text-[9px] text-muted-foreground/80 bg-white/5 rounded-full px-1.5 py-0.5">Optional</span>
      )}
      <div className="w-7 h-7 rounded-full bg-white/5 grid place-items-center">
        <ImageIcon className="w-3.5 h-3.5" />
      </div>
      <div className="text-[11px] text-foreground/90 text-center leading-tight">
        Upload image or <span className="text-white underline underline-offset-2">generate it</span>
      </div>
      <div className="text-[9px] text-muted-foreground/70 text-center">PNG, JPG or paste</div>
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
                  <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-white/5 text-white">
                    <VideoModelIcon family={f.family} id={f.entries[0].id} className="size-4" />
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
      <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${selected ? 'bg-[#9C3FED]/15 text-[#9C3FED]' : 'bg-white/5 text-white'}`}>
        <VideoModelIcon family={entry.family} id={entry.id} className="size-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-foreground font-medium">{entry.name}</span>
          {entry.hasAudio && <Volume2 className="w-3 h-3 text-muted-foreground" />}
          {entry.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#9C3FED] text-white">
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
      {selected && <Check className="w-4 h-4 text-[#9C3FED] shrink-0 mt-1" />}
    </button>
  );
}

function EnhanceIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className={className} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.6497 0.375C6.92585 0.375 7.1497 0.598858 7.1497 0.875V1.45833C7.1497 1.48967 7.14682 1.52033 7.14131 1.55006C7.17104 1.54455 7.2017 1.54167 7.23304 1.54167H7.81637C8.09251 1.54167 8.31637 1.76552 8.31637 2.04167C8.31637 2.31781 8.09251 2.54167 7.81637 2.54167H7.23304C7.2017 2.54167 7.17104 2.53878 7.14131 2.53327C7.14682 2.56301 7.1497 2.59367 7.1497 2.625V3.20833C7.1497 3.48448 6.92585 3.70833 6.6497 3.70833C6.37356 3.70833 6.1497 3.48448 6.1497 3.20833V2.625C6.1497 2.59367 6.15259 2.56301 6.1581 2.53327C6.12836 2.53878 6.0977 2.54167 6.06637 2.54167H5.48304C5.20689 2.54167 4.98304 2.31781 4.98304 2.04167C4.98304 1.76552 5.20689 1.54167 5.48304 1.54167H6.06637C6.0977 1.54167 6.12836 1.54455 6.1581 1.55006C6.15259 1.52033 6.1497 1.48967 6.1497 1.45833V0.875C6.1497 0.598858 6.37356 0.375 6.6497 0.375ZM6.55797 1.94994C6.56349 1.97967 6.56637 2.01033 6.56637 2.04167C6.56637 2.073 6.56349 2.10366 6.55797 2.1334C6.58771 2.12788 6.61837 2.125 6.6497 2.125C6.68104 2.125 6.7117 2.12788 6.74143 2.1334C6.73592 2.10366 6.73304 2.073 6.73304 2.04167C6.73304 2.01033 6.73592 1.97967 6.74143 1.94994C6.7117 1.95545 6.68104 1.95833 6.6497 1.95833C6.61837 1.95833 6.58771 1.95545 6.55797 1.94994ZM2.625 1.54167C2.90114 1.54167 3.125 1.76552 3.125 2.04167V2.91667C3.125 3.19281 2.90114 3.41667 2.625 3.41667C2.34886 3.41667 2.125 3.19281 2.125 2.91667V2.04167C2.125 1.76552 2.34886 1.54167 2.625 1.54167ZM8.5294 3.09641C9.18027 2.44554 10.2355 2.44554 10.8864 3.09641C11.5373 3.74729 11.5373 4.80256 10.8864 5.45344L9.23651 7.10335L4.28676 12.0531C3.63588 12.704 2.58061 12.704 1.92974 12.0531C1.27886 11.4022 1.27886 10.347 1.92974 9.69608L6.87948 4.74633L8.5294 3.09641ZM10.1793 3.80352C9.91896 3.54317 9.49685 3.54317 9.23651 3.80352L7.94014 5.09988L8.88295 6.04269L10.1793 4.74633C10.4397 4.48598 10.4397 4.06387 10.1793 3.80352ZM8.17585 6.7498L7.23304 5.80699L2.63684 10.4032C2.37649 10.6635 2.37649 11.0856 2.63684 11.346C2.89719 11.6063 3.3193 11.6063 3.57965 11.346L8.17585 6.7498ZM0.375 3.79167C0.375 3.51552 0.598858 3.29167 0.875 3.29167H1.75C2.02614 3.29167 2.25 3.51552 2.25 3.79167C2.25 4.06781 2.02614 4.29167 1.75 4.29167H0.875C0.598858 4.29167 0.375 4.06781 0.375 3.79167ZM3 3.79167C3 3.51552 3.22386 3.29167 3.5 3.29167H4.375C4.65114 3.29167 4.875 3.51552 4.875 3.79167C4.875 4.06781 4.65114 4.29167 4.375 4.29167H3.5C3.22386 4.29167 3 4.06781 3 3.79167ZM2.625 4.16667C2.90114 4.16667 3.125 4.39052 3.125 4.66667V5.54167C3.125 5.81781 2.90114 6.04167 2.625 6.04167C2.34886 6.04167 2.125 5.81781 2.125 5.54167V4.66667C2.125 4.39052 2.34886 4.16667 2.625 4.16667ZM11.375 7.95833C11.6511 7.95833 11.875 8.18219 11.875 8.45833V9.04167C11.875 9.073 11.8721 9.10366 11.8666 9.1334C11.8963 9.12788 11.927 9.125 11.9583 9.125H12.5417C12.8178 9.125 13.0417 9.34886 13.0417 9.625C13.0417 9.90114 12.8178 10.125 12.5417 10.125H11.9583C11.927 10.125 11.8963 10.1221 11.8666 10.1166C11.8721 10.1463 11.875 10.177 11.875 10.2083V10.7917C11.875 11.0678 11.6511 11.2917 11.375 11.2917C11.0989 11.2917 10.875 11.0678 10.875 10.7917V10.2083C10.875 10.177 10.8779 10.1463 10.8834 10.1166C10.8537 10.1221 10.823 10.125 10.7917 10.125H10.2083C9.93219 10.125 9.70833 9.90114 9.70833 9.625C9.70833 9.34886 9.93219 9.125 10.2083 9.125H10.7917C10.823 9.125 10.8537 9.12788 10.8834 9.1334C10.8779 9.10366 10.875 9.073 10.875 9.04167V8.45833C10.875 8.18219 11.0989 7.95833 11.375 7.95833ZM11.2833 9.53327C11.2888 9.56301 11.2917 9.59367 11.2917 9.625C11.2917 9.65633 11.2888 9.68699 11.2833 9.71673C11.313 9.71122 11.3437 9.70833 11.375 9.70833C11.4063 9.70833 11.437 9.71122 11.4667 9.71673C11.4612 9.68699 11.4583 9.65633 11.4583 9.625C11.4583 9.59367 11.4612 9.56301 11.4667 9.53327C11.437 9.53878 11.4063 9.54167 11.375 9.54167C11.3437 9.54167 11.313 9.53878 11.2833 9.53327Z" fill="currentColor" />
    </svg>
  );
}

function SpeakerIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.2478 4.75195C21.1027 6.60684 22.25 9.16934 22.25 11.9998C22.25 14.8303 21.1027 17.3928 19.2478 19.2476M15.8891 8.11133C16.8844 9.10663 17.5 10.4816 17.5 12.0004C17.5 13.5192 16.8844 14.8942 15.8891 15.8895M2.75 7.75H5.7074C5.89846 7.75 6.08552 7.69526 6.24645 7.59227L12.25 3.75V20.25L6.24645 16.4077C6.08552 16.3047 5.89846 16.25 5.7074 16.25H2.75C2.19772 16.25 1.75 15.8023 1.75 15.25V8.75C1.75 8.19772 2.19772 7.75 2.75 7.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

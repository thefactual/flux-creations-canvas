import { useState, useRef } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ImagePlus, Film, Music, X, Plus, Tag, Clock, Check, Volume2, VolumeX,
} from 'lucide-react';
import { ChevronDownIcon } from '@/components/marketingstudio/FormatIcons';
import { GenerateButton } from './GenerateButton';
import {
  useSeedanceStore, MAX_IMAGES, MAX_VIDEOS, MAX_AUDIOS, MAX_MEDIA_SECONDS,
  SEEDANCE_RESOLUTIONS, SEEDANCE_RATIOS, SEEDANCE_DURATIONS,
  type SeedanceAsset, type SeedanceAssetKind,
} from '@/store/seedanceStore';

function SeedanceLogo({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3.1544 12.1539L0.533203 12.8092V1.19824L3.1544 1.85354V12.1539Z" fill="currentColor" />
      <path d="M15.8225 12.8333L13.1963 13.4886V0.518555L15.8225 1.169V12.8333Z" fill="currentColor" />
      <path d="M7.31261 12.5083L4.69141 13.1636V6.32422L7.31261 6.97947V12.5083Z" fill="currentColor" />
      <path d="M9.02539 5.3096L11.6516 4.6543V11.4937L9.02539 10.8384V5.3096Z" fill="currentColor" />
    </svg>
  );
}

function AspectIcon({ ratio, className = '' }: { ratio: string; className?: string }) {
  if (ratio === 'adaptive') {
    return <span className={`w-4 h-4 grid place-items-center text-[10px] ${className}`}>A</span>;
  }
  const [w, h] = ratio.split(':').map(Number);
  const max = 14;
  const scale = max / Math.max(w, h);
  return (
    <span className={`w-4 h-4 flex items-center justify-center ${className}`}>
      <span className="border-2 border-white rounded-sm" style={{ width: w * scale, height: h * scale }} />
    </span>
  );
}

const ACCEPT: Record<SeedanceAssetKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

export function SeedancePromptBar() {
  const {
    prompt, setPrompt, images, videos, audios, addAsset, removeAsset,
    resolution, setResolution, ratio, setRatio, duration, setDuration,
    generateAudio, setGenerateAudio, generate, isSubmitting,
  } = useSeedanceStore();

  const [resOpen, setResOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [durOpen, setDurOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingKindRef = useRef<SeedanceAssetKind>('image');

  const triggerUpload = (kind: SeedanceAssetKind) => {
    pendingKindRef.current = kind;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.accept = ACCEPT[kind];
      fileInputRef.current.click();
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const kind = pendingKindRef.current;
    for (let i = 0; i < files.length; i++) {
      await addAsset(kind, files[i]);
    }
  };

  // Drop a file directly onto the prompt — auto-detect kind.
  const onPromptDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const kind: SeedanceAssetKind =
        f.type.startsWith('video/') ? 'video' :
        f.type.startsWith('audio/') ? 'audio' : 'image';
      await addAsset(kind, f);
    }
  };

  const insertTag = (tag: string) => {
    setPrompt((prompt ? prompt.trimEnd() + ' ' : '') + `@${tag} `);
  };

  const totalRefs = images.length + videos.length + audios.length;
  const canSubmit = (prompt.trim().length > 0 || totalRefs > 0) && !isSubmitting;

  return (
    <LayoutGroup>
      <motion.div layout className="relative w-full max-w-[1100px] mx-auto">
        <motion.div
          layout
          transition={{ layout: { duration: 0.42, ease: [0.32, 0.72, 0, 1] } }}
          className="relative rounded-[22px] ms-glass p-2.5 flex flex-col gap-2.5"
        >
          {/* Asset tracks */}
          <div className="flex gap-2 px-1 pt-1 flex-wrap">
            <AssetTrack
              label="Images"
              hint={`${images.length}/${MAX_IMAGES}`}
              icon={<ImagePlus className="w-4 h-4" />}
              assets={images}
              onAdd={() => triggerUpload('image')}
              onRemove={removeAsset}
              onTag={insertTag}
              full={images.length >= MAX_IMAGES}
            />
            <AssetTrack
              label="Videos"
              hint={`${videos.length}/${MAX_VIDEOS} · ≤${MAX_MEDIA_SECONDS}s`}
              icon={<Film className="w-4 h-4" />}
              assets={videos}
              onAdd={() => triggerUpload('video')}
              onRemove={removeAsset}
              onTag={insertTag}
              full={videos.length >= MAX_VIDEOS}
            />
            <AssetTrack
              label="Audio"
              hint={`${audios.length}/${MAX_AUDIOS} · ≤${MAX_MEDIA_SECONDS}s`}
              icon={<Music className="w-4 h-4" />}
              assets={audios}
              onAdd={() => triggerUpload('audio')}
              onRemove={removeAsset}
              onTag={insertTag}
              full={audios.length >= MAX_AUDIOS}
            />
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Prompt + CTA */}
          <div className="flex items-start gap-2"
               onDragOver={(e) => e.preventDefault()}
               onDrop={onPromptDrop}>
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
                placeholder='Describe the shot. Reference uploads as @image_1, @video_1, @audio_1…'
                rows={3}
                className="w-full bg-transparent border-0 text-sm leading-[1.6] text-foreground placeholder:text-muted-foreground/70 focus:outline-none resize-none ms-prompt-scroll min-h-[72px] max-h-[220px] overflow-y-auto"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (canSubmit) generate();
                  }
                }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setGenerateAudio(!generateAudio)}
                  className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors ${generateAudio ? 'text-white' : 'text-white/50'}`}
                >
                  {generateAudio ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  Sound {generateAudio ? 'on' : 'off'}
                </button>
                {totalRefs > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {totalRefs} reference{totalRefs > 1 ? 's' : ''} attached
                  </span>
                )}
              </div>
            </div>

            <GenerateButton
              onClick={() => canSubmit && generate()}
              disabled={!canSubmit}
              className="self-center h-[72px] px-7 text-[15px]"
            />
          </div>

          {/* Bottom chips */}
          <div className="flex items-center gap-2 flex-wrap pl-1">
            <span className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground">
              <SeedanceLogo className="w-3.5 h-3.5 text-white" />
              Seedance 2.0
            </span>

            {/* Aspect */}
            <Popover open={ratioOpen} onOpenChange={setRatioOpen}>
              <PopoverTrigger asChild>
                <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                  <AspectIcon ratio={ratio} className="text-white ml-0.5" />
                  {ratio === 'adaptive' ? 'Auto' : ratio}
                  <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" sideOffset={10}
                className="w-[280px] p-3 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase px-2 pt-1 pb-2">
                  Aspect Ratio
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {SEEDANCE_RATIOS.map((ar) => {
                    const active = ratio === ar;
                    return (
                      <button
                        key={ar}
                        onClick={() => { setRatio(ar); setRatioOpen(false); }}
                        className={`flex items-center gap-1.5 justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                          active ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                        }`}
                      >
                        <AspectIcon ratio={ar} />
                        <span className="font-medium">{ar === 'adaptive' ? 'Auto' : ar}</span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Duration */}
            <Popover open={durOpen} onOpenChange={setDurOpen}>
              <PopoverTrigger asChild>
                <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  {duration}s
                  <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" sideOffset={10}
                className="w-32 p-1.5 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">Duration</div>
                {SEEDANCE_DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDuration(d); setDurOpen(false); }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      duration === d ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                    }`}
                  >
                    {d}s
                    {duration === d && <Check className="w-4 h-4 text-[#9C3FED]" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Resolution */}
            <Popover open={resOpen} onOpenChange={setResOpen}>
              <PopoverTrigger asChild>
                <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  {resolution}
                  <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" sideOffset={10}
                className="w-32 p-1.5 rounded-2xl ms-glass shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">Resolution</div>
                {SEEDANCE_RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setResolution(r); setResOpen(false); }}
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

            <div className="flex-1" />
          </div>
        </motion.div>
      </motion.div>
    </LayoutGroup>
  );
}

// =====================================================================
// Asset track — vertical column of thumbnails with an Add tile.
// Click thumbnail to insert its @id tag into the prompt.
// =====================================================================
function AssetTrack({
  label, hint, icon, assets, onAdd, onRemove, onTag, full,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  assets: SeedanceAsset[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onTag: (tag: string) => void;
  full: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        {icon}
        <span className="font-semibold text-white/80">{label}</span>
        <span className="text-muted-foreground/70">{hint}</span>
      </div>
      <div className="flex gap-1.5">
        {assets.map((a) => (
          <AssetThumb key={a.id} asset={a} onRemove={() => onRemove(a.id)} onTag={() => onTag(a.id)} />
        ))}
        {!full && (
          <button
            onClick={onAdd}
            className="w-[72px] h-[72px] rounded-lg bg-white/[0.03] border border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.06] transition-colors grid place-items-center text-muted-foreground"
            title={`Add ${label.toLowerCase()}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AssetThumb({ asset, onRemove, onTag }: { asset: SeedanceAsset; onRemove: () => void; onTag: () => void }) {
  return (
    <div className="relative group w-[72px] h-[72px] rounded-lg overflow-hidden border border-white/10 bg-black/40">
      <button onClick={onTag} className="absolute inset-0" title={`Insert @${asset.id}`}>
        {asset.kind === 'image' && (
          <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
        )}
        {asset.kind === 'video' && (
          <video src={asset.url} className="w-full h-full object-cover" muted />
        )}
        {asset.kind === 'audio' && (
          <div className="w-full h-full grid place-items-center bg-gradient-to-br from-purple-900/40 to-blue-900/40">
            <Music className="w-6 h-6 text-white/80" />
          </div>
        )}
      </button>
      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-[9px] text-white/90 truncate font-mono pointer-events-none">
        @{asset.id}
      </div>
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

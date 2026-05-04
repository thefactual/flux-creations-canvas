import { useRef } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import {
  ImagePlus, Film, Music, X, Plus, Clock, Volume2, VolumeX, Gem,
} from 'lucide-react';
import { ChevronDownIcon } from '@/components/marketingstudio/FormatIcons';
import { GenerateButton } from './GenerateButton';
import { MentionDropdown, useMentionAutocomplete, type MentionItem } from './MentionAutocomplete';
import {
  useSeedanceStore, MAX_IMAGES, MAX_VIDEOS, MAX_AUDIOS, MAX_MEDIA_SECONDS,
  SEEDANCE_RESOLUTIONS, SEEDANCE_RATIOS,
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

// Marketing Studio aspect-ratio icons (cloned for visual parity).
function AspectAutoIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M8.25 3.75H4.75C4.19772 3.75 3.75 4.19772 3.75 4.75V8.25M15.75 3.75H19.25C19.8023 3.75 20.25 4.19772 20.25 4.75V8.25M20.25 15.75V19.25C20.25 19.8023 19.8023 20.25 19.25 20.25H15.75M8.25 20.25H4.75C4.19772 20.25 3.75 19.8023 3.75 19.25V15.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AspectLandscape({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13.833 3.5C14.8454 3.5 15.6658 4.32064 15.666 5.33301V10.667C15.6658 11.6794 14.8454 12.5 13.833 12.5H3.16602C2.1539 12.4996 1.33318 11.6791 1.33301 10.667V5.33301C1.33318 4.32085 2.1539 3.50035 3.16602 3.5H13.833ZM3.16602 4.5C2.70619 4.50035 2.33318 4.87314 2.33301 5.33301V10.667C2.33318 11.1269 2.70619 11.4996 3.16602 11.5H13.833C14.2931 11.5 14.6658 11.1271 14.666 10.667V5.33301C14.6658 4.87292 14.2931 4.5 13.833 4.5H3.16602Z" fill="currentColor" />
    </svg>
  );
}
function AspectPortrait({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13 12.5C13 13.8807 11.8807 15 10.5 15L4.5 15C3.11929 15 2 13.8807 2 12.5L2 3.5C2 2.11929 3.11929 1 4.5 1L10.5 1C11.8807 1 13 2.11929 13 3.5L13 12.5ZM12 3.5C12 2.67157 11.3284 2 10.5 2L4.5 2C3.67157 2 3 2.67157 3 3.5L3 12.5C3 13.3284 3.67157 14 4.5 14L10.5 14C11.3284 14 12 13.3284 12 12.5L12 3.5Z" fill="currentColor" />
    </svg>
  );
}
function AspectWide43({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M12.5 3C13.8807 3 15 4.11929 15 5.5V11.5C15 12.8807 13.8807 14 12.5 14H3.5C2.11929 14 1 12.8807 1 11.5V5.5C1 4.11929 2.11929 3 3.5 3H12.5ZM3.5 4C2.67157 4 2 4.67157 2 5.5V11.5C2 12.3284 2.67157 13 3.5 13H12.5C13.3284 13 14 12.3284 14 11.5V5.5C14 4.67157 13.3284 4 12.5 4H3.5Z" fill="currentColor" />
    </svg>
  );
}
function AspectSquare({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10.5 3C11.8807 3 13 4.11929 13 5.5V10.5C13 11.8807 11.8807 13 10.5 13H5.5C4.11929 13 3 11.8807 3 10.5V5.5C3 4.11929 4.11929 3 5.5 3H10.5ZM5.5 4C4.67157 4 4 4.67157 4 5.5V10.5C4 11.3284 4.67157 12 5.5 12H10.5C11.3284 12 12 11.3284 12 10.5V5.5C12 4.67157 11.3284 4 10.5 4H5.5Z" fill="currentColor" />
    </svg>
  );
}
function aspectIcon(a: string, className = 'size-4') {
  switch (a) {
    case 'adaptive': return <AspectAutoIcon className={className} />;
    case '16:9':
    case '21:9': return <AspectLandscape className={className} />;
    case '4:3':  return <AspectWide43 className={className} />;
    case '9:16':
    case '3:4':  return <AspectPortrait className={className} />;
    case '1:1':  return <AspectSquare className={className} />;
    default: return <AspectAutoIcon className={className} />;
  }
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


  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingKindRef = useRef<SeedanceAssetKind>('image');

  // @-mention autocomplete (typing "@" filters all uploaded assets)
  const mention = useMentionAutocomplete(textareaRef, setPrompt);
  const mentionItems: MentionItem[] = [
    ...images.map((a) => ({ id: a.id, label: a.name || a.id, thumbUrl: a.url, kind: 'image' as const })),
    ...videos.map((a) => ({ id: a.id, label: a.name || a.id, thumbUrl: a.url, kind: 'video' as const })),
    ...audios.map((a) => ({ id: a.id, label: a.name || a.id, kind: 'audio' as const })),
  ];

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
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    const caret = e.target.selectionStart ?? val.length;
                    setPrompt(val);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 220) + 'px';
                    if (mentionItems.length > 0) mention.detect({ value: val, caret });
                    else mention.close();
                  }}
                  placeholder='Describe the shot. Type @ to reference an upload.'
                  rows={3}
                  className="w-full bg-transparent border-0 text-sm leading-[1.6] text-foreground placeholder:text-muted-foreground/70 focus:outline-none resize-none ms-prompt-scroll min-h-[72px] max-h-[220px] overflow-y-auto"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  onKeyDown={(e) => {
                    // Allow native copy/paste/cut/select-all
                    if ((e.metaKey || e.ctrlKey) && ['c','v','x','a','z','y'].includes(e.key.toLowerCase())) {
                      return;
                    }
                    if (mention.open && e.key === 'Escape') { mention.close(); return; }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (canSubmit) generate();
                    }
                  }}
                />
                <MentionDropdown
                  open={mention.open}
                  query={mention.query}
                  items={mentionItems}
                  onPick={(item) => mention.insert(item, prompt)}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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

            {/* Aspect — MS-style chip */}
            <SeedanceAspectChip value={ratio} onChange={setRatio} />

            {/* Resolution — MS-style dropdown chip */}
            <SeedanceChip
              icon={<Gem className="w-3.5 h-3.5" />}
              value={resolution}
              options={SEEDANCE_RESOLUTIONS as readonly string[]}
              onChange={setResolution}
            />

            {/* Duration — MS-style slider chip */}
            <SeedanceDurationChip value={duration} onChange={setDuration} />

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

// =====================================================================
// Marketing-Studio-style chips (visual parity)
// =====================================================================
function SeedanceChip({
  icon, value, options, onChange,
}: {
  icon: React.ReactNode;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
          <span className="text-muted-foreground">{icon}</span>
          {value}
          <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-ms-surface-2 border-ms-border">
        {options.map((o) => (
          <DropdownMenuItem key={o} onClick={() => onChange(o)} className="text-sm">
            {o}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SeedanceAspectChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const display = value === 'adaptive' ? 'Auto' : value;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
          <span className="text-muted-foreground">{aspectIcon(value, 'size-3.5')}</span>
          {display}
          <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[280px] p-3 rounded-2xl border border-white/10 bg-[hsl(0_0%_8%)]/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase px-2 pt-1 pb-2">
          Aspect Ratio
        </div>
        <div className="grid grid-cols-2 gap-1">
          {SEEDANCE_RATIOS.map((a) => {
            const active = value === a;
            const label = a === 'adaptive' ? 'Auto' : a;
            return (
              <button
                key={a}
                onClick={() => onChange(a)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                }`}
              >
                <span className="text-white/80 shrink-0">{aspectIcon(a)}</span>
                <span className="font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SeedanceDurationChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Seedance accepts 4–15s.
  const num = Math.min(15, Math.max(4, parseInt(value) || 5));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          {num}s
          <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[320px] p-4 rounded-2xl border border-white/10 bg-[hsl(0_0%_8%)]/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="text-xs font-medium text-white/60 mb-2.5 px-0.5">Duration</div>
        <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-center gap-3">
          <div className="text-base font-semibold text-white tabular-nums w-12 shrink-0">{num}s</div>
          <Slider
            value={[num]}
            min={4}
            max={15}
            step={1}
            onValueChange={(v) => onChange(String(v[0]))}
            className="flex-1"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

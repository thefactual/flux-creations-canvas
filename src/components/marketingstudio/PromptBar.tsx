import { useEffect, useRef, useState } from 'react';
import { RECREATE_EVENT, FormatPreset } from './formatPresets';
import { Plus, Sparkles, Package, Smartphone, Smartphone as PhoneIcon, Gem, Clock } from 'lucide-react';
import { ExtraRefStrip, ExtraRef } from './ExtraRefStrip';
import { resolveToUrl } from '@/lib/uploadToStorage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { AssetsModal } from './AssetsModal';
import { AddProductModal } from './AddProductModal';
import { AvatarModal } from './AvatarModal';
import { FormatPickerModal, FormatId } from './FormatPickerModal';
import {
  ChevronDownIcon,
  HyperMotionIcon,
  ProductReviewIcon,
  TVSpotIcon,
  TryOnIcon,
  TutorialIcon,
  UGCIcon,
  UnboxingIcon,
  WildCardIcon,
} from './FormatIcons';
import {
  MSAspect,
  MSDuration,
  MSGeneration,
  MSMode,
  MSResolution,
  MSSurface,
  useMarketingStudioStore,
} from '@/store/marketingStudioStore';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';


const RESOLUTIONS: MSResolution[] = ['480p', '720p', '1080p'];


function modeIcon(mode: MSMode) {
  const cls = 'size-3.5';
  switch (mode) {
    case 'UGC': return <UGCIcon className={cls} />;
    case 'Tutorial': return <TutorialIcon className={cls} />;
    case 'Unboxing': return <UnboxingIcon className={cls} />;
    case 'Hyper Motion': return <HyperMotionIcon className={cls} />;
    case 'Product Review': return <ProductReviewIcon className={cls} />;
    case 'TV Spot': return <TVSpotIcon className={cls} />;
    case 'Wild Card': return <WildCardIcon className={cls} />;
    case 'UGC Virtual Try On':
    case 'Pro Virtual Try On': return <TryOnIcon className={cls} />;
  }
}

interface Props {
  projectId?: string;
  projectName?: string;
  /** When set, this generation belongs to a /create project (not an ms_project).
   *  No redirect happens, no ms_project is created. */
  createProjectId?: string;
  /** Lazy-create a /create project if the user generates without one selected. */
  ensureCreateProject?: () => Promise<string>;
}

export function PromptBar({ projectId, createProjectId, ensureCreateProject }: Props) {
  const [surface, setSurface] = useState<MSSurface>('Product');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<MSMode>('UGC');
  const [aspect, setAspect] = useState<MSAspect>('Auto');
  const [autoSourceUrl, setAutoSourceUrl] = useState<string | null>(null);
  const [res, setRes] = useState<MSResolution>('720p');
  const [duration, setDuration] = useState<MSDuration>('8s');
  const [productThumb, setProductThumb] = useState<string | null>(null);
  const [avatarThumb, setAvatarThumb] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [exactVoiceover, setExactVoiceover] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Extra reference images (drag/drop, paste, finder upload, @-mentionable)
  const [extraRefs, setExtraRefs] = useState<ExtraRef[]>([]);
  const [uploadingRefs, setUploadingRefs] = useState(0);
  const refIdCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // @-mention autocomplete
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<number>(0); // index in prompt where '@' is

  const [assetsOpen, setAssetsOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  // Renumber names "Image 1", "Image 2"... so deletes/reorders stay consistent.
  const renumber = (list: ExtraRef[]): ExtraRef[] =>
    list.map((r, i) => ({ ...r, name: `Image ${i + 1}` }));

  const addRefFiles = async (files: File[]) => {
    setUploadingRefs((n) => n + files.length);
    try {
      const dataUris = await Promise.all(
        files.map(
          (f) =>
            new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = reject;
              r.readAsDataURL(f);
            }),
        ),
      );
      const urls = await Promise.all(dataUris.map((d) => resolveToUrl(d).catch(() => null)));
      setExtraRefs((prev) => {
        const next = [
          ...prev,
          ...urls
            .filter((u): u is string => !!u)
            .map((url) => ({
              id: `ref-${++refIdCounterRef.current}-${Date.now()}`,
              url,
              name: '',
            })),
        ];
        return renumber(next);
      });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setUploadingRefs((n) => Math.max(0, n - files.length));
    }
  };

  const removeRef = (id: string) => {
    setExtraRefs((prev) => {
      const removed = prev.find((r) => r.id === id);
      const next = renumber(prev.filter((r) => r.id !== id));
      // Strip any @mentions that referenced the removed image (by old name).
      if (removed) {
        setPrompt((p) => p.replace(new RegExp(`@${removed.name}\\b`, 'g'), '').replace(/\s{2,}/g, ' ').trim());
      }
      return next;
    });
  };

  const reorderRefs = (from: number, to: number) => {
    setExtraRefs((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return renumber(next);
    });
  };

  const insertMentionFor = (ref: ExtraRef) => {
    setPrompt((p) => {
      const sep = p.length === 0 || p.endsWith(' ') || p.endsWith('\n') ? '' : ' ';
      return `${p}${sep}@${ref.name} `;
    });
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const { addGeneration, updateGeneration } = useMarketingStudioStore();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => {
      const p = (e as CustomEvent<FormatPreset>).detail;
      if (!p) return;
      setMode(p.mode);
      const cleaned = p.prompt.replace(/@[A-Za-z0-9_][A-Za-z0-9 _-]*?(?=(\s@|\s|\.|,|$))/g, '').replace(/\s{2,}/g, ' ').trim();
      setPrompt(cleaned);
      setDuration(p.duration);
      setAspect(p.aspect);
      setProductThumb(p.productThumb ?? null);
      setAvatarThumb(p.avatarThumb ?? null);
      setProductName(p.productName ?? null);
      setAvatarName(p.avatarName ?? null);
    };
    window.addEventListener(RECREATE_EVENT, handler);
    return () => window.removeEventListener(RECREATE_EVENT, handler);
  }, []);

  const cost = surface === 'Product' ? 4840 : 16286;

  const handleGenerate = async () => {
    if (generating) return; // guard against double-clicks / StrictMode double-fire
    if (!prompt.trim() && !productId && !avatarId) {
      toast({ title: 'Add a prompt, product, or avatar', variant: 'destructive' });
      return;
    }
    setGenerating(true);

    // Embedded mode (/create): we attach to a create_project, not an ms_project.
    const embedded = createProjectId !== undefined || !!ensureCreateProject;
    let createPid: string | undefined = createProjectId;

    // 1. Resolve / create project.
    let pid = projectId;
    let pslug: string | undefined;
    if (embedded) {
      try {
        if (!createPid && ensureCreateProject) {
          createPid = await ensureCreateProject();
        }
      } catch (e: any) {
        toast({ title: 'Could not create project', description: e?.message, variant: 'destructive' });
        setGenerating(false);
        return;
      }
    } else if (!pid) {
      try {
        const { createProjectDB } = await import('@/lib/marketingStudioSync');
        const p = await createProjectDB(prompt.slice(0, 28) || productName || 'New project');
        pid = p.id;
        pslug = p.slug;
      } catch (e: any) {
        toast({ title: 'Could not create project', description: e?.message, variant: 'destructive' });
        setGenerating(false);
        return;
      }
    }

    // 2. Call orchestrator.
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: orch, error: orchErr } = await supabase.functions.invoke(
        'marketing-orchestrate',
        {
          body: {
            productId,
            avatarId,
            format: mode,
            surface,
            aspect,
            duration_seconds: parseInt(duration) || 8,
            resolution: res,
            userPrompt: prompt,
            exactVoiceover,
            projectId: embedded ? null : pid,
            createProjectId: embedded ? createPid : null,
            extraRefImages: extraRefs.map((r) => r.url),
            extraRefNames: extraRefs.map((r) => r.name),
          },
        },
      );
      if (orchErr) throw orchErr;
      const realId: string | undefined = orch?.id;
      if (!realId) throw new Error('Orchestrator did not return an id');

      // 3. Mirror into store only when in dedicated MS workspace.
      //    Embedded /create relies on useMarketingFeedStore polling.
      if (!embedded && pid) {
        addGeneration(pid, {
          id: realId,
          thumbUrl: productThumb || avatarThumb || '',
          prompt,
          mode,
          surface,
          aspect,
          resolution: res,
          duration,
          productId: productId || undefined,
          avatarId: avatarId || undefined,
          createdAt: Date.now(),
          submittedAt: Date.now(),
          status: 'queued',
          stage: orch?.stage || 'videoing',
        });
      }

      // 4. Navigate ONLY when we created a fresh ms_project. Embedded never navigates.
      if (!embedded && pslug) navigate(`/marketingstudio/${pslug}`);
      setPrompt('');
      setExtraRefs([]);
      toast({ title: 'Generation started', description: 'Rendering on Seedance 2.0…' });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="relative w-full max-w-[1100px] mx-auto">
      <div className="relative flex items-stretch gap-2.5">
        {/* Left vertical pill: Product / App */}
        <div className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[calc(100%+10px)] flex-col gap-1.5 p-1.5 rounded-2xl ms-glass z-10">
          {(['Product', 'App'] as MSSurface[]).map((s) => {
            const active = s === surface;
            const Icon = s === 'Product' ? Package : Smartphone;
            return (
              <button
                key={s}
                onClick={() => setSurface(s)}
                className={`flex flex-col items-center justify-center w-[56px] h-[56px] rounded-xl text-[10px] font-medium transition-all ${
                  active ? 'ms-glass-2 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <Icon className="w-[18px] h-[18px] mb-1" strokeWidth={1.5} />
                {s}
              </button>
            );
          })}
        </div>

        {/* Main bar */}
        <div className="flex-1 rounded-[22px] ms-glass p-2.5 flex flex-col gap-2 min-w-0">
          <div className="flex items-stretch gap-2">
            <button
              onClick={() => setAssetsOpen(true)}
              className="grid place-items-center w-9 h-9 self-start mt-1 rounded-lg ms-chip-glass text-foreground shrink-0"
              aria-label="Add reference"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* Prompt area: name chips + scrollable textarea */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1 pr-1">
              {(productName || avatarName) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {productName && (
                    <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[12px] font-medium text-foreground/90">
                      {productThumb && (
                        <img src={productThumb} alt="" className="w-4 h-4 rounded-full object-cover" />
                      )}
                      {productName}
                    </span>
                  )}
                  {avatarName && (
                    <span className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[12px] font-medium text-foreground/90">
                      {avatarThumb && (
                        <img src={avatarThumb} alt="" className="w-4 h-4 rounded-full object-cover" />
                      )}
                      {avatarName}
                    </span>
                  )}
                </div>
              )}
              {/* Extra reference image strip — drag/drop, paste, finder upload, @-mention */}
              {(extraRefs.length > 0 || uploadingRefs > 0) && (
                <div className="flex items-center gap-2">
                  <ExtraRefStrip
                    refs={extraRefs}
                    onAdd={addRefFiles}
                    onRemove={removeRef}
                    onReorder={reorderRefs}
                    onChipClick={insertMentionFor}
                  />
                  {uploadingRefs > 0 && (
                    <span className="text-[11px] text-muted-foreground animate-pulse">
                      Uploading {uploadingRefs}…
                    </span>
                  )}
                </div>
              )}

              <div className="relative">
                <textarea
                  ref={(el) => {
                    textareaRef.current = el;
                    if (!el) return;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
                  }}
                  value={prompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrompt(val);
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 220) + 'px';
                    // @-mention detection: find the last '@token' that the cursor is currently typing.
                    const caret = e.currentTarget.selectionStart ?? val.length;
                    const upto = val.slice(0, caret);
                    const m = upto.match(/(?:^|\s)@([A-Za-z0-9 ]{0,20})$/);
                    if (m && extraRefs.length > 0) {
                      setMentionOpen(true);
                      setMentionQuery(m[1] || '');
                      setMentionAnchor(caret - (m[1]?.length ?? 0) - 1); // position of '@'
                    } else {
                      setMentionOpen(false);
                    }
                  }}
                  onPaste={(e) => {
                    const items = Array.from(e.clipboardData?.items ?? []);
                    const files = items
                      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                      .map((it) => it.getAsFile())
                      .filter((f): f is File => !!f);
                    if (files.length) {
                      e.preventDefault();
                      addRefFiles(files);
                    }
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (e.dataTransfer.files?.length) {
                      e.preventDefault();
                      addRefFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionOpen && (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                      setMentionOpen(false);
                    }
                    if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  rows={3}
                  placeholder="Describe what happens in the ad… drop, paste, or @ to reference an image"
                  className="w-full bg-transparent border-0 text-sm leading-[1.6] text-foreground placeholder:text-muted-foreground/70 focus:outline-none resize-none ms-prompt-scroll min-h-[72px] max-h-[220px] overflow-y-auto"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                />

                {/* @mention autocomplete */}
                {mentionOpen && (
                  <div className="absolute left-0 bottom-full mb-2 z-30 w-56 rounded-xl bg-ms-surface-2 border border-ms-border shadow-2xl overflow-hidden">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-ms-border">
                      Reference an image
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {extraRefs
                        .filter((r) => r.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              // Replace "@partial" before caret with "@<name> "
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
                            <img src={r.url} alt="" className="w-7 h-7 rounded-md object-cover" />
                            <span className="text-sm text-foreground">@{r.name}</span>
                          </button>
                        ))}
                      {extraRefs.filter((r) => r.name.toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:flex items-stretch gap-2 self-start">
              <button
                onClick={() => setProductOpen(true)}
                className="ms-glass-2 flex flex-col items-center justify-center w-[88px] h-[88px] rounded-2xl text-[10px] font-semibold text-foreground/90 overflow-hidden relative tracking-wider transition-all"
              >
                {productThumb ? (
                  <img src={productThumb} alt="product" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                ) : null}
                <div className="grid place-items-center w-7 h-7 rounded-full bg-white/10 mb-1.5 relative">
                  <Plus className="w-4 h-4 text-foreground/90" strokeWidth={1.5} />
                </div>
                <span className="relative drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">PRODUCT</span>
              </button>
              <button
                onClick={() => setAvatarOpen(true)}
                className="ms-glass-2 flex flex-col items-center justify-center w-[88px] h-[88px] rounded-2xl text-[10px] font-semibold text-foreground/90 overflow-hidden relative tracking-wider transition-all"
              >
                {avatarThumb ? (
                  <img src={avatarThumb} alt="avatar" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                ) : null}
                <div className="grid place-items-center w-7 h-7 rounded-full bg-white/10 mb-1.5 relative">
                  <Plus className="w-4 h-4 text-foreground/90" strokeWidth={1.5} />
                </div>
                <span className="relative drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">AVATAR</span>
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="ms-cta flex items-center justify-center gap-1.5 w-[170px] h-[88px] rounded-2xl text-white text-[12px] font-extrabold tracking-wider disabled:opacity-60"
              >
                {generating ? 'GENERATING…' : 'GENERATE'}
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[12px] font-bold opacity-95">{(cost / 100).toFixed(2)}</span>
              </button>
            </div>
          </div>

          {/* Bottom row: chips */}
          <div className="flex items-center gap-2 flex-wrap pl-1">
            {/* Mode chip — opens format picker */}
            <button
              onClick={() => setFormatOpen(true)}
              className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all"
            >
              <span className="text-muted-foreground">{modeIcon(mode)}</span>
              {mode}
              <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
            </button>

            {surface === 'App' && (
              <Chip icon={<PhoneIcon className="w-3.5 h-3.5" />} value="Mobile" options={['Mobile', 'Desktop']} onChange={() => {}} />
            )}
            <AspectChip value={aspect} onChange={setAspect} autoSourceUrl={productThumb || avatarThumb} onAutoChange={setAutoSourceUrl} />
            <Chip icon={<Gem className="w-3.5 h-3.5" />} value={res} options={RESOLUTIONS} onChange={(v) => setRes(v as MSResolution)} />
            <DurationChip value={duration} onChange={setDuration} />
          </div>

          {/* Mobile generate row */}
          <div className="flex md:hidden gap-2">
            <button onClick={() => setProductOpen(true)} className="ms-glass-2 flex-1 h-12 rounded-xl text-[11px] font-semibold text-foreground">
              + PRODUCT
            </button>
            <button onClick={() => setAvatarOpen(true)} className="ms-glass-2 flex-1 h-12 rounded-xl text-[11px] font-semibold text-foreground">
              + AVATAR
            </button>
            <button onClick={handleGenerate} className="ms-cta flex-1 h-12 rounded-xl text-white text-[11px] font-extrabold">
              GENERATE ✦ {(cost / 100).toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      <AssetsModal open={assetsOpen} onOpenChange={setAssetsOpen} onSelect={(url) => setProductThumb(url)} />
      <AddProductModal
        open={productOpen}
        onOpenChange={setProductOpen}
        onSelect={(it) => {
          setProductThumb(it.thumb);
          setProductName(it.name);
          setProductId(it.id);
        }}
      />
      <AvatarModal
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        onSelect={(a) => {
          setAvatarThumb(a.thumb);
          setAvatarName(a.name);
          setAvatarId(a.id);
        }}
      />
      <FormatPickerModal
        open={formatOpen}
        onOpenChange={setFormatOpen}
        selected={mode}
        onSelect={(id: FormatId) => setMode(id as MSMode)}
      />
    </div>
  );
}

function Chip({
  icon,
  value,
  options,
  onChange,
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

// Aspect ratio icons
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

function aspectIcon(a: MSAspect, className = 'size-4') {
  switch (a) {
    case 'Auto': return <AspectAutoIcon className={className} />;
    case '16:9': return <AspectLandscape className={className} />;
    case '21:9': return <AspectLandscape className={className} />;
    case '4:3':  return <AspectWide43 className={className} />;
    case '9:16': return <AspectPortrait className={className} />;
    case '3:4':  return <AspectPortrait className={className} />;
    case '1:1':  return <AspectSquare className={className} />;
  }
}

const ASPECT_OPTIONS: MSAspect[] = ['Auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];

function ratioFromUrl(url: string): Promise<MSAspect> {
  return new Promise((resolve) => {
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
    const finish = (w: number, h: number) => {
      if (!w || !h) return resolve('1:1');
      const r = w / h;
      const opts: { a: MSAspect; v: number }[] = [
        { a: '1:1', v: 1 }, { a: '16:9', v: 16 / 9 }, { a: '9:16', v: 9 / 16 },
        { a: '4:3', v: 4 / 3 }, { a: '3:4', v: 3 / 4 }, { a: '21:9', v: 21 / 9 },
      ];
      opts.sort((a, b) => Math.abs(a.v - r) - Math.abs(b.v - r));
      resolve(opts[0].a);
    };
    if (isVideo) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => finish(v.videoWidth, v.videoHeight);
      v.onerror = () => resolve('1:1');
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => finish(img.naturalWidth, img.naturalHeight);
      img.onerror = () => resolve('1:1');
      img.src = url;
    }
  });
}

function AspectChip({
  value,
  onChange,
  autoSourceUrl,
  onAutoChange,
}: {
  value: MSAspect;
  onChange: (v: MSAspect) => void;
  autoSourceUrl: string | null;
  onAutoChange: (v: MSAspect | null) => void;
}) {
  const [autoLabel, setAutoLabel] = useState<MSAspect | null>(null);
  const isAuto = value === 'Auto';
  const display = isAuto ? (autoLabel ? `Auto · ${autoLabel}` : 'Auto') : value;

  const handleSelect = async (a: MSAspect) => {
    onChange(a);
    if (a === 'Auto') {
      if (autoSourceUrl) {
        const r = await ratioFromUrl(autoSourceUrl);
        setAutoLabel(r);
        onAutoChange(r);
      } else {
        setAutoLabel(null);
        onAutoChange(null);
      }
    } else {
      setAutoLabel(null);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ms-chip-glass flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs text-foreground transition-all">
          <span className="text-muted-foreground">{aspectIcon(isAuto ? 'Auto' : value, 'size-3.5')}</span>
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
          {ASPECT_OPTIONS.map((a) => {
            const active = value === a;
            return (
              <button
                key={a}
                onClick={() => handleSelect(a)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/5'
                }`}
              >
                <span className="text-white/80 shrink-0">{aspectIcon(a)}</span>
                <span className="font-medium">{a}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DurationChip({ value, onChange }: { value: MSDuration; onChange: (v: MSDuration) => void }) {
  const num = Math.min(15, Math.max(1, parseInt(value) || 8));
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
            min={1}
            max={15}
            step={1}
            onValueChange={(v) => onChange(`${v[0]}s`)}
            className="flex-1"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}


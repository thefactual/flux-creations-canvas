import { useGeneratorStore, MODELS, GeneratedImage } from '@/store/generatorStore';
import { useVideoStore, GeneratedVideo } from '@/store/videoStore';
import { useMarketingFeedStore } from '@/store/marketingFeedStore';
import { MSGeneration } from '@/store/marketingStudioStore';

const EMPTY_MS_FEED: MSGeneration[] = [];
import { usePromptModeStore } from '@/store/promptModeStore';
import { useCreateProjectsStore } from '@/store/createProjectsStore';
import { useGridFilterStore } from '@/store/gridFilterStore';
import { useLayoutStore, ZOOM_ROW_HEIGHTS } from '@/store/layoutStore';
import { AlertCircle, Eye, RefreshCw, Trash2, Loader2, Download, Link2, Heart, MoreHorizontal, Maximize2, Search, X, ImageIcon, FolderInput, Image as ImageLucide, Check, Play } from 'lucide-react';
import { useGridSelectionStore } from '@/store/gridSelectionStore';
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { create } from 'zustand';
import { VideoDetailModal } from '@/components/marketingstudio/VideoDetailModal';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Local UI store for the All / Liked tab on the /create grid.
type GridTab = 'all' | 'liked';
const useGridTabStore = create<{ tab: GridTab; setTab: (t: GridTab) => void }>((set) => ({
  tab: 'all',
  setTab: (tab) => set({ tab }),
}));

// Unified media item used by the justified-rows layout.
type MediaItem =
  | ({ kind: 'image' } & GeneratedImage)
  | ({ kind: 'video' } & GeneratedVideo)
  | ({ kind: 'marketing'; aspectRatio: string } & MSGeneration);


// Build a resized variant of a Supabase Storage public URL using the
// `/render/image/` transform endpoint. Falls back to original on non-Supabase URLs.
function thumbUrl(url: string | undefined, width = 480, quality = 70): string | undefined {
  if (!url) return url;
  try {
    if (url.includes('/storage/v1/object/public/')) {
      return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
        + (url.includes('?') ? '&' : '?') + `width=${width}&quality=${quality}&resize=contain`;
    }
  } catch {}
  return url;
}

function parseRatio(ar: string): number {
  const [w, h] = ar.split(':').map(Number);
  if (!w || !h) return 3 / 4;
  return w / h;
}

export function ImageGrid() {
  const { images: allImages } = useGeneratorStore();
  const { videos: allVideos } = useVideoStore();
  const activeProjectId = useCreateProjectsStore((s) => s.activeProjectId);
  const { search, modelFilter, dateFilter } = useGridFilterStore();
  const tab = useGridTabStore((s) => s.tab);
  const setTab = useGridTabStore((s) => s.setTab);

  const msFeedRaw = useMarketingFeedStore(
    (s) => (activeProjectId ? s.byProject[activeProjectId] : undefined),
  );
  const msFeed = msFeedRaw ?? EMPTY_MS_FEED;

  // Merge images + videos + marketing-studio generations into a unified feed.
  const items = useMemo<MediaItem[]>(() => {
    const imgItems: MediaItem[] = allImages.map((i) => ({ kind: 'image' as const, ...i }));
    const vidItems: MediaItem[] = allVideos.map((v) => ({ kind: 'video' as const, ...v }));
    const msItems: MediaItem[] = msFeed.map((g) => ({
      kind: 'marketing' as const,
      aspectRatio:
        g.aspect && g.aspect !== 'Auto' ? g.aspect : '9:16',
      ...g,
    }));

    let list: MediaItem[] = [...imgItems, ...vidItems, ...msItems];

    list = list.filter((i) => {
      if (i.kind === 'marketing') return true; // already scoped to active project by feed
      const pid = (i as any).projectId as string | undefined;
      return activeProjectId ? pid === activeProjectId : !pid;
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.prompt?.toLowerCase().includes(q));
    }
    if (modelFilter) {
      list = list.filter((i) => (i as any).model === modelFilter);
    }
    if (dateFilter !== 'all') {
      const now = Date.now();
      const day = 86400000;
      const cutoff = dateFilter === 'today' ? now - day : dateFilter === '7d' ? now - 7 * day : now - 30 * day;
      list = list.filter((i) => i.createdAt >= cutoff);
    }
    if (tab === 'liked') {
      list = list.filter((i) => !!i.liked);
    }

    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [allImages, allVideos, msFeed, activeProjectId, search, modelFilter, dateFilter, tab]);

  const zoom = useLayoutStore((s) => s.zoom);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const gap = 4;
  const targetRowHeight = ZOOM_ROW_HEIGHTS[zoom] * 2;

  const layout = useMemo(() => {
    type Pos = { id: string; left: number; top: number; width: number; height: number };
    if (!containerWidth) return { items: [] as Pos[], totalHeight: 0 };

    const positioned: Pos[] = [];
    let top = 0;
    let rowStart = 0;

    const flushRow = (endExclusive: number, isLast: boolean) => {
      const row = items.slice(rowStart, endExclusive);
      if (row.length === 0) return;
      const ratios = row.map((i) => parseRatio(i.aspectRatio));
      const sumRatio = ratios.reduce((a, b) => a + b, 0);
      const totalGap = gap * (row.length - 1);
      const available = Math.max(0, containerWidth - totalGap);
      let rowHeight = available / sumRatio;
      if (isLast && rowHeight > targetRowHeight * 1.4) {
        rowHeight = targetRowHeight;
      }
      const rawWidths = ratios.map((r) => r * rowHeight);
      const flooredWidths = rawWidths.map((w) => Math.floor(w));
      if (!isLast || rowHeight !== targetRowHeight) {
        const used = flooredWidths.reduce((a, b) => a + b, 0);
        let remainder = available - used;
        const order = rawWidths
          .map((w, i) => ({ i, frac: w - Math.floor(w) }))
          .sort((a, b) => b.frac - a.frac);
        let k = 0;
        while (remainder > 0 && order.length > 0) {
          flooredWidths[order[k % order.length].i] += 1;
          remainder -= 1;
          k += 1;
        }
      }
      let left = 0;
      row.forEach((it, idx) => {
        const w = flooredWidths[idx];
        positioned.push({ id: it.id, left, top, width: w, height: rowHeight });
        left += w + gap;
      });
      top += rowHeight + gap;
      rowStart = endExclusive;
    };

    let accRatio = 0;
    for (let i = 0; i < items.length; i++) {
      accRatio += parseRatio(items[i].aspectRatio);
      const totalGap = gap * (i - rowStart);
      const projected = (containerWidth - totalGap) / accRatio;
      if (projected <= targetRowHeight) {
        flushRow(i + 1, false);
        accRatio = 0;
      }
    }
    if (rowStart < items.length) flushRow(items.length, true);

    const totalHeight = Math.max(0, top - gap);
    return { items: positioned, totalHeight };
  }, [items, containerWidth, targetRowHeight]);

  return (
    <div className="w-full">
      {/* Top tabs row: All / Liked (Marketing Studio parity) */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-1 p-1 rounded-full bg-ms-surface-2 border border-ms-border">
          <button
            onClick={() => setTab('all')}
            className={`px-3 h-7 rounded-full text-xs font-medium transition-colors ${
              tab === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTab('liked')}
            className={`flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium transition-colors ${
              tab === 'liked' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Heart className="w-3 h-3" /> Liked
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: items.length === 0 ? undefined : layout.totalHeight, minHeight: items.length === 0 ? '60vh' : undefined }}>
        {items.length === 0 && (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ms-cta to-ms-cta-2 grid place-items-center mb-4 shadow-[0_10px_30px_-10px_hsl(var(--ms-cta)/0.6)]">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
            <div className="text-lg font-semibold text-foreground">
              {tab === 'liked' ? 'No liked items yet' : 'No generations yet'}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {tab === 'liked' ? 'Tap the heart on any card to save your favourites.' : 'Describe what you want below to get started.'}
            </div>
          </div>
        )}
        {layout.items.map((pos, i) => {
          const it = items[i];
          return (
            <div
              key={`${it.kind}-${it.id}`}
              className="absolute"
              style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
            >
              {it.kind === 'image' ? (
                <ImageCard image={it} />
              ) : it.kind === 'video' ? (
                <VideoCard video={it} />
              ) : (
                <MarketingCard gen={it} createProjectId={activeProjectId!} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterToolbar() {
  const { search, modelFilter, dateFilter, setSearch, setModelFilter, setDateFilter, reset } =
    useGridFilterStore();
  const activeProjectId = useCreateProjectsStore((s) => s.activeProjectId);
  const activeProject = useCreateProjectsStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId)
  );
  const hasActiveFilters = !!search || !!modelFilter || dateFilter !== 'all';

  if (!activeProjectId) return null;

  const dateLabel = { all: 'All time', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' }[dateFilter];
  const modelLabel = modelFilter ? MODELS.find((m) => m.id === modelFilter)?.name ?? modelFilter : 'All models';

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="text-sm font-semibold text-foreground truncate mr-2">
        {activeProject?.name}
      </div>
      <div className="relative flex-1 min-w-[180px] max-w-[320px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prompts…"
          className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-ms-surface-2 border border-ms-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-8 px-3 text-xs rounded-lg bg-ms-surface-2 border border-ms-border text-foreground hover:bg-ms-border transition-colors">
            {modelLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-ms-surface-2 border-ms-border max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setModelFilter(null)}>All models</DropdownMenuItem>
          <DropdownMenuSeparator />
          {MODELS.map((m) => (
            <DropdownMenuItem key={m.id} onClick={() => setModelFilter(m.id)}>
              {m.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-8 px-3 text-xs rounded-lg bg-ms-surface-2 border border-ms-border text-foreground hover:bg-ms-border transition-colors">
            {dateLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-ms-surface-2 border-ms-border">
          <DropdownMenuItem onClick={() => setDateFilter('all')}>All time</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDateFilter('today')}>Today</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDateFilter('7d')}>Last 7 days</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDateFilter('30d')}>Last 30 days</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {hasActiveFilters && (
        <button
          onClick={reset}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function getAspectClass(ratio: string): string {
  const map: Record<string, string> = {
    '1:1': 'aspect-square',
    '3:4': 'aspect-[3/4]',
    '4:3': 'aspect-[4/3]',
    '2:3': 'aspect-[2/3]',
    '3:2': 'aspect-[3/2]',
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-video',
    '5:4': 'aspect-[5/4]',
    '4:5': 'aspect-[4/5]',
    '21:9': 'aspect-[21/9]',
  };
  return map[ratio] || 'aspect-[3/4]';
}

function ImageCard({ image }: {
  image: ReturnType<typeof useGeneratorStore.getState>['images'][0];
}) {
  const { setSelectedImageId, retryImage, deleteImage, useAsReference, moveImageToProject } = useGeneratorStore();
  const setVideoMode = usePromptModeStore((s) => s.setMode);
  const addVideoReferenceImage = useVideoStore((s) => s.addReferenceImage);
  const setVideoSubMode = useVideoStore((s) => s.setMode);
  const isSelected = useGridSelectionStore((s) => s.selected.has(image.id));
  const toggleSelect = useGridSelectionStore((s) => s.toggle);
  const projects = useCreateProjectsStore((s) => s.projects);
  const setProjectThumbnail = useCreateProjectsStore((s) => s.setProjectThumbnail);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!image.imageUrl) return;
    try {
      const res = await fetch(image.imageUrl);
      const blob = await res.blob();
      const ext = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpg' : 'png';
      const slug = image.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-${image.id.slice(0, 8)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(image.imageUrl, '_blank');
    }
  };

  const aspectClass = getAspectClass(image.aspectRatio);

  // Tick every second while generating so elapsed/progress updates live.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (image.status !== 'generating') return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [image.status]);

  // Generating state — Marketing Studio style queue card with shimmer + progress
  if (image.status === 'generating') {
    const elapsed = Math.floor((Date.now() - image.createdAt) / 1000);
    const pct = Math.min(95, Math.floor((elapsed / 60) * 100));
    return (
      <div className="relative w-full h-full overflow-hidden bg-ms-surface-2 ring-1 ring-ms-border">
        <div className="absolute inset-0 ms-shimmer opacity-40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/90 px-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <div className="text-[11px] font-medium tracking-wide uppercase text-center">
            Generating…
          </div>
          <div className="w-3/4 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-foreground/80 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground">{elapsed}s</div>
        </div>
      </div>
    );
  }

  // Failed / NSFW state
  if (image.status === 'failed' || image.status === 'nsfw') {
    return (
      <div className="relative w-full h-full overflow-hidden bg-ms-surface-2 flex flex-col items-center justify-center gap-3 p-3">
        <div className="flex items-center gap-1.5">
          {image.status === 'failed' ? (
            <span className="flex items-center gap-1 bg-destructive/80 text-destructive-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">
              <AlertCircle className="w-3 h-3" /> Failed
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-muted/80 text-muted-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">
              <Eye className="w-3 h-3" /> NSFW
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground text-center leading-snug">
          {image.status === 'failed' ? 'Generation failed' : 'Content filtered'}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={() => retryImage(image.id)}
            className="flex items-center gap-1 bg-muted/60 text-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
          <button
            onClick={() => deleteImage(image.id)}
            className="flex items-center gap-1 bg-muted/60 text-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative w-full h-full overflow-hidden bg-ms-surface-2 transition-all cursor-pointer"
      onClick={() => setSelectedImageId(image.id)}
    >
      {/* Loading skeleton */}
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        src={thumbUrl(image.imageUrl, 480, 70)}
        srcSet={image.imageUrl ? `${thumbUrl(image.imageUrl, 480, 70)} 1x, ${thumbUrl(image.imageUrl, 960, 72)} 2x` : undefined}
        sizes="(max-width: 640px) 50vw, 220px"
        alt=""
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={(e) => {
          setLoaded(true);
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setNaturalAspect(img.naturalWidth / img.naturalHeight);
          }
        }}
      />

      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Top-left selection checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleSelect(image.id); }}
        className={`absolute top-2 left-2 grid place-items-center w-7 h-7 rounded-full backdrop-blur-md ring-1 transition-all ${
          isSelected
            ? 'bg-white text-black ring-white opacity-100'
            : 'bg-black/55 text-white/90 ring-white/15 opacity-0 group-hover:opacity-100 hover:bg-black/75'
        }`}
        title={isSelected ? 'Deselect' : 'Select'}
      >
        {isSelected ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="block w-3.5 h-3.5 rounded-full ring-1 ring-white/70" />}
      </button>

      {/* Top-right action icons on hover */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedImageId(image.id); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white/90 hover:bg-black/75 hover:text-white backdrop-blur-md ring-1 ring-white/10 transition-colors"
          title="Open"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white/90 hover:bg-black/75 hover:text-white backdrop-blur-md ring-1 ring-white/10 transition-colors"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white/90 hover:bg-black/75 hover:text-white backdrop-blur-md ring-1 ring-white/10 transition-colors"
          title="More"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom action row: Reference + Animate (center) + Delete (right) */}
      <div className="absolute bottom-2 right-2 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {image.imageUrl && (
          <>
            <HoverIconBtn
              label="Reference"
              onClick={(e) => { e.stopPropagation(); useAsReference(image.imageUrl!); }}
              svg={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M3 4.75C3 3.7835 3.7835 3 4.75 3H19.25C20.2165 3 21 3.7835 21 4.75V19.25C21 20.2165 20.2165 21 19.25 21H4.75C3.7835 21 3 20.2165 3 19.25V4.75ZM4.75 4.5C4.61193 4.5 4.5 4.61193 4.5 4.75V14.4393L6.76256 12.1768C7.44598 11.4934 8.55402 11.4934 9.23744 12.1768L16.5607 19.5H19.25C19.3881 19.5 19.5 19.3881 19.5 19.25V4.75C19.5 4.61193 19.3881 4.5 19.25 4.5H4.75Z" fill="currentColor"/><path d="M13.4255 8.53727C13.4738 8.51308 13.5131 8.47385 13.5373 8.42546L14.2764 6.94721C14.3685 6.76295 14.6315 6.76295 14.7236 6.94721L15.4627 8.42546C15.4869 8.47385 15.5262 8.51308 15.5745 8.53727L17.0528 9.27639C17.237 9.36852 17.237 9.63148 17.0528 9.72361L15.5745 10.4627C15.5262 10.4869 15.4869 10.5262 15.4627 10.5745L14.7236 12.0528C14.6315 12.237 14.3685 12.237 14.2764 12.0528L13.5373 10.5745C13.5131 10.5262 13.4738 10.4869 13.4255 10.4627L11.9472 9.72361C11.763 9.63148 11.763 9.36852 11.9472 9.27639L13.4255 8.53727Z" fill="currentColor"/></svg>}
            />
            <HoverIconBtn
              label="Animate"
              onClick={(e) => {
                e.stopPropagation();
                addVideoReferenceImage(image.imageUrl!);
                setVideoSubMode('image-to-video');
                setVideoMode('video');
              }}
              svg={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M2 5.75C2 4.7835 2.7835 4 3.75 4H14.25C15.2165 4 16 4.7835 16 5.75V8.78669L20.191 6.6912C21.0221 6.27563 22 6.88 22 7.80923V16.1912C22 17.1204 21.0221 17.7248 20.191 17.3092L16 15.2137V18.25C16 19.2165 15.2165 20 14.25 20H3.75C2.7835 20 2 19.2165 2 18.25V5.75ZM16 13.5367L20.5 15.7867V8.21374L16 10.4637V13.5367Z" fill="currentColor"/></svg>}
            />
          </>
        )}
        <HoverIconBtn
          label="Delete"
          danger
          onClick={(e) => { e.stopPropagation(); deleteImage(image.id); }}
          svg={<Trash2 className="w-[18px] h-[18px]" />}
        />
      </div>

      {/* Context menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-2 right-11 z-30 bg-popover border border-border rounded-xl shadow-2xl py-1.5 min-w-[140px] animate-in fade-in-0 zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem icon={<Maximize2 className="w-3.5 h-3.5" />} label="Open" onClick={() => { setSelectedImageId(image.id); setShowMenu(false); }} />
          <MenuItem icon={<RefreshCw className="w-3.5 h-3.5" />} label="Regenerate" onClick={() => { retryImage(image.id); setShowMenu(false); }} />
          <MenuItem icon={<Link2 className="w-3.5 h-3.5" />} label="Use as Reference" onClick={() => { if (image.imageUrl) useAsReference(image.imageUrl); setShowMenu(false); }} />
          <MenuItem icon={<Heart className="w-3.5 h-3.5" />} label="Like" onClick={() => setShowMenu(false)} />
          <MenuItem icon={<Download className="w-3.5 h-3.5" />} label="Download" onClick={(e) => { handleDownload(e); setShowMenu(false); }} />
          {image.imageUrl && image.projectId && (
            <MenuItem
              icon={<ImageLucide className="w-3.5 h-3.5" />}
              label="Set as cover"
              onClick={() => { setProjectThumbnail(image.projectId!, image.imageUrl!); setShowMenu(false); }}
            />
          )}
          {projects.length > 1 && (
            <div className="relative group/move">
              <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted hover:text-foreground cursor-pointer">
                <FolderInput className="w-3.5 h-3.5" />
                Move to project ▸
              </div>
              <div className="hidden group-hover/move:block absolute left-full top-0 ml-1 bg-popover border border-border rounded-xl shadow-2xl py-1.5 min-w-[160px] max-h-60 overflow-y-auto">
                {projects.filter((p) => p.id !== image.projectId).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { moveImageToProject(image.id, p.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted hover:text-foreground truncate"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="my-1 border-t border-border/50" />
          <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={() => { deleteImage(image.id); setShowMenu(false); }} destructive />
        </div>
      )}
    </div>
  );
}

function HoverIconBtn({ label, svg, onClick, danger }: {
  label: string;
  svg: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <div className="relative group/hib">
      <button
        onClick={onClick}
        className={`flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md ring-1 ring-white/10 transition-colors ${danger ? 'bg-black/55 text-white hover:bg-red-600/85' : 'bg-black/55 text-white hover:bg-black/75'}`}
        aria-label={label}
      >
        {svg}
      </button>
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-black/85 text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover/hib:opacity-100 transition-opacity duration-150">
        {label}
      </span>
    </div>
  );
}

function MenuItem({ icon, label, onClick, destructive }: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground/80 hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// =============================================================
// VideoCard — sibling to ImageCard, hover-plays, video-specific actions
// =============================================================
function VideoCard({ video }: { video: GeneratedVideo & { kind: 'video' } }) {
  const setSelectedImageId = useGeneratorStore((s) => s.setSelectedImageId);
  const deleteVideo = useVideoStore((s) => s.deleteVideo);
  const retryVideo = useVideoStore((s) => s.retryVideo);
  const toggleLike = useVideoStore((s) => s.toggleLike);
  const setSelectedVideoId = useVideoStore((s) => s.setSelectedVideoId);
  const isSelected = useGridSelectionStore((s) => s.selected.has(video.id));
  const toggleSelect = useGridSelectionStore((s) => s.toggle);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [, forceTick] = useState(0);
  useEffect(() => {
    if (video.status !== 'generating') return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [video.status]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!video.videoUrl) return;
    try {
      const res = await fetch(video.videoUrl);
      const blob = await res.blob();
      const slug = video.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '') || 'video';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-${video.id.slice(0, 8)}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(video.videoUrl, '_blank');
    }
  };

  // Pending state (Marketing Studio parity)
  if (video.status === 'generating') {
    const elapsed = Math.floor((Date.now() - video.createdAt) / 1000);
    const pct = video.progress ?? Math.min(95, Math.floor((elapsed / 120) * 100));
    return (
      <div className="relative w-full h-full overflow-hidden bg-ms-surface-2 ring-1 ring-ms-border">
        <div className="absolute inset-0 ms-shimmer opacity-40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/90 px-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <div className="text-[11px] font-medium tracking-wide uppercase text-center">Rendering video…</div>
          <div className="w-3/4 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-foreground/80 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground">{elapsed}s</div>
        </div>
      </div>
    );
  }

  if (video.status === 'failed' || video.status === 'nsfw') {
    return (
      <div className="relative w-full h-full overflow-hidden bg-ms-surface-2 flex flex-col items-center justify-center gap-2 p-3 text-center">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="text-[11px] font-semibold text-foreground">Generation failed</div>
        <div className="text-[10px] text-muted-foreground line-clamp-3">{video.error || 'Try again'}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <button onClick={() => retryVideo(video.id)} className="flex items-center gap-1 bg-muted/60 text-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-muted">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
          <button onClick={() => deleteVideo(video.id)} className="flex items-center gap-1 bg-muted/60 text-foreground text-xs px-3 py-1.5 rounded-lg hover:bg-muted">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative w-full h-full overflow-hidden bg-ms-surface-2 cursor-pointer"
      onClick={() => setSelectedVideoId(video.id)}
      onMouseEnter={() => { videoRef.current?.play().catch(() => {}); }}
      onMouseLeave={() => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = 0.1; } }}
    >
      {video.videoUrl ? (
        <video
          ref={videoRef}
          src={`${video.videoUrl}#t=0.1`}
          poster={video.thumbnailUrl}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover bg-[#0a0a0a] pointer-events-none"
        />
      ) : (
        <div className="absolute inset-0 bg-[#0a0a0a]" />
      )}

      {/* Play badge (top-right corner, subtle) */}
      <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/55 backdrop-blur-md grid place-items-center ring-1 ring-white/10 opacity-90">
        <Play className="w-3.5 h-3.5 text-white fill-white" />
      </div>

      {/* Hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Top-left selection */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleSelect(video.id); }}
        className={`absolute top-2 left-2 grid place-items-center w-7 h-7 rounded-full backdrop-blur-md ring-1 transition-all ${
          isSelected
            ? 'bg-white text-black ring-white opacity-100'
            : 'bg-black/55 text-white/90 ring-white/15 opacity-0 group-hover:opacity-100 hover:bg-black/75'
        }`}
        title={isSelected ? 'Deselect' : 'Select'}
      >
        {isSelected ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="block w-3.5 h-3.5 rounded-full ring-1 ring-white/70" />}
      </button>

      {/* Bottom-right action row */}
      <div className="absolute bottom-2 right-2 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <HoverIconBtn label="Expand" onClick={(e) => { e.stopPropagation(); setSelectedVideoId(video.id); }} svg={<Maximize2 className="w-[18px] h-[18px]" />} />
        <HoverIconBtn label="Download" onClick={handleDownload} svg={<Download className="w-[18px] h-[18px]" />} />
        <HoverIconBtn
          label={video.liked ? 'Unlike' : 'Like'}
          onClick={(e) => { e.stopPropagation(); toggleLike(video.id); }}
          svg={<Heart className={`w-[18px] h-[18px] ${video.liked ? 'fill-current text-rose-400' : ''}`} />}
        />
        <HoverIconBtn label="Delete" danger onClick={(e) => { e.stopPropagation(); deleteVideo(video.id); }} svg={<Trash2 className="w-[18px] h-[18px]" />} />
      </div>
    </div>
  );
}

// =============================================================
// MarketingCard — clones MarketingStudioProject card UI for /create grid
// =============================================================
function stageLabel(g: MSGeneration): string {
  if (g.status === 'failed') return 'Failed';
  if (g.status === 'done') return 'Ready';
  switch (g.stage) {
    case 'scripting': return 'Writing script…';
    case 'keyframing': return 'Composing scene…';
    case 'keyframe_ready': return 'Scene ready…';
    case 'keyframe_failed': return 'Scene fallback…';
    case 'videoing': return 'Rendering on Seedance 2.0…';
    case 'done': return 'Ready';
    default:
      if (g.status === 'queued_pending_persist') return 'Registering…';
      if (g.status === 'running') return 'Rendering…';
      return 'Queued…';
  }
}

function MarketingCard({ gen, createProjectId }: { gen: MSGeneration & { kind: 'marketing' }; createProjectId: string }) {
  const toggleLike = useMarketingFeedStore((s) => s.toggleLike);
  const removeLocal = useMarketingFeedStore((s) => s.removeGeneration);
  const [selected, setSelected] = useState(false);
  const [, forceTick] = useState(0);

  const isPending = gen.status === 'queued' || gen.status === 'queued_pending_persist' || gen.status === 'running';
  const isFailed = gen.status === 'failed';

  useEffect(() => {
    if (!isPending) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isPending]);

  const elapsed = Math.floor((Date.now() - (gen.submittedAt || gen.createdAt)) / 1000);
  const pct = Math.min(95, Math.floor((elapsed / 120) * 100));

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    removeLocal(createProjectId, gen.id);
    await supabase.from('ms_generations').delete().eq('id', gen.id);
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase
        .from('ms_generations')
        .update({ status: 'queued', stage: 'scripting', error: null, updated_at: new Date().toISOString() } as any)
        .eq('id', gen.id);
      await supabase.functions.invoke('ms-retry-generation', { body: { id: gen.id } });
    } catch {}
  };

  return (
    <>
      <div
        className="group relative w-full h-full overflow-hidden bg-ms-surface-2 cursor-pointer"
        onClick={() => !isPending && !isFailed && setSelected(true)}
        onMouseEnter={(e) => { const v = e.currentTarget.querySelector('video'); v?.play().catch(() => {}); }}
        onMouseLeave={(e) => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0.1; } }}
      >
        {gen.videoUrl && !isPending && !isFailed ? (
          <video
            src={`${gen.videoUrl}#t=0.1`}
            poster={gen.thumbUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover bg-[#0a0a0a] pointer-events-none"
          />
        ) : gen.thumbUrl && !isPending && !isFailed ? (
          <img src={gen.thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        {isPending && (
          <>
            <div className="absolute inset-0 ms-shimmer opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/90 px-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <div className="text-[11px] font-medium tracking-wide uppercase text-center">{stageLabel(gen)}</div>
              <div className="w-3/4 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-foreground/80 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground">{elapsed}s</div>
            </div>
          </>
        )}

        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-foreground/90 px-3 text-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <div className="text-[11px] font-semibold">Generation failed</div>
            <div className="text-[10px] text-muted-foreground line-clamp-3">{gen.error || 'Try again'}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-medium"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-medium"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        )}

        {!isPending && !isFailed && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
              <div className="grid place-items-center w-12 h-12 rounded-full bg-white/90">
                <Play className="w-5 h-5 text-black fill-black" />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <HoverIconBtn label="Expand" onClick={(e) => { e.stopPropagation(); setSelected(true); }} svg={<Maximize2 className="w-[18px] h-[18px]" />} />
              <HoverIconBtn
                label={gen.liked ? 'Unlike' : 'Like'}
                onClick={(e) => { e.stopPropagation(); toggleLike(createProjectId, gen.id); }}
                svg={<Heart className={`w-[18px] h-[18px] ${gen.liked ? 'fill-current text-rose-400' : ''}`} />}
              />
              <HoverIconBtn label="Delete" danger onClick={handleDelete} svg={<Trash2 className="w-[18px] h-[18px]" />} />
            </div>
          </>
        )}
      </div>

      <VideoDetailModal
        open={selected}
        onOpenChange={(v) => setSelected(v)}
        generation={gen}
        projectId={createProjectId}
      />
    </>
  );
}


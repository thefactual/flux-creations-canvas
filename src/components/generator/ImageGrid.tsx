import { useGeneratorStore, MODELS } from '@/store/generatorStore';
import { useVideoStore } from '@/store/videoStore';
import { usePromptModeStore } from '@/store/promptModeStore';
import { useCreateProjectsStore } from '@/store/createProjectsStore';
import { useGridFilterStore } from '@/store/gridFilterStore';
import { useLayoutStore, ZOOM_ROW_HEIGHTS } from '@/store/layoutStore';
import { AlertCircle, Eye, RefreshCw, Trash2, Loader2, Download, Link2, Heart, MoreHorizontal, Maximize2, Search, X, ImageIcon, FolderInput, Image as ImageLucide, Check } from 'lucide-react';
import { useGridSelectionStore } from '@/store/gridSelectionStore';
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const activeProjectId = useCreateProjectsStore((s) => s.activeProjectId);
  const { search, modelFilter, dateFilter } = useGridFilterStore();

  const images = useMemo(() => {
    let list = activeProjectId
      ? allImages.filter((i) => i.projectId === activeProjectId)
      : allImages.filter((i) => !i.projectId);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.prompt?.toLowerCase().includes(q));
    }
    if (modelFilter) {
      list = list.filter((i) => i.model === modelFilter);
    }
    if (dateFilter !== 'all') {
      const now = Date.now();
      const day = 86400000;
      const cutoff = dateFilter === 'today' ? now - day : dateFilter === '7d' ? now - 7 * day : now - 30 * day;
      list = list.filter((i) => i.createdAt >= cutoff);
    }
    return list;
  }, [allImages, activeProjectId, search, modelFilter, dateFilter]);

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
  // Higgsfield-style: row height is driven by a 9:16 reference at the current zoom level.
  // All other aspect ratios in the same row scale to that height.
  const targetRowHeight = ZOOM_ROW_HEIGHTS[zoom];

  // Justified rows layout (à la Higgsfield / Google Images / Flickr):
  // every row has the SAME height; widths vary by aspect ratio so each row
  // exactly fills the container width. Order is preserved (newest first).
  const layout = useMemo(() => {
    type Item = { id: string; left: number; top: number; width: number; height: number };
    if (!containerWidth) return { items: [] as Item[], totalHeight: 0 };

    const items: Item[] = [];
    let top = 0;
    let rowStart = 0;

    const flushRow = (endExclusive: number, isLast: boolean) => {
      const rowImgs = images.slice(rowStart, endExclusive);
      if (rowImgs.length === 0) return;
      const ratios = rowImgs.map((i) => parseRatio(i.aspectRatio));
      const sumRatio = ratios.reduce((a, b) => a + b, 0);
      const totalGap = gap * (rowImgs.length - 1);
      // Height that makes the row exactly fill the container width.
      let rowHeight = (containerWidth - totalGap) / sumRatio;
      // Don't stretch the last partial row beyond the target height.
      if (isLast && rowHeight > targetRowHeight * 1.4) {
        rowHeight = targetRowHeight;
      }
      let left = 0;
      rowImgs.forEach((img, idx) => {
        const w = ratios[idx] * rowHeight;
        items.push({ id: img.id, left, top, width: w, height: rowHeight });
        left += w + gap;
      });
      top += rowHeight + gap;
      rowStart = endExclusive;
    };

    let accRatio = 0;
    for (let i = 0; i < images.length; i++) {
      accRatio += parseRatio(images[i].aspectRatio);
      // Projected row height if we close the row here.
      const totalGap = gap * (i - rowStart);
      const projected = (containerWidth - totalGap) / accRatio;
      if (projected <= targetRowHeight) {
        flushRow(i + 1, false);
        accRatio = 0;
      }
    }
    if (rowStart < images.length) flushRow(images.length, true);

    const totalHeight = Math.max(0, top - gap);
    return { items, totalHeight };
  }, [images, containerWidth, targetRowHeight]);

  return (
    <div className="w-full">
      
      <div ref={containerRef} className="relative w-full" style={{ height: images.length === 0 ? undefined : layout.totalHeight, minHeight: images.length === 0 ? '60vh' : undefined }}>
      {images.length === 0 && (
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <p className="text-lg text-foreground font-semibold">No generations yet</p>
            <p className="text-xs text-muted-foreground/70">Describe what you want below to get started.</p>
          </div>
        </div>
      )}
      {layout.items.map((pos, i) => {
        const img = images[i];
        return (
          <div
            key={img.id}
            className="absolute"
            style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
          >
            <ImageCard image={img} />
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

  // Generating state
  if (image.status === 'generating') {
    return (
      <div className="relative w-full h-full overflow-hidden bg-ms-surface-2 flex items-center justify-center">
        <div className="absolute inset-0 ms-shimmer opacity-40" />
        <div className="relative flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-foreground animate-spin" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Generating…</span>
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
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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

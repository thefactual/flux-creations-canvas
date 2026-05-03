import { useGeneratorStore, MODELS } from '@/store/generatorStore';
import { useCreateProjectsStore } from '@/store/createProjectsStore';
import { useGridFilterStore } from '@/store/gridFilterStore';
import { useLayoutStore, ZOOM_ROW_HEIGHTS } from '@/store/layoutStore';
import { AlertCircle, Eye, RefreshCw, Trash2, Loader2, Download, Link2, Heart, MoreHorizontal, Maximize2, Search, X, ImageIcon, FolderInput, Image as ImageLucide } from 'lucide-react';
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

  const gap = 8;
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
  const { setSelectedImageId, retryImage, deleteImage, useAsReference } = useGeneratorStore();
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
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-ms-surface-2 ring-1 ring-ms-border flex items-center justify-center">
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
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-ms-surface-2 ring-1 ring-ms-border flex flex-col items-center justify-center gap-3 p-3">
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
      className="group relative w-full h-full rounded-xl overflow-hidden bg-ms-surface-2 ring-1 ring-ms-border hover:ring-foreground/30 transition-all cursor-pointer"
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

      {/* Top-right action icons on hover */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedImageId(image.id); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-colors"
          title="Open"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-colors"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (image.imageUrl) useAsReference(image.imageUrl); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-colors"
          title="Use as reference"
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-colors"
          title="More"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
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
          <div className="my-1 border-t border-border/50" />
          <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={() => { deleteImage(image.id); setShowMenu(false); }} destructive />
        </div>
      )}

      {/* Delete icon - always visible on hover, bottom-right */}
      {!showMenu && (
        <button
          onClick={(e) => { e.stopPropagation(); deleteImage(image.id); }}
          className="absolute bottom-2 right-2 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white/90 hover:bg-red-600/80 hover:text-white backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100 duration-200"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Bottom info on hover */}
      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <p className="text-[10px] text-white/70 truncate">{image.prompt}</p>
      </div>
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

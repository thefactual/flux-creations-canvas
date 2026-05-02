import { useGeneratorStore } from '@/store/generatorStore';
import { AlertCircle, Eye, RefreshCw, Trash2, Loader2, Download, Link2, Heart, MoreHorizontal, Maximize2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

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

export function ImageGrid() {
  const { images } = useGeneratorStore();

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <p className="text-lg">Start creating</p>
          <p className="text-xs text-muted-foreground/60">Type a prompt below and click Generate</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {images.map((img) => (
          <div key={img.id} className="break-inside-avoid mb-2">
            <ImageCard image={img} />
          </div>
        ))}
      </div>
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
      <div className={`relative ${aspectClass} rounded-xl overflow-hidden bg-card border border-border flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <span className="text-xs text-muted-foreground">Generating...</span>
        </div>
      </div>
    );
  }

  // Failed / NSFW state
  if (image.status === 'failed' || image.status === 'nsfw') {
    return (
      <div className={`relative ${aspectClass} rounded-xl overflow-hidden bg-card border border-border flex flex-col items-center justify-center gap-3 p-3`}>
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

  // Use natural image aspect if loaded, otherwise fall back to aspectRatio setting
  const style = naturalAspect ? { aspectRatio: naturalAspect } : undefined;
  const containerClass = naturalAspect ? '' : aspectClass;

  return (
    <div
      className={`group relative ${containerClass} rounded-xl overflow-hidden bg-card border border-border hover:border-foreground/20 transition-colors cursor-pointer`}
      style={style}
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

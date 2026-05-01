import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Volume2, VolumeX, X } from 'lucide-react';
import { MSMode } from '@/store/marketingStudioStore';

export type FormatId =
  | 'UGC'
  | 'Tutorial'
  | 'Unboxing'
  | 'Hyper Motion'
  | 'Product Review'
  | 'TV Spot'
  | 'Wild Card'
  | 'UGC Virtual Try On'
  | 'Pro Virtual Try On'
  | 'Podcast';

export interface FormatItem {
  id: FormatId;
  label: string;
  desc: string;
  src: string;
  preview: string; // header preview image
}

export const FORMAT_ITEMS: FormatItem[] = [
  { id: 'UGC',                label: 'UGC',                desc: 'Realistic social media videos', src: '/formats/ugc-1.mp4',          preview: '/formats/preview-ugc.png' },
  { id: 'Tutorial',           label: 'Tutorial',           desc: 'Step-by-step tutorials',         src: '/formats/tutorial-1.mp4',     preview: '/formats/preview-tutorial.png' },
  { id: 'Unboxing',           label: 'Unboxing',           desc: 'High-quality unboxing',          src: '/formats/unboxing-1.mp4',     preview: '/formats/preview-vazu.png' },
  { id: 'Hyper Motion',       label: 'Hyper Motion',      desc: 'Highlight your product',         src: '/formats/hyper-motion-1.mp4', preview: '/formats/preview-vazu.png' },
  { id: 'Product Review',     label: 'Product Review',    desc: 'Authentic product reviews',      src: '/formats/product-review.mp4', preview: '/formats/preview-ugc.png' },
  { id: 'TV Spot',            label: 'TV Spot',            desc: 'Authentic stories, amplified',  src: '/formats/tv-spot.mp4',        preview: '/formats/preview-vazu.png' },
  { id: 'Wild Card',          label: 'Wild Card',          desc: 'A unique and creative video',   src: '/formats/wild-card.mp4',      preview: '/formats/preview-tutorial.png' },
  { id: 'UGC Virtual Try On', label: 'UGC Virtual Try On', desc: 'Try before you buy',            src: '/formats/ugc-tryon.mp4',      preview: '/formats/preview-ugc.png' },
  { id: 'Pro Virtual Try On', label: 'Pro Virtual Try On', desc: 'Advanced virtual try-on',       src: '/formats/pro-tryon.mp4',      preview: '/formats/preview-ugc.png' },
  { id: 'Podcast',            label: 'Podcast',            desc: 'Faux-podcast clip — two-person ad', src: '/formats/podcast-1.mp4',  preview: '/formats/preview-ugc.png' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selected?: MSMode | string;
  onSelect: (id: FormatId) => void;
}

export function FormatPickerModal({ open, onOpenChange, selected, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 border-0 bg-transparent shadow-none max-w-[1180px] w-[calc(100vw-2rem)] max-h-[92vh] overflow-hidden [&>button.absolute.right-4.top-4]:hidden"
        style={{ fontFamily: '"Montserrat", system-ui, sans-serif' }}
      >
        <div className="relative ms-glass rounded-3xl overflow-hidden">
          {/* Header */}
          <div className="relative flex items-start justify-between gap-4 p-6 md:p-8 pb-4">
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white uppercase">
                Pick the format that hits
              </h2>
              <p className="mt-1.5 text-sm text-white/60 max-w-md">
                From unboxing to UGC – choose the type of video that fits your product and audience.
              </p>
            </div>

            {/* Stacked preview images */}
            <div className="hidden sm:flex items-center -space-x-6 pr-12 shrink-0">
              <img src="/formats/preview-tutorial.png" alt="" className="w-16 h-20 md:w-20 md:h-24 rounded-2xl object-cover ring-2 ring-black/40 -rotate-6 shadow-xl" />
              <img src="/formats/preview-ugc.png"      alt="" className="w-16 h-20 md:w-20 md:h-24 rounded-2xl object-cover ring-2 ring-black/40 rotate-2 shadow-xl z-10" />
              <img src="/formats/preview-vazu.png"     alt="" className="w-16 h-20 md:w-20 md:h-24 rounded-2xl object-cover ring-2 ring-black/40 rotate-6 shadow-xl" />
            </div>

            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-5 right-5 grid place-items-center w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid */}
          <div className="px-4 md:px-6 pb-6 md:pb-8 max-h-[68vh] overflow-y-auto ms-scroll">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
              {FORMAT_ITEMS.map((f) => (
                <FormatTile
                  key={f.id}
                  item={f}
                  active={selected === f.id}
                  onClick={() => {
                    onSelect(f.id);
                    onOpenChange(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormatTile({ item, active, onClick }: { item: FormatItem; active: boolean; onClick: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);

  // Only mount/play the video once the tile is near the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: null, rootMargin: '200px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !inView) return;
    v.muted = true;
    const tryPlay = () => v.play().catch(() => {});
    if (v.readyState >= 2) tryPlay();
    else v.addEventListener('loadeddata', tryPlay, { once: true });
    return () => v.removeEventListener('loadeddata', tryPlay);
  }, [inView]);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="text-left group focus:outline-none"
    >
      <div
        ref={wrapRef}
        className={`relative aspect-[3/4] rounded-2xl overflow-hidden bg-black/40 ring-1 transition-all duration-300 ease-out will-change-transform ${
          active
            ? 'ring-2 ring-white shadow-[0_20px_60px_-20px_rgba(255,255,255,0.4)] scale-[1.04]'
            : `ring-white/10 ${hovered ? 'scale-[1.05] ring-white/30 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]' : ''}`
        }`}
      >
        {/* Lightweight poster shown until the video lazy-mounts */}
        <img
          src={item.preview}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        {inView && (
          <video
            ref={ref}
            src={item.src}
            muted={muted}
            loop
            autoPlay
            playsInline
            preload="metadata"
            poster={item.preview}
            className="relative w-full h-full object-cover"
          />
        )}
        {/* Mute toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const v = ref.current;
            const next = !muted;
            setMuted(next);
            if (v) v.muted = next;
          }}
          className="absolute top-2.5 right-2.5 grid place-items-center w-8 h-8 rounded-full bg-black/55 backdrop-blur-md text-white hover:bg-black/75 transition-colors"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="text-sm font-semibold text-white truncate">{item.label}</div>
        <div className="text-xs text-white/55 truncate">{item.desc}</div>
      </div>
    </button>
  );
}

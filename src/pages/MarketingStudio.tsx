import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { MarketingStudioLayout } from '@/components/marketingstudio/MarketingStudioLayout';
import { PromptBar } from '@/components/marketingstudio/PromptBar';
import { PromptNavBar } from '@/components/PromptNavBar';
import { FORMAT_PRESETS, dispatchRecreate } from '@/components/marketingstudio/formatPresets';

const FORMATS = [
  { id: 'f1', label: 'Hyper Motion', src: '/formats/hyper-motion-1.mp4' },
  { id: 'f2', label: 'Unboxing', src: '/formats/unboxing-1.mp4' },
  { id: 'f3', label: 'Hyper Motion', src: '/formats/hyper-motion-2.mp4' },
  { id: 'f4', label: 'UGC', src: '/formats/ugc-1.mp4' },
  { id: 'f5', label: 'UGC', src: '/formats/ugc-2.mp4' },
  { id: 'f6', label: 'UGC Virtual Try On', src: '/formats/ugc-tryon-1.mp4' },
  { id: 'f7', label: 'Unboxing', src: '/formats/unboxing-2.mp4' },
  { id: 'f8', label: 'UGC Virtual Try On', src: '/formats/ugc-tryon-2.mp4' },
  { id: 'f9', label: 'Tutorial', src: '/formats/tutorial-1.mp4' },
  { id: 'f10', label: 'Podcast', src: '/formats/podcast-1.mp4' },
];

function BoltIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path
        d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"
        fill="currentColor"
      />
      <path
        d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FormatCard({ id, label, src }: { id: string; label: string; src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(true);
  const expandTimer = useRef<number | null>(null);

  useEffect(() => {
    if (hovered) {
      ref.current?.play().catch(() => {});
      expandTimer.current = window.setTimeout(() => setExpanded(true), 350);
    } else {
      if (expandTimer.current) window.clearTimeout(expandTimer.current);
      setExpanded(false);
      if (ref.current) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
      setMuted(true);
    }
    return () => {
      if (expandTimer.current) window.clearTimeout(expandTimer.current);
    };
  }, [hovered]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative aspect-[2/3]"
    >
      <div
        className={`absolute inset-0 rounded-2xl overflow-hidden bg-ms-surface-2 ring-1 ring-white/5 transition-all duration-500 ease-out will-change-transform ${
          expanded
            ? 'scale-[1.08] z-30 ring-white/20 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]'
            : 'scale-100 z-0 hover:ring-white/10'
        }`}
      >
        <video
          ref={ref}
          src={src}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />

        {/* Top gradient + label */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute top-3 left-0 right-0 px-3 flex items-center justify-center">
          <span className="text-[13px] font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] whitespace-nowrap">
            {label}
          </span>
        </div>

        {/* Mute toggle — appears on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className={`absolute top-2.5 right-2.5 grid place-items-center w-8 h-8 rounded-full bg-black/55 backdrop-blur-md text-white transition-all duration-300 ${
            hovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
          }`}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Recreate button — slides up from bottom on hover */}
        <div className="absolute inset-x-0 bottom-0 p-2.5 overflow-hidden">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const preset = FORMAT_PRESETS[id];
              if (!preset) return;
              window.scrollTo({ top: 0, behavior: 'smooth' });
              // Defer so listener is mounted & after scroll begins
              requestAnimationFrame(() => dispatchRecreate(preset));
            }}
            className={`w-full h-11 rounded-full bg-white text-black text-sm font-semibold shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out ${
              hovered ? 'translate-y-0 opacity-100' : 'translate-y-[140%] opacity-0'
            }`}
          >
            Recreate
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MarketingStudio() {
  return (
    <MarketingStudioLayout>
      {/* Hero glow */}
      <div className="relative">
        <div className="absolute -top-14 inset-x-0 h-[640px] ms-hero-glow pointer-events-none" />

        <section className="relative px-4 md:px-8 pt-10 md:pt-16 pb-8 max-w-6xl mx-auto">
          <div className="text-center">
            <div className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase mb-4">
              Marketing Studio
            </div>
            <h1
              className="text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground uppercase leading-[1.05] font-semibold"
              style={{ fontFamily: '"Bricolage Grotesque", system-ui, sans-serif' }}
            >
              Turn Any Product
              <br />
              Into a Video Ad
            </h1>
          </div>

          <div className="mt-10">
            <PromptBar />
          </div>
        </section>
      </div>

      {/* Formats grid */}
      <section className="px-4 md:px-8 pb-16 max-w-7xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-6 mt-6">
          <BoltIcon className="size-4 text-[#ff005b]" />
          <h2 className="text-base font-semibold text-foreground">Generate across formats</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {FORMATS.map((f) => (
            <FormatCard key={f.id} id={f.id} label={f.label} src={f.src} />
          ))}
        </div>
      </section>
    </MarketingStudioLayout>
  );
}

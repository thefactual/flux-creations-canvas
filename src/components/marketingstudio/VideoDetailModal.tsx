import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Heart, Share2, Download, MoreHorizontal, Pencil, RefreshCw, Send } from 'lucide-react';
import { MSGeneration, useMarketingStudioStore } from '@/store/marketingStudioStore';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function proxiedVideoUrl(url: string, download?: string) {
  const qs = new URLSearchParams({ url });
  if (download) qs.set('download', download);
  return `${SUPABASE_URL}/functions/v1/marketing-video-proxy?${qs.toString()}`;
}

export function VideoDetailModal({
  open,
  onOpenChange,
  generation,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  generation: MSGeneration | null;
  projectId?: string;
}) {
  const toggleLike = useMarketingStudioStore((s) => s.toggleLike);
  if (!generation) return null;

  // Play directly from the upstream CDN — much faster first-byte than going
  // through our edge proxy. Proxy is only used for the Download action so we
  // can force a `content-disposition: attachment` filename.
  const playSrc = generation.videoUrl;

  const handleDownload = async () => {
    if (!generation.videoUrl) return;
    try {
      const filename = `${(generation.prompt || 'video').slice(0, 40).replace(/[^a-z0-9]+/gi, '-')}.mp4`;
      const res = await fetch(proxiedVideoUrl(generation.videoUrl, filename));
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      toast.error('Download failed');
      window.open(generation.videoUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1200px,96vw)] w-[96vw] h-[92vh] md:h-[88vh] bg-ms-surface/80 backdrop-blur-2xl border-ms-border p-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          {/* Media */}
          <div className="relative flex items-center justify-center min-h-0 overflow-hidden">
            {playSrc && (
              <video
                src={playSrc}
                muted
                loop
                playsInline
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none"
              />
            )}
            {playSrc ? (
              <video
                key={playSrc}
                src={`${playSrc}#t=0.1`}
                controls
                autoPlay
                loop
                playsInline
                preload="auto"
                className="relative max-w-full max-h-full w-auto h-auto object-contain z-10"
              />
            ) : generation.thumbUrl ? (
              <img
                src={generation.thumbUrl}
                alt=""
                className="relative max-w-full max-h-full w-auto h-auto object-contain z-10"
              />
            ) : (
              <div className="text-muted-foreground text-sm">No preview available</div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex flex-col bg-ms-surface border-t md:border-t-0 md:border-l border-ms-border min-h-0">
            <div className="p-4 border-b border-ms-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ms-cta to-ms-cta-2" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">korsola_user</div>
                <div className="text-xs text-muted-foreground">Author</div>
              </div>
            </div>

            <div className="flex border-b border-ms-border">
              <button className="flex-1 h-10 text-xs font-medium text-foreground bg-ms-surface-2">Details</button>
              <button className="flex-1 h-10 text-xs font-medium text-muted-foreground hover:text-foreground">Comments</button>
            </div>

            <div className="flex-1 overflow-y-auto ms-scroll p-4 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt</div>
                  <button className="text-[11px] text-muted-foreground hover:text-foreground">Copy</button>
                </div>
                <div className="text-sm text-foreground/90 leading-relaxed bg-ms-surface-2 rounded-lg p-3">
                  {generation.prompt}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Information
                </div>
                <div className="rounded-lg bg-ms-surface-2 divide-y divide-ms-border">
                  <Row label="Model" value="Marketing Studio" />
                  <Row label="Type" value={generation.surface} />
                  <Row label="Mode" value={generation.mode} />
                  <Row label="Aspect" value={generation.aspect} />
                  <Row label="Resolution" value={generation.resolution} />
                  <Row label="Duration" value={generation.duration} />
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-ms-border space-y-2">
              <button className="ms-cta w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Recreate
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="h-10 rounded-xl bg-ms-surface-2 hover:bg-ms-border text-sm text-foreground flex items-center justify-center gap-2">
                  <Send className="w-3.5 h-3.5" /> Publish
                </button>
                <button className="h-10 rounded-xl bg-ms-surface-2 hover:bg-ms-border text-sm text-foreground flex items-center justify-center gap-2">
                  <Pencil className="w-3.5 h-3.5" /> Video edit
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleDownload} className="flex-1 h-10 rounded-xl bg-ms-surface-2 hover:bg-ms-border text-sm text-foreground flex items-center justify-center gap-2">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  onClick={() => projectId && toggleLike(projectId, generation.id)}
                  className="grid place-items-center w-10 h-10 rounded-xl bg-ms-surface-2 hover:bg-ms-border text-foreground"
                >
                  <Heart className={`w-4 h-4 ${generation.liked ? 'fill-ms-cta text-ms-cta' : ''}`} />
                </button>
                <button className="grid place-items-center w-10 h-10 rounded-xl bg-ms-surface-2 hover:bg-ms-border text-foreground">
                  <Share2 className="w-4 h-4" />
                </button>
                <button className="grid place-items-center w-10 h-10 rounded-xl bg-ms-surface-2 hover:bg-ms-border text-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 h-10 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

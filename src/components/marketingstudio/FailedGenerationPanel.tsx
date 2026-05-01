import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Activity, Image as ImageIcon, User2, Package } from 'lucide-react';
import { MSGeneration } from '@/store/marketingStudioStore';
import { supabase } from '@/integrations/supabase/client';

interface ProviderProbe {
  status: 'ok' | 'balance_error' | 'down' | 'unconfigured';
  message: string;
  latencyMs: number;
}
interface HealthPayload {
  checkedAt: number;
  atlas: ProviderProbe;
  fal: ProviderProbe;
  blockGeneration: boolean;
  cached?: boolean;
}

interface DetailRow {
  provider?: string | null;
  reference_paths?: string[] | null;
  product_id?: string | null;
  avatar_id?: string | null;
  prompt?: string | null;
  stage?: string | null;
  fal_request_id?: string | null;
  resolution?: string | null;
  aspect?: string | null;
  duration_seconds?: number | null;
}

function statusTone(s: ProviderProbe['status']) {
  if (s === 'ok') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (s === 'balance_error') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (s === 'unconfigured') return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
}

interface Props {
  generation: MSGeneration | null;
  open: boolean;
  onClose: () => void;
  onRetry: (g: MSGeneration) => void;
}

export function FailedGenerationPanel({ generation, open, onClose, onRetry }: Props) {
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingHealth, setRefreshingHealth] = useState(false);

  useEffect(() => {
    if (!open || !generation) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const isUuid = /^[0-9a-f-]{36}$/i.test(generation.id);
      const [rowRes, healthRes] = await Promise.all([
        isUuid
          ? supabase
              .from('ms_generations')
              .select(
                'provider, reference_paths, product_id, avatar_id, prompt, stage, fal_request_id, resolution, aspect, duration_seconds',
              )
              .eq('id', generation.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.functions.invoke('marketing-provider-health', { body: {} }),
      ]);
      if (cancelled) return;
      if (rowRes?.data) setDetail(rowRes.data as DetailRow);
      if (healthRes?.data) setHealth(healthRes.data as HealthPayload);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, generation?.id]);

  async function refreshHealth() {
    setRefreshingHealth(true);
    const { data } = await supabase.functions.invoke('marketing-provider-health', {
      body: { force: true },
    });
    if (data) setHealth(data as HealthPayload);
    setRefreshingHealth(false);
  }

  if (!generation) return null;
  const refsCount = detail?.reference_paths?.length ?? 0;
  const hasAvatar = !!detail?.avatar_id;
  const hasProduct = !!detail?.product_id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px] bg-ms-surface border-ms-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Failed generation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <div className="text-xs uppercase tracking-wide text-red-300/80 mb-1">Provider error</div>
            <div className="text-foreground/90 break-words whitespace-pre-wrap">
              {generation.error || 'No error message captured.'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="border-ms-border">stage: {detail?.stage || generation.stage || 'unknown'}</Badge>
              {detail?.provider && <Badge variant="outline" className="border-ms-border">provider: {detail.provider}</Badge>}
              {detail?.fal_request_id && (
                <Badge variant="outline" className="border-ms-border">req: {detail.fal_request_id.slice(0, 10)}…</Badge>
              )}
            </div>
          </section>

          <section className="rounded-md border border-ms-border bg-ms-surface-2 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Inputs</div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${hasAvatar ? 'border-emerald-500/40 text-emerald-300' : 'border-ms-border text-muted-foreground'}`}>
                <User2 className="w-3 h-3" /> avatar {hasAvatar ? 'yes' : 'no'}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${hasProduct ? 'border-emerald-500/40 text-emerald-300' : 'border-ms-border text-muted-foreground'}`}>
                <Package className="w-3 h-3" /> product {hasProduct ? 'yes' : 'no'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-ms-border text-muted-foreground">
                <ImageIcon className="w-3 h-3" /> {refsCount} refs
              </span>
              {detail?.resolution && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-ms-border text-muted-foreground">
                  {detail.resolution} · {detail.aspect} · {detail.duration_seconds}s
                </span>
              )}
            </div>
            {detail?.prompt && (
              <div className="text-xs text-muted-foreground line-clamp-4">{detail.prompt}</div>
            )}
          </section>

          <section className="rounded-md border border-ms-border bg-ms-surface-2 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Activity className="w-3 h-3" /> Provider health
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={refreshingHealth}
                onClick={refreshHealth}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${refreshingHealth ? 'animate-spin' : ''}`} />
                Re-check
              </Button>
            </div>
            {!health && <div className="text-xs text-muted-foreground">Loading…</div>}
            {health && (
              <div className="space-y-1.5">
                {(['atlas', 'fal'] as const).map((p) => {
                  const probe = health[p];
                  return (
                    <div key={p} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground">{p === 'atlas' ? 'Atlas' : 'fal'}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${statusTone(probe.status)}`}>
                        {probe.status}
                      </span>
                      <span className="text-muted-foreground truncate">{probe.message}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{probe.latencyMs}ms</span>
                    </div>
                  );
                })}
                {health.blockGeneration && (
                  <div className="mt-2 text-[11px] text-amber-300">
                    Both providers are unhealthy. New generations are blocked until at least one recovers.
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button
              onClick={() => {
                onRetry(generation);
                onClose();
              }}
              disabled={loading}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

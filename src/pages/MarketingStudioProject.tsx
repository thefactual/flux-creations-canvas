import { useParams, Navigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { MarketingStudioLayout } from '@/components/marketingstudio/MarketingStudioLayout';
import { PromptBar } from '@/components/marketingstudio/PromptBar';
import { useMarketingStudioStore, MSGeneration } from '@/store/marketingStudioStore';
import { Heart, Maximize2, Play, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { VideoDetailModal } from '@/components/marketingstudio/VideoDetailModal';
import { FailedGenerationPanel } from '@/components/marketingstudio/FailedGenerationPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const minProviderTimeoutMs = (duration?: string) => {
  const seconds = Math.min(15, Math.max(4, parseInt(duration || '8') || 8));
  return Math.max(8 * 60 * 1000, Math.min(15 * 60 * 1000, (6 * 60 + seconds * 30) * 1000));
};

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

export default function MarketingStudioProject() {
  const { slug } = useParams();
  const project = useMarketingStudioStore((s) => s.getProjectBySlug(slug || ''));
  const projects = useMarketingStudioStore((s) => s.projects);
  const toggleLike = useMarketingStudioStore((s) => s.toggleLike);
  const updateGeneration = useMarketingStudioStore((s) => s.updateGeneration);
  const [tab, setTab] = useState<'all' | 'liked'>('all');
  const [selected, setSelected] = useState<MSGeneration | null>(null);
  const [failedDetail, setFailedDetail] = useState<MSGeneration | null>(null);
  const [hydratingProject, setHydratingProject] = useState(false);
  const retrying = useRef<Set<string>>(new Set());

  // If the slug isn't in local store (different device / cleared cache),
  // hydrate the project from DB before redirecting away.
  useEffect(() => {
    if (project || !slug) return;
    let cancelled = false;
    setHydratingProject(true);
    (async () => {
      const { data } = await supabase
        .from('ms_projects')
        .select('id, slug, name, thumb_url, created_at')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        useMarketingStudioStore.setState((s) => ({
          projects: [
            {
              id: data.id,
              slug: data.slug,
              name: data.name,
              thumbUrl: data.thumb_url ?? undefined,
              createdAt: new Date(data.created_at as any).getTime(),
              generations: [],
            },
            ...s.projects.filter((p) => p.slug !== data.slug),
          ],
        }));
      }
      setHydratingProject(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, slug]);

  const addGeneration = useMarketingStudioStore((s) => s.addGeneration);

  // Hydrate generations from DB on mount/refresh AND every 5s — keeps history in sync
  // across reloads and devices. Pulls ALL rows for this project_id, not just IDs we
  // already know about, so newly-created server rows (e.g. from orchestrator) appear.
  useEffect(() => {
    if (!project) return;
    // One-time cleanup: remove any non-UUID placeholder generations left in
    // localStorage by previous (buggy) versions of the prompt bar — these caused
    // duplicate cards alongside DB-hydrated rows.
    const stale = project.generations.filter((g) => !/^[0-9a-f-]{36}$/i.test(g.id));
    if (stale.length > 0) {
      useMarketingStudioStore.setState((s) => ({
        projects: s.projects.map((p) =>
          p.id === project.id
            ? { ...p, generations: p.generations.filter((g) => /^[0-9a-f-]{36}$/i.test(g.id)) }
            : p,
        ),
      }));
    }
    let cancelled = false;
    const sync = async () => {
      const { data, error } = await supabase
        .from('ms_generations')
        .select(
          'id, status, stage, video_url, thumb_url, error, fal_request_id, prompt, format, surface, aspect, resolution, duration_seconds, product_id, avatar_id, created_at, updated_at, keyframe_url',
        )
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled || error || !data) return;
      const known = new Set(project.generations.map((g) => g.id));
      for (const row of data) {
        if (known.has(row.id)) {
          updateGeneration(project.id, row.id, {
            status: row.status as MSGeneration['status'],
            stage: (row as any).stage as MSGeneration['stage'],
            videoUrl: row.video_url ?? undefined,
            thumbUrl: row.thumb_url ?? (row as any).keyframe_url ?? undefined,
            error: row.error ?? undefined,
            falRequestId: row.fal_request_id ?? undefined,
            submittedAt:
              row.status === 'queued' || row.status === 'queued_pending_persist' || row.status === 'running'
                ? new Date((row as any).updated_at ?? row.created_at as any).getTime()
                : undefined,
          });
        } else {
          addGeneration(project.id, {
            id: row.id,
            thumbUrl: row.thumb_url ?? (row as any).keyframe_url ?? '',
            videoUrl: row.video_url ?? undefined,
            prompt: row.prompt ?? '',
            mode: ((row as any).format ?? 'UGC') as MSGeneration['mode'],
            surface: ((row as any).surface ?? 'Product') as MSGeneration['surface'],
            aspect: ((row as any).aspect ?? '9:16') as MSGeneration['aspect'],
            resolution: ((row as any).resolution ?? '720p') as MSGeneration['resolution'],
            duration: `${(row as any).duration_seconds ?? 8}s`,
            productId: (row as any).product_id ?? undefined,
            avatarId: (row as any).avatar_id ?? undefined,
            createdAt: new Date(row.created_at as any).getTime(),
            submittedAt: new Date(((row as any).updated_at ?? row.created_at) as any).getTime(),
            status: row.status as MSGeneration['status'],
            stage: (row as any).stage as MSGeneration['stage'],
            falRequestId: row.fal_request_id ?? undefined,
            error: row.error ?? undefined,
          });
        }
      }
    };
    sync();
    const t = setInterval(sync, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Poll active generations every 4s, with timeout
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(async () => {
      const active = project.generations.filter(
        (g) =>
          (g.status === 'queued' ||
            g.status === 'queued_pending_persist' ||
            g.status === 'running') &&
          /^[0-9a-f-]{36}$/i.test(g.id),
      );

      for (const g of active) {
        // Client-side timeout
        const started = g.submittedAt || g.createdAt;
        const timeoutMs = minProviderTimeoutMs(g.duration);
        if (Date.now() - started > timeoutMs) {
          const timeoutMessage = `Timed out after ${Math.round(timeoutMs / 60000)} minutes while rendering. The provider did not return a final result; retry will submit a fresh job.`;
          updateGeneration(project.id, g.id, {
            status: 'failed',
            stage: 'failed',
            error: timeoutMessage,
          });
          await supabase
            .from('ms_generations')
            .update({ status: 'failed', stage: 'failed', error: timeoutMessage })
            .eq('id', g.id);
          continue;
        }

        // If video hasn't been submitted yet (still scripting/keyframing), refresh the row to update `stage`.
        if (!g.falRequestId) {
          const { data: row } = await supabase
            .from('ms_generations')
            .select('id, status, stage, video_url, error, fal_request_id')
            .eq('id', g.id)
            .maybeSingle();
          if (row) {
            updateGeneration(project.id, g.id, {
              status: row.status as MSGeneration['status'],
              stage: (row as any).stage as MSGeneration['stage'],
              falRequestId: row.fal_request_id ?? undefined,
              videoUrl: row.video_url ?? undefined,
              error: row.error ?? undefined,
            });
          }
          continue;
        }

        try {
          const { data } = await supabase.functions.invoke('marketing-generate-video', {
            body: { poll: g.id },
          });
          if (!data) continue;
          if (data.status === 'done') {
            updateGeneration(project.id, g.id, {
              status: 'done',
              stage: 'done',
              videoUrl: data.video_url,
              thumbUrl: data.thumb_url || g.thumbUrl,
            });
          } else if (data.status === 'failed') {
            updateGeneration(project.id, g.id, {
              status: 'failed',
              stage: 'failed',
              error: data.error || 'Generation failed',
            });
          } else if (data.status === 'queued_pending_persist') {
            updateGeneration(project.id, g.id, { status: 'queued_pending_persist' });
          } else if (data.status === 'running') {
            updateGeneration(project.id, g.id, { status: 'running', stage: 'videoing' });
          }
        } catch (_) {
          /* swallow transient network errors */
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [project, updateGeneration]);

  if (!project) {
    if (hydratingProject) {
      return (
        <div className="min-h-screen grid place-items-center bg-background">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return <Navigate to="/image" replace />;
  }

  const items = tab === 'all' ? project.generations : project.generations.filter((g) => g.liked);

  const handleRetry = async (g: MSGeneration) => {
    if (retrying.current.has(g.id)) return;
    retrying.current.add(g.id);
    updateGeneration(project.id, g.id, {
      status: 'queued',
      error: undefined,
      submittedAt: Date.now(),
    });
    try {
      const { data, error } = await supabase.functions.invoke('marketing-generate-video', {
        body: { retry: g.id },
      });
      if (error) throw error;
      if (data?.status === 'failed') {
        updateGeneration(project.id, g.id, {
          status: 'failed',
          stage: 'failed',
          error: data.error || 'Retry failed',
        });
        toast({ title: 'Retry failed', description: data.error, variant: 'destructive' });
        return;
      }
      updateGeneration(project.id, g.id, {
        falRequestId: data?.fal_request_id,
        status: 'queued',
        stage: 'videoing',
        error: undefined,
        submittedAt: Date.now(),
      });
      toast({ title: 'Retrying generation' });
    } catch (e: any) {
      updateGeneration(project.id, g.id, {
        status: 'failed',
        error: e?.message ?? 'Retry failed',
      });
      toast({ title: 'Retry failed', description: e?.message, variant: 'destructive' });
    } finally {
      retrying.current.delete(g.id);
    }
  };

  const tabsRight = (
    <div className="flex items-center gap-1 p-1 rounded-full bg-ms-surface-2 border border-ms-border">
      <button
        onClick={() => setTab('all')}
        className={`px-3 h-7 rounded-full text-xs font-medium ${
          tab === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        All
      </button>
      <button
        onClick={() => setTab('liked')}
        className={`flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium ${
          tab === 'liked' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Heart className="w-3 h-3" /> Liked
      </button>
      <button className="grid place-items-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground">
        <Maximize2 className="w-3 h-3" />
      </button>
    </div>
  );

  // Active jobs panel summary
  const activeJobs = project.generations.filter(
    (g) =>
      g.status === 'queued' ||
      g.status === 'queued_pending_persist' ||
      g.status === 'running',
  );

  return (
    <MarketingStudioLayout showBack title={project.name} rightSlot={tabsRight}>
      <div className="px-3 md:px-5 pb-44">
        {activeJobs.length > 0 && (
          <div className="mb-3 rounded-2xl ms-glass p-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {activeJobs.length} generation{activeJobs.length > 1 ? 's' : ''} in progress
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {stageLabel(activeJobs[0])}
              </div>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ms-cta to-ms-cta-2 grid place-items-center mb-4 shadow-[0_10px_30px_-10px_hsl(var(--ms-cta)/0.6)]">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
            <div className="text-lg font-semibold text-foreground">No generations yet</div>
            <div className="text-sm text-muted-foreground mt-1">Describe your ad below to get started.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((g) => {
              const isPending =
                g.status === 'queued' ||
                g.status === 'queued_pending_persist' ||
                g.status === 'running';
              const isFailed = g.status === 'failed';
              const elapsed = Math.floor((Date.now() - (g.submittedAt || g.createdAt)) / 1000);
              const pct = Math.min(95, Math.floor((elapsed / 120) * 100)); // fake progress to 95% over 2min
              return (
                <button
                  key={g.id}
                  onClick={() => !isPending && !isFailed && setSelected(g)}
                  onMouseEnter={(e) => { const v = e.currentTarget.querySelector('video'); v?.play().catch(() => {}); }}
                  onMouseLeave={(e) => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0.1; } }}
                  className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-ms-surface-2 ring-1 ring-ms-border hover:ring-foreground/30 transition-all text-left"
                >
                  {g.videoUrl && !isPending && !isFailed ? (
                    <video
                      src={`${g.videoUrl}#t=0.1`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover bg-[#0a0a0a] pointer-events-none"
                    />
                  ) : g.thumbUrl && !isPending && !isFailed ? (
                    <img
                      src={g.thumbUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#0a0a0a]" />
                  )}

                  {isPending && (
                    <>
                      <div className="absolute inset-0 ms-shimmer opacity-40" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/90 px-3">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <div className="text-[11px] font-medium tracking-wide uppercase text-center">
                          {stageLabel(g)}
                        </div>
                        <div className="w-3/4 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-foreground/80 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground">{elapsed}s</div>
                      </div>
                    </>
                  )}

                  {isFailed && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-foreground/90 px-3 text-center">
                      <AlertCircle className="w-6 h-6 text-destructive" />
                      <div className="text-[11px] font-semibold">Generation failed</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-3">
                        {g.error || 'Try again'}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {/^[0-9a-f-]{36}$/i.test(g.id) && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(g);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-medium cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" /> Retry
                          </span>
                        )}
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFailedDetail(g);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-medium cursor-pointer"
                        >
                          Details
                        </span>
                      </div>
                    </div>
                  )}

                  {!isPending && !isFailed && (
                    <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                      <div className="grid place-items-center w-12 h-12 rounded-full bg-white/90">
                        <Play className="w-5 h-5 text-black fill-black" />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLike(project.id, g.id);
                    }}
                    className="absolute bottom-2 right-2 grid place-items-center w-8 h-8 rounded-full bg-black/40 text-white hover:bg-black/60"
                  >
                    <Heart className={`w-3.5 h-3.5 ${g.liked ? 'fill-ms-cta text-ms-cta' : ''}`} />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating prompt bar */}
      <div className="fixed bottom-4 left-0 md:left-64 right-0 px-3 md:px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <PromptBar projectId={project.id} projectName={project.name} />
        </div>
      </div>

      <VideoDetailModal
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        generation={selected}
        projectId={project.id}
      />

      <FailedGenerationPanel
        open={!!failedDetail}
        generation={failedDetail}
        onClose={() => setFailedDetail(null)}
        onRetry={(g) => handleRetry(g)}
      />
    </MarketingStudioLayout>
  );
}

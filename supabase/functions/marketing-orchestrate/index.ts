// Orchestrate the marketing-video pipeline as one call.
// SCRIPT WRITER DISABLED — the user-typed prompt is sent directly to the
// video provider. The avatar's voice sample URL is auto-attached inside
// marketing-generate-video. Per-format inspo system prompts in
// marketing-generate-script are kept on disk but no longer called from here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function aspectToRatio(a: string) {
  if (!a || a === 'Auto') return 'adaptive';
  return a;
}

function isValidHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function uniqueValidUrls(urls: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!isValidHttpUrl(raw)) continue;
    const url = String(raw).trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function invokeFn(name: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function signedStorageUrl(admin: any, bucket: string, path: string) {
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

async function gatherReferenceUrls(admin: any, opts: {
  productId?: string | null;
  avatarId?: string | null;
}): Promise<{ refs: string[]; thumb: string | null }> {
  const refs: string[] = [];
  let thumb: string | null = null;

  if (opts.productId) {
    const { data: imgs } = await admin
      .from('ms_product_images')
      .select('storage_path, is_primary')
      .eq('product_id', opts.productId)
      .order('is_primary', { ascending: false });
    for (const img of imgs ?? []) {
      const url = await signedStorageUrl(admin, 'ms-products', (img as any).storage_path);
      if (url) {
        refs.push(url);
        if (!thumb) thumb = url;
      }
    }
  }

  if (opts.avatarId) {
    const { data: av } = await admin
      .from('ms_avatars')
      .select('public_url, storage_path, is_builtin')
      .eq('id', opts.avatarId)
      .maybeSingle();
    if (av) {
      const url = (av as any).public_url
        || ((av as any).storage_path ? await signedStorageUrl(admin, 'ms-avatars', (av as any).storage_path) : null);
      if (url) {
        refs.push(url);
        if (!thumb) thumb = url;
      }
    }
  }

  return { refs: uniqueValidUrls(refs), thumb };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const {
      productId,
      avatarId,
      format,
      surface,
      aspect = '9:16',
      duration_seconds = 8,
      resolution = '720p',
      userPrompt = '',
      projectId,
    } = await req.json();

    const ratio = aspectToRatio(aspect);
    let finalPrompt = (userPrompt || '').trim();

    // If no prompt was provided but we have product/avatar refs, synthesize a
    // minimal neutral prompt so the provider has something to work with.
    if (!finalPrompt) {
      if (productId || avatarId) {
        const parts: string[] = [];
        if (avatarId) parts.push('a person');
        if (productId) parts.push(`${avatarId ? 'holding and showcasing' : 'showcasing'} the product`);
        finalPrompt = `${format || 'UGC'} style video of ${parts.join(' ')}, natural lighting, cinematic.`;
      } else {
        return new Response(JSON.stringify({ error: 'prompt required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 1) Resolve refs + thumb up front so the row has something to show.
    const { refs, thumb } = await gatherReferenceUrls(admin, { productId, avatarId });

    // 2) Persist row immediately at stage=videoing — no scripting step anymore.
    const { data: row, error: insErr } = await admin
      .from('ms_generations')
      .insert({
        user_id: null,
        project_id: projectId ?? null,
        product_id: productId ?? null,
        avatar_id: avatarId ?? null,
        format,
        surface,
        aspect: ratio,
        duration_seconds,
        resolution,
        prompt: finalPrompt,
        script_text: finalPrompt,
        reference_paths: refs,
        thumb_url: thumb,
        status: 'queued',
        stage: 'videoing',
      })
      .select()
      .single();
    if (insErr) throw insErr;

    const generationId = row.id;

    // Respond immediately. Video submission runs in background so the UI
    // gets a real id to poll without waiting on the provider handshake.
    const runPipeline = async () => {
      try {
        const vidRes = await invokeFn('marketing-generate-video', {
          reuseGenerationId: generationId,
          prompt: finalPrompt,
          image_urls: refs,
          aspect: ratio,
          duration_seconds,
          resolution,
          productId,
          avatarId,
          format,
          surface,
          projectId,
          script_text: finalPrompt,
        });
        if (!vidRes.ok) {
          throw new Error(`video submit failed: ${vidRes.text.slice(0, 300)}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin
          .from('ms_generations')
          .update({ status: 'failed', stage: 'failed', error: msg.slice(0, 500) })
          .eq('id', generationId);
      }
    };

    // @ts-ignore - EdgeRuntime is available in Supabase Deno runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runPipeline());
    } else {
      runPipeline();
    }

    return new Response(
      JSON.stringify({ id: generationId, stage: 'videoing', status: 'queued' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useEffect, useRef, useState } from 'react';
import {
  Link as LinkIcon,
  MoreHorizontal,
  Package,
  Smartphone,
  Loader2,
  ArrowLeft,
  UploadCloud,
  Plus,
  X,
  Trash2,
} from 'lucide-react';
import { useProducts } from '@/hooks/useMarketingLibrary';
import { toast } from '@/hooks/use-toast';

type View = 'list' | 'create';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,XXXX" — strip the prefix.
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1522335789203-aaa3e9ee79f9?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=400&q=80',
];

export function AddProductModal({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect?: (item: { id: string; name: string; thumb: string }, kind: 'product' | 'app') => void;
}) {
  const [view, setView] = useState<View>('list');
  const [tab, setTab] = useState<'product' | 'app'>('product');
  const { products, loading, uploadProductImages, createFromUrl, deleteProduct, refresh } = useProducts();

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [heroUrl, setHeroUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const analyzedRef = useRef(false);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  useEffect(() => {
    if (open) refresh();
    if (!open) {
      setView('list');
      setFiles([]);
      setName('');
      setDescription('');
      setUrl('');
      setHeroUrl('');
      analyzedRef.current = false;
    }
  }, [open, refresh]);

  // Auto-analyze the first uploaded image to fill in name + description.
  const analyzeFirstImage = async (file: File) => {
    if (analyzedRef.current) return;
    analyzedRef.current = true;
    setAnalyzing(true);
    try {
      const b64 = await fileToBase64(file);
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('marketing-analyze-product', {
        body: { image_base64: b64, mime_type: file.type || 'image/jpeg' },
      });
      if (error) throw error;
      if (data?.name && !name.trim()) setName(data.name);
      if (data?.description && !description.trim()) setDescription(data.description);
    } catch (e: any) {
      // Silent fail — user can still type manually.
      console.warn('analyze-product failed', e?.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list).slice(0, 6 - files.length);
    if (!arr.length) return;
    const wasEmpty = files.length === 0;
    setFiles((prev) => [...prev, ...arr].slice(0, 6));
    if (wasEmpty) {
      // Kick off auto-analyze on the very first image.
      analyzeFirstImage(arr[0]);
    }
  };

  const handleHeroImport = async () => {
    if (!heroUrl.trim() || busy) return;
    setBusy(true);
    try {
      await createFromUrl(heroUrl.trim());
      toast({ title: 'Importing product', description: 'We\'re scraping the page — it will appear shortly.' });
      setHeroUrl('');
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (tab === 'product') {
      if (files.length === 0 || !name.trim()) return;
      setBusy(true);
      try {
        await uploadProductImages(files, name.trim(), description.trim() || undefined);
        toast({ title: 'Product added' });
        setView('list');
        setFiles([]);
        setName('');
        setDescription('');
      } catch (e: any) {
        toast({ title: 'Upload failed', description: e?.message ?? '', variant: 'destructive' });
      } finally {
        setBusy(false);
      }
    } else {
      if (!url.trim()) return;
      setBusy(true);
      try {
        await createFromUrl(url.trim());
        toast({ title: 'App imported' });
        setView('list');
        setUrl('');
      } catch (e: any) {
        toast({ title: 'Import failed', description: e?.message ?? '', variant: 'destructive' });
      } finally {
        setBusy(false);
      }
    }
  };

  const canCreate =
    !busy &&
    ((tab === 'product' && files.length > 0 && name.trim().length > 0) ||
      (tab === 'app' && url.trim().length > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl ms-glass border-0 p-0 overflow-hidden text-foreground">
        {view === 'list' ? (
          <div className="flex flex-col max-h-[85vh]">
            {/* Tab switch pill — top center */}
            <div className="flex justify-center pt-5">
              <div className="inline-flex p-1 rounded-full ms-chip-glass">
                {(['product', 'app'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 px-5 h-9 rounded-full text-xs font-medium transition-colors ${
                      tab === t ? 'bg-white/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'product' ? <Package className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                    {t === 'product' ? 'Product' : 'App'}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero header */}
            <div className="px-8 md:px-10 pt-6 pb-8 grid md:grid-cols-2 gap-6 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase text-foreground">
                  {tab === 'product' ? 'Add your product' : 'Add your app'}
                </h2>
                <p className="text-sm text-muted-foreground mt-3 max-w-md">
                  {tab === 'product'
                    ? 'Add a link or upload images to use your product across generations.'
                    : 'Turn your app link into a creative brief that captures interface, voice, flows, and product story.'}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[260px]">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={heroUrl}
                      onChange={(e) => setHeroUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleHeroImport();
                      }}
                      placeholder={tab === 'product' ? 'www.yourproduct.com' : 'www.yourapp.com'}
                      className="w-full h-11 pl-9 pr-24 rounded-full ms-chip-glass text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/25"
                    />
                    {heroUrl.trim().length > 0 && (
                      <button
                        onClick={handleHeroImport}
                        disabled={busy}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-9 px-3 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Import
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">or</span>
                  <button
                    onClick={() => setView('create')}
                    className="px-5 h-11 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90"
                  >
                    Create manually
                  </button>
                </div>
              </div>

              <div className="hidden md:flex justify-end">
                <div className="flex items-center -space-x-6">
                  {HERO_IMAGES.map((src, i) => (
                    <div
                      key={i}
                      className="w-32 h-40 rounded-3xl overflow-hidden ring-2 ring-white/10 shadow-2xl bg-white/5"
                      style={{
                        transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -10 : 0}px)`,
                        zIndex: i === 1 ? 10 : 1,
                      }}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Existing products / apps grid */}
            <div className="px-6 md:px-8 pb-6 flex-1 overflow-y-auto ms-scroll">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 min-h-[320px] content-start">
                <button
                  onClick={() => setView('create')}
                  className="aspect-square rounded-2xl ms-glass-2 border border-dashed border-white/10 hover:border-white/25 flex flex-col items-center justify-center gap-2 text-muted-foreground transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg ms-chip-glass grid place-items-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-medium text-foreground">
                    {tab === 'product' ? 'Add product' : 'Add app'}
                  </div>
                </button>

                {/* Skeleton tiles while first-ever load is in flight — prevents
                    the layout shift caused by an inline "Loading…" row. */}
                {loading && products.length === 0 &&
                  Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={`sk-${i}`}
                      className="aspect-square rounded-2xl bg-white/[0.03] animate-pulse"
                    />
                  ))}
                {!loading && products.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground text-sm py-6">
                    No products yet. Paste a link above or click "Create manually".
                  </div>
                )}
                {products.map((p) => {
                  const failed = p.status === 'failed';
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        onClick={() => {
                          if (failed) return;
                          onSelect?.({ id: p.id, name: p.name, thumb: p.primary_thumb || '' }, tab);
                          onOpenChange(false);
                        }}
                        className="w-full text-left"
                        disabled={failed}
                      >
                        <div className="relative aspect-square rounded-2xl overflow-hidden ms-glass-2 group-hover:ring-1 group-hover:ring-white/20 transition-all">
                          {failed ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3 text-center">
                              <div className="text-sm font-semibold text-foreground">Failed to create</div>
                              <div className="text-[11px] text-muted-foreground">
                                {p.error || 'Not enough product data could be found.'}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteProduct(p.id);
                                }}
                                className="mt-1 px-3 h-8 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </button>
                            </div>
                          ) : p.primary_thumb ? (
                            <img
                              src={p.primary_thumb}
                              alt={p.name}
                              loading="eager"
                              decoding="async"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-[10px] text-muted-foreground">
                              No image
                            </div>
                          )}
                          {!failed && (
                            <div className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-foreground truncate">
                          {failed ? p.source_url?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || p.name : p.name}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 md:p-6">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setView('list')}
                className="w-9 h-9 grid place-items-center rounded-full ms-chip-glass text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="text-base font-semibold text-foreground">
                {tab === 'product' ? 'New product' : 'New app'}
              </div>
              <div className="w-9" />
            </div>

            <div className="flex justify-center mb-5">
              <div className="inline-flex p-1 rounded-full ms-chip-glass">
                {(['product', 'app'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 px-4 h-8 rounded-full text-xs font-medium transition-colors ${
                      tab === t ? 'bg-white/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'product' ? <Package className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                    {t === 'product' ? 'Product' : 'App'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5 min-h-[440px]">
              <div className="relative">
                {tab === 'product' ? (
                  busy ? (
                    <div className="aspect-square w-full rounded-2xl ms-glass-2 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-foreground" />
                      <div className="text-sm font-semibold text-foreground">Uploading</div>
                      <div className="text-xs text-muted-foreground">This may take a few seconds</div>
                    </div>
                  ) : previews.length > 0 ? (
                    <div className="rounded-2xl ms-glass-2 p-3 relative">
                      <div className="grid grid-cols-3 gap-2">
                        {previews.map((src, i) => (
                          <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                              className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-black/60 text-white"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            {i === 0 && (
                              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[9px] rounded bg-black/60 text-white">
                                Primary
                              </div>
                            )}
                          </div>
                        ))}
                        {files.length < 6 && (
                          <button
                            onClick={() => fileRef.current?.click()}
                            className="aspect-square rounded-lg border border-dashed border-white/10 hover:border-white/25 flex items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground text-center">
                        {files.length} / 6 images · first image is the cover
                      </div>
                      {analyzing && (
                        <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/70 backdrop-blur px-3 py-2 flex items-center justify-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          <span className="text-xs font-medium text-white">Checking content…</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="group aspect-square w-full rounded-2xl ms-glass-2 border border-dashed border-white/10 hover:border-white/25 flex flex-col items-center justify-center gap-3 transition-colors"
                    >
                      <div className="w-14 h-14 rounded-full ms-chip-glass grid place-items-center text-muted-foreground group-hover:text-foreground">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-semibold text-foreground">Upload from device</div>
                      <div className="text-xs text-muted-foreground">Up to 6 product images</div>
                    </button>
                  )
                ) : (
                  <div className="aspect-square w-full rounded-2xl ms-glass-2 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <div className="w-14 h-14 rounded-full ms-chip-glass grid place-items-center text-muted-foreground">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-foreground">Paste your app URL</div>
                    <div className="text-xs text-muted-foreground">
                      We'll fetch interface, voice, flows, and product story.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                {tab === 'product' ? (
                  <>
                    <label className="text-sm text-muted-foreground mb-2">Product name</label>
                    <div className="relative">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={analyzing ? 'Detecting…' : 'Enter product name'}
                        maxLength={64}
                        className="w-full h-12 pl-3 pr-10 rounded-xl ms-chip-glass text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/25"
                      />
                      {analyzing && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>

                    <label className="text-sm text-muted-foreground mb-2 mt-4">Description</label>
                    <div className="relative">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={analyzing ? 'Detecting…' : 'Describe your product'}
                        rows={5}
                        maxLength={400}
                        className="w-full p-3 rounded-xl ms-chip-glass text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/25 resize-none leading-relaxed"
                      />
                      {analyzing && (
                        <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-sm text-muted-foreground mb-2">App URL</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="www.yourapp.com"
                        className="w-full h-12 pl-9 pr-3 rounded-xl ms-chip-glass text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/25"
                      />
                    </div>
                  </>
                )}

                <div className="flex-1" />

                <button
                  disabled={!canCreate}
                  onClick={handleCreate}
                  className="mt-6 h-12 w-full rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> {tab === 'product' ? 'Uploading…' : 'Importing…'}
                    </>
                  ) : tab === 'product' ? (
                    'Create Product'
                  ) : (
                    'Import App'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

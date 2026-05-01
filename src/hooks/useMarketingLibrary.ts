import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DBAvatar {
  id: string;
  name: string;
  gender: string | null;
  storage_path: string | null;
  public_url: string | null;
  is_builtin: boolean;
  user_id: string | null;
  created_at: string;
  thumb: string; // resolved url
}

export interface DBProduct {
  id: string;
  name: string;
  source_url: string | null;
  brand_color: string | null;
  description: string | null;
  status: string;
  error: string | null;
  created_at: string;
  primary_thumb: string | null;
  images: { id: string; storage_path: string; signed_url: string; is_primary: boolean }[];
}

async function signed(path: string, bucket: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

// Module-level cache so reopening the avatar picker shows results instantly.
let _avatarsCache: DBAvatar[] | null = null;

export function useAvatars() {
  const [avatars, setAvatars] = useState<DBAvatar[]>(() => _avatarsCache ?? []);
  const [loading, setLoading] = useState(_avatarsCache === null);

  const refresh = useCallback(async () => {
    if (_avatarsCache === null) setLoading(true);
    const { data, error } = await supabase
      .from('ms_avatars')
      .select('*')
      // user-created avatars first, newest at the top, then builtins
      .order('is_builtin', { ascending: true })
      .order('created_at', { ascending: false });
    if (error || !data) {
      setAvatars([]);
      setLoading(false);
      return;
    }
    const resolved: DBAvatar[] = await Promise.all(
      data.map(async (a: any) => {
        let thumb = a.public_url || '';
        if (!thumb && a.storage_path) thumb = await signed(a.storage_path, 'ms-avatars');
        return { ...a, thumb };
      }),
    );
    _avatarsCache = resolved;
    setAvatars(resolved);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadAvatar = useCallback(
    async (file: File, name: string, gender: 'male' | 'female' | 'other' = 'female') => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id ?? null;
      const folder = uid ?? 'anon';
      const ext = file.name.split('.').pop() || 'png';
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('ms-avatars').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: created, error: insErr } = await supabase
        .from('ms_avatars')
        .insert({ name, gender, storage_path: path, user_id: uid, is_builtin: false })
        .select('*')
        .single();
      if (insErr) throw insErr;

      const resolvedCreated: DBAvatar = {
        ...created,
        thumb: created.public_url || (created.storage_path ? await signed(created.storage_path, 'ms-avatars') : ''),
      } as DBAvatar;

      setAvatars((current) => [resolvedCreated, ...current.filter((avatar) => avatar.id !== resolvedCreated.id)]);
      await refresh();
      return resolvedCreated;
    },
    [refresh],
  );

  return { avatars, loading, refresh, uploadAvatar };
}

// Module-level cache so reopening the product picker shows results
// instantly instead of flashing "Loading…" while we re-query.
let _productsCache: DBProduct[] | null = null;

export function useProducts() {
  const [products, setProducts] = useState<DBProduct[]>(() => _productsCache ?? []);
  const [loading, setLoading] = useState(_productsCache === null);

  const refresh = useCallback(async () => {
    if (_productsCache === null) setLoading(true);
    const { data: prods } = await supabase
      .from('ms_products')
      .select('*')
      .order('created_at', { ascending: false });
    const productList = prods ?? [];

    // Fetch ALL images in one query, group client-side — avoids N round trips.
    const productIds = productList.map((p: any) => p.id);
    const imagesByProduct: Record<string, any[]> = {};
    if (productIds.length > 0) {
      const { data: allImgs } = await supabase
        .from('ms_product_images')
        .select('*')
        .in('product_id', productIds);
      for (const img of allImgs ?? []) {
        (imagesByProduct[img.product_id] ||= []).push(img);
      }
    }

    // Sign every URL in parallel rather than serially per product.
    const signedByImageId: Record<string, string> = {};
    const signTasks: Promise<void>[] = [];
    for (const imgs of Object.values(imagesByProduct)) {
      for (const img of imgs) {
        signTasks.push(
          signed(img.storage_path, 'ms-products').then((url) => {
            signedByImageId[img.id] = url;
          }),
        );
      }
    }
    await Promise.all(signTasks);

    const list: DBProduct[] = productList.map((p: any) => {
      const imgs = imagesByProduct[p.id] ?? [];
      const resolved = imgs.map((i: any) => ({
        id: i.id,
        storage_path: i.storage_path,
        is_primary: i.is_primary,
        signed_url: signedByImageId[i.id] ?? '',
      }));
      const primary = resolved.find((r) => r.is_primary) || resolved[0];
      return { ...p, images: resolved, primary_thumb: primary?.signed_url ?? null };
    });
    _productsCache = list;
    setProducts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadProductImages = useCallback(
    async (files: File[], name: string, description?: string) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id ?? null;
      const folder = uid ?? 'anon';
      const { data: prod, error: pErr } = await supabase
        .from('ms_products')
        .insert({ user_id: uid, name, description: description ?? null, status: 'ready' })
        .select()
        .single();
      if (pErr || !prod) throw pErr || new Error('Failed to create product');
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split('.').pop() || 'png';
        const path = `${folder}/${prod.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('ms-products').upload(path, f);
        if (upErr) throw upErr;
        await supabase
          .from('ms_product_images')
          .insert({ product_id: prod.id, user_id: uid, storage_path: path, is_primary: i === 0 });
      }
      await refresh();
      return prod.id as string;
    },
    [refresh],
  );

  const createFromUrl = useCallback(
    async (url: string) => {
      const { data, error } = await supabase.functions.invoke('marketing-url-to-brief', {
        body: { url },
      });
      if (error) throw error;
      await refresh();
      return data?.product_id as string | undefined;
    },
    [refresh],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      // best-effort: remove image rows + product row (storage objects left to lifecycle)
      await supabase.from('ms_product_images').delete().eq('product_id', id);
      await supabase.from('ms_products').delete().eq('id', id);
      setProducts((prev) => {
        const next = prev.filter((p) => p.id !== id);
        _productsCache = next;
        return next;
      });
    },
    [],
  );

  return { products, loading, refresh, uploadProductImages, createFromUrl, deleteProduct };
}

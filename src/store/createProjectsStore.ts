import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type CreateProject = {
  id: string;
  name: string;
  slug: string;
  thumbUrl?: string | null;
  thumbLocked?: boolean;
  createdAt: number;
};

type State = {
  projects: CreateProject[];
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  loaded: boolean;
  toggleSidebar: () => void;
  setActiveProject: (id: string | null) => void;
  loadProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<CreateProject>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setProjectThumbnail: (id: string, url: string, locked?: boolean) => Promise<void>;
  bumpProjectThumbIfUnlocked: (id: string, url: string) => Promise<void>;
  reorderProjects: (orderedIds: string[]) => Promise<void>;
};

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'project'
  ) + '-' + Math.random().toString(36).slice(2, 6);
}

export const useCreateProjectsStore = create<State>((set, get) => ({
  projects: [],
  activeProjectId: localStorage.getItem('create-active-project') || null,
  sidebarCollapsed: localStorage.getItem('create-sb-collapsed') === '1',
  loaded: false,

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    localStorage.setItem('create-sb-collapsed', next ? '1' : '0');
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
    if (id) localStorage.setItem('create-active-project', id);
    else localStorage.removeItem('create-active-project');
  },

  loadProjects: async () => {
    if (get().loaded) return;
    const { data, error } = await supabase
      .from('create_projects' as any)
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(200) as any;
    if (error) {
      console.error('Load create_projects error:', error);
      set({ loaded: true });
      return;
    }
    const projects: CreateProject[] = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      thumbUrl: r.thumb_url,
      thumbLocked: !!r.thumb_locked,
      createdAt: new Date(r.created_at).getTime(),
    }));
    const currentActive = get().activeProjectId;
    const stillExists = currentActive && projects.some((p) => p.id === currentActive);
    let activeProjectId = currentActive;
    if (!stillExists) {
      activeProjectId = projects[0]?.id ?? null;
      if (activeProjectId) localStorage.setItem('create-active-project', activeProjectId);
      else localStorage.removeItem('create-active-project');
    }
    set({ projects, activeProjectId, loaded: true });
  },

  createProject: async (name = 'New project') => {
    const slug = slugify(name);
    const { data, error } = await supabase
      .from('create_projects' as any)
      .insert({ name, slug } as any)
      .select()
      .single() as any;
    if (error || !data) throw error;
    const proj: CreateProject = {
      id: data.id,
      name: data.name,
      slug: data.slug,
      thumbUrl: data.thumb_url,
      thumbLocked: !!data.thumb_locked,
      createdAt: new Date(data.created_at).getTime(),
    };
    set({ projects: [proj, ...get().projects], activeProjectId: proj.id });
    localStorage.setItem('create-active-project', proj.id);
    return proj;
  },

  renameProject: async (id, name) => {
    set({
      projects: get().projects.map((p) => (p.id === id ? { ...p, name } : p)),
    });
    await supabase.from('create_projects' as any).update({ name } as any).eq('id', id);
  },

  deleteProject: async (id) => {
    const wasActive = get().activeProjectId === id;
    const remaining = get().projects.filter((p) => p.id !== id);
    set({
      projects: remaining,
      activeProjectId: wasActive ? remaining[0]?.id ?? null : get().activeProjectId,
    });
    if (wasActive) {
      const next = remaining[0]?.id ?? null;
      if (next) localStorage.setItem('create-active-project', next);
      else localStorage.removeItem('create-active-project');
    }
    // FK cascades delete of generations rows
    await supabase.from('create_projects' as any).delete().eq('id', id);
  },

  setProjectThumbnail: async (id, url, locked = true) => {
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, thumbUrl: url, thumbLocked: locked } : p
      ),
    });
    await supabase
      .from('create_projects' as any)
      .update({ thumb_url: url, thumb_locked: locked } as any)
      .eq('id', id);
  },

  bumpProjectThumbIfUnlocked: async (id, url) => {
    const proj = get().projects.find((p) => p.id === id);
    if (!proj || proj.thumbLocked) return;
    set({
      projects: get().projects.map((p) => (p.id === id ? { ...p, thumbUrl: url } : p)),
    });
    await supabase
      .from('create_projects' as any)
      .update({ thumb_url: url, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
  },

  reorderProjects: async (orderedIds) => {
    const projects = get().projects;
    const map = new Map(projects.map((p) => [p.id, p]));
    const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as CreateProject[];
    // append any not in orderedIds
    projects.forEach((p) => { if (!orderedIds.includes(p.id)) reordered.push(p); });
    set({ projects: reordered });
    // persist sort_order: spaced increments
    await Promise.all(
      reordered.map((p, idx) =>
        supabase.from('create_projects' as any).update({ sort_order: idx } as any).eq('id', p.id)
      )
    );
  },
}));

import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, Wand2, PanelLeft, MoreHorizontal, Trash2 } from 'lucide-react';
import { useMarketingStudioStore } from '@/store/marketingStudioStore';
import { usePromptModeStore } from '@/store/promptModeStore';
import { Logo } from './Logo';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { sidebarCollapsed, toggleSidebar, projects, deleteProject } =
    useMarketingStudioStore();
  const navigate = useNavigate();
  const params = useParams();
  const activeSlug = params.slug;
  const [query, setQuery] = useState('');

  const collapsed = sidebarCollapsed;
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  const setMode = usePromptModeStore((s) => s.setMode);
  const handleNew = () => {
    setMode('marketing');
    navigate('/image');
    onClose?.();
  };

  return (
    <aside
      className={`group/aside flex flex-col h-full ms-grid-bg transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-6 pb-2 shrink-0 relative">
        <div className={collapsed ? 'transition-opacity duration-150 group-hover/aside:opacity-0 pointer-events-none' : ''}>
          <Logo collapsed={collapsed} />
        </div>
        <button
          onClick={toggleSidebar}
          className={`hidden md:grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-ms-surface-2 transition-opacity ${
            collapsed
              ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/aside:opacity-100'
              : ''
          }`}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>

      {/* New project */}
      <div className="px-3">
        <button
          onClick={handleNew}
          className={`w-full flex items-center gap-3 ${
            collapsed ? 'justify-center px-0' : 'px-3'
          } h-10 rounded-lg bg-ms-surface-2 hover:bg-ms-border text-foreground text-sm font-medium transition-colors`}
        >
          <span className="grid place-items-center w-7 h-7 rounded-full bg-ms-border">
            <Plus className="w-4 h-4" />
          </span>
          {!collapsed && <span>New project</span>}
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full pl-9 pr-3 h-9 bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Tools */}
      <div className="mt-4 px-3">
        {!collapsed && (
          <div className="px-3 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Tools
          </div>
        )}
        <button
          className={`w-full flex items-center gap-3 ${
            collapsed ? 'justify-center px-0' : 'px-3'
          } h-9 rounded-lg hover:bg-ms-surface-2 text-sm text-foreground transition-colors`}
        >
          <span className="grid place-items-center w-7 h-7 rounded-md bg-gradient-to-br from-ms-cta to-ms-cta-2">
            <Wand2 className="w-3.5 h-3.5 text-white" />
          </span>
          {!collapsed && <span>Url to Ad</span>}
        </button>
      </div>

      {/* Projects */}
      <div className="mt-4 px-3 flex-1 overflow-y-auto ms-scroll">
        {!collapsed && (
          <div className="px-3 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Projects
          </div>
        )}
        <div className="space-y-0.5">
          {filtered.map((p) => {
            const active = p.slug === activeSlug;
            return (
              <div
                key={p.id}
                className={`group flex items-center gap-2 ${
                  collapsed ? 'justify-center px-0' : 'px-2'
                } h-9 rounded-lg cursor-pointer transition-colors ${
                  active ? 'bg-ms-surface-2 ring-1 ring-ms-border' : 'hover:bg-ms-surface-2'
                }`}
                onClick={() => {
                  navigate(`/marketingstudio/${p.slug}`);
                  onClose?.();
                }}
              >
                <div className="w-6 h-6 rounded-md bg-ms-border overflow-hidden shrink-0 grid place-items-center">
                  {p.thumbUrl ? (
                    <img src={p.thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-3 h-3 text-muted-foreground" fill="currentColor">
                      <path d="M4 18 L12 4 L20 18 L4 18 Z" />
                    </svg>
                  )}
                </div>
                {!collapsed && (
                  <>
                    <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1 rounded"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-ms-surface-2 border-ms-border">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const idToDelete = p.id;
                            deleteProject(idToDelete);
                            if (active) navigate('/marketingstudio');
                            // Remove from DB too (cascades to generations)
                            const { supabase } = await import('@/integrations/supabase/client');
                            await supabase.from('ms_projects').delete().eq('id', idToDelete);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            );
          })}
          {!collapsed && filtered.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              No projects yet
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

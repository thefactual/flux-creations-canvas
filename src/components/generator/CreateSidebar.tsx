import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, PanelLeft, MoreHorizontal, Trash2, Sparkles, Pencil } from 'lucide-react';
import { Logo } from '@/components/marketingstudio/Logo';
import { useCreateProjectsStore } from '@/store/createProjectsStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function CreateSidebar({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const {
    sidebarCollapsed,
    toggleSidebar,
    projects,
    activeProjectId,
    setActiveProject,
    loadProjects,
    createProject,
    deleteProject,
    renameProject,
    loaded,
  } = useCreateProjectsStore();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const collapsed = sidebarCollapsed;

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };
  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameProject(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleNew = async () => {
    try {
      const project = await createProject('New project');
      navigate(`/create/${project.slug}`);
      onClose?.();
    } catch (e) {
      console.error(e);
    }
  };

  const openProject = (id: string, slug: string) => {
    if (id !== activeProjectId) setActiveProject(id);
    navigate(`/create/${slug}`);
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
        <div
          className={
            collapsed
              ? 'transition-opacity duration-150 group-hover/aside:opacity-0 pointer-events-none'
              : ''
          }
        >
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
      <div className="px-3 mt-2">
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
      {!collapsed && projects.length > 0 && (
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

      {/* Projects */}
      <div className="mt-4 px-3 flex-1 overflow-y-auto ms-scroll">
        {!collapsed && projects.length > 0 && (
          <div className="px-3 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Projects
          </div>
        )}

        {/* Empty state */}
        {!collapsed && loaded && projects.length === 0 && (
          <div className="px-3 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-ms-surface-2 grid place-items-center">
              <Sparkles className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium text-foreground">
              No projects yet
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Click <span className="text-foreground font-medium">New project</span> to start
              creating. Your generations will live here.
            </p>
          </div>
        )}

        <div className="space-y-0.5">
          {filtered.map((p) => {
            const active = p.id === activeProjectId;
            return (
              <div
                key={p.id}
                onClick={(e) => {
                  e.preventDefault();
                  openProject(p.id, p.slug);
                }}
                className={`group flex items-center gap-2 ${
                  collapsed ? 'justify-center px-0' : 'px-2'
                } h-9 rounded-lg cursor-pointer transition-colors ${
                  active
                    ? 'bg-ms-surface-2 ring-1 ring-ms-border'
                    : 'hover:bg-ms-surface-2'
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-ms-border overflow-hidden shrink-0 grid place-items-center">
                  {p.thumbUrl ? (
                    <img src={p.thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
                {!collapsed && (
                  <>
                    {renamingId === p.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="text-sm bg-transparent border border-ms-border rounded px-1.5 py-0.5 flex-1 min-w-0 text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      />
                    ) : (
                      <span
                        className="text-sm text-foreground truncate flex-1"
                        onDoubleClick={(e) => { e.stopPropagation(); startRename(p.id, p.name); }}
                      >
                        {p.name}
                      </span>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1 rounded"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-ms-surface-2 border-ms-border"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(p.id, p.name);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(p.id);
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
        </div>
      </div>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all generations inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (confirmDeleteId) await deleteProject(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

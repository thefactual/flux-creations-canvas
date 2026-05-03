import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PromptBar } from '@/components/generator/PromptBar';
import { VideoPromptBarInline } from '@/components/generator/VideoPromptBarInline';
import { PromptBar as MarketingPromptBar } from '@/components/marketingstudio/PromptBar';
import { PromptNavBar } from '@/components/PromptNavBar';
import { CreateSidebar } from '@/components/generator/CreateSidebar';
import { ImageGrid } from '@/components/generator/ImageGrid';
import { ImageDetailModal } from '@/components/generator/ImageDetailModal';
import { VideoDetailModal } from '@/components/video/VideoDetailModal';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useGeneratorStore } from '@/store/generatorStore';
import { useVideoStore } from '@/store/videoStore';
import { usePromptModeStore } from '@/store/promptModeStore';
import { useCreateProjectsStore } from '@/store/createProjectsStore';
import { useMarketingFeedStore } from '@/store/marketingFeedStore';

export default function Generator() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const selectedImageId = useGeneratorStore((s) => s.selectedImageId);
  const loadHistory = useGeneratorStore((s) => s.loadHistory);
  const loadVideoHistory = useVideoStore((s) => s.loadHistory);
  const mode = usePromptModeStore((s) => s.mode);
  const sidebarCollapsed = useCreateProjectsStore((s) => s.sidebarCollapsed);
  const projects = useCreateProjectsStore((s) => s.projects);
  const projectsLoaded = useCreateProjectsStore((s) => s.loaded);
  const activeProjectId = useCreateProjectsStore((s) => s.activeProjectId);
  const setActiveProject = useCreateProjectsStore((s) => s.setActiveProject);
  const loadProjects = useCreateProjectsStore((s) => s.loadProjects);
  const createProject = useCreateProjectsStore((s) => s.createProject);
  const startMarketingPolling = useMarketingFeedStore((s) => s.startPolling);
  const stopMarketingPolling = useMarketingFeedStore((s) => s.stopPolling);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load (or refresh) history for the active project whenever it changes.
  useEffect(() => {
    if (!activeProjectId) return;
    loadHistory(activeProjectId);
    loadVideoHistory(activeProjectId);
  }, [activeProjectId, loadHistory, loadVideoHistory]);

  // URL slug is the source of truth when present; this prevents active-project
  // state and route state from bouncing each other during project switches.
  useEffect(() => {
    if (!projectsLoaded) return;

    if (slug) {
      const match = projects.find((p) => p.slug === slug);
      if (match && match.id !== activeProjectId) {
        setActiveProject(match.id);
      } else if (!match) {
        // Slug not found — fall back to the create root.
        navigate('/create', { replace: true });
      }
    } else if (activeProjectId) {
      // We're on /create but have an active project — push slug into URL.
      const active = projects.find((p) => p.id === activeProjectId);
      if (active) navigate(`/create/${active.slug}`, { replace: true });
    } else if (projects.length > 0) {
      const first = projects[0];
      setActiveProject(first.id);
      navigate(`/create/${first.slug}`, { replace: true });
    }
  }, [slug, projects, projectsLoaded, activeProjectId, setActiveProject, navigate]);

  // Poll marketing-studio generations for the active create_project.
  useEffect(() => {
    if (activeProjectId) startMarketingPolling(activeProjectId);
    return () => stopMarketingPolling();
  }, [activeProjectId, startMarketingPolling, stopMarketingPolling]);

  // Ensure a create_project exists when user starts working.
  const ensureActiveProject = async (): Promise<string> => {
    if (activeProjectId) return activeProjectId;
    const p = await createProject('New project');
    return p.id;
  };

  const renderBar = () => {
    if (mode === 'marketing') {
      return (
        <MarketingPromptBar
          createProjectId={activeProjectId ?? undefined}
          ensureCreateProject={ensureActiveProject}
        />
      );
    }
    if (mode === 'video') return <VideoPromptBarInline />;
    return <PromptBar />;
  };

  const sidebarWidth = sidebarCollapsed ? 64 : 256; // w-16 / w-64

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full ms-grid-bg text-foreground flex -mt-20 pt-20 transition-[padding] duration-200 ease-out" style={{ paddingLeft: `${sidebarWidth}px` }}>
      {/* Desktop sidebar - full height, above header */}
      <div className="hidden md:flex fixed left-0 top-0 h-screen z-[60]">
        <CreateSidebar />
      </div>
      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-ms-surface border-ms-border">
          <CreateSidebar onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 pb-44">
          <ImageGrid />
        </div>

        <div
          className="fixed bottom-4 right-0 px-3 md:px-6 z-30 pointer-events-none left-0 md:[left:var(--sb-w)] transition-[left] duration-200 ease-out"
          style={{ ['--sb-w' as any]: `${sidebarWidth}px` }}
        >
          <div className="pointer-events-auto">
            <PromptNavBar />
            <motion.div
              layout
              transition={{ layout: { duration: 0.5, ease: [0.32, 0.72, 0, 1] } }}
            >
              <motion.div
                key={mode}
                initial={{ opacity: 0, filter: 'blur(8px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              >
                {renderBar()}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      {selectedImageId && <ImageDetailModal />}
    </div>
  );
}

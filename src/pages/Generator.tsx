import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PromptBar } from '@/components/generator/PromptBar';
import { VideoPromptBarInline } from '@/components/generator/VideoPromptBarInline';
import { PromptBar as MarketingPromptBar } from '@/components/marketingstudio/PromptBar';
import { PromptNavBar } from '@/components/PromptNavBar';
import { CreateSidebar } from '@/components/generator/CreateSidebar';
import { ImageGrid } from '@/components/generator/ImageGrid';
import { ImageDetailModal } from '@/components/generator/ImageDetailModal';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useGeneratorStore } from '@/store/generatorStore';
import { useVideoStore } from '@/store/videoStore';
import { usePromptModeStore } from '@/store/promptModeStore';
import { useMarketingStudioStore } from '@/store/marketingStudioStore';
import { hydrateMarketingStudio } from '@/lib/marketingStudioSync';

export default function Generator() {
  const selectedImageId = useGeneratorStore((s) => s.selectedImageId);
  const loadHistory = useGeneratorStore((s) => s.loadHistory);
  const loadVideoHistory = useVideoStore((s) => s.loadHistory);
  const mode = usePromptModeStore((s) => s.mode);
  const sidebarCollapsed = useMarketingStudioStore((s) => s.sidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    loadHistory();
    loadVideoHistory();
    hydrateMarketingStudio();
  }, [loadHistory, loadVideoHistory]);

  const renderBar = () => {
    if (mode === 'marketing') return <MarketingPromptBar />;
    if (mode === 'video') return <VideoPromptBarInline />;
    return <PromptBar />;
  };

  const sidebarWidth = sidebarCollapsed ? 64 : 256; // w-16 / w-64

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full bg-background text-foreground flex -mt-20 pt-20 transition-[padding] duration-200 ease-out" style={{ paddingLeft: `${sidebarWidth}px` }}>
      {/* Desktop sidebar - full height, above header */}
      <div className="hidden md:flex fixed left-0 top-0 h-screen z-[60]">
        <MarketingSidebar />
      </div>
      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-ms-surface border-ms-border">
          <MarketingSidebar onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 px-3 md:px-5 pt-3 pb-44">
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

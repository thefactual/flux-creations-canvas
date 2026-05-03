import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PromptBar } from '@/components/generator/PromptBar';
import { VideoPromptBarInline } from '@/components/generator/VideoPromptBarInline';
import { PromptNavBar } from '@/components/PromptNavBar';
import { ImageGrid } from '@/components/generator/ImageGrid';
import { ImageDetailModal } from '@/components/generator/ImageDetailModal';
import { useGeneratorStore } from '@/store/generatorStore';
import { useVideoStore } from '@/store/videoStore';
import { usePromptModeStore } from '@/store/promptModeStore';

export default function Generator() {
  const selectedImageId = useGeneratorStore((s) => s.selectedImageId);
  const loadHistory = useGeneratorStore((s) => s.loadHistory);
  const loadVideoHistory = useVideoStore((s) => s.loadHistory);
  const mode = usePromptModeStore((s) => s.mode);

  useEffect(() => {
    loadHistory();
    loadVideoHistory();
  }, [loadHistory, loadVideoHistory]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-background text-foreground flex flex-col">
      <div className="flex-1 px-3 md:px-5 pt-3 pb-44">
        <ImageGrid />
      </div>

      <div className="fixed bottom-4 left-0 right-0 px-3 md:px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <PromptNavBar />
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'image' ? (
              <motion.div
                key="image"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <PromptBar />
              </motion.div>
            ) : (
              <motion.div
                key="video"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <VideoPromptBarInline />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {selectedImageId && <ImageDetailModal />}
    </div>
  );
}

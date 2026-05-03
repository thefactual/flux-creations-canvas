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
          <motion.div
            layout
            transition={{ layout: { duration: 0.42, ease: [0.32, 0.72, 0, 1] } }}
            style={{ overflow: 'hidden' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {mode === 'image' ? (
                <motion.div
                  key="image"
                  layout
                  initial={{ opacity: 0, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(6px)' }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                >
                  <PromptBar />
                </motion.div>
              ) : (
                <motion.div
                  key="video"
                  layout
                  initial={{ opacity: 0, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(6px)' }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                >
                  <VideoPromptBarInline />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {selectedImageId && <ImageDetailModal />}
    </div>
  );
}

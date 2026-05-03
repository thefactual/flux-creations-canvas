import { useEffect } from 'react';
import { PromptBar } from '@/components/generator/PromptBar';
import { PromptNavBar } from '@/components/PromptNavBar';
import { ImageGrid } from '@/components/generator/ImageGrid';
import { ImageDetailModal } from '@/components/generator/ImageDetailModal';
import { useGeneratorStore } from '@/store/generatorStore';

export default function Generator() {
  const selectedImageId = useGeneratorStore((s) => s.selectedImageId);
  const loadHistory = useGeneratorStore((s) => s.loadHistory);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-background text-foreground flex flex-col">
      {/* Image grid area — leave room for the floating prompt bar */}
      <div className="flex-1 px-3 md:px-5 pt-3 pb-44">
        <ImageGrid />
      </div>

      {/* Floating prompt bar (Higgsfield / marketing-studio style) */}
      <div className="fixed bottom-4 left-0 right-0 px-3 md:px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <PromptNavBar />
          <PromptBar />
        </div>
      </div>

      {/* Detail modal */}
      {selectedImageId && <ImageDetailModal />}
    </div>
  );
}

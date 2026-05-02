import { useEffect } from 'react';
import { PromptBar } from '@/components/generator/PromptBar';
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
    <div className="h-[calc(100vh-3.5rem)] w-full bg-background flex flex-col overflow-hidden">
      {/* Image grid area */}
      <div className="flex-1 overflow-y-auto">
        <ImageGrid />
      </div>

      {/* Bottom prompt bar */}
      <PromptBar />

      {/* Detail modal */}
      {selectedImageId && <ImageDetailModal />}
    </div>
  );
}

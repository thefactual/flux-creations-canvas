import { useEffect, useState } from 'react';
import { PromptBar } from '@/components/generator/PromptBar';
import { ImageGrid } from '@/components/generator/ImageGrid';
import { ImageDetailModal } from '@/components/generator/ImageDetailModal';
import { useGeneratorStore } from '@/store/generatorStore';
import { Heart, Maximize2 } from 'lucide-react';

export default function Generator() {
  const selectedImageId = useGeneratorStore((s) => s.selectedImageId);
  const loadHistory = useGeneratorStore((s) => s.loadHistory);
  const [tab, setTab] = useState<'all' | 'liked'>('all');

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-background text-foreground flex flex-col">
      {/* Tabs row (mirrors marketing studio rightSlot) */}
      <div className="flex items-center justify-end px-3 md:px-5 pt-2 pb-1">
        <div className="flex items-center gap-1 p-1 rounded-full bg-ms-surface-2 border border-ms-border">
          <button
            onClick={() => setTab('all')}
            className={`px-3 h-7 rounded-full text-xs font-medium transition-colors ${
              tab === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTab('liked')}
            className={`flex items-center gap-1 px-3 h-7 rounded-full text-xs font-medium transition-colors ${
              tab === 'liked' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Heart className="w-3 h-3" /> Liked
          </button>
          <button className="grid place-items-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground">
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Image grid area — leave room for the floating prompt bar */}
      <div className="flex-1 px-3 md:px-5 pb-44">
        <ImageGrid />
      </div>

      {/* Floating prompt bar (Higgsfield / marketing-studio style) */}
      <div className="fixed bottom-4 left-0 right-0 px-3 md:px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <PromptBar />
        </div>
      </div>

      {/* Detail modal */}
      {selectedImageId && <ImageDetailModal />}
    </div>
  );
}

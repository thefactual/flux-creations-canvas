import { useState, useEffect } from 'react';
import { PanelBottomOpen, PanelLeftOpen } from 'lucide-react';
import { VideoPromptBar } from '@/components/video/VideoPromptBar';
import { VideoSidebar } from '@/components/video/VideoSidebar';
import { VideoGrid } from '@/components/video/VideoGrid';
import { VideoDetailModal } from '@/components/video/VideoDetailModal';
import { PromptNavBar } from '@/components/PromptNavBar';
import { useVideoStore } from '@/store/videoStore';

export default function Video() {
  const selectedVideoId = useVideoStore(s => s.selectedVideoId);
  const loadHistory = useVideoStore(s => s.loadHistory);
  const [layout, setLayout] = useState<'sidebar' | 'bottom'>('sidebar');

  useEffect(() => { loadHistory(); }, [loadHistory]);
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full bg-background flex flex-col overflow-hidden">
      {/* Layout toggle floating */}
      <div className="absolute top-2 right-4 z-30">
        <button
          onClick={() => setLayout(layout === 'sidebar' ? 'bottom' : 'sidebar')}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={layout === 'sidebar' ? 'Switch to bottom bar' : 'Switch to sidebar'}
        >
          {layout === 'sidebar' ? <PanelBottomOpen className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
      </div>

      {/* Main content */}
      {layout === 'sidebar' ? (
        <div className="flex-1 flex overflow-hidden">
          <VideoSidebar />
          <div className="flex-1 overflow-y-auto">
            <VideoGrid />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <VideoGrid />
          </div>
          <div className="px-3 md:px-6 pb-3">
            <PromptNavBar />
            <VideoPromptBar />
          </div>
        </>
      )}

      {/* Detail modal */}
      {selectedVideoId && <VideoDetailModal />}
    </div>
  );
}

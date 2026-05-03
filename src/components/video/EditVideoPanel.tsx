import { RefObject } from 'react';
import { Plus, Video, Film } from 'lucide-react';
import { DropZone, readFileAsDataURL } from './DropZone';
import { useVideoStore } from '@/store/videoStore';

interface EditVideoPanelProps {
  prompt: string;
  setPrompt: (v: string) => void;
  referenceImages: string[];
  addReferenceImage: (url: string) => void;
  setReferenceImageAt: (idx: number, url: string) => void;
  removeReferenceImage: (index: number) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  selectedModelName?: string;
}

const MAX_IMAGE_REFS = 4;

export function EditVideoPanel({
  prompt, setPrompt, referenceImages, setReferenceImageAt, removeReferenceImage,
  fileInputRef, selectedModelName,
}: EditVideoPanelProps) {
  const keepAudio = useVideoStore(s => s.keepAudio);
  const setKeepAudio = useVideoStore(s => s.setKeepAudio);

  const sourceVideo = referenceImages[0];
  const imageRefs = referenceImages.slice(1).filter(Boolean);

  const uploadVideo = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/*';
    input.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) { const url = await readFileAsDataURL(f); setReferenceImageAt(0, url); }
    };
    input.click();
  };

  const handleVideoDrop = async (files: File[]) => {
    const f = files.find(file => file.type.startsWith('video/'));
    if (f) { const url = await readFileAsDataURL(f); setReferenceImageAt(0, url); }
  };

  const handleImagesDrop = async (files: File[]) => {
    const slots = MAX_IMAGE_REFS - imageRefs.length;
    for (const f of files.filter(x => x.type.startsWith('image/')).slice(0, slots)) {
      const url = await readFileAsDataURL(f);
      // append into slots 1..MAX_IMAGE_REFS
      const nextIdx = referenceImages.length === 0 ? 1 : referenceImages.length;
      setReferenceImageAt(nextIdx, url);
    }
  };

  return (
    <div className="space-y-3">
      {/* Hero banner */}
      <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-cyan-900/40 to-card h-28 flex flex-col justify-between p-3">
        <div className="flex justify-end">
          <span className="text-[9px] bg-muted/60 backdrop-blur px-2 py-0.5 rounded-md text-muted-foreground flex items-center gap-1">
            <Film className="w-3 h-3" /> Video to Video
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-primary uppercase tracking-wider">VIDEO EDIT</p>
          <p className="text-[10px] text-muted-foreground">{selectedModelName || 'Kling Video Edit'}</p>
        </div>
      </div>

      {/* Required: source video */}
      <DropZone onFiles={handleVideoDrop} accept="video/*">
        {sourceVideo ? (
          <div className="relative rounded-xl overflow-hidden border border-border aspect-video bg-black">
            <video src={sourceVideo} className="w-full h-full object-cover" muted playsInline />
            <button
              onClick={() => removeReferenceImage(0)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
            >×</button>
          </div>
        ) : (
          <button
            onClick={uploadVideo}
            className="w-full border border-border rounded-xl p-5 flex flex-col items-center gap-1.5 text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors bg-card"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Video className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-foreground">Upload a reference video</span>
            <span className="text-[10px] text-muted-foreground/60">Duration required: 3–10 secs</span>
          </button>
        )}
      </DropZone>

      {/* Optional: reference images */}
      <DropZone onFiles={handleImagesDrop} accept="image/*">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors relative bg-card/40"
        >
          <span className="absolute top-2 right-2 text-[9px] text-muted-foreground/50">Optional</span>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium text-foreground">Upload images & elements</span>
          <span className="text-[10px] text-muted-foreground/60">Up to {MAX_IMAGE_REFS} images or elements</span>
        </button>
      </DropZone>

      {/* Uploaded image refs */}
      {imageRefs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {imageRefs.map((img, i) => (
            <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
              <img src={img} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeReferenceImage(i + 1)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[9px] flex items-center justify-center"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Prompt */}
      <div className="space-y-1">
        <span className="text-[11px] text-muted-foreground">Prompt</span>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder='Describe the change. Reference uploads with @Image1, @Image2…'
          rows={3}
          className="w-full bg-card rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none border-0 focus:outline-none leading-relaxed"
          style={{ scrollbarWidth: 'none' }}
        />
      </div>

      {/* Keep audio */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2.5">
        <span className="text-xs text-foreground">Keep original audio</span>
        <button
          onClick={() => setKeepAudio(!keepAudio)}
          className={`w-9 h-5 rounded-full transition-colors relative ${keepAudio ? 'bg-primary' : 'bg-muted'}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${keepAudio ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

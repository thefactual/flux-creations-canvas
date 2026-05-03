import { useState, RefObject } from 'react';
import { Plus, Image as ImageIcon, Video, ChevronDown, ChevronUp } from 'lucide-react';
import { DropZone, readFileAsDataURL } from './DropZone';

interface MotionControlPanelProps {
  referenceImages: string[];
  addReferenceImage: (url: string) => void;
  setReferenceImageAt: (idx: number, url: string) => void;
  removeReferenceImage: (index: number) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  motionPrompt: string;
  setMotionPrompt: (value: string) => void;
  characterOrientation: 'video' | 'image';
  setCharacterOrientation: (value: 'video' | 'image') => void;
}

export function MotionControlPanel({
  referenceImages,
  addReferenceImage,
  setReferenceImageAt,
  removeReferenceImage,
  fileInputRef,
  motionPrompt,
  setMotionPrompt,
  characterOrientation,
  setCharacterOrientation,
}: MotionControlPanelProps) {
  const [sceneControl, setSceneControl] = useState(true);
  const [sceneSource, setSceneSource] = useState<'video' | 'image'>('image');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const uploadFileAt = (targetIdx: number, accept: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = await readFileAsDataURL(file);
        setReferenceImageAt(targetIdx, url);
      }
    };
    input.click();
  };

  const handleMotionDrop = async (files: File[]) => {
    if (files[0]) {
      const url = await readFileAsDataURL(files[0]);
      setReferenceImageAt(0, url);
    }
  };

  const handleCharacterDrop = async (files: File[]) => {
    if (files[0]) {
      const url = await readFileAsDataURL(files[0]);
      setReferenceImageAt(1, url);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-violet-900/40 to-card h-28 flex flex-col justify-between p-3">
        <div className="flex justify-end">
          <span className="text-[9px] bg-muted/60 backdrop-blur px-2 py-0.5 rounded-md text-muted-foreground flex items-center gap-1">
            <Video className="w-3 h-3" /> How it works
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-primary uppercase tracking-wider">MOTION CONTROL</p>
          <p className="text-[10px] text-muted-foreground">Control motion with video references</p>
        </div>
      </div>

      <div className="flex gap-2">
        <DropZone onFiles={handleMotionDrop} accept="image/*,video/*" className="flex-1">
          {referenceImages[0] ? (
            <div className="relative rounded-xl overflow-hidden border border-border aspect-[3/4]">
              {referenceImages[0].startsWith('data:video') || referenceImages[0].includes('.mp4') || referenceImages[0].includes('.webm') || referenceImages[0].includes('.mov') ? (
                <video src={referenceImages[0]} muted playsInline autoPlay loop className="w-full h-full object-cover" />
              ) : (
                <img src={referenceImages[0]} alt="Motion reference" className="w-full h-full object-cover" />
              )}
              <button
                onClick={() => removeReferenceImage(0)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
              >×</button>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Video className="w-2.5 h-2.5" /> Video
              </span>
            </div>
          ) : (
            <button
              onClick={() => uploadFileAt(0, 'image/*,video/*')}
              className="w-full aspect-[3/4] border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-foreground/30 transition-colors px-2"
            >
              <div className="grid place-items-center w-8 h-8 rounded-full bg-muted">
                <Video className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-foreground text-center leading-tight">Add motion to copy</span>
              <span className="text-[9px] text-muted-foreground/70 text-center leading-tight">Video duration:<br/>3–30 seconds</span>
            </button>
          )}
        </DropZone>

        <DropZone onFiles={handleCharacterDrop} accept="image/*" className="flex-1">
          {referenceImages[1] ? (
            <div className="relative rounded-xl overflow-hidden border border-border aspect-[3/4]">
              <img src={referenceImages[1]} alt="Character reference" className="w-full h-full object-cover" />
              <button
                onClick={() => removeReferenceImage(1)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
              >×</button>
            </div>
          ) : (
            <button
              onClick={() => uploadFileAt(1, 'image/*')}
              className="w-full aspect-[3/4] border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-foreground/30 transition-colors px-2"
            >
              <div className="grid place-items-center w-8 h-8 rounded-full bg-muted">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-foreground text-center leading-tight">Add your character</span>
              <span className="text-[9px] text-muted-foreground/70 text-center leading-tight">Image with visible<br/>face and body</span>
            </button>
          )}
        </DropZone>
      </div>

      <div className="bg-card border border-border rounded-xl px-3 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-foreground font-medium">Scene control mode</span>
            <span className="text-[10px] text-muted-foreground">Pick where the background comes from</span>
          </div>
          <button
            onClick={() => setSceneControl(!sceneControl)}
            className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${sceneControl ? 'bg-primary' : 'bg-muted'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${sceneControl ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {sceneControl && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSceneSource('video')}
              className={`relative rounded-xl border overflow-hidden aspect-square flex flex-col items-center justify-center gap-1.5 transition-all ${sceneSource === 'video' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background hover:border-foreground/20'}`}
            >
              {referenceImages[0] && (referenceImages[0].startsWith('data:video') || referenceImages[0].includes('.mp4') || referenceImages[0].includes('.webm') || referenceImages[0].includes('.mov')) ? (
                <video src={referenceImages[0]} muted playsInline autoPlay loop className={`absolute inset-0 w-full h-full object-cover ${sceneSource === 'video' ? 'opacity-50' : 'opacity-30'}`} />
              ) : null}
              <div className={`relative grid place-items-center w-8 h-8 rounded-full ${sceneSource === 'video' ? 'bg-primary/30' : 'bg-muted'}`}>
                <Video className={`w-4 h-4 ${sceneSource === 'video' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <span className={`relative text-[11px] font-semibold tracking-wide ${sceneSource === 'video' ? 'text-foreground' : 'text-muted-foreground'}`}>VIDEO</span>
              <span className="relative text-[9px] text-muted-foreground/80 px-2 text-center leading-tight">From motion clip</span>
            </button>

            <button
              onClick={() => setSceneSource('image')}
              className={`relative rounded-xl border overflow-hidden aspect-square flex flex-col items-center justify-center gap-1.5 transition-all ${sceneSource === 'image' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background hover:border-foreground/20'}`}
            >
              {referenceImages[1] ? (
                <img src={referenceImages[1]} alt="" className={`absolute inset-0 w-full h-full object-cover ${sceneSource === 'image' ? 'opacity-50' : 'opacity-30'}`} />
              ) : null}
              <div className={`relative grid place-items-center w-8 h-8 rounded-full ${sceneSource === 'image' ? 'bg-primary/30' : 'bg-muted'}`}>
                <ImageIcon className={`w-4 h-4 ${sceneSource === 'image' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <span className={`relative text-[11px] font-semibold tracking-wide ${sceneSource === 'image' ? 'text-foreground' : 'text-muted-foreground'}`}>IMAGE</span>
              <span className="relative text-[9px] text-muted-foreground/80 px-2 text-center leading-tight">From character photo</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors"
        >
          <span className="text-xs font-medium text-foreground">Advanced settings</span>
          {advancedOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>

        {advancedOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Prompt</span>
              <textarea
                value={motionPrompt}
                onChange={e => setMotionPrompt(e.target.value)}
                placeholder='Describe background and scene details — e.g., "A corgi runs in" or "Snowy park setting". Motion is controlled by your reference video'
                rows={4}
                className="w-full bg-background rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none border-0 focus:outline-none leading-relaxed break-words overflow-hidden"
                style={{ scrollbarWidth: 'none' }}
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Orientation</span>
              <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setCharacterOrientation('video')}
                  className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md transition-colors ${characterOrientation === 'video' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >
                  <Video className="w-3 h-3" /> Video
                </button>
                <button
                  onClick={() => setCharacterOrientation('image')}
                  className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-md transition-colors ${characterOrientation === 'image' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >
                  <ImageIcon className="w-3 h-3" /> Image
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                When Character Orientation matches the video, complex motions perform better; when it matches the image, camera moves stay more stable.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

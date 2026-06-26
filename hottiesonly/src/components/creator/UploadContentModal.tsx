import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useContent } from "@/store/contentStore";
import { fileToScaledDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onClose: () => void };

type Access = "sub" | "ppv";

export function UploadContentModal({ open, onClose }: Props) {
  const addPost = useContent((s) => s.addPost);
  const fileRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<Access>("sub");
  const [price, setPrice] = useState(7.99);

  const reset = () => {
    setImage(null);
    setAccess("sub");
    setPrice(7.99);
  };

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      setImage(await fileToScaledDataUrl(file, 1000, 0.82));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const publish = () => {
    if (!image) return;
    addPost({
      kind: "photo",
      priceCents: access === "ppv" ? Math.round(price * 100) : 0,
      imageDataUrl: image,
    });
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Upload content"
      description="Add a photo to your feed. Saves to this browser."
    >
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {/* Drop / preview area */}
        <button
          onClick={() => fileRef.current?.click()}
          className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-2xl border border-dashed border-ink-600 bg-ink-850 transition-colors hover:border-brand-500/60"
        >
          {image ? (
            <img src={image} alt="preview" className="h-full w-full object-cover" />
          ) : busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/50" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-white/50">
              <ImagePlus className="h-7 w-7" />
              <span className="text-sm font-medium">Choose a photo</span>
            </span>
          )}
        </button>

        {/* Access */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-white/60">Access</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAccess("sub")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                access === "sub"
                  ? "border-brand-500/70 bg-brand-500/10 text-white"
                  : "border-ink-700 bg-ink-850 text-white/60",
              )}
            >
              Subscribers
            </button>
            <button
              onClick={() => setAccess("ppv")}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                access === "ppv"
                  ? "border-brand-500/70 bg-brand-500/10 text-white"
                  : "border-ink-700 bg-ink-850 text-white/60",
              )}
            >
              Pay-per-view
            </button>
          </div>
        </div>

        {access === "ppv" && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-white/60">Price (USD)</span>
            <input
              type="number"
              min={0.99}
              step={0.5}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm focus:border-brand-500/60 focus:outline-none"
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={publish} disabled={!image || busy}>
            Publish
          </Button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useProfile } from "@/store/profileStore";
import { fileToScaledDataUrl } from "@/lib/image";

type Props = { open: boolean; onClose: () => void };

export function EditProfileModal({ open, onClose }: Props) {
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);
  const fileRef = useRef<HTMLInputElement>(null);

  // Local draft so edits only commit on Save.
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);

  // Re-seed the draft each time the modal opens.
  useEffect(() => {
    if (open) setDraft(profile);
  }, [open, profile]);

  const onPickAvatar = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToScaledDataUrl(file, 600, 0.85);
      setDraft((d) => ({ ...d, avatarDataUrl: dataUrl }));
    } catch {
      /* ignore bad file */
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    update({
      name: draft.name.trim() || profile.name,
      tagline: draft.tagline,
      bio: draft.bio,
      location: draft.location,
      avatarDataUrl: draft.avatarDataUrl,
    });
    onClose();
  };

  const field =
    "w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm focus:border-brand-500/60 focus:outline-none";

  return (
    <Modal open={open} onClose={onClose} title="Edit profile" description="Changes save to this browser.">
      <div className="space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {draft.avatarDataUrl ? (
              <img
                src={draft.avatarDataUrl}
                alt=""
                className="h-20 w-20 rounded-2xl object-cover"
              />
            ) : (
              <div
                className="h-20 w-20 rounded-2xl"
                style={{
                  backgroundImage: `linear-gradient(135deg, hsl(${draft.avatarHue} 85% 60%), hsl(${
                    draft.avatarHue - 40
                  } 80% 40%))`,
                }}
              />
            )}
            {busy && (
              <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickAvatar(e.target.files?.[0])}
            />
            <Button size="sm" variant="dark" onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" /> Upload photo
            </Button>
            {draft.avatarDataUrl && (
              <button
                onClick={() => setDraft((d) => ({ ...d, avatarDataUrl: null }))}
                className="flex items-center gap-1 text-xs text-white/50 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-white/60">Display name</span>
          <input
            className={field}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-white/60">Tagline</span>
          <input
            className={field}
            value={draft.tagline}
            onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-white/60">Bio</span>
          <textarea
            rows={3}
            className={`${field} resize-none`}
            value={draft.bio}
            onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-white/60">Location</span>
          <input
            className={field}
            value={draft.location}
            onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

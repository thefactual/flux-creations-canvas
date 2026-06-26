import { useState } from "react";
import { Lock, Play, Heart, Check, Image as ImageIcon, Plus } from "lucide-react";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";
import { useContent, type Post } from "@/store/contentStore";
import { compact, formatPrice, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { UploadContentModal } from "./UploadContentModal";

// PPV is priced in cents but bought with credits here (1 credit ≈ $0.25 demo rate).
const CENTS_PER_CREDIT = 25;
const toCredits = (cents: number) => Math.max(1, Math.round(cents / CENTS_PER_CREDIT));

function Tile({ post }: { post: Post }) {
  const isSubscribed = useWallet((s) => s.isSubscribed);
  const unlocked = useWallet((s) => s.unlockedPostIds.includes(post.id));
  const credits = useWallet((s) => s.credits);
  const unlockPost = useWallet((s) => s.unlockPost);
  const openSubscribe = useUI((s) => s.openSubscribe);
  const openBuyCredits = useUI((s) => s.openBuyCredits);
  const toggleLike = useContent((s) => s.toggleLike);

  const includedWithSub = post.priceCents === 0;
  const isOpen = unlocked || (includedWithSub && isSubscribed);
  const cost = toCredits(post.priceCents);

  const onClick = () => {
    if (isOpen) return;
    if (includedWithSub) return openSubscribe();
    if (credits < cost) return openBuyCredits();
    unlockPost(post.id, cost);
  };

  // Uploaded image wins; otherwise the default /images/post-N.jpg; otherwise gradient.
  const imgSrc = post.imageDataUrl ?? post.imageSrc;

  return (
    <div
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-ink-800"
      style={{
        backgroundImage: `linear-gradient(140deg, hsl(${post.hue} 70% 45%), hsl(${
          post.hue - 35
        } 65% 28%))`,
      }}
    >
      {imgSrc && (
        <img
          src={imgSrc}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          className={cn("absolute inset-0 h-full w-full object-cover", !isOpen && "blur-xl scale-110")}
        />
      )}

      {/* Locked overlay */}
      {!isOpen && (
        <button
          onClick={onClick}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-md transition-colors group-hover:bg-black/45"
        >
          <Lock className="h-6 w-6 text-white" />
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
            {includedWithSub ? "Subscribe to view" : `Unlock · ${cost} cr`}
          </span>
          {!includedWithSub && (
            <span className="text-[11px] text-white/70">{formatPrice(post.priceCents)} value</span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold">
          <Check className="h-3 w-3 text-green-400" /> Unlocked
        </div>
      )}

      {/* Kind */}
      <div className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/40">
        {post.kind === "video" ? (
          <Play className="h-3.5 w-3.5 text-white" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 text-white" />
        )}
      </div>

      {/* Interactive like */}
      <button
        onClick={() => toggleLike(post.id)}
        className="absolute bottom-2 left-2 z-10 flex items-center gap-1 text-xs font-semibold text-white/90"
      >
        <Heart className={cn("h-4 w-4 transition-colors", post.liked ? "fill-brand-500 text-brand-500" : "fill-white/90")} />
        {compact(post.likes)}
        {post.kind === "video" && post.duration && (
          <span className="ml-1 text-white/70">
            {Math.floor(post.duration / 60)}:{String(post.duration % 60).padStart(2, "0")}
          </span>
        )}
      </button>
    </div>
  );
}

export function ContentGrid() {
  const isSubscribed = useWallet((s) => s.isSubscribed);
  const openSubscribe = useUI((s) => s.openSubscribe);
  const posts = useContent((s) => s.posts);
  const [uploadOpen, setUploadOpen] = useState(false);

  const ppvCount = posts.filter((p) => p.priceCents > 0).length;

  return (
    <section className="mx-auto mt-8 max-w-3xl px-4 pb-12">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink-900">Content</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {posts.length} posts · {ppvCount} PPV
          </span>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" /> Upload
          </Button>
        </div>
      </div>

      {!isSubscribed && (
        <button
          onClick={openSubscribe}
          className="mb-4 flex w-full items-center justify-between rounded-2xl border border-brand-500/40 bg-brand-500/[0.08] px-4 py-3 text-left transition-colors hover:bg-brand-500/[0.14]"
        >
          <span className="text-sm">
            <span className="font-bold text-ink-900">Subscribe to unlock everything</span>
            <span className="block text-zinc-600">All photos & videos + DM access. From $19.99/mo.</span>
          </span>
          <span className="rounded-xl brand-gradient px-3 py-2 text-sm font-bold">Subscribe</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {posts.map((post) => (
          <Tile key={post.id} post={post} />
        ))}
      </div>

      <UploadContentModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </section>
  );
}

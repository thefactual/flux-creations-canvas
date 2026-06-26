import { useState } from "react";
import { Heart, Play, Plus, Lock } from "lucide-react";
import { useContent, type Post } from "@/store/contentStore";
import { compact, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { UploadContentModal } from "./UploadContentModal";

function GalleryTile({ post, teaser }: { post: Post; teaser?: boolean }) {
  const toggleLike = useContent((s) => s.toggleLike);
  const imgSrc = post.imageDataUrl ?? post.imageSrc;

  return (
    <div
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl"
      style={{
        backgroundImage: `linear-gradient(140deg, hsl(${post.hue} 70% 55%), hsl(${
          post.hue - 35
        } 65% 38%))`,
      }}
    >
      {imgSrc && (
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
            teaser && "blur-md",
          )}
        />
      )}

      {/* "more in chat" teaser tile */}
      {teaser && (
        <a
          href="#plans"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-white backdrop-blur-[2px]"
        >
          <Lock className="h-6 w-6" />
          <span className="text-sm font-bold">See everything</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">Subscribe</span>
        </a>
      )}

      {!teaser && (
        <>
          {post.kind === "video" && (
            <div className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/40">
              <Play className="h-3.5 w-3.5 text-white" />
            </div>
          )}
          <button
            onClick={() => toggleLike(post.id)}
            className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow"
          >
            <Heart className={cn("h-4 w-4", post.liked ? "fill-brand-500 text-brand-500" : "fill-white/90")} />
            {compact(post.likes)}
          </button>
        </>
      )}
    </div>
  );
}

export function Gallery() {
  const posts = useContent((s) => s.posts);
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <section className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">Gallery</h2>
          <p className="text-sm text-zinc-500">A taste — the rest lives in chat.</p>
        </div>
        <Button size="sm" variant="dark" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Upload
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {posts.map((post, i) => (
          // Blur the last couple as a "subscribe to see more" teaser.
          <GalleryTile key={post.id} post={post} teaser={i >= posts.length - 2} />
        ))}
      </div>

      <UploadContentModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </section>
  );
}

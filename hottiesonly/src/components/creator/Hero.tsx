import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, MessageCircle, Sparkles, Heart, Users, Image as ImageIcon, Video, Pencil } from "lucide-react";
import { useProfile } from "@/store/profileStore";
import { useContent, totalLikes } from "@/store/contentStore";
import { useWallet } from "@/store/walletStore";
import { Avatar } from "@/components/ui/Avatar";
import { compact } from "@/lib/utils";
import { EditProfileModal } from "./EditProfileModal";

const COVER = "/images/post-4.webp";

export function Hero() {
  const navigate = useNavigate();
  const profile = useProfile((s) => s.profile);
  const posts = useContent((s) => s.posts);
  const isSubscribed = useWallet((s) => s.isSubscribed);
  const [editOpen, setEditOpen] = useState(false);

  const subscribers = profile.baseSubscribers + (isSubscribed ? 1 : 0);
  const likes = profile.baseLikes + totalLikes(posts);
  const photos = posts.filter((p) => p.kind === "photo").length;
  const videos = posts.filter((p) => p.kind === "video").length + 24;

  return (
    <section className="relative">
      {/* Cover photo */}
      <div className="relative h-[82vh] min-h-[560px] w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(135deg, hsl(${profile.bannerHue} 70% 30%), hsl(${
              profile.bannerHue + 30
            } 75% 22%))`,
          }}
        />
        <img
          src={COVER}
          alt=""
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          className="absolute inset-0 h-full w-full object-cover object-[center_22%]"
        />
        {/* Legibility gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/35" />

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-green-400" /> Online now
          </span>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/60"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-3xl px-5 pb-7">
            <div className="flex items-end gap-4">
              <Avatar
                src={profile.avatarDataUrl ?? "/images/avatar.webp"}
                hue={profile.avatarHue}
                className="h-20 w-20 shrink-0 rounded-2xl border-2 border-white/80 shadow-xl sm:h-24 sm:w-24"
              />
              <div className="min-w-0 pb-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-2xl font-extrabold text-white drop-shadow sm:text-3xl">
                    {profile.name}
                  </h1>
                  <BadgeCheck className="h-6 w-6 text-brand-400" />
                </div>
                <p className="text-sm text-white/70">@{profile.handle}</p>
              </div>
            </div>

            <p className="mt-4 max-w-xl text-[15px] font-medium text-white drop-shadow">
              {profile.tagline}
            </p>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/75">{profile.bio}</p>

            {/* Stats */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-white/80">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {compact(subscribers)} subscribers
              </span>
              <span className="flex items-center gap-1.5">
                <Heart className="h-4 w-4" /> {compact(likes)} likes
              </span>
              <span className="flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4" /> {compact(photos)} photos
              </span>
              <span className="flex items-center gap-1.5">
                <Video className="h-4 w-4" /> {compact(videos)} videos
              </span>
            </div>

            {/* CTAs */}
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="#plans"
                className="inline-flex h-12 items-center gap-2 rounded-2xl brand-gradient px-7 text-[15px] font-bold text-white shadow-lg shadow-brand-600/30 transition-opacity hover:opacity-90"
              >
                <Sparkles className="h-5 w-5" /> Subscribe
              </a>
              <button
                onClick={() => navigate("/chat")}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-6 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <MessageCircle className="h-5 w-5" /> Message me
              </button>
            </div>
          </div>
        </div>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
    </section>
  );
}

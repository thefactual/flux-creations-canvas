import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, MapPin, MessageCircle, Heart, Users, Image, Sparkles, Pencil } from "lucide-react";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";
import { useProfile } from "@/store/profileStore";
import { useContent, totalLikes } from "@/store/contentStore";
import { Button } from "@/components/ui/Button";
import { compact } from "@/lib/utils";
import { EditProfileModal } from "./EditProfileModal";

export function ProfileHeader() {
  const navigate = useNavigate();
  const isSubscribed = useWallet((s) => s.isSubscribed);
  const openSubscribe = useUI((s) => s.openSubscribe);
  const profile = useProfile((s) => s.profile);
  const posts = useContent((s) => s.posts);
  const [editOpen, setEditOpen] = useState(false);

  // Live, reactive counts.
  const subscribers = profile.baseSubscribers + (isSubscribed ? 1 : 0);
  const likes = profile.baseLikes + totalLikes(posts);

  return (
    <div>
      {/* Banner */}
      <div
        className="h-40 w-full sm:h-52"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${profile.bannerHue} 80% 22%), hsl(${
            profile.bannerHue + 30
          } 85% 45%))`,
        }}
      />

      <div className="mx-auto -mt-12 max-w-3xl px-4">
        <div className="flex items-end justify-between">
          {/* Avatar */}
          <div className="relative">
            {profile.avatarDataUrl ? (
              <img
                src={profile.avatarDataUrl}
                alt={profile.name}
                className="h-24 w-24 rounded-3xl border-4 border-ink-950 object-cover sm:h-28 sm:w-28"
              />
            ) : (
              <div
                className="h-24 w-24 rounded-3xl border-4 border-ink-950 sm:h-28 sm:w-28"
                style={{
                  backgroundImage: `linear-gradient(135deg, hsl(${profile.avatarHue} 85% 60%), hsl(${
                    profile.avatarHue - 40
                  } 80% 40%))`,
                }}
              />
            )}
            <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full border-2 border-ink-950 bg-green-400" />
          </div>

          <div className="mb-2 flex gap-2">
            <Button variant="dark" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="dark" size="sm" onClick={() => navigate("/chat")}>
              <MessageCircle className="h-4 w-4" /> Message
            </Button>
            {!isSubscribed && (
              <Button size="sm" onClick={openSubscribe}>
                <Sparkles className="h-4 w-4" /> Subscribe
              </Button>
            )}
          </div>
        </div>

        {/* Name + handle */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold">{profile.name}</h1>
            <BadgeCheck className="h-5 w-5 text-brand-500" />
          </div>
          <p className="text-sm text-white/50">
            @{profile.handle}
            {isSubscribed && <span className="ml-2 text-brand-400">· Subscribed</span>}
          </p>
          <p className="mt-2 text-[15px] font-medium">{profile.tagline}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">{profile.bio}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/50">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {profile.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {compact(subscribers)} subscribers
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" /> {compact(likes)} likes
            </span>
            <span className="flex items-center gap-1.5">
              <Image className="h-4 w-4" /> {compact(posts.length)} posts
            </span>
          </div>
        </div>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { BadgeCheck, Sparkles, MapPin, MessageCircle, Heart, Users, Image } from "lucide-react";
import { CREATOR } from "@/data/creator";
import { useWallet } from "@/store/walletStore";
import { useUI } from "@/store/uiStore";
import { Button } from "@/components/ui/Button";
import { compact } from "@/lib/utils";

export function ProfileHeader() {
  const navigate = useNavigate();
  const isSubscribed = useWallet((s) => s.isSubscribed);
  const openSubscribe = useUI((s) => s.openSubscribe);

  return (
    <div>
      {/* Banner */}
      <div
        className="h-40 w-full sm:h-52"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${CREATOR.bannerHue} 80% 22%), hsl(${
            CREATOR.bannerHue + 30
          } 85% 45%))`,
        }}
      />

      <div className="mx-auto -mt-12 max-w-3xl px-4">
        <div className="flex items-end justify-between">
          {/* Avatar */}
          <div className="relative">
            <div
              className="h-24 w-24 rounded-3xl border-4 border-ink-950 sm:h-28 sm:w-28"
              style={{
                backgroundImage: `linear-gradient(135deg, hsl(${CREATOR.avatarHue} 85% 60%), hsl(${
                  CREATOR.avatarHue - 40
                } 80% 40%))`,
              }}
            />
            {CREATOR.online && (
              <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full border-2 border-ink-950 bg-green-400" />
            )}
          </div>

          <div className="mb-2 flex gap-2">
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

        {/* Name + badges */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-extrabold">{CREATOR.name}</h1>
            {CREATOR.verified && <BadgeCheck className="h-5 w-5 text-brand-500" />}
            {CREATOR.isAi && (
              <span className="ml-1 flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold text-brand-400">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            )}
          </div>
          <p className="text-sm text-white/50">
            @{CREATOR.handle}
            {isSubscribed && <span className="ml-2 text-brand-400">· Subscribed</span>}
          </p>
          <p className="mt-2 text-[15px] font-medium">{CREATOR.tagline}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">{CREATOR.bio}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/50">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {CREATOR.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {compact(CREATOR.stats.subscribers)} subscribers
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" /> {compact(CREATOR.stats.likes)} likes
            </span>
            <span className="flex items-center gap-1.5">
              <Image className="h-4 w-4" /> {compact(CREATOR.stats.posts)} posts
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import korsolaLogo from "@/assets/korsola-logo.jpg";

type Slide = {
  src: string;
  type: "image" | "video";
  badge?: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    src: "/auth/slide-image-gen.png",
    type: "image",
    badge: "With Reference",
    title: "NANO BANANA PRO",
    subtitle: "Generate hyper-real images from a prompt or any reference photo.",
  },
  {
    src: "/auth/slide-2.mp4",
    type: "video",
    badge: "With Audio",
    title: "KLING 3.0 — UNBOXING",
    subtitle: "Cinematic product reveals with motion, sound, and polish that feels real.",
  },
  {
    src: "/auth/slide-3.mp4",
    type: "video",
    badge: "Video Edit",
    title: "SEEDANCE 2.0",
    subtitle: "Drop in raw footage and tell it what to change. Edit video like a prompt.",
  },
  {
    src: "/formats/ugc-1.mp4",
    type: "video",
    badge: "Marketing Studio",
    title: "REAL UGC ADS",
    subtitle: "Creator-style ads for any product — generated, not filmed.",
  },
  {
    src: "/auth/slide-4.mp4",
    type: "video",
    badge: "Try-On",
    title: "UGC VIRTUAL TRY-ON",
    subtitle: "Put your product on any avatar in any setting — instantly.",
  },
  {
    src: "/formats/tutorial-1.mp4",
    type: "video",
    badge: "Tutorial",
    title: "TUTORIALS & GET-READY-WITH-ME",
    subtitle: "Step-by-step demos that hold attention and convert.",
  },
  {
    src: "/auth/slide-5.mp4",
    type: "video",
    badge: "Vlog",
    title: "VLOG & STREET INTERVIEWS",
    subtitle: "Authentic on-the-street energy without leaving your desk.",
  },
  {
    src: "/auth/slide-6.mp4",
    type: "video",
    badge: "Motion Control",
    title: "MOTION CONTROL",
    subtitle: "Take the motion of any video and apply it to any image.",
  },
  {
    src: "/formats/podcast-1.mp4",
    type: "video",
    badge: "Avatar",
    title: "PODCAST & TALKING HEAD",
    subtitle: "Lifelike avatars that talk, react, and host like a real creator.",
  },
];

export default function Auth() {
  const [slide, setSlide] = useState(0);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? "/home";

  useEffect(() => {
    const t = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5500);
    return () => window.clearInterval(t);
  }, []);

  if (!loading && session) return <Navigate to={from} replace />;

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and 6+ char password");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/home` },
        });
        if (error) throw error;
        toast.success("Welcome to Korsola");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/home",
      });
      if (result.error) {
        toast.error("Google sign-in failed");
        setSubmitting(false);
        return;
      }
      if (result.redirected) return;
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
      setSubmitting(false);
    }
  };

  const current = SLIDES[slide];

  return (
    <div
      className="min-h-[100svh] w-full bg-[#0a0a0a] text-white overflow-hidden"
      style={{ fontFamily: "Montserrat, system-ui, -apple-system, Helvetica, Arial, sans-serif" }}
    >
      <div className="grid min-h-[100svh] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* LEFT — auth */}
        <div className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
          <div className="absolute top-5 left-5 sm:top-7 sm:left-8">
            <Link to="/home" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/80 hover:text-white">
              <img src={korsolaLogo} alt="Korsola" className="w-8 h-8 rounded-md object-cover" />
              <span className="hidden sm:inline">KORSOLA</span>
            </Link>
          </div>

          <div className="w-full max-w-[440px]">
            <div className="mx-auto mb-6 w-14 h-14 rounded-2xl overflow-hidden">
              <img src={korsolaLogo} alt="Korsola" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-center text-[28px] sm:text-[34px] font-semibold leading-tight tracking-tight">
              Welcome to Korsola
            </h1>
            <p className="mt-2 text-center text-[15px] text-white/55">
              Sign in and start creating ads that actually convert.
            </p>

            <div className="mt-8 space-y-3">
              <button
                onClick={handleGoogle}
                disabled={submitting}
                className="w-full h-[52px] rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center gap-3 text-[15px] font-semibold transition-colors disabled:opacity-50"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              {!showEmail ? (
                <>
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">or</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <button
                    onClick={() => setShowEmail(true)}
                    className="w-full h-[52px] rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center gap-3 text-[15px] font-semibold transition-colors"
                  >
                    <Mail className="w-[18px] h-[18px]" />
                    Continue with Email
                  </button>
                </>
              ) : (
                <form onSubmit={handleEmail} className="pt-2 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="w-full h-[52px] rounded-2xl bg-white/[0.04] border border-white/10 px-5 text-[15px] placeholder:text-white/35 focus:border-white/30 focus:outline-none focus:bg-white/[0.06]"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full h-[52px] rounded-2xl bg-white/[0.04] border border-white/10 px-5 text-[15px] placeholder:text-white/35 focus:border-white/30 focus:outline-none focus:bg-white/[0.06]"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-[52px] rounded-2xl bg-[#6d28ff] hover:bg-[#5b1fdb] text-white text-[15px] font-bold transition-colors disabled:opacity-60"
                  >
                    {submitting ? "..." : mode === "signup" ? "Create account" : "Sign in"}
                  </button>
                  <div className="flex items-center justify-between pt-1 text-[13px] text-white/55">
                    <button type="button" onClick={() => setShowEmail(false)} className="hover:text-white">
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                      className="font-semibold text-white hover:text-[#a78bff]"
                    >
                      {mode === "signup" ? "Already have an account? Sign in" : "New here? Create account"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <p className="mt-10 text-center text-[12px] leading-relaxed text-white/40">
              By continuing, I acknowledge the{" "}
              <a className="underline underline-offset-2 hover:text-white/70">Privacy Policy</a> and agree to the{" "}
              <a className="underline underline-offset-2 hover:text-white/70">Terms of Use</a>.
            </p>
          </div>
        </div>

        {/* RIGHT — slideshow */}
        <div className="relative min-h-[60svh] lg:min-h-[100svh] bg-black overflow-hidden">
          {SLIDES.map((s, i) => {
            const active = i === slide;
            return (
              <div
                key={i}
                className={`absolute inset-0 transition-all duration-[1100ms] ease-out ${
                  active ? "opacity-100 scale-100" : "opacity-0 scale-[1.04] pointer-events-none"
                }`}
              >
                {s.type === "video" ? (
                  <video
                    src={s.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <img src={s.src} alt={s.title} className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              </div>
            );
          })}

          {/* Badge */}
          {current.badge && (
            <div className="absolute top-5 right-5 sm:top-7 sm:right-8 z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md text-[12px] font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d8ff3e]" />
                {current.badge}
              </span>
            </div>
          )}

          {/* Caption */}
          <div className="absolute inset-x-0 bottom-0 px-6 sm:px-10 lg:px-14 pb-8 sm:pb-12 z-10">
            <div key={slide} className="animate-in fade-in slide-in-from-bottom-3 duration-700">
              <h2
                className="text-white text-[28px] sm:text-[40px] lg:text-[52px] font-bold tracking-tight leading-[1.02]"
                style={{ fontFamily: 'Montserrat, "Bricolage Grotesque", system-ui, sans-serif' }}
              >
                {current.title}
              </h2>
              <p className="mt-2 text-white/75 text-[14px] sm:text-[16px] max-w-[560px]">
                {current.subtitle}
              </p>
            </div>

            {/* Progress bars */}
            <div className="mt-6 flex items-center gap-1.5">
              {SLIDES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  className="group flex-1 h-[3px] rounded-full overflow-hidden bg-white/15 hover:bg-white/25 transition-colors"
                  aria-label={`Go to slide ${i + 1}`}
                >
                  <span
                    className={`block h-full bg-white transition-all ${
                      i < slide ? "w-full" : i === slide ? "w-full animate-[fill_5500ms_linear]" : "w-0"
                    }`}
                    style={
                      i === slide
                        ? { animation: "authProgress 5500ms linear forwards" }
                        : undefined
                    }
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes authProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.5 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9v.1c2.6 0 4.8-.9 6.4-2.4 1.4-1.3 2.2-3.3 2.2-3.9z" opacity=".0"/>
    </svg>
  );
}

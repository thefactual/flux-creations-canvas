import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** image src (uploaded data URL or /images/... path). Falls back to the gradient on error/absent. */
  src?: string | null;
  /** hue for the gradient fallback */
  hue: number;
  className?: string;
};

/** Square/round avatar that renders an image over a gradient, falling back to
 *  the gradient if the image is missing or fails to load. */
export function Avatar({ src, hue, className }: Props) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 85% 60%), hsl(${hue - 40} 80% 40%))`,
      }}
    >
      {showImg && (
        <img
          src={src!}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

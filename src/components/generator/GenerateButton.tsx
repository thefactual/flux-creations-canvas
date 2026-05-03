import { Sparkles } from 'lucide-react';

type Props = {
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  trailing?: React.ReactNode;
  showSparkles?: boolean;
};

/**
 * Shared "Generate" CTA button with looping video background and dark overlay.
 * Drop in anywhere we previously used a `ms-cta` button.
 */
export function GenerateButton({
  onClick,
  disabled,
  className = '',
  label = 'Generate',
  trailing,
  showSparkles = true,
}: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`ms-cta relative overflow-hidden flex items-center justify-center gap-2 rounded-2xl text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed shrink-0 bg-black ${className}`}
    >
      <video
        src="/videos/generate-btn.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
      <span className="absolute inset-0 bg-black/20 pointer-events-none" />
      <span className="relative z-10 flex items-center gap-2">
        {label}
        {showSparkles && <Sparkles className="w-4 h-4" />}
        {trailing}
      </span>
    </button>
  );
}

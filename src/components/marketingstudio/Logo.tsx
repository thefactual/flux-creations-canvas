import { Link } from 'react-router-dom';
import logoWhite from '@/assets/korsola-logo-white.png';
import logoHover from '@/assets/logo-hover.mp4';

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/home" className="group shrink-0 flex items-center gap-2" aria-label="Korsola home">
      <span className="relative w-11 h-11 rounded-[10px] overflow-hidden bg-white block">
        <img
          src={logoWhite}
          alt="Korsola"
          className="absolute inset-0 w-full h-full object-contain p-1.5 z-10 transition-opacity duration-200 group-hover:opacity-0"
        />
        <video
          src={logoHover}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />
      </span>
      {!collapsed && (
        <span className="text-[13px] font-extrabold tracking-[0.14em] text-foreground">
          KORSOLA
        </span>
      )}
    </Link>
  );
}

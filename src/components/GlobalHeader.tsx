import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X, Bell, Gem, User } from 'lucide-react';
import logoWhite from '@/assets/korsola-logo-white.png';
import logoPink from '@/assets/korsola-logo-pink.png';

// TODO: replace with real auth state
const isLoggedIn = false;

const NAV_ITEMS = [
  { to: '/home', label: 'Home' },
  { to: '/image', label: 'Image' },
  { to: '/video', label: 'Video' },
  { to: '/spaces-projects', label: 'Spaces' },
  { to: '/marketingstudio', label: 'Marketing Studio', badge: 'New' },
];

export function GlobalHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Hide on marketing studio routes
  if (location.pathname.startsWith('/marketingstudio')) return null;

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-xl">
      <div className="h-14 px-4 md:px-6 flex items-center justify-between gap-4">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6 min-w-0">
          <Link to="/home" className="group relative shrink-0 flex items-center" aria-label="Korsola home">
            <img
              src={logoWhite}
              alt="Korsola"
              className="w-8 h-8 object-contain transition-opacity duration-200 group-hover:opacity-0"
            />
            <img
              src={logoPink}
              alt=""
              aria-hidden
              className="w-8 h-8 object-contain absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            />
            <span className="ml-2 hidden sm:block text-[13px] font-extrabold tracking-[0.14em] text-foreground">
              KORSOLA
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-foreground bg-muted/60'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`
                }
              >
                {item.label}
                {item.badge && (
                  <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-lime-300 text-black align-middle">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right: auth / actions */}
        <div className="flex items-center gap-2">
          {!isLoggedIn ? (
            <>
              <button className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold text-foreground hover:bg-muted/50 relative transition-colors">
                <Gem className="w-3.5 h-3.5 text-[#FF2D78]" />
                Pricing
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1.5 py-px rounded-full bg-[#FF2D78] text-white whitespace-nowrap">
                  30% OFF
                </span>
              </button>
              <button className="text-xs font-semibold text-foreground hover:opacity-80 px-2">
                Login
              </button>
              <button className="px-4 h-8 rounded-full text-xs font-bold text-white bg-[#FF2D78] hover:brightness-110 transition-all">
                Sign up
              </button>
            </>
          ) : (
            <>
              <button className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold text-white bg-[#FF2D78] hover:brightness-110 transition-all relative">
                <Gem className="w-3.5 h-3.5" />
                Upgrade
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1.5 py-px rounded-full bg-lime-300 text-black whitespace-nowrap">
                  30% OFF
                </span>
              </button>
              <button
                className="grid place-items-center w-9 h-9 rounded-full text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
              </button>
              <button
                className="w-8 h-8 rounded-full bg-muted grid place-items-center hover:ring-2 hover:ring-[#FF2D78] transition-all"
                aria-label="Profile"
              >
                <User className="w-4 h-4 text-foreground" />
              </button>
            </>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden grid place-items-center w-9 h-9 rounded-md text-foreground hover:bg-muted/50"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="md:hidden bg-background/95 backdrop-blur-xl px-3 py-2 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-foreground bg-muted/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`
              }
            >
              {item.label}
              {item.badge && (
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-lime-300 text-black align-middle">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

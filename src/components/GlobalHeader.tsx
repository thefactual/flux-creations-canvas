import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { GenerateButton } from '@/components/generator/GenerateButton';
import { useState } from 'react';
import { Menu, X, Bell, Gem, User, ArrowLeft } from 'lucide-react';
import logoWhite from '@/assets/korsola-logo-white.png';
import logoPink from '@/assets/korsola-logo-pink.png';
import { useLayoutStore } from '@/store/layoutStore';
import { useCreateProjectsStore } from '@/store/createProjectsStore';

// TODO: replace with real auth state
const isLoggedIn = false;

const NAV_ITEMS = [
  { to: '/home', label: 'Home' },
  { to: '/create', label: 'Create' },
  { to: '/video', label: 'Video' },
  { to: '/spaces-projects', label: 'Spaces' },
  { to: '/marketingstudio', label: 'Marketing Studio', badge: 'New' },
];

export function GlobalHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarCollapsed = useCreateProjectsStore((s) => s.sidebarCollapsed);
  const activeProjectId = useCreateProjectsStore((s) => s.activeProjectId);
  const projects = useCreateProjectsStore((s) => s.projects);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Hide on marketing studio routes
  if (location.pathname.startsWith('/marketingstudio')) return null;

  const isCreate = location.pathname.startsWith('/create');
  const sidebarWidth = sidebarCollapsed ? 64 : 256;

  return (
    <header
      className="sticky top-0 z-50 ms-grid-bg backdrop-blur-xl transition-[left,width] duration-200 ease-out"
      style={
        isCreate
          ? { marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)` }
          : { width: '100%' }
      }
    >
      <div className="h-20 px-4 md:px-8 flex items-center justify-between gap-4">
        {/* Left: logo + nav (hidden on /create — sidebar owns the logo there) */}
        <div className="flex items-center gap-6 min-w-0">
          {!location.pathname.startsWith('/create') && (
            <Link to="/home" className="group shrink-0 flex items-center gap-2" aria-label="Korsola home">
              <span className="relative w-11 h-11 rounded-[10px] overflow-hidden bg-white block">
                <img
                  src={logoWhite}
                  alt="Korsola"
                  className="absolute inset-0 w-full h-full object-contain transition-opacity duration-200 group-hover:opacity-0"
                />
                <img
                  src={logoPink}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />
              </span>
              <span className="hidden sm:block text-[13px] font-extrabold tracking-[0.14em] text-foreground">
                KORSOLA
              </span>
            </Link>
          )}

          {isCreate && (
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => navigate('/home')}
                className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Back to home"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              {activeProject && (
                <div className="text-sm font-semibold text-foreground truncate max-w-[40vw]">
                  {activeProject.name}
                </div>
              )}
            </div>
          )}

          {!location.pathname.startsWith('/create') && (
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `relative px-4 py-2 rounded-2xl text-[15px] font-medium transition-colors ${
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
        </div>

        {/* Right: auth / actions */}
        <div className="flex items-center gap-2">
          {location.pathname.startsWith('/create') && <LayoutZoomSlider />}
          {!isLoggedIn ? (
            <>
              <button className="hidden sm:flex items-center gap-1.5 px-4 h-10 rounded-2xl text-sm font-semibold text-foreground hover:bg-muted/50 relative transition-colors">
                <Gem className="w-4 h-4 text-[#9C3FED]" />
                Pricing
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-px rounded-full bg-[#9C3FED] text-white whitespace-nowrap">
                  30% OFF
                </span>
              </button>
              <button className="px-4 h-10 rounded-2xl text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors">
                Login
              </button>
              <GenerateButton
                label="Sign up"
                showSparkles={false}
                className="px-5 h-10 !rounded-2xl text-sm"
              />
            </>
          ) : (
            <>
              <GenerateButton
                label="Upgrade"
                showSparkles={false}
                className="hidden sm:flex px-5 h-10 !rounded-2xl text-sm relative"
                trailing={
                  <>
                    <Gem className="w-4 h-4" />
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-px rounded-full bg-lime-300 text-black whitespace-nowrap">
                      30% OFF
                    </span>
                  </>
                }
              />
              <button
                className="grid place-items-center w-9 h-9 rounded-full text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
              </button>
              <button
                className="w-8 h-8 rounded-full bg-muted grid place-items-center hover:ring-2 hover:ring-[#9C3FED] transition-all"
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

function LayoutZoomSlider() {
  const zoom = useLayoutStore((s) => s.zoom);
  const setZoom = useLayoutStore((s) => s.setZoom);
  const max = 4;
  const pct = (zoom / max) * 100;
  return (
    <div
      className="hidden md:flex items-center h-10 px-3 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors"
      title="Adjust grid size"
    >
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={zoom}
        onChange={(e) => setZoom(parseInt(e.target.value, 10))}
        aria-label="Grid size"
        className="ms-zoom-slider w-28 cursor-pointer"
        style={{ background: `linear-gradient(to right, #9C3FED 0%, #9C3FED ${pct}%, hsl(0 0% 100% / 0.12) ${pct}%, hsl(0 0% 100% / 0.12) 100%)` }}
      />
    </div>
  );
}


import { NavLink, useLocation } from 'react-router-dom';
import { Image as ImageIcon, Film, Megaphone } from 'lucide-react';

const ITEMS = [
  { to: '/image', label: 'Image', Icon: ImageIcon },
  { to: '/video', label: 'Video', Icon: Film },
  { to: '/marketingstudio', label: 'Marketing Studio', Icon: Megaphone },
];

export function PromptNavBar() {
  const { pathname } = useLocation();
  return (
    <div
      className="w-full max-w-[1100px] mx-auto mb-2 flex justify-center"
      style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
    >
      <div className="ms-glass rounded-full p-1 flex items-center gap-1">
        {ITEMS.map(({ to, label, Icon }) => {
          const active =
            to === '/image'
              ? pathname.startsWith('/image') || pathname.startsWith('/generator')
              : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`group inline-flex items-center gap-2 px-3 sm:px-4 h-9 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap ${
                active
                  ? 'bg-white text-black shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)]'
                  : 'text-white/75 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

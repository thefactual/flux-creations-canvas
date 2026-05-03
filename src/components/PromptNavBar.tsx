import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Image as ImageIcon, Film, Megaphone, Move3d } from 'lucide-react';
import { usePromptModeStore } from '@/store/promptModeStore';

export function PromptNavBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { mode, setMode } = usePromptModeStore();

  const onImageRoute = pathname.startsWith('/image') || pathname.startsWith('/generator');

  const items = [
    {
      key: 'image',
      label: 'Image',
      Icon: ImageIcon,
      active: onImageRoute && mode === 'image',
      onClick: () => { setMode('image'); if (!onImageRoute) navigate('/image'); },
    },
    {
      key: 'video',
      label: 'Video',
      Icon: Film,
      active: (onImageRoute && mode === 'video') || pathname.startsWith('/video'),
      onClick: () => { setMode('video'); if (!onImageRoute && !pathname.startsWith('/video')) navigate('/image'); },
    },
    {
      key: 'motion',
      label: 'Motion Control',
      Icon: Move3d,
      to: '/motion-control',
      active: pathname.startsWith('/motion-control'),
    },
    {
      key: 'marketing',
      label: 'Marketing Studio',
      Icon: Megaphone,
      to: '/marketingstudio',
      active: pathname.startsWith('/marketingstudio'),
    },
  ];

  return (
    <div
      className="w-full max-w-[1100px] mx-auto mb-2 flex justify-center"
      style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
    >
      <div className="ms-glass rounded-full p-1 flex items-center gap-1">
        {items.map(({ key, label, Icon, active, onClick, to }) => {
          const cls = `group inline-flex items-center gap-2 px-3 sm:px-4 h-9 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap ${
            active
              ? 'bg-white text-black shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)]'
              : 'text-white/75 hover:text-white hover:bg-white/5'
          }`;
          if (onClick) {
            return (
              <button key={key} onClick={onClick} className={cls}>
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          }
          return (
            <NavLink key={key} to={to!} className={cls}>
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

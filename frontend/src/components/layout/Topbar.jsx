import { useAuth } from '../../context/AuthContext.jsx';
import SearchInput from '../common/SearchInput.jsx';
import NotificationBell from './NotificationBell.jsx';

export default function Topbar() {
  const { user, logout } = useAuth();
  const initials = (user?.name || 'A S').split(' ').map((w) => w[0]).slice(0, 2).join('');

  return (
    <header className="h-[62px] shrink-0 flex items-center justify-between px-6 border-b border-white/10 bg-surface/60 backdrop-blur-md">
      <SearchInput placeholder="Search questions, companies…" />
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400 hidden sm:inline">
          🔥 <b className="text-white">{user?.currentStreak ?? 0}</b> day streak
        </span>
        {user?.role !== 'admin' && <NotificationBell />}
        <div className="w-[34px] h-[34px] rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center font-bold text-xs">
          {initials}
        </div>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-white">
          Sign out
        </button>
      </div>
    </header>
  );
}

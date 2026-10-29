import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '▤' },
  { to: '/profile', label: 'Profile', icon: '👤' },
  { to: '/dsa', label: 'DSA Sheet', icon: '◧' },
  { to: '/aptitude', label: 'Aptitude', icon: '✓' },
  { to: '/technical-quizzes', label: 'Technical Quizzes', icon: '🧪' },
  { to: '/interview-prep', label: 'Interview Prep', icon: '💬' },
  { to: '/resume-builder', label: 'Resume', icon: '📄' },
  { to: '/ats-analyzer', label: 'ATS Analyzer', icon: '🎯' },
  { to: '/companies', label: 'Companies', icon: '◫' },
  { to: '/mock-interview', label: 'AI Mock Interview', icon: '🎙' },
  { to: '/peer-mock-interview', label: 'Peer Mock Interview', icon: '🤝' },
  { to: '/notes', label: 'Notes', icon: '✎' },
  { to: '/playground', label: 'Playground', icon: '⌘' },
  { to: '/coding-problems', label: 'Coding Problems', icon: '💻' },
  { to: '/leaderboard', label: 'Leaderboard', icon: '▲' },
  { to: '/feedback', label: 'Feedback', icon: '💡' },
];

export default function Sidebar() {
  return (
    <aside className="w-[236px] shrink-0 p-3.5 border-r border-white/10 bg-white/[0.02] hidden md:flex flex-col overflow-y-auto">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-extrabold text-sm shadow-lg shadow-primary/40">
          NH
        </div>
        <div>
          <div className="font-bold text-sm">NextHire</div>
          <div className="text-[11px] text-gray-400">Placement Readiness</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-primary/20 to-accent/5 text-white shadow-[inset_2px_0_0_#3B82F6]'
                  : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
              }`
            }
          >
            <span className="w-[18px] text-center text-[15px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-3 border-t border-white/10 text-[11px] text-gray-500 px-1">
        NextHire · Placement Readiness & Career
      </div>
    </aside>
  );
}

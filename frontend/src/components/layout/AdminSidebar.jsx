import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/admin', label: 'Overview', icon: '▤', end: true },
  { to: '/admin/students', label: 'Students', icon: '🎓' },
  { to: '/admin/topics', label: 'Topics', icon: '◈' },
  { to: '/admin/companies', label: 'Companies', icon: '◫' },
  { to: '/admin/questions', label: 'Tasks', icon: '◧' },
  { to: '/admin/interview-questions', label: 'Interview Qs', icon: '🎙' },
  { to: '/admin/quizzes', label: 'Quizzes', icon: '📝' },
  { to: '/admin/coding-problems', label: 'Coding Problems', icon: '💻' },
  { to: '/admin/feedback', label: 'Feedback', icon: '💡' },
  { to: '/admin/notifications', label: 'Notifications', icon: '🔔' },
];

export default function AdminSidebar() {
  return (
    <aside className="w-[220px] shrink-0 p-3.5 border-r border-white/10 bg-white/[0.02] hidden md:flex flex-col">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center font-extrabold text-sm">
          NH
        </div>
        <div>
          <div className="font-bold text-sm">Admin Panel</div>
          <div className="text-[11px] text-gray-400">NextHire</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-secondary/25 to-primary/5 text-white shadow-[inset_2px_0_0_#4F46E5]'
                  : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
              }`
            }
          >
            <span className="w-[18px] text-center text-[15px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <NavLink to="/dashboard" className="text-[11px] text-gray-500 px-1 pt-3 border-t border-white/10 hover:text-gray-300">
        ← Exit to student view
      </NavLink>
    </aside>
  );
}

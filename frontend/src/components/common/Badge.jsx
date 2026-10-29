const difficultyStyles = {
  Easy: 'bg-green-500/15 text-green-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Hard: 'bg-red-500/15 text-red-400',
};

export function DifficultyBadge({ level }) {
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${difficultyStyles[level] || ''}`}>{level}</span>;
}

export function Tag({ children }) {
  return <span className="inline-block bg-secondary/20 text-indigo-300 text-[11px] px-2 py-0.5 rounded-md mr-1 mb-1">{children}</span>;
}

export function StatusDot({ status }) {
  const color = status === 'done' ? 'bg-green-400' : status === 'attempted' ? 'bg-amber-400' : 'bg-white/20';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

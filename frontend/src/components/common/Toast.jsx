import { useEffect } from 'react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2600);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 right-5 bg-surface-card border border-white/10 rounded-xl px-4 py-3 text-xs text-gray-300 max-w-[280px] shadow-2xl z-50">
      {message}
    </div>
  );
}

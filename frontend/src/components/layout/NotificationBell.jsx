import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { listMyNotifications, markAllMyNotificationsRead } from '../../services/notification.service.js';

const POLL_MS = 60000;
const ICONS = { 'interview-reminder': '🎙', 'daily-goal': '🎯', 'quiz-reminder': '📝', 'placement-update': '📢', 'company-visit': '🏢', general: '🔔' };

/**
 * Student notification bell. Loads notifications from the backend (GET /api/notifications — the
 * student's own plus admin broadcasts), so they persist across refreshes and logins. Re-checks
 * every minute, when the tab regains focus, and whenever the panel is opened.
 * "New" for broadcasts is tracked per student in this browser (they're shared rows in the DB).
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const seenKey = `notifications:lastSeen:${userId}`;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(seenKey)) || 0);
  const wrapRef = useRef(null);

  const load = useCallback(() => {
    listMyNotifications()
      .then((data) => { setItems(Array.isArray(data) ? data : []); setError(''); })
      .catch(() => setError('Could not load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setLastSeen(Number(localStorage.getItem(seenKey)) || 0); }, [seenKey]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener('focus', load);
    return () => { clearInterval(timer); window.removeEventListener('focus', load); };
  }, [load]);

  // Closing the panel is when "new" highlights are cleared (they stay visible while it's open).
  const close = useCallback(() => {
    setOpen(false);
    setLastSeen(Number(localStorage.getItem(seenKey)) || 0);
    load();
  }, [seenKey, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const isNew = (n) => (n.userId ? !n.isRead : new Date(n.createdAt).getTime() > lastSeen);
  const unread = items.filter(isNew).length;

  const toggle = () => {
    if (open) { close(); return; }
    setOpen(true);
    load();
    if (unread > 0) {
      localStorage.setItem(seenKey, String(Date.now()));
      if (items.some((n) => n.userId && !n.isRead)) markAllMyNotificationsRead().catch(() => {});
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={toggle} className="relative w-[34px] h-[34px] rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center" aria-label="Notifications">
        <span className="text-base">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-surface shadow-2xl z-50">
          <div className="px-4 py-3 border-b border-white/10 text-sm font-bold">Notifications</div>
          {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
          {!loading && error && <p className="p-4 text-sm text-red-400">{error}</p>}
          {!loading && !error && items.length === 0 && <p className="p-4 text-sm text-gray-500">No notifications yet.</p>}
          {items.map((n) => {
            const body = (
              <>
                <div className="flex items-start gap-2.5">
                  <span className="text-base leading-5">{ICONS[n.type] || '🔔'}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-100 flex items-center gap-2">
                      <span className="truncate">{n.title}</span>
                      {isNew(n) && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-[12.5px] text-gray-400 mt-0.5 whitespace-pre-line break-words">{n.message}</p>
                    <p className="text-[11px] text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </>
            );
            const cls = 'block px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.03]';
            if (n.link && n.link.startsWith('/')) return <Link key={n._id} to={n.link} onClick={close} className={cls}>{body}</Link>;
            if (n.link && /^https?:\/\//.test(n.link)) return <a key={n._id} href={n.link} target="_blank" rel="noreferrer" className={cls}>{body}</a>;
            return <div key={n._id} className={cls}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

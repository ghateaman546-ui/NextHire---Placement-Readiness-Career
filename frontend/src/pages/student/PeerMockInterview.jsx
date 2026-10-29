import { useEffect, useState } from 'react';
import Card from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import Input from '../../components/common/Input.jsx';
import StarRating from '../../components/common/StarRating.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { listAvailableSlots, listMySessions, scheduleSlot, joinSlot, submitPeerFeedback, getMeetingDetails } from '../../services/peerInterview.service.js';

const peerDomains = ['DSA', 'System Design', 'HR/Behavioral', 'OS', 'DBMS', 'OOP', 'Java', 'JavaScript', 'React', 'Node', 'SQL', 'General'];

const TABS = [{ key: 'browse', label: 'Find a Peer' }, { key: 'schedule', label: 'Schedule a Slot' }, { key: 'my', label: 'My Sessions' }];

/**
 * Mock interview scheduler with peer evaluation feedback forms.
 * Distinct from the AI Mock Interview: this matches two students together
 * at a chosen time, then lets each side rate & review the other afterward.
 */
export default function PeerMockInterview() {
  const [tab, setTab] = useState('browse');
  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Peer Mock Interview</h2>
      <p className="text-gray-400 text-[13.5px] mb-5">Schedule a mock interview with another student, then leave each other structured feedback.</p>

      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.key ? 'bg-primary text-white' : 'bg-white/[0.04] text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'browse' && <BrowseTab />}
      {tab === 'schedule' && <ScheduleTab onScheduled={() => setTab('my')} />}
      {tab === 'my' && <MyTab />}
    </div>
  );
}

function BrowseTab() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinedId, setJoinedId] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    listAvailableSlots()
      .then(setSlots)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load open slots.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleJoin = async (id) => {
    setError('');
    try {
      await joinSlot(id);
      setJoinedId(id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join this slot.');
    }
  };

  return (
    <div>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <p className="text-gray-500 text-sm">Loading slots…</p>
      ) : (
        <div className="space-y-3">
          {slots.map((s) => {
            const dt = new Date(s.scheduledFor);
            return (
              <Card key={s._id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">{s.domain} mock interview</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    with {s.host?.name} ({s.host?.college}) · {dt.toLocaleString()} · {s.durationMinutes} min
                  </div>
                </div>
                {joinedId === s._id ? (
                  <span className="text-xs text-green-400 font-semibold">Joined ✓</span>
                ) : (
                  <Button onClick={() => handleJoin(s._id)} className="w-auto px-5">Join session</Button>
                )}
              </Card>
            );
          })}
          {slots.length === 0 && <p className="text-gray-500 text-sm">No open slots right now — schedule your own in the "Schedule a Slot" tab.</p>}
        </div>
      )}
    </div>
  );
}

function ScheduleTab({ onScheduled }) {
  const [form, setForm] = useState({ domain: 'DSA', scheduledFor: '', durationMinutes: 30, meetingProvider: 'custom', meetingLink: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await scheduleSlot(form);
      onScheduled();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to schedule this slot.');
    } finally {
      setSubmitting(false);
    }
  };

  const linkPlaceholder = { 'google-meet': 'https://meet.google.com/xxx-xxxx-xxx', zoom: 'https://zoom.us/j/1234567890', custom: 'https://…' }[form.meetingProvider];

  return (
    <Card className="p-6 max-w-lg">
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Domain / Focus area</label>
          <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
            {peerDomains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <Input label="Date & time" type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} required />
        <Input label="Duration (minutes)" type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Meeting provider</label>
          <select value={form.meetingProvider} onChange={(e) => setForm({ ...form, meetingProvider: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm outline-none">
            <option value="custom">Custom link</option>
            <option value="google-meet">Google Meet</option>
            <option value="zoom">Zoom</option>
          </select>
        </div>
        <Input label="Meeting link (optional — paste a real Google Meet / Zoom link)" placeholder={linkPlaceholder} value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} />
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Scheduling…' : 'Schedule slot'}</Button>
      </form>
    </Card>
  );
}

function MyTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedbackFor, setFeedbackFor] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    listMySessions()
      .then(setSessions)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your sessions.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (feedbackFor) {
    return <PeerFeedbackForm sessionId={feedbackFor} onDone={() => { setFeedbackFor(null); load(); }} />;
  }

  return (
    <div>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <p className="text-gray-500 text-sm">Loading sessions…</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const partnerName = s.partner?.name || 'Waiting for a partner';
            return (
              <Card key={s._id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">{s.domain} with {partnerName}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(s.scheduledFor).toLocaleString()} · <span className="capitalize">{s.status}</span>
                  </div>
                </div>
                {(s.status === 'matched' || s.status === 'completed') && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {s.status === 'matched' && <JoinMeetingButton session={s} />}
                    <Button onClick={() => setFeedbackFor(s._id)} variant="ghost" className="w-auto px-4">Leave feedback</Button>
                  </div>
                )}
              </Card>
            );
          })}
          {sessions.length === 0 && <p className="text-gray-500 text-sm">No sessions yet — schedule or join one to get started.</p>}
        </div>
      )}
    </div>
  );
}

// Mirrors backend/src/config/meetingConfig.js's JOIN_WINDOW_MINUTES_BEFORE default —
// used only for the live "Scheduled" vs "Join Meeting" label on this page; the
// actual join action always re-checks with the backend (the authoritative source)
// at click time, so a mismatch here can't grant early/unauthorized access.
const JOIN_WINDOW_MINUTES_BEFORE = 10;

function computeLocalMeetingPhase(session, now) {
  const start = new Date(session.scheduledFor).getTime();
  const end = start + (session.durationMinutes || 30) * 60 * 1000;
  const readyAt = start - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000;
  if (now < readyAt) return 'scheduled';
  if (now < end + 15 * 60 * 1000) return 'joinable'; // covers "ready" and "in-progress" — both show the same Join button
  return 'ended';
}

function JoinMeetingButton({ session }) {
  const [now, setNow] = useState(Date.now());
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 13000);
    return () => clearInterval(id);
  }, []);

  const phase = computeLocalMeetingPhase(session, now);

  const handleJoin = async () => {
    setError('');
    setJoining(true);

    // Open the tab SYNCHRONOUSLY, still inside this click handler — Safari and
    // other browsers only allow window.open() to bypass the popup blocker when
    // it happens as a direct, immediate result of the user's tap. Fetching the
    // meeting link first and calling window.open() after an `await` breaks that
    // direct link, so the browser silently blocks it.
    // Deliberately NOT passing noopener/noreferrer here: per spec, window.open()
    // ALWAYS returns null when noopener is set — even when the tab opened fine —
    // which made the "meetingWindow ? redirect it : fall back" check below always
    // take the fallback path. We need a real handle to redirect later, so we open
    // without noopener now; the destination is always a domain we've already
    // validated (meet.google.com / zoom.us), so the small opener-access trade-off
    // is acceptable for a link we control the destination of.
    const meetingWindow = window.open('', '_blank');

    try {
      const details = await getMeetingDetails(session._id);
      if (!details.meetingLink) {
        meetingWindow?.close();
        setError('Meeting link not available yet.');
        return;
      }
      const providerLabel = details.meetingProvider === 'google-meet' ? 'Opening Google Meet…' : details.meetingProvider === 'zoom' ? 'Opening Zoom…' : 'Opening meeting link…';
      setError(providerLabel);

      // A plain navigation is the correct, portable way to hand off to Google
      // Meet/Zoom on both desktop and mobile — mobile browsers already launch
      // the installed app for these URLs via OS-level universal links, falling
      // back to the browser automatically when the app isn't installed.
      if (meetingWindow) {
        meetingWindow.location.href = details.meetingLink;
        setError('');
      } else {
        // The blank tab itself was genuinely blocked (aggressive popup blocker
        // settings) — nothing left to redirect, so fall back to a same-tab
        // navigation, which browsers always allow.
        window.location.href = details.meetingLink;
      }
    } catch (err) {
      meetingWindow?.close();
      // eslint-disable-next-line no-console
      console.error('[JoinMeeting] getMeetingDetails failed:', err.response?.status, err.response?.data || err.message);
      setError(err.response?.data?.message || 'Unable to open meeting. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  if (phase === 'scheduled') {
    return (
      <div className="text-right">
        <Button disabled variant="ghost" className="w-auto px-4 opacity-50 cursor-not-allowed">Scheduled</Button>
        <p className="text-[11px] text-gray-500 mt-1">You can join {JOIN_WINDOW_MINUTES_BEFORE} minutes before the scheduled time.</p>
      </div>
    );
  }

  if (phase === 'ended') {
    return <Button disabled variant="ghost" className="w-auto px-4 opacity-50 cursor-not-allowed">Meeting window ended</Button>;
  }

  return (
    <div className="text-right">
      <Button onClick={handleJoin} disabled={joining} className="w-auto px-4">
        {joining ? 'Joining…' : 'Join Meeting'}
      </Button>
      {error && <p className="text-[11px] text-gray-400 mt-1 max-w-[220px]">{error}</p>}
    </div>
  );
}

function PeerFeedbackForm({ sessionId, onDone }) {
  const [ratings, setRatings] = useState({ communicationRating: 0, technicalRating: 0, confidenceRating: 0, overallRating: 0 });
  const [strengths, setStrengths] = useState('');
  const [areasToImprove, setAreasToImprove] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setRating = (key, value) => setRatings((r) => ({ ...r, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!ratings.communicationRating || !ratings.technicalRating || !ratings.confidenceRating || !ratings.overallRating) {
      setError('Please rate all four categories before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitPeerFeedback(sessionId, { ...ratings, strengths, areasToImprove, additionalComments });
      setSubmitted(true);
      setTimeout(onDone, 1400);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="p-8 text-center max-w-lg">
        <div className="text-3xl mb-2">✅</div>
        <p className="font-semibold">Feedback submitted — thanks for helping a peer improve!</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-lg">
      <h3 className="font-bold mb-4">Peer Evaluation Feedback Form</h3>
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <StarRating label="Communication" value={ratings.communicationRating} onChange={(v) => setRating('communicationRating', v)} />
        <StarRating label="Technical Knowledge" value={ratings.technicalRating} onChange={(v) => setRating('technicalRating', v)} />
        <StarRating label="Confidence" value={ratings.confidenceRating} onChange={(v) => setRating('confidenceRating', v)} />
        <StarRating label="Overall" value={ratings.overallRating} onChange={(v) => setRating('overallRating', v)} />

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Strengths</label>
          <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60" rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Areas to improve</label>
          <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60" rows={2} value={areasToImprove} onChange={(e) => setAreasToImprove(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Additional comments</label>
          <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/60" rows={2} value={additionalComments} onChange={(e) => setAdditionalComments(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting} className="w-auto px-6">{submitting ? 'Submitting…' : 'Submit feedback'}</Button>
          <Button type="button" variant="ghost" onClick={onDone} className="w-auto px-5">Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

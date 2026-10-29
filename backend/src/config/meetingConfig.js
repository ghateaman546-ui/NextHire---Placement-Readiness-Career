/**
 * meetingConfig.js — single source of truth for peer-mock-interview meeting
 * behavior: how early a participant may join, which URL shapes are trusted
 * per provider, and how to compute a session's current meeting status.
 *
 * All values are configurable via environment variables so they aren't
 * hard-coded across the app (per the "make these values configurable"
 * requirement) — falls back to sensible defaults if unset.
 */

const JOIN_WINDOW_MINUTES_BEFORE = Number(process.env.PEER_MEETING_JOIN_WINDOW_MINUTES) || 10;
// How long after the scheduled end time a session is still considered "in progress"
// before we treat it as over (covers sessions that legitimately run a bit long).
const GRACE_PERIOD_MINUTES_AFTER = Number(process.env.PEER_MEETING_GRACE_PERIOD_MINUTES) || 15;

const MEETING_PROVIDERS = ['google-meet', 'zoom', 'custom'];

// Only these hosts are trusted for their respective provider — prevents a
// participant from pasting an arbitrary/malicious URL and having it presented
// as a legitimate Google Meet or Zoom link.
const TRUSTED_DOMAINS = {
  'google-meet': ['meet.google.com'],
  zoom: ['zoom.us', 'zoom.com'], // covers *.zoom.us (e.g. company.zoom.us) via suffix check below
};

/**
 * Validates a meeting URL is a well-formed, safe https(s) URL and, for
 * google-meet/zoom, that its host matches the provider's known domain.
 * Returns { valid: true } or { valid: false, message }.
 */
function isValidMeetingUrl(url, provider) {
  if (!url || typeof url !== 'string') return { valid: false, message: 'Meeting link is required.' };

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, message: 'Meeting link must be a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, message: 'Meeting link must use https://.' };
  }

  const host = parsed.hostname.toLowerCase();
  const trusted = TRUSTED_DOMAINS[provider];
  if (trusted && !trusted.some((d) => host === d || host.endsWith(`.${d}`))) {
    const label = provider === 'google-meet' ? 'Google Meet' : 'Zoom';
    return { valid: false, message: `That doesn't look like a real ${label} link (expected a ${trusted[0]} URL).` };
  }

  return { valid: true };
}

/**
 * Computes the current meeting status for a peer session from plain data
 * (no DB access) so it can be reused identically by any caller.
 * Returns one of: 'no-partner' | 'cancelled' | 'no-link' | 'scheduled' | 'ready' | 'in-progress' | 'ended' | 'completed'
 */
function computeMeetingStatus(session, now = new Date()) {
  if (session.status === 'cancelled') return 'cancelled';
  if (session.status === 'completed') return 'completed';
  if (session.status === 'open' || !session.partner) return 'no-partner';
  if (!session.meetingLink) return 'no-link';

  const start = new Date(session.scheduledFor).getTime();
  const end = start + (session.durationMinutes || 30) * 60 * 1000;
  const readyAt = start - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000;
  const nowMs = now.getTime();

  if (nowMs < readyAt) return 'scheduled';
  if (nowMs < end + GRACE_PERIOD_MINUTES_AFTER * 60 * 1000) return nowMs < start ? 'ready' : 'in-progress';
  return 'ended';
}

module.exports = {
  JOIN_WINDOW_MINUTES_BEFORE,
  GRACE_PERIOD_MINUTES_AFTER,
  MEETING_PROVIDERS,
  TRUSTED_DOMAINS,
  isValidMeetingUrl,
  computeMeetingStatus,
};

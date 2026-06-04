export function getSessionRemaining(extrapolatedClock, trackTime) {
  if (!extrapolatedClock?.Remaining || !trackTime) return null;
  const [h, m, s] = extrapolatedClock.Remaining.split(':').map(Number);
  const remaining = h * 3600 + m * 60 + s;
  if (!extrapolatedClock.Extrapolating) return remaining;
  const utcMs  = new Date(extrapolatedClock.Utc).getTime();
  const elapsed = (Number(trackTime) - utcMs) / 1000;
  return Math.max(0, remaining - elapsed);
}

export function formatSessionClock(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Returns the session StartDate as a UTC ms timestamp.
// GmtOffset can be "+08:00", "08:00:00", or "-05:30" etc.
export function sessionStartMs(sessionInfo) {
  const startDate = sessionInfo?.StartDate;
  if (!startDate) return null;
  const raw = sessionInfo?.GmtOffset ?? '00:00:00';
  const sign = raw.startsWith('-') ? -1 : 1;
  const [h, m] = raw.replace(/^[+-]/, '').split(':').map(Number);
  const offsetMin = sign * (h * 60 + m);
  // Build an ISO string with proper ±HH:MM suffix
  const pad = n => String(Math.abs(n)).padStart(2, '0');
  const isoOffset = `${sign >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`;
  return new Date(`${startDate}${isoOffset}`).getTime();
}

export function formatVenueTime(trackTime, gmtOffset) {
  if (!trackTime || !gmtOffset) return '—';
  const sign = gmtOffset.startsWith('-') ? -1 : 1;
  const [h, m, s = 0] = gmtOffset.replace(/^[+-]/, '').split(':').map(Number);
  const offsetMs = sign * (h * 3600 + m * 60 + s) * 1000;
  const local = new Date(Number(trackTime) + offsetMs);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}:${String(local.getUTCSeconds()).padStart(2, '0')}`;
}

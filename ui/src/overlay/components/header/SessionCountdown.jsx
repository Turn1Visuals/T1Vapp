import React, { useState, useEffect } from 'react';
import { findNextSession, formatCountdown } from '../../useSchedule.js';
import { sessionStartMs } from '../../../sessionClock.js';

export default function SessionCountdown({ sessions, clock, isLive, status, state, style }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let countdown = null;

  if (isLive || !status?.loaded) {
    // Waiting for live session — count down using event tracker schedule
    if (!sessions.length) return null;
    const next = findNextSession(sessions, Date.now());
    if (!next) return null;
    countdown = formatCountdown(next.startMs - Date.now());
  } else {
    // Playback — count down to session start using SessionInfo.StartDate vs trackTime
    const startMs = sessionStartMs(state?.SessionInfo);
    if (!startMs) return null;
    const nowMs = Number(clock?.trackTime ?? 0);
    if (!nowMs) return null;
    countdown = formatCountdown(startMs - nowMs);
  }

  if (!countdown) return null;

  return <span style={{ fontWeight: 700, ...style }}>{countdown}</span>;
}

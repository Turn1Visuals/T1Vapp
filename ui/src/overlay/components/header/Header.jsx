import React, { useState, useEffect } from 'react';
import EventInfo, { TrackStatusPill, getTrackStatusBg } from './EventInfo.jsx';
import WeatherGroup from './WeatherGroup.jsx';
import { getSessionRemaining, formatSessionClock, formatVenueTime } from '../../../sessionClock.js';
import Logo from '../Logo.jsx';
import SessionCountdown from './SessionCountdown.jsx';

const ACTIVE_STATUSES = new Set(['Started', 'Aborted']);

function isSessionActive(state) {
  return ACTIVE_STATUSES.has(state?.SessionStatus?.Status ?? '');
}

function isBetweenQualParts(state) {
  if (state?.SessionInfo?.Type !== 'Qualifying') return false;
  const timing = state?.TimingData?.Lines ?? {};
  return Object.values(timing).some(line => line.KnockedOut);
}

function Divider() {
  return <span style={{ width: 1, height: '1.2em', background: 'rgba(255,255,255,0.6)', flexShrink: 0 }} />;
}

function LocalTime({ state, clock }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const time = formatVenueTime(clock?.trackTime ?? Date.now(), state?.SessionInfo?.GmtOffset);
  if (time === '—') return null;
  return <span>{time.slice(0, 5)}</span>;
}

export default function Header({ state, clock, status, sessions = [] }) {
  const statusColor = getTrackStatusBg(state) ?? '#ffffff';
  const remaining   = formatSessionClock(getSessionRemaining(state?.ExtrapolatedClock, clock?.trackTime));

  return (
    <div style={{
      width: '100%', height: 56,
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      background: 'rgba(0,0,0,0.75)',
      padding: '0 20px', boxSizing: 'border-box',
      borderBottom: '2px solid var(--session-color, #e10600)',
    }}>

      {/* Left */}
      <EventInfo state={state} style={{ fontWeight: 600 }} />

      {/* Center */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: statusColor, fontWeight: 700 }}>{remaining}</span>
        <TrackStatusPill state={state} />
        {!isSessionActive(state) && !isBetweenQualParts(state) && <SessionCountdown sessions={sessions} clock={clock} isLive={status?.live} status={status} state={state} />}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
        <LocalTime state={state} clock={clock} />
        <Divider />
        <WeatherGroup state={state} style={{ textAlign: 'center', minWidth: 80 }} />
        <Divider />
        <Logo height={28} />
      </div>

    </div>
  );
}

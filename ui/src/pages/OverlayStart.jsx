import React, { useState, useEffect } from 'react';
import LogoLong from '../overlay/components/LogoLong.jsx';
import { useSchedule, findNextSession, formatCountdown } from '../overlay/useSchedule.js';
import { useTiming } from '../hooks/useTiming.js';
import { getSessionColorFromLabel } from '../overlay/sessionColor.js';
import { buildTrackSvgUrl, buildTrackSvgUrlFromPublicId } from '../overlay/circuitAssets.js';
import { sessionStartMs } from '../sessionClock.js';
import '../overlay/overlay.css';

const debug = new URLSearchParams(window.location.search).has('debug');

function useEventMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    fetch('/f1/event-tracker')
      .then(r => r.json())
      .then(data => setMeta({
        meetingName:     data.race?.meetingName        ?? '',
        meetingLocation: data.race?.meetingLocation    ?? '',
        roundText:       data.race?.roundText          ?? '',
        trackImageId:    data.circuitImage?.public_id  ?? null,
        circuitKey:      data.circuitKey               ?? null,
      }))
      .catch(() => {});
  }, []);
  return meta;
}

function TrackOutline({ url, style }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      style={{ height: 180, filter: 'invert(1)', objectFit: 'contain', ...style }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function CountdownBox({ sessions, color, status, state, clock }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let countdown = null;

  if (status?.loaded && !status?.live) {
    const startMs = sessionStartMs(state?.SessionInfo);
    const nowMs   = Number(clock?.trackTime ?? 0);
    if (startMs && nowMs) countdown = formatCountdown(startMs - nowMs);
  } else {
    const next = findNextSession(sessions, Date.now());
    countdown = next ? formatCountdown(next.startMs - Date.now()) : null;
  }

  return (
    <div style={{
      display: 'inline-block',
      border: `2px solid ${color}`,
      padding: '14px 48px',
      fontSize: '3em',
      fontWeight: 700,
      letterSpacing: '0.04em',
      minWidth: 220,
      textAlign: 'center',
    }}>
      {countdown ?? 'Starting shortly'}
    </div>
  );
}

export default function OverlayStart() {
  const sessions = useSchedule();
  const liveMeta = useEventMeta();
  const { state, clock, status } = useTiming({ autoConnect: true });

  const isPlayback = status?.loaded && !status?.live;
  const si         = state?.SessionInfo;

  // If F1 Live session date doesn't match today, it's stale — use schedule data instead
  const isF1LiveStale = si?.StartDate ? (si.StartDate.split('T')[0] !== new Date().toISOString().split('T')[0]) : false;
  const useF1Live = si && !isF1LiveStale;

  const meetingName = useF1Live && si?.Meeting?.Name
    ? si.Meeting.Name.replace('Grand Prix', 'GP')
    : liveMeta?.meetingName ?? '';

  const meetingLocation = useF1Live
    ? (si?.Meeting?.Country?.Name ?? si?.Meeting?.Location ?? '')
    : (liveMeta?.meetingLocation ?? '');

  const roundText = useF1Live && si?.Meeting?.Number
    ? `Round ${si.Meeting.Number}`
    : (liveMeta?.roundText ?? '');

  const nextSession = findNextSession(sessions, Date.now());
  const circuitKey = liveMeta?.circuitKey ?? null;
  const bgUrl = circuitKey ? `/circuits/${circuitKey}.jpg` : null;

  const trackSvgUrl = buildTrackSvgUrlFromPublicId(liveMeta?.trackImageId);

  const color = getSessionColorFromLabel(nextSession?.label);

  return (
    <div className="overlay-root" style={{
      width: '100vw', height: '100vh',
      background: 'transparent', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      '--session-color': color,
    }}>
      <div style={{
        width: 1920, height: 1080,
        position: 'relative', overflow: 'hidden',
        outline: debug ? '2px solid rgba(255,0,0,0.6)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a',
      }}>

        {bgUrl && (
          <img src={bgUrl} alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 64 }}>

          <LogoLong height={44} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <TrackOutline url={trackSvgUrl} />

            {(meetingLocation || roundText) && (
              <div style={{ textAlign: 'center', fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-muted)' }}>
                {[roundText, meetingLocation?.toUpperCase()].filter(Boolean).join(' · ')}
              </div>
            )}

            {meetingName && (
              <div style={{ textAlign: 'center', fontSize: '3em', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1 }}>
                {meetingName}
              </div>
            )}

            {nextSession?.label && (
              <div style={{
                background: color, color: '#fff',
                padding: '6px 24px', fontWeight: 700,
                fontSize: '1em', letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                {nextSession.label}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-muted)' }}>
              LIVE TIMING WATCH ALONG
            </div>
            <CountdownBox sessions={sessions} color={color} status={status} state={state} clock={clock} />
          </div>

        </div>
      </div>
    </div>
  );
}

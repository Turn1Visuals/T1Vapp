import React, { useState, useEffect } from 'react';
import LogoLong from '../overlay/components/LogoLong.jsx';
import { useSchedule, findCurrentSession } from '../overlay/useSchedule.js';
import { useTiming } from '../hooks/useTiming.js';
import { getSessionColorFromLabel } from '../overlay/sessionColor.js';
import { buildTrackSvgUrl, buildTrackSvgUrlFromPublicId } from '../overlay/circuitAssets.js';
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

function TrackOutline({ url }) {
  if (!url) return null;
  return (
    <img src={url} alt=""
      style={{ height: 180, filter: 'invert(1)', objectFit: 'contain' }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

export default function OverlayEnd() {
  const sessions = useSchedule();
  const liveMeta = useEventMeta();
  const { state, status } = useTiming({ autoConnect: true });

  const isPlayback = status?.loaded && !status?.live;
  const si         = state?.SessionInfo;

  const meetingName = isPlayback && si?.Meeting?.Name
    ? si.Meeting.Name.replace('Grand Prix', 'GP')
    : liveMeta?.meetingName ?? '';

  const meetingLocation = isPlayback && si?.Meeting?.Country?.Name
    ? si.Meeting.Country.Name
    : (isPlayback && si?.Meeting?.Location ? si.Meeting.Location : (liveMeta?.meetingLocation ?? ''));

  const roundText = isPlayback && si?.Meeting?.Number
    ? `Round ${si.Meeting.Number}`
    : (liveMeta?.roundText ?? '');

  const sessionLabel = isPlayback && si?.Name
    ? si.Name
    : findCurrentSession(sessions, Date.now())?.label ?? null;

  const circuitKey = si?.Meeting?.Circuit?.Key ?? liveMeta?.circuitKey ?? null;

  const bgUrl       = circuitKey ? `/circuits/${circuitKey}.jpg` : null;
  const trackSvgUrl = isPlayback
    ? buildTrackSvgUrl(si)
    : buildTrackSvgUrlFromPublicId(liveMeta?.trackImageId);
  const color        = getSessionColorFromLabel(sessionLabel);

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

            {sessionLabel && (
              <div style={{
                background: color, color: '#fff',
                padding: '6px 24px', fontWeight: 700,
                fontSize: '1em', letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                {sessionLabel}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: '2em', fontWeight: 700, letterSpacing: '0.08em' }}>
            THANK YOU FOR WATCHING
          </div>

        </div>
      </div>
    </div>
  );
}

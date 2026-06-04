import React from 'react';
import countries from 'i18n-iso-countries';

const TRACK_STATUS = {
  '1': { text: 'Track Clear',   bg: '#00c853', color: '#111' },
  '2': { text: 'Yellow Flag',   bg: '#ffd600', color: '#111' },
  '4': { text: 'Safety Car',    bg: '#ff9100', color: '#111' },
  '5': { text: 'Red Flag',      bg: '#ff1744', color: '#fff' },
  '6': { text: 'VSC Deployed',  bg: '#ff9100', color: '#111' },
  '7': { text: 'VSC Ending',    bg: '#ff9100', color: '#111' },
};

const IOC_TO_ALPHA2 = {
  UAE:'AE', KSA:'SA', NED:'NL', MON:'MC', SIN:'SG', GER:'DE', SUI:'CH',
  RSA:'ZA', DEN:'DK', SWE:'SE', NOR:'NO', FIN:'FI', GRE:'GR', POR:'PT',
  CRO:'HR', SRB:'RS', ROU:'RO', BUL:'BG', SLO:'SI', SVK:'SK', CZE:'CZ',
  HKG:'HK', TPE:'TW',
};

function toAlpha2(code) {
  const raw = String(code ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (IOC_TO_ALPHA2[raw]) return IOC_TO_ALPHA2[raw];
  if (/^[A-Z]{3}$/.test(raw)) {
    const c = countries.alpha3ToAlpha2(raw);
    return c ? String(c).toUpperCase() : '';
  }
  return '';
}

export function getTrackStatus(state) {
  const code = String(state?.TrackStatus?.Status ?? '').trim();
  return TRACK_STATUS[code] ?? null;
}

export function getTrackStatusBg(state) {
  return getTrackStatus(state)?.bg ?? null;
}

export function TrackStatusPill({ state, style }) {
  const s = getTrackStatus(state);
  if (!s) return null;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 3, fontWeight: 700, whiteSpace: 'nowrap', ...style }}>
      {s.text}
    </span>
  );
}

function QualPart({ state }) {
  const type = state?.SessionInfo?.Type ?? '';
  const name = state?.SessionInfo?.Name ?? '';
  if (type !== 'Qualifying') return null;

  const part = state?.TopThree?.SessionPart
    ?? (() => {
      const series = state?.SessionData?.Series;
      if (!Array.isArray(series)) return null;
      for (let i = series.length - 1; i >= 0; i--) {
        const p = series[i].QualifyingPart;
        if (p >= 1 && p <= 3) return p;
      }
      return null;
    })();

  if (!part) return null;
  const prefix = name === 'Sprint Qualifying' ? 'SQ' : 'Q';
  return <Badge>{prefix}{part}</Badge>;
}

function PracticePart({ sessionName }) {
  const m = /^Practice (\d+)$/.exec(sessionName ?? '');
  if (!m) return null;
  return <Badge>FP{m[1]}</Badge>;
}

function LapCount({ state }) {
  if (state?.SessionInfo?.Type !== 'Race') return null;
  const current = state?.LapCount?.CurrentLap;
  const total   = state?.LapCount?.TotalLaps;
  if (current == null || total == null) return null;

  const status = state?.SessionStatus?.Status ?? '';
  const done   = status === 'Finished' || status === 'Finalised'
    || Object.values(state?.TimingData?.Lines ?? {}).some(l => l.TakenChequered);

  if (done) return <Badge>Chequered Flag</Badge>;
  const left = total - current + 1;
  return <Badge>Lap {current}/{total} {left === 1 ? '(Final Lap)' : `(${left} left)`}</Badge>;
}

function Badge({ children }) {
  return (
    <span style={{ background: 'var(--session-color, #e10600)', color: '#fff', padding: '2px 8px', borderRadius: 3, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function EventInfo({ state, style }) {
  const info        = state?.SessionInfo ?? {};
  const eventName   = (info.Meeting?.Name ?? info.Name ?? '—').replace('Grand Prix', 'GP');
  const rawSessionName = info.Name ?? '—';
  const sessionName    = rawSessionName.replace(/^Practice \d+$/, 'Practice');
  const alpha2      = toAlpha2(info.Meeting?.Country?.Code).toLowerCase();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', ...style }}>
      {alpha2 && <span className={`fi fi-${alpha2}`} style={{ flexShrink: 0, borderRadius: 2 }} />}
      <span>{eventName}</span>
      <span style={{ color: 'var(--color-dimmed)' }}>•</span>
      <span style={{ fontWeight: 400 }}>{sessionName}</span>
      <PracticePart sessionName={rawSessionName} />
      <QualPart state={state} />
      <LapCount state={state} />
    </div>
  );
}

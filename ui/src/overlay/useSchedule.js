import { useEffect, useState } from 'react';

// ── Jolpica fallback ──────────────────────────────────────────────────────────

const JOLPICA_URL = 'https://api.jolpi.ca/ergast/f1/2026.json';

const SESSION_LABELS = {
  FirstPractice: 'Practice 1', SecondPractice: 'Practice 2', ThirdPractice: 'Practice 3',
  SprintQualifying: 'Sprint Qualifying', Sprint: 'Sprint', Qualifying: 'Qualifying',
};

const COUNTRY_TO_ALPHA2 = {
  Australia: 'AU', China: 'CN', Japan: 'JP', Bahrain: 'BH',
  'Saudi Arabia': 'SA', 'United States': 'US', USA: 'US', Italy: 'IT',
  Monaco: 'MC', Canada: 'CA', Spain: 'ES', Austria: 'AT',
  'United Kingdom': 'GB', UK: 'GB', Hungary: 'HU', Belgium: 'BE',
  Netherlands: 'NL', Singapore: 'SG', Azerbaijan: 'AZ',
  Mexico: 'MX', Brazil: 'BR', Qatar: 'QA', 'United Arab Emirates': 'AE', UAE: 'AE',
};

async function fetchJolpica() {
  const data  = await fetch(JOLPICA_URL).then(r => r.json());
  const races = data?.MRData?.RaceTable?.Races ?? [];
  const sessions = [];
  for (const race of races) {
    const country = race.Circuit?.Location?.country ?? '';
    for (const [key, label] of Object.entries(SESSION_LABELS)) {
      if (race[key]) {
        const { date, time } = race[key];
        sessions.push({ startMs: new Date(`${date}T${time}`).getTime(), label, raceName: race.raceName.replace('Grand Prix', 'GP'), countryCode: COUNTRY_TO_ALPHA2[country] ?? '', gmtOffset: null, state: null });
      }
    }
    if (race.date && race.time) {
      sessions.push({ startMs: new Date(`${race.date}T${race.time}`).getTime(), label: 'Race', raceName: race.raceName.replace('Grand Prix', 'GP'), countryCode: COUNTRY_TO_ALPHA2[country] ?? '', gmtOffset: null, state: null });
    }
  }
  return sessions.sort((a, b) => a.startMs - b.startMs);
}

function buildSessionList(data) {
  const timetables = data?.seasonContext?.timetables ?? [];
  const race       = data?.race ?? {};
  return timetables.map(t => ({
    startMs:     new Date(`${t.startTime}${t.gmtOffset}`).getTime(),
    endMs:       new Date(`${t.endTime}${t.gmtOffset}`).getTime(),
    label:       t.description,      // "Practice 1", "Qualifying", etc.
    raceName:    (race.meetingName ?? '').replace('Grand Prix', 'GP'),
    countryCode: race.meetingCountryCode ?? '', // alpha3, e.g. "JPN"
    gmtOffset:   t.gmtOffset,        // "+09:00"
    state:       t.state,            // "upcoming" | "live" | "completed"
  }));
}

export function findNextSession(sessions, nowMs) {
  return sessions.find(s => s.startMs > nowMs) ?? null;
}

export function findCurrentSession(sessions, nowMs) {
  const started = sessions.filter(s => s.startMs <= nowMs);
  return started[started.length - 1] ?? null;
}

export function formatCountdown(ms) {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  if (m > 0) return `${m}:${pad(s)}`;
  return `${s}s`;
}

// Builds a minimal SessionInfo-compatible state from an event tracker session.
// Used as fallback before real F1 data arrives.
export function buildFallbackState(session) {
  if (!session) return null;
  return {
    SessionInfo: {
      Name:      session.label,
      GmtOffset: session.gmtOffset,
      Meeting: {
        Name:    session.raceName,
        Country: { Code: session.countryCode },
      },
    },
  };
}

// Fetches current/next meeting from F1 event tracker, falls back to Jolpica
export function useSchedule() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetch('/f1/event-tracker')
      .then(r => r.json())
      .then(data => {
        if (data?.error) throw new Error(data.error);
        console.log('[schedule] using F1 event tracker');
        setSessions(buildSessionList(data));
      })
      .catch(err => {
        console.warn('[schedule] F1 event tracker failed:', err.message, '— falling back to Jolpica');
        fetchJolpica().then(s => { console.log('[schedule] using Jolpica fallback'); setSessions(s); }).catch(() => {});
      });
  }, []);

  return sessions;
}

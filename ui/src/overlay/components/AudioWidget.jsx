import { useRef, useEffect, useCallback, useState, createContext, useContext } from 'react';
import { isOnHotLap, parseTime } from '../../qualifyingUtils';

export const AudioContext = createContext();

// Fixed phrases — pre-generated on mount via /tts/warmup
const FIXED_PHRASES = [
  "It's lights out, and away we go!",
  'Safety car deployed.',
  'Safety car in this lap.',
  'Virtual safety car deployed.',
  'Virtual safety car ending.',
  'Red flag!',
  'Aborted start!',
  'Q1 is underway!', 'Q2 is underway!', 'Q3 is underway!',
  'Q1 has resumed.', 'Q2 has resumed.', 'Q3 has resumed.',
  'SQ1 is underway!', 'SQ2 is underway!', 'SQ3 is underway!',
  'SQ1 has resumed.', 'SQ2 has resumed.', 'SQ3 has resumed.',
  'Chequered flag!',
];

const DEDUP_MS = 10_000; // ignore same key within this window

export default function AudioWidget({ state }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);

  // ── Queue ────────────────────────────────────────────────────────────────────
  const dedupRef    = useRef(new Map()); // key → last enqueue time

  useEffect(() => {
    if (!queue.length || isPlaying) return;

    const text = queue[0];
    console.log('[audio] Playing:', text);
    setIsPlaying(true);
    const audio = new Audio(`/tts?text=${encodeURIComponent(text)}`);

    const playNext = () => {
      setQueue(q => q.slice(1));
      setIsPlaying(false);
    };

    audio.onended = playNext;
    audio.onerror = () => {
      console.warn('[audio] TTS error, skipping');
      playNext();
    };
    audio.play().catch(() => {
      console.warn('[audio] Play failed');
      playNext();
    });
  }, [queue, isPlaying]);

  const enqueue = useCallback((key, text) => {
    const now  = Date.now();
    const last = dedupRef.current.get(key) ?? 0;
    if (now - last < DEDUP_MS) return;
    dedupRef.current.set(key, now);
    setQueue(q => [...q, text]);
  }, []);

  // ── Warmup ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/tts/warmup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phrases: FIXED_PHRASES }),
    }).catch(() => {});
  }, []);

  // ── F1 state tracking refs ───────────────────────────────────────────────────
  const prevStatusRef      = useRef(null);
  const prevPartRef        = useRef(null);
  const prevMsgCountRef    = useRef(null);
  const announcedKORef     = useRef(new Set());
  const announcedQualParts = useRef(new Set());
  const announcedWinnerRef = useRef(null); // stores announced driver num, null = not yet announced
  const announcedPoleRef   = useRef(null); // stores announced driver num, null = not yet announced
  const poleCheckRef       = useRef(false);
  const initializedRef     = useRef(false);

  // ── Event detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state) return;

    let flagJustFired = false;

    const si       = state.SessionInfo;
    const status   = state.SessionStatus?.Status ?? null;
    const part     = state.SessionPart ?? null;
    const msgs     = state.RaceControlMessages?.Messages;
    const timing   = state.TimingData?.Lines ?? {};
    const drivers  = state.DriverList ?? {};

    const isRace       = si?.SessionEvent === 'race';
    const isQual       = si?.Type === 'Qualifying';
    const isSprintQual = isQual && si?.Name === 'Sprint Qualifying';
    const isSprint     = isRace && si?.Name === 'Sprint';
    const raceName     = () => {
      const base = si?.Meeting?.Name ?? 'the race';
      return isSprint ? base.replace('Grand Prix', 'Sprint') : base;
    };

    // Skip announcements on first state snapshot
    if (!initializedRef.current) {
      prevStatusRef.current   = status;
      prevPartRef.current     = part;
      prevMsgCountRef.current = msgs ? Object.keys(msgs).length : 0;
      // Mark all currently KO'd drivers as already announced
      for (const [num, line] of Object.entries(timing)) {
        if (line.KnockedOut) announcedKORef.current.add(num);
      }
      // If already mid-qualifying, mark current part as previously announced
      if (isQual && part != null && status === 'Started') {
        announcedQualParts.current.add(`${isSprintQual ? 'SQ' : 'Q'}${part}`);
      }
      // If race already finished, seed winner with current P1 (don't re-announce on load)
      if (isRace && status === 'Finished') {
        const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
        announcedWinnerRef.current = p1num;
      }
      // If qualifying already finished, seed pole with current P1 (don't re-announce on load)
      if (isQual && status === 'Finished' && part === 3) {
        const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
        announcedPoleRef.current = p1num;
      }
      initializedRef.current = true;
      return;
    }

    // ── Session status ────────────────────────────────────────────────────────
    if (status !== prevStatusRef.current) {
      prevStatusRef.current = status;
      if (status === 'Started') {
        if (isRace) {
          enqueue('lights-out', "It's lights out, and away we go!");
        } else if (isQual) {
          const prefix  = isSprintQual ? 'SQ' : 'Q';
          const num     = part ?? 1;
          const label   = `${prefix}${num}`;
          const partKey = `${prefix}${num}`;
          const resumed = announcedQualParts.current.has(partKey);
          const text    = resumed ? `${label} has resumed.` : `${label} is underway!`;
          announcedQualParts.current.add(partKey);
          enqueue(`qual-started-${partKey}`, text);
        }
      }
      if (status === 'Finished' && isQual && part === 3 && !announcedPoleRef.current && !poleCheckRef.current) {
        // Fallback if chequered flag RCM was missed
        poleCheckRef.current = true;
        flagJustFired = true;
      }
      if (status === 'Finished' && isRace && announcedWinnerRef.current === null) {
        announceWinner(); // Fallback if chequered RCM was missed
      }
    }

    // ── Race control messages ─────────────────────────────────────────────────
    if (msgs) {
      const msgArr    = Array.isArray(msgs) ? msgs : Object.values(msgs);
      const count     = msgArr.length;
      const prevCount = prevMsgCountRef.current ?? count;
      prevMsgCountRef.current = count;

      for (const msg of msgArr.slice(prevCount)) {
        const cat    = msg.Category ?? '';
        const flag   = msg.Flag     ?? '';
        const status = msg.Status   ?? '';
        const mode   = msg.Mode     ?? '';
        const text   = String(msg.Message ?? '').toLowerCase();

        if (cat === 'SafetyCar') {
          const isVsc = mode === 'VSC';
          if (isVsc) {
            if (status === 'ENDING')        enqueue('vsc-ending', 'Virtual safety car ending.');
            else if (status === 'DEPLOYED') enqueue('vsc',        'Virtual safety car deployed.');
          } else {
            if (status === 'IN THIS LAP')   enqueue('sc-ending',  'Safety car in this lap.');
            else if (status === 'DEPLOYED') enqueue('sc',         'Safety car deployed.');
          }
        }
        else if (cat === 'Flag') {
          if (flag === 'RED') enqueue('red-flag', 'Red flag!');
          else if (flag === 'CHEQUERED' && !isRace) {
            enqueue('chequered', 'Chequered flag!');
            if (part === 3 && announcedPoleRef.current === null) {
              poleCheckRef.current = true;
              flagJustFired = true;
            }
          }
          else if (flag === 'CHEQUERED' && isRace && announcedWinnerRef.current === null) {
            announceWinner();
          }
        }
        else if (text.includes('aborted') || text.includes('abort')) {
          enqueue('aborted-start', 'Aborted start!');
        }
      }
    }

    // ── KO detection (qualifying) ─────────────────────────────────────────────
    const newKO = [];
    for (const [num, line] of Object.entries(timing)) {
      if (line.KnockedOut && !announcedKORef.current.has(num)) {
        announcedKORef.current.add(num);
        const driver = drivers[num];
        if (driver) newKO.push({ name: driver.LastName ?? driver.Tla ?? num, pos: Number(line.Position ?? 99) });
      }
    }
    if (newKO.length) {
      newKO.sort((a, b) => a.pos - b.pos);
      const names  = newKO.length === 1
        ? newKO[0].name
        : `${newKO.slice(0, -1).map(d => d.name).join(', ')} and ${newKO.at(-1).name}`;
      const verb   = newKO.length === 1 ? 'is' : 'are';
      const prefix = isSprintQual ? 'SQ' : 'Q';
      const nextPart = part != null ? `${prefix}${part}` : null;
      const text   = nextPart
        ? `${names} ${verb} eliminated from ${nextPart}.`
        : `${names} ${verb} eliminated.`;
      enqueue(`ko-${newKO.join('-')}`, text);
    }

    // ── Race winner ───────────────────────────────────────────────────────────
    function announceWinner() {
      const p1num  = Object.keys(timing).find(n => Number(timing[n].Position) === 1);
      const driver = p1num ? drivers[p1num] : null;
      if (!driver) return;
      announcedWinnerRef.current = p1num;
      const name    = driver.LastName ?? driver.Tla ?? 'Unknown';
      const meeting = raceName();
      enqueue('winner', `${name} wins the ${meeting}!`);
    }

    // Re-announce if P1 changed after winner announcement (e.g. penalty)
    if (announcedWinnerRef.current !== null && isRace) {
      const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
      if (p1num && p1num !== announcedWinnerRef.current) announceWinner();
    }

    // ── Pole position ─────────────────────────────────────────────────────────
    function announcePole() {
      const p1num  = Object.keys(timing).find(n => Number(timing[n].Position) === 1);
      const driver = p1num ? drivers[p1num] : null;
      if (!driver) return;
      announcedPoleRef.current = p1num;
      poleCheckRef.current     = false;
      const name    = driver.LastName ?? driver.Tla ?? 'Unknown';
      const meeting = si?.Meeting?.Name ?? 'qualifying';
      const text    = isSprintQual
        ? `${name} takes sprint pole for the ${meeting.replace('Grand Prix', 'Sprint')}!`
        : `${name} takes pole position for the ${meeting}!`;
      enqueue('pole', text);
    }

    // Wait for all hot laps to complete after chequered flag
    if (poleCheckRef.current && announcedPoleRef.current === null && !flagJustFired) {
      const p1num    = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
      const refS1Sec = parseTime(state.BestLapSectors?.[p1num]?.S1 ?? null);
      const anyOnHotLap = Object.values(timing).some(line => isOnHotLap(line, refS1Sec));
      if (!anyOnHotLap) announcePole();
    }

    // Re-announce if P1 changed after a lap deletion
    if (announcedPoleRef.current !== null && isQual && part === 3) {
      const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
      if (p1num && p1num !== announcedPoleRef.current) announcePole();
    }

  }, [state, enqueue]);

  // Provider is wrapped around overlay at higher level, just track state here
  return null;
}

export function AudioProvider({ children }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const dedupRef = useRef(new Map());

  useEffect(() => {
    if (!queue.length || isPlaying) return;

    const text = queue[0];
    console.log('[audio] Playing:', text);
    setIsPlaying(true);
    const audio = new Audio(`/tts?text=${encodeURIComponent(text)}`);

    const playNext = () => {
      setQueue(q => q.slice(1));
      setTimeout(() => setIsPlaying(false), 2000);
    };

    audio.onended = playNext;
    audio.onerror = () => {
      console.warn('[audio] TTS error, skipping');
      playNext();
    };
    audio.play().catch(() => {
      console.warn('[audio] Play failed');
      playNext();
    });
  }, [queue, isPlaying]);

  const enqueue = useCallback((key, text) => {
    const now = Date.now();
    const last = dedupRef.current.get(key) ?? 0;
    if (now - last < DEDUP_MS) return;
    dedupRef.current.set(key, now);
    setQueue(q => [...q, text]);
  }, []);

  return (
    <AudioContext.Provider value={{ isPlaying, enqueue }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudioState() {
  const context = useContext(AudioContext);
  return context?.isPlaying ?? false;
}

export function useEnqueueAudio() {
  const context = useContext(AudioContext);
  return context?.enqueue ?? (() => {});
}

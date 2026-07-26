import React from 'react';
import { useTiming } from '../hooks/useTiming.js';
import Header from '../overlay/components/header/Header.jsx';
import Controls from '../components/Controls.jsx';
import TrackMapOverlay from '../overlay/components/TrackMapOverlay.jsx';
import TimingTableOverlay from '../overlay/components/TimingTableOverlay.jsx';
import RaceControlWidget from '../overlay/components/RaceControlWidget.jsx';
import PracticeWidget from '../overlay/components/PracticeWidget.jsx';
import QualifyingLapWidget from '../overlay/components/QualifyingLapWidget.jsx';
import PitLaneWidget from '../overlay/components/PitLaneWidget.jsx';
import DriverStandingsWidget from '../overlay/components/DriverStandingsWidget.jsx';
import BattleWidget from '../overlay/components/BattleWidget.jsx';
import { AudioProvider, useEnqueueAudio } from '../overlay/components/AudioWidget.jsx';
import Commentator from '../overlay/components/Commentator.jsx';
import { getSessionColor } from '../overlay/sessionColor.js';
import useHotLaps from '../overlay/useHotLaps.js';
import { useSchedule, findNextSession, buildFallbackState } from '../overlay/useSchedule.js';
import '../overlay/overlay.css';

const debug = new URLSearchParams(window.location.search).has('debug');
const showStandings = new URLSearchParams(window.location.search).get('standings') !== '0';

function useCircuitKey(state) {
  const [etKey, setEtKey] = React.useState(null);
  React.useEffect(() => {
    fetch('/f1/event-tracker')
      .then(r => r.json())
      .then(d => setEtKey(d.circuitKey ?? null))
      .catch(() => {});
  }, []);
  return state?.SessionInfo?.Meeting?.Circuit?.Key ?? etKey ?? null;
}

function OverlayContent() {
  const { state, clock, status, positionFrames } = useTiming({ autoConnect: true });
  const sessions = useSchedule();
  const circuitKey = useCircuitKey(state);
  const enqueue = useEnqueueAudio();

  // Before F1 data arrives, derive event/session info from Jolpica schedule
  const nextSession   = findNextSession(sessions, Date.now());
  const fallbackState = buildFallbackState(nextSession);
  const effectiveState = state?.SessionInfo ? state : (fallbackState ?? state);

  // Use the enqueue function from context instead of creating a local one
  // The rest of the announcement logic remains the same
  const prevStatusRef      = React.useRef(null);
  const prevPartRef        = React.useRef(null);
  const prevMsgCountRef    = React.useRef(null);
  const announcedKORef     = React.useRef(new Set());
  const announcedQualParts = React.useRef(new Set());
  const announcedWinnerRef = React.useRef(null);
  const announcedPoleRef   = React.useRef(null);
  const poleCheckRef       = React.useRef(false);
  const initializedRef     = React.useRef(false);

  // Shared hot-lap detection (same logic as QualifyingLapWidget)
  const { entries: hotLapEntries } = useHotLaps(state);
  const hotLapsRef = React.useRef([]);
  hotLapsRef.current = hotLapEntries;

  React.useEffect(() => {
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
    const isPractice   = si?.Type === 'Practice';
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
      for (const [num, line] of Object.entries(timing)) {
        if (line.KnockedOut) announcedKORef.current.add(num);
      }
      if (isQual && part != null && status === 'Started') {
        announcedQualParts.current.add(`${isSprintQual ? 'SQ' : 'Q'}${part}`);
      }
      if (isRace && status === 'Finished') {
        const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
        announcedWinnerRef.current = p1num;
      }
      if (isQual && status === 'Finished' && part === 3) {
        const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
        announcedPoleRef.current = p1num;
      }
      initializedRef.current = true;
      return;
    }

    // Session status
    if (status !== prevStatusRef.current) {
      prevStatusRef.current = status;
      if (status === 'Started') {
        if (isRace) {
          enqueue('lights-out', "It's lights out, and away we go!");
        } else if (isPractice) {
          const num     = part ?? 1;
          const label   = `FP${num}`;
          const partKey = `FP${num}`;
          const resumed = announcedQualParts.current.has(partKey);
          const text    = resumed ? `${label} has resumed.` : `${label} is underway!`;
          announcedQualParts.current.add(partKey);
          enqueue(`practice-started-${partKey}`, text);
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
        poleCheckRef.current = true;
        flagJustFired = true;
      }
      if (status === 'Finished' && isRace && announcedWinnerRef.current === null) {
        announceWinner();
      }
    }

    // Race control messages
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

    // KO detection
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

    // Race winner
    function announceWinner() {
      const p1num  = Object.keys(timing).find(n => Number(timing[n].Position) === 1);
      const driver = p1num ? drivers[p1num] : null;
      if (!driver) return;
      announcedWinnerRef.current = p1num;
      const name    = driver.LastName ?? driver.Tla ?? 'Unknown';
      const meeting = raceName();
      enqueue('winner', `${name} wins the ${meeting}!`);
    }

    if (announcedWinnerRef.current !== null && isRace) {
      const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
      if (p1num && p1num !== announcedWinnerRef.current) announceWinner();
    }

    // Pole position
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

    // Announce only once the flag is out in (S)Q3 and nobody is still on a hot lap
    const anyOnHotLap = hotLapsRef.current.some(e => !e.isCompleted);

    if (poleCheckRef.current && announcedPoleRef.current === null && !flagJustFired
        && part === 3 && !anyOnHotLap) {
      announcePole();
    }

    // Re-announce if P1 changed after the announcement (e.g. lap deletion)
    if (announcedPoleRef.current !== null && isQual && part === 3 && !anyOnHotLap) {
      const p1num = Object.keys(timing).find(n => Number(timing[n].Position) === 1) ?? null;
      if (p1num && p1num !== announcedPoleRef.current) announcePole();
    }

  }, [state, enqueue]);

  return (
    <div className="overlay-root" style={{ width: '100vw', height: '100vh', background: 'transparent', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 1920, height: 1080,
        position: 'relative', overflow: 'hidden',
        outline: debug ? '2px solid rgba(255,0,0,0.6)' : 'none',
        display: 'grid', gridTemplateRows: 'auto 1fr',
        '--session-color': getSessionColor(effectiveState),
      }}>
        {circuitKey && (
          <img src={`/circuits/${circuitKey}.jpg`} alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, zIndex: -1 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: -1 }} />
        <Header state={effectiveState} clock={clock} status={status} sessions={sessions} />

        {/* Main layout */}
        <main style={{ display: 'flex', flexDirection: 'row', overflow: 'hidden', height: '100%' }}>

          {/* Col 1 — timing table (fit-content width) */}
          <div style={{ flexShrink: 0, padding: 12, outline: debug ? '1px solid #4499ff' : 'none', overflow: 'hidden' }}>
            <TimingTableOverlay state={state} />
          </div>

          {/* Col 2 — track map + session widgets (fills remaining) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: debug ? '1px solid #4499ff' : 'none' }}>

            {/* Track map (flex 5) */}
            <div style={{ flex: 5, padding: 12, overflow: 'hidden', outline: debug ? '1px solid #4499ff' : 'none' }}>
              <TrackMapOverlay state={state} clock={clock} positionFrames={positionFrames} />
            </div>

            {/* Session widgets (flex 3) */}
            <div style={{ flex: 3, padding: 12, overflow: 'hidden', outline: debug ? '1px solid #4499ff' : 'none' }}>
              <div style={{ position: 'relative', height: '100%' }}>
                <PracticeWidget state={state} />
                <QualifyingLapWidget state={state} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
                    <BattleWidget state={state} />
                  </div>
                  {['Race', 'Sprint'].includes(effectiveState?.SessionInfo?.Type) && (
                    <div style={{ width: 150, flexShrink: 0, height: '100%' }}>
                      <PitLaneWidget state={state} />
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Col 3 — race control + commentator (400px fixed) */}
          <div style={{ flexShrink: 0, width: 250, display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: debug ? '1px solid #4499ff' : 'none', position: 'relative' }}>

            {/* Driver standings (content-sized) */}
            {showStandings && (
              <div style={{ flexShrink: 0, padding: '12px 12px 0', outline: debug ? '1px solid #4499ff' : 'none' }}>
                <DriverStandingsWidget state={state} />
              </div>
            )}

            {/* Race control (fills) */}
            <div style={{ flex: 1, padding: 12, outline: debug ? '1px solid #4499ff' : 'none', minHeight: 0 }}>
              <div style={{ height: '100%', overflow: 'hidden' }}>
                <RaceControlWidget state={state} />
              </div>
            </div>

            {/* Commentator (bottom-right) */}
            <Commentator />

          </div>

        </main>
      </div>

      {debug && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)', borderTop: '1px solid #333',
        }}>
          <Controls status={status} clock={clock} state={state} />
        </div>
      )}
    </div>
  );
}

export default function OverlaySession() {
  return (
    <AudioProvider>
      <OverlayContent />
    </AudioProvider>
  );
}

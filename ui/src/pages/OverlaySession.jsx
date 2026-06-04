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
import BattleWidget from '../overlay/components/BattleWidget.jsx';
import AudioWidget from '../overlay/components/AudioWidget.jsx';
import { getSessionColor } from '../overlay/sessionColor.js';
import { useSchedule, findNextSession, buildFallbackState } from '../overlay/useSchedule.js';
import '../overlay/overlay.css';

const debug = new URLSearchParams(window.location.search).has('debug');

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

export default function OverlaySession() {
  const { state, clock, status, positionFrames } = useTiming({ autoConnect: true });
  const sessions = useSchedule();
  const circuitKey = useCircuitKey(state);

  // Before F1 data arrives, derive event/session info from Jolpica schedule
  const nextSession   = findNextSession(sessions, Date.now());
  const fallbackState = buildFallbackState(nextSession);
  const effectiveState = state?.SessionInfo ? state : (fallbackState ?? state);

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

          {/* Col 3 — audio + race control (400px fixed) */}
          <div style={{ flexShrink: 0, width: 250, display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: debug ? '1px solid #4499ff' : 'none' }}>

            {/* Audio widget (no visual output) */}
            <AudioWidget state={state} />

            {/* Race control (fills remainder) */}
            <div style={{ flex: 1, padding: 12, overflow: 'hidden auto', outline: debug ? '1px solid #4499ff' : 'none' }}>
              <RaceControlWidget state={state} />
            </div>

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

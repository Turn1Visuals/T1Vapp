import { useState, useRef, useCallback } from 'react';
import SessionClock from '../components/SessionClock';
import { useTiming } from '../hooks/useTiming';
import Sidebar from '../components/Sidebar';
import Controls from '../components/Controls';
import TrackTab from '../components/TrackTab';
import TimingTable from '../components/TimingTable';
import JsonViewer from '../components/JsonViewer';
import styles from './F1Timing.module.css';

const DATA_TABS = [
  { id: 'state',       label: 'State' },
  { id: 'racecontrol', label: 'Race Control' },
  { id: 'timing',      label: 'Timing' },
  { id: 'timingapp',   label: 'TimingApp' },
  { id: 'position',    label: 'Position' },
  { id: 'cardata',     label: 'CarData' },
  { id: 'raw',         label: 'Raw' },
];

const FEATURE_TABS = [
  { id: 'track',  label: 'Track' },
  { id: 'timing', label: 'Timing' },
];

function JsonTab({ data }) {
  return <JsonViewer data={data ?? null} />;
}

function DropdownPanel({ tabs, active, onSelect, children }) {
  return (
    <div className={styles.panel}>
      <div className={styles.dropdownBar}>
        <select className={styles.dropdown} value={active} onChange={e => onSelect(e.target.value)}>
          {tabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className={styles.tabContent}>
        {children}
      </div>
    </div>
  );
}

function TabPanel({ tabs, active, onSelect, children }) {
  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${active === t.id ? styles.tabActive : ''}`}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.tabContent}>
        {children}
      </div>
    </div>
  );
}

export default function F1Timing() {
  const [dataTab,    setDataTab]    = useState('state');
  const [featureTab, setFeatureTab] = useState('track');
  const [label, setLabel] = useState(null);
  const [leftWidth, setLeftWidth] = useState(320);
  const dragging = useRef(false);

  const onResizerMouseDown = useCallback(e => {
    dragging.current = true;
    e.preventDefault();
    function onMove(e) {
      if (!dragging.current) return;
      setLeftWidth(w => Math.max(120, Math.min(window.innerWidth - 200, e.clientX - 260)));
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const { state, clock, status, positionFrames, startPolling } = useTiming();

  function onSessionLoaded() {
    setLabel(localStorage.getItem('f1t_label'));
    startPolling();
  }

  const s = state;

  function renderDataTab() {
    if (!s) return <div className={styles.empty}>Load a session to begin</div>;
    switch (dataTab) {
      case 'state':       return <JsonTab data={{ clock, SessionInfo: s.SessionInfo, SessionStatus: s.SessionStatus, TrackStatus: s.TrackStatus, LapCount: s.LapCount, ExtrapolatedClock: s.ExtrapolatedClock, WeatherData: s.WeatherData, TopThree: s.TopThree, TimingStats: s.TimingStats, DriverList: s.DriverList }} />;
      case 'racecontrol': return <JsonTab data={s.RaceControlMessages} />;
      case 'timing':      return <JsonTab data={s.TimingData} />;
      case 'timingapp':   return <JsonTab data={s.TimingAppData} />;
      case 'position':    return <JsonTab data={s.Position} />;
      case 'cardata':     return <JsonTab data={s.CarData} />;
      case 'raw':         return <JsonTab data={{ f1LiveTimingState: s, f1LiveTimingClock: clock }} />;
      default:            return null;
    }
  }

  function renderFeatureTab() {
    if (!s) return <div className={styles.empty}>Load a session to begin</div>;
    switch (featureTab) {
      case 'track':  return <TrackTab state={s} clock={clock} positionFrames={positionFrames} />;
      case 'timing': return <TimingTable state={s} />;
      default:       return null;
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={`${styles.badge} ${status?.loaded ? styles.badgeGreen : ''}`}>
          {status?.loaded ? (status.playing ? 'Playing' : 'Paused') : 'No session'}
        </span>
        {label && <span className={styles.sessionLabel}>{label}</span>}
        {s && <SessionClock state={s} clock={clock} />}
        <span style={{ marginLeft: 'auto', color: '#444', fontSize: 12 }}>
          {`http://localhost:${window.location.port}/overlay/session`}
        </span>
      </header>

      <div className={styles.layout}>
        <Sidebar onSessionLoaded={onSessionLoaded} />

        <div className={styles.workspace}>
          <Controls status={status} clock={clock} state={s} />

          <div className={styles.panes}>
            <div style={{ width: leftWidth, minWidth: 120, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
              <DropdownPanel tabs={DATA_TABS} active={dataTab} onSelect={setDataTab}>
                {renderDataTab()}
              </DropdownPanel>
            </div>
            <div className={styles.resizer} onMouseDown={onResizerMouseDown} />
            <TabPanel tabs={FEATURE_TABS} active={featureTab} onSelect={setFeatureTab}>
              {renderFeatureTab()}
            </TabPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { formatVenueTime } from '../sessionClock';
import styles from './Controls.module.css';

function fmtMs(ms) {
  const s = Math.floor((ms ?? 0) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

export default function Controls({ status, clock, state }) {
  const loaded   = status?.loaded ?? false;
  const playing  = status?.playing ?? false;
  const offset   = status?.offset ?? 0;
  const duration = status?.duration ?? 0;
  const progress = duration > 0 ? (offset / duration) * 100 : 0;
  const isLive   = status?.live ?? false;

  const gmtOffset   = state?.SessionInfo?.GmtOffset ?? null;
  const streamStart = Number(clock?.liveTimingStartTime ?? 0);
  const timeStart   = gmtOffset && streamStart ? formatVenueTime(streamStart,           gmtOffset) : fmtMs(0);
  const timeEnd     = gmtOffset && streamStart ? formatVenueTime(streamStart + duration, gmtOffset) : fmtMs(duration);

  const barRef    = useRef(null);
  const dragging  = useRef(false);
  const [dragPct, setDragPct] = useState(null); // local preview while dragging

  async function play() {
    const speed = Number(document.getElementById('speed-select').value);
    await fetch('/f1/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speed }) });
  }
  async function pause() { await fetch('/f1/pause', { method: 'POST' }); }
  async function restart() {
    await fetch('/f1/seek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offsetMs: 0 }) });
  }

  function pctFromEvent(e) {
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  async function seekTo(pct) {
    await fetch('/f1/seek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offsetMs: Math.round(pct * duration) }) });
  }

  function onMouseDown(e) {
    if (!loaded) return;
    dragging.current = true;
    const pct = pctFromEvent(e);
    setDragPct(pct);

    function onMove(e) {
      if (!dragging.current) return;
      setDragPct(pctFromEvent(e));
    }
    function onUp(e) {
      if (!dragging.current) return;
      dragging.current = false;
      const finalPct = pctFromEvent(e);
      setDragPct(null);
      seekTo(finalPct);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const displayPct = dragPct !== null ? dragPct * 100 : progress;
  const displayOffset = dragPct !== null ? Math.round(dragPct * duration) : offset;

  return (
    <div className={styles.wrap}>
      <div className={styles.btns}>
        {!isLive && <button className={styles.primary} onClick={play}    disabled={!loaded}>▶ Play</button>}
        {!isLive && <button className={styles.btn}     onClick={pause}   disabled={!loaded}>⏸ Pause</button>}
        {!isLive && <button className={styles.btn}     onClick={restart} disabled={!loaded}>⏮ Restart</button>}
        {!isLive && (
          <label className={styles.label}>Speed:
            <select id="speed-select" className={styles.select}>
              {[1,2,5,10,30,60].map(x => <option key={x} value={x}>{x}×</option>)}
            </select>
          </label>
        )}
        {isLive && <span className={styles.livePill}>🔴 LIVE</span>}
        <button className={styles.btnStop} onClick={() => fetch('/f1/unload', { method: 'POST' })}>■ Stop</button>
        <span className={styles.clock}>
          {!isLive && (playing ? '▶' : '⏸')} {fmtMs(displayOffset)}
        </span>
      </div>
      <div ref={barRef} className={`${styles.progressBg} ${loaded ? styles.progressActive : ''}`} onMouseDown={onMouseDown}>
        <div className={styles.progressFill} style={{ width: `${displayPct.toFixed(2)}%` }} />
        {loaded && <div className={styles.progressThumb} style={{ left: `${displayPct.toFixed(2)}%` }} />}
      </div>
      <div className={styles.progressInfo}>
        <span>{isLive ? '← buffer start' : timeStart}</span>
        <span>{isLive ? 'now' : timeEnd}</span>
      </div>
    </div>
  );
}

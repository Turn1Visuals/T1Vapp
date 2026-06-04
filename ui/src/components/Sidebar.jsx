import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';

const START_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: START_YEAR - 2017 }, (_, i) => START_YEAR - i);

function LiveBadge({ onConnect }) {
  const [live, setLive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const d = await fetch('/f1/live/status').then(r => r.json());
        if (cancelled) return;
        setLive(d);
        if (d.status === 'Available' && !d.connected) onConnect();
      } catch { if (!cancelled) setLive({ status: 'Unknown', connected: false }); }
    }
    check();
    const id = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const isAvailable = live?.status === 'Available';
  const isConnected = live?.connected;

  return (
    <div className={`${styles.liveBanner} ${isAvailable || isConnected ? styles.liveBannerActive : ''}`}>
      <span className={`${styles.liveDot} ${isAvailable || isConnected ? styles.liveDotActive : ''}`} />
      {isConnected
        ? <span className={styles.liveLabel}>LIVE — connected</span>
        : isAvailable
        ? <span className={styles.liveLabel}>Connecting…</span>
        : <span className={styles.liveLabelOff}>{live ? 'No live session' : 'Checking…'}</span>
      }
    </div>
  );
}

export default function Sidebar({ onSessionLoaded }) {
  const [year, setYear]         = useState(() => Number(localStorage.getItem('f1t_year') ?? START_YEAR));
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [activeRow, setActiveRow] = useState(() => localStorage.getItem('f1t_path') ?? null);

  useEffect(() => { loadYear(year); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadYear(y) {
    setLoading(true);
    try {
      const data = await fetch(`/f1/sessions?year=${y}`).then(r => r.json());
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadSession(path, label) {
    setActiveRow(path);
    localStorage.setItem('f1t_path', path);
    localStorage.setItem('f1t_label', label);
    const res = await fetch('/f1/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then(r => r.json());
    if (!res.error) onSessionLoaded(res);
  }

  const meetings = {};
  for (const s of sessions) {
    if (!meetings[s.meeting]) meetings[s.meeting] = [];
    meetings[s.meeting].push(s);
  }

  async function connectLive() {
    await fetch('/f1/live/connect', { method: 'POST' });
    onSessionLoaded({});
  }

  return (
    <div className={styles.sidebar}>
      <LiveBadge onConnect={connectLive} />
      <div className={styles.top}>
        <select
          value={year}
          onChange={e => { const y = Number(e.target.value); setYear(y); localStorage.setItem('f1t_year', y); }}
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => loadYear(year)}>Load</button>
      </div>

      <div className={styles.list}>
        {loading && <div className={styles.empty}>Loading…</div>}
        {!loading && sessions.length === 0 && <div className={styles.empty}>Select a year</div>}
        {Object.entries(meetings).map(([meeting, items]) => (
          <div key={meeting} className={styles.meeting}>
            <div className={styles.meetingName}>{meeting}</div>
            {items.map(s => (
              <div
                key={s.path}
                className={`${styles.row} ${activeRow === s.path ? styles.active : ''}`}
                onClick={() => loadSession(s.path, `${s.meeting} — ${s.session}`)}
              >
                <span className={s.cached ? styles.dotGreen : styles.dotGrey} />
                {s.session}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TEAM_STYLES from '../../teamStyles';

const STANDINGS_URL = 'https://api.jolpi.ca/ergast/f1/2026/driverStandings.json';

// Change this to cap the table (e.g. 10 for points-scoring positions only).
// null = show the full grid.
const MAX_ROWS = null;

const RACE_POINTS   = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

async function fetchBaselineStandings() {
  const data = await fetch(STANDINGS_URL).then(r => r.json());
  const list = data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
  const map = {};
  for (const d of list) {
    const code = d.Driver?.code;
    if (code) map[code] = { points: Number(d.points) || 0, pos: Number(d.position) || null };
  }
  return map;
}

export default function DriverStandingsWidget({ state }) {
  const [baseline, setBaseline] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchBaselineStandings().then(map => { if (!cancelled) setBaseline(map); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const si          = state?.SessionInfo ?? null;
  const sessionEvent = si?.SessionEvent ?? null;
  const isSprint      = sessionEvent === 'race' && si?.Name === 'Sprint';
  const pointsTable    = isSprint ? SPRINT_POINTS : RACE_POINTS;

  const timingLines = state?.TimingData?.Lines ?? {};
  const driverList  = state?.DriverList ?? {};

  const rows = useMemo(() => {
    if (!baseline) return [];
    const list = Object.keys(driverList).map(num => {
      const driver = driverList[num];
      const tla    = driver?.Tla ?? driver?.Abbr ?? num;
      const pos    = parseInt(timingLines[num]?.Position, 10);
      const sessionPoints  = Number.isFinite(pos) && pos >= 1 ? (pointsTable[pos - 1] ?? 0) : 0;
      const baselinePoints = baseline[tla]?.points ?? 0;
      return {
        tla,
        team: driver?.TeamName ?? null,
        actualPos: baseline[tla]?.pos ?? null,
        current: baselinePoints,
        sessionPoints,
        predicted: baselinePoints + sessionPoints,
      };
    });
    list.sort((a, b) => b.predicted - a.predicted);
    return list.map((row, i) => {
      const pos = i + 1;
      const delta = row.actualPos != null ? row.actualPos - pos : null;
      return { ...row, pos, delta };
    });
  }, [baseline, driverList, timingLines, pointsTable]);

  const visibleRows = MAX_ROWS != null ? rows.slice(0, MAX_ROWS) : rows;

  // ── FLIP position animations (same technique as TimingTableOverlay) ───────────
  const rowEls       = useRef({});
  const prevTopRef   = useRef({});
  const prevOrderRef = useRef([]);

  useLayoutEffect(() => {
    const currentOrder = visibleRows.map(r => r.tla);
    const prevOrder     = prevOrderRef.current;
    const orderChanged  = currentOrder.length !== prevOrder.length ||
      currentOrder.some((tla, i) => tla !== prevOrder[i]);
    prevOrderRef.current = currentOrder;
    if (!orderChanged) return;

    const entries = Object.entries(rowEls.current).filter(([, el]) => el);
    if (!entries.length) return;

    entries.forEach(([, el]) => { el.style.transition = 'none'; el.style.transform = ''; });
    entries[0][1].getBoundingClientRect(); // force reflow

    const newTop = {};
    entries.forEach(([tla, el]) => { newTop[tla] = el.getBoundingClientRect().top; });

    const moving = [];
    entries.forEach(([tla, el]) => {
      if (prevTopRef.current[tla] == null) return;
      const delta = prevTopRef.current[tla] - newTop[tla];
      if (Math.abs(delta) < 1) return;
      el.style.transform = `translateY(${delta}px)`;
      moving.push(el);
    });

    if (moving.length) {
      moving[0].getBoundingClientRect(); // force reflow
      moving.forEach(el => {
        el.style.transition = 'transform 800ms cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.transform  = '';
      });
    }

    prevTopRef.current = newTop;
  });

  if (sessionEvent !== 'race') return null;
  if (!rows.length) return null;

  return (
    <div style={{
      width: '100%',
      boxSizing: 'border-box',
      display: 'grid', gridTemplateRows: 'auto 1fr',
      padding: 10, gap: 6,
      background: 'rgba(255,255,255,0.05)', borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: 2, color: '#fff',
        textTransform: 'uppercase',
      }}>
        Virtual Standings
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'max-content 3px max-content minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
        columnGap: 6,
        rowGap: 3,
      }}>
        {visibleRows.map(({ pos, tla, current, sessionPoints, predicted, team, delta }) => {
          const teamStyle = TEAM_STYLES[team] ?? { background: '#555' };
          const deltaColor = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : 'rgba(255,255,255,0.35)';
          const deltaLabel = delta == null ? '' : delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–';

          return (
            <div key={tla} ref={el => { rowEls.current[tla] = el; }} style={{
              display: 'grid',
              gridColumn: '1 / -1',
              gridTemplateColumns: 'subgrid',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>{pos}</span>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: teamStyle.background }} />
              <span style={{ fontSize: 11, color: '#fff' }}>{tla}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'right' }}>{current}</span>
              <span style={{ fontSize: 11, color: sessionPoints > 0 ? '#4caf50' : 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
                +{sessionPoints}
              </span>
              <span style={{ fontSize: 11, color: '#fff', textAlign: 'right' }}>{predicted}</span>
              <span style={{ fontSize: 11, color: deltaColor, textAlign: 'right' }}>{deltaLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

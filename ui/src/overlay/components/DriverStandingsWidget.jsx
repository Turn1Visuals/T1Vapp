import { useLayoutEffect, useMemo, useRef } from 'react';
import TEAM_STYLES from '../../teamStyles';

// Change this to cap the table (e.g. 10 for points-scoring positions only).
// null = show the full grid.
const MAX_ROWS = null;

export default function DriverStandingsWidget({ state }) {
  const sessionEvent = state?.SessionInfo?.SessionEvent ?? null;

  const predictions = state?.ChampionshipPrediction?.Drivers ?? {};
  const driverList  = state?.DriverList ?? {};

  const rows = useMemo(() => {
    const list = Object.keys(predictions).map(num => {
      const pred   = predictions[num];
      const driver = driverList[num];
      return {
        num,
        tla: driver?.Tla ?? driver?.Abbr ?? num,
        team: driver?.TeamName ?? null,
        actualPos: pred?.CurrentPosition ?? null,
        pos: pred?.PredictedPosition ?? null,
        current: pred?.CurrentPoints ?? 0,
        predicted: pred?.PredictedPoints ?? 0,
      };
    }).filter(row => row.pos != null);
    list.sort((a, b) => a.pos - b.pos);
    return list.map(row => ({
      ...row,
      sessionPoints: row.predicted - row.current,
      delta: row.actualPos != null ? row.actualPos - row.pos : null,
    }));
  }, [predictions, driverList]);

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

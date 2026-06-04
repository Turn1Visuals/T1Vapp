import { Fragment } from 'react';
import TEAM_STYLES from '../../teamStyles';
import { SECTOR_COLORS } from '../../colors';

const COLS = [
  { key: 'S1', sub: 'S1',      headerColor: SECTOR_COLORS[0], type: 'time',  get: s => s?.BestSectors?.[0] },
  { key: 'S2', sub: 'S2',      headerColor: SECTOR_COLORS[1], type: 'time',  get: s => s?.BestSectors?.[1] },
  { key: 'S3', sub: 'S3',      headerColor: SECTOR_COLORS[2], type: 'time',  get: s => s?.BestSectors?.[2] },
  { key: 'I1', sub: 'I1 km/h', headerColor: SECTOR_COLORS[0], type: 'speed', get: s => s?.BestSpeeds?.I1 },
  { key: 'I2', sub: 'I2 km/h', headerColor: SECTOR_COLORS[1], type: 'speed', get: s => s?.BestSpeeds?.I2 },
  { key: 'ST', sub: 'ST km/h', headerColor: '#ffffff',         type: 'speed', get: s => s?.BestSpeeds?.ST },
  { key: 'FL', sub: 'FL km/h', headerColor: SECTOR_COLORS[2],  type: 'speed', get: s => s?.BestSpeeds?.FL },
];

export default function PracticeWidget({ state }) {
  const sessionType = state?.SessionInfo?.Type ?? null;
  if (sessionType !== null && sessionType !== 'Practice') return null;

  const timingStats = state?.TimingStats?.Lines ?? {};
  const driverList  = state?.DriverList ?? {};

  function buildColData(col) {
    const ranked   = [];
    const unranked = [];
    for (const [num, driver] of Object.entries(driverList)) {
      const teamStyle = TEAM_STYLES[driver.TeamName] ?? { background: '#555', text: '#fff' };
      const tla       = driver.Tla ?? num;
      const entry     = col.get(timingStats[num]);
      const val       = entry?.Value ? parseFloat(entry.Value) : NaN;
      if (!isNaN(val)) {
        ranked.push({ num, tla, value: entry.Value, val, teamStyle });
      } else {
        unranked.push({ num, tla, value: null, teamStyle });
      }
    }
    ranked.sort(col.type === 'time'
      ? (a, b) => a.val - b.val
      : (a, b) => b.val - a.val
    );
    return [...ranked, ...unranked];
  }

  const colData = COLS.map(col => ({ col, rows: buildColData(col) }))
    .filter(({ rows }) => rows.some(r => r.value !== null));

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'grid',
      gridTemplateColumns: `repeat(${colData.length}, auto)`,
      gap: 10,
    }}>
      {colData.map(({ col, rows }) => {
        return (
          <div key={col.key} style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '5px 8px 4px',
              flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: col.headerColor ?? 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>
                {col.sub}
              </div>
            </div>

            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              scrollbarWidth: 'none',
              display: 'grid',
              gridTemplateColumns: '3px auto 1fr',
              columnGap: 5,
              rowGap: 5,
              alignContent: 'start',
              alignItems: 'stretch',
            }}>
              {rows.map(({ num, tla, value, teamStyle }) => (
                <Fragment key={num}>
                  <div style={{ background: teamStyle.background }} />
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.85)',
                    letterSpacing: 0.3,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '3px 0 3px 6px',
                  }}>
                    {tla}
                  </span>
                  <span style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.7)',
                    fontVariantNumeric: 'tabular-nums',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '3px 6px 3px 0',
                  }}>
                    {value ?? <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

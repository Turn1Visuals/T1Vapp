import React, { useRef, useLayoutEffect } from 'react';
import TyreIcon from '../../components/TyreIcon';
import TEAM_STYLES from '../../teamStyles';
import { getCompoundStyle } from '../../compoundStyles';
import { SECTOR_COLORS } from '../../colors';

// ─── Colors ────────────────────────────────────────────────────────────────────
const C_PURPLE = '#e040fb';
const C_GREEN  = '#39d600';
const C_YELLOW = '#ffc906';

// ─── Data builder ──────────────────────────────────────────────────────────────
function parseTime(str) {
  if (!str) return null;
  const m = str.match(/^(\d+):(\d+\.\d+)$/);
  if (m) return parseInt(m[1]) * 60 + parseFloat(m[2]);
  const s = parseFloat(str);
  return isNaN(s) ? null : s;
}

function fmtDiff(sec) {
  const s = sec.toFixed(3);
  return sec >= 0 ? `+${s}` : s;
}

function buildQualGaps(rows) {
  const timeMap = {};
  rows.forEach(r => {
    const ms = parseTime(r.bestLap?.value);
    if (ms != null && !isNaN(ms)) timeMap[r.num] = ms;
  });
  const times = Object.values(timeMap);
  if (!times.length) return {};
  const fastest = Math.min(...times);
  const gaps = {};
  rows.forEach((r, i) => {
    const ms = timeMap[r.num];
    if (ms == null) return;
    const gap      = ms === fastest ? '' : fmtDiff(ms - fastest);
    const prev     = rows[i - 1];
    const prevMs   = prev ? timeMap[prev.num] : null;
    const interval = !prev ? '' : prevMs != null ? fmtDiff(ms - prevMs) : '';
    gaps[r.num] = { gap, interval };
  });
  return gaps;
}

function buildRows(state) {
  if (!state) return [];

  const driverList   = state.DriverList          ?? {};
  const timingLines  = state.TimingData?.Lines    ?? {};
  const timingApp    = state.TimingAppData?.Lines ?? {};
  const timingStats  = state.TimingStats?.Lines   ?? {};
  const bestLapSects = state.BestLapSectors       ?? {};
  const isQualifying = state.SessionPart != null
    || state.SessionInfo?.Type === 'Qualifying'
    || state.SessionInfo?.Type === 'Practice';

  const lapTimeValues  = Object.values(timingLines).map(l => l.BestLapTime?.Value).filter(Boolean);
  const overallBestLap = lapTimeValues.length
    ? lapTimeValues.reduce((best, t) => parseTime(t) < parseTime(best) ? t : best)
    : null;

  const overallBestSectors = [0, 1, 2].map(i => {
    const times = Object.values(timingStats).map(l => l.BestSectors?.[i]?.Value).filter(Boolean);
    return times.length ? times.reduce((best, t) => (t < best ? t : best)) : null;
  });

  const rows = Object.entries(timingLines)
    .map(([num, line]) => {
      const driver    = driverList[num] ?? {};
      const team      = driver.TeamName ?? '';
      const stints    = timingApp[num]?.Stints;
      const stintsArr = Array.isArray(stints) ? stints : Object.values(stints ?? {});
      const lastStint = stintsArr.length ? stintsArr[stintsArr.length - 1] : null;

      const sectorsRaw = line.Sectors ?? {};
      const sectors = [0, 1, 2].map(i => {
        const s = sectorsRaw[i] ?? sectorsRaw[String(i)];
        if (!s) return null;
        return {
          value:           s.Value ?? '',
          personalFastest: !!s.PersonalFastest,
          overallFastest:  !!s.OverallFastest,
          segments:        s.Segments ?? {},
        };
      });

      const posGained = (() => {
        const gp = line.GridPos ?? timingApp[num]?.GridPos ?? driver.StartPosition ?? null;
        if (gp == null || gp === '') return null;
        const start   = parseInt(gp);
        const current = parseInt(line.Position ?? 99);
        return isNaN(start) || isNaN(current) ? null : start - current;
      })();

      return {
        num,
        pos:              parseInt(line.Position ?? 99),
        tla:              driver.Tla ?? driver.Abbr ?? num,
        teamName:         team,
        teamStyle:        TEAM_STYLES[team] ?? { background: '#555', text: '#fff' },
        compStyle:        getCompoundStyle(lastStint?.Compound),
        compound:         lastStint?.Compound ?? null,
        tyreNew:          lastStint?.New === 'true' || lastStint?.New === true,
        lapsOnTyre:       lastStint?.TotalLaps ?? null,
        gap:              line.GapToLeader ?? '',
        interval:         line.IntervalToPositionAhead?.Value ?? '',
        intervalCatching: !!line.IntervalToPositionAhead?.Catching,
        lastLap: (() => {
          const val = line.LastLapTime?.Value ?? '';
          const sec = parseTime(val);
          return {
            value:           sec != null && sec < 600 ? val : '',
            personalFastest: !!line.LastLapTime?.PersonalFastest,
            overallFastest:  !!line.LastLapTime?.OverallFastest,
          };
        })(),
        bestLap: {
          value:          line.BestLapTime?.Value ?? '',
          overallFastest: !!(line.BestLapTime?.Value && line.BestLapTime.Value === overallBestLap),
        },
        sectors,
        bestSectors: [0, 1, 2].map(i => {
          const val = timingStats[num]?.BestSectors?.[i]?.Value ?? '';
          return { value: val, overallFastest: !!(val && val === overallBestSectors[i]) };
        }),
        bestLapTyre:   bestLapSects[num]?.compound ?? null,
        bestLapTyreNew: bestLapSects[num]?.isNew ?? true,
        laps:          parseInt(line.NumberOfLaps ?? 0) || 0,
        pits:          line.NumberOfPitStops ?? 0,
        takenChequered: line.Status === 1088 || line.Status === 1104,
        posGained,
        inPit:      !!(line.InPit),
        pitOut:     !!(line.PitOut),
        retired:    !!(line.Retired),
        stopped:    !!(line.Stopped),
        knockedOut: !!(line.KnockedOut),
      };
    })
    .sort((a, b) => a.pos - b.pos);

  if (isQualifying) {
    const qualGaps = buildQualGaps(rows);
    rows.forEach(r => {
      r.gap      = qualGaps[r.num]?.gap      ?? '';
      r.interval = qualGaps[r.num]?.interval ?? '';
      r.intervalCatching = false;
    });
  }

  return rows;
}

// ─── Column definitions ────────────────────────────────────────────────────────

function PosCell({ row }) {
  return (
    <span style={{ fontWeight: 700, lineHeight: 1 }}>{row.pos}</span>
  );
}

function PosGainedCell({ row }) {
  const { posGained } = row;
  if (posGained == null) return null;
  if (posGained === 0)   return <span style={{ color: 'var(--color-dimmed)' }}>=</span>;
  const color = posGained > 0 ? C_GREEN : '#ef5350';
  const label = posGained > 0 ? `+${posGained}` : `${posGained}`;
  return <span style={{ color }}>{label}</span>;
}

function IntervalCell({ row, style }) {
  const value = row.pos === 1 ? null : (row.interval || null);
  const catching = row.intervalCatching && row.pos !== 1;
  return (
    <div style={{
      border: `1px solid ${catching ? C_GREEN : 'transparent'}`,
      borderRadius: 3,
      padding: '1px 5px',
      textAlign: 'right',
      ...style,
    }}>
      {value ?? ''}
    </div>
  );
}

function GapCell({ row, style }) {
  const value = row.pos === 1 ? null : (row.gap || null);
  return (
    <div style={{
      border: '1px solid transparent',
      borderRadius: 3,
      padding: '1px 5px',
      textAlign: 'right',
      ...style,
    }}>
      {value ?? ''}
    </div>
  );
}

const STATUS_BADGE = {
  retired:    { label: 'RET',     bg: '#b71c1c', color: '#fff' },
  stopped:    { label: 'STOP',    bg: '#e65100', color: '#fff' },
  knockedOut: { label: 'KO',      bg: '#4a0000', color: '#ff8a80' },
  inPit:      { label: 'IN PIT',  bg: '#1565c0', color: '#fff' },
  pitOut:     { label: 'PIT OUT', bg: '#2e7d32', color: '#fff' },
};

function lapTimeColor(overallFastest, personalFastest) {
  if (overallFastest)  return C_PURPLE;
  if (personalFastest) return C_GREEN;
  return '#fff';
}

function LastLapCell({ row }) {
  const status = ['retired', 'stopped', 'knockedOut', 'inPit', 'pitOut']
    .find(k => row[k]);
  const badge = status ? STATUS_BADGE[status] : null;

  const badgeEl = (
    <span style={{
      display: 'block',
      width: '100%',
      textAlign: 'center',
      fontSize: '0.6em',
      letterSpacing: 0.8,
      padding: '2px 6px',
      borderRadius: 3,
      background: badge?.bg ?? '#333',
      color: badge?.color ?? '#fff',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
    }}>
      {badge?.label ?? 'PIT OUT'}
    </span>
  );

  const timeEl = (
    <span style={{ display: 'block', width: '100%', textAlign: 'right', color: lapTimeColor(row.lastLap?.overallFastest, row.lastLap?.personalFastest) }}>
      {row.lastLap?.value || ''}
    </span>
  );

  // Ghost: render both overlaid so column sizes to the widest
  if (row.__ghost__) {
    return (
      <div style={{ display: 'grid', width: '100%' }}>
        <div style={{ gridArea: '1/1' }}>{badgeEl}</div>
        <div style={{ gridArea: '1/1' }}>{timeEl}</div>
      </div>
    );
  }

  return badge ? badgeEl : timeEl;
}

const SEG_COLORS = {
  2051: C_PURPLE,
  2049: C_GREEN,
  2048: C_YELLOW,
  2064: '#1565c0',
  2052: '#e65100',
  2068: '#b71c1c',
};
function segColor(status) {
  return SEG_COLORS[status] ?? 'rgba(255,255,255,0.15)';
}

function sectorTimeColor(overallFastest, personalFastest) {
  if (overallFastest)  return C_PURPLE;
  if (personalFastest) return C_GREEN;
  return C_YELLOW;
}

function SectorCell({ sector, segCount }) {
  if (!sector) return null;
  const segs = Object.values(sector.segments ?? {});
  const count = segCount ?? segs.length;
  return (
    <>
      <span style={{ gridRow: 2, color: sectorTimeColor(sector.overallFastest, sector.personalFastest), whiteSpace: 'nowrap', alignSelf: 'center', visibility: sector.value ? 'visible' : 'hidden' }}>
        {sector.value || '00.000'}
      </span>
      {count > 0 && (
        <div style={{ gridRow: 3, display: 'flex', gap: 2, alignSelf: 'start', paddingTop: 3 }}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} style={{
              width: 4,
              height: 3,
              borderRadius: 1,
              background: segColor(segs[i]?.Status ?? segs[i]?.status ?? 0),
              flexShrink: 0,
            }} />
          ))}
        </div>
      )}
    </>
  );
}

function TyreCell({ row }) {
  if (!row.compound) return null;
  return (
    <TyreIcon
      compound={row.compound}
      isNew={row.tyreNew}
      size={26}
      label={row.lapsOnTyre != null ? String(row.lapsOnTyre) : undefined}
    />
  );
}

function BestLapCell({ row }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: row.bestLap?.overallFastest ? C_PURPLE : '#fff' }}>
        {row.bestLap?.value || ''}
      </span>
      {row.bestLapTyre && (
        <TyreIcon compound={row.bestLapTyre} isNew={row.bestLapTyreNew} size={22} />
      )}
    </div>
  );
}

function PitsCell({ row }) {
  const pits = row.pits;
  if (!pits) return null;
  return <span>{pits}</span>;
}

// ─── Column definitions ────────────────────────────────────────────────────────
const COL_DEFS = {
  pos: {
    header: 'P',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <PosCell row={row} />
      </div>
    ),
  },
  gained: {
    header: '±',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', alignSelf: 'start', fontSize: '0.75em', fontWeight: 400, marginLeft: -6 }}>
        <PosGainedCell row={row} />
      </div>
    ),
  },
  driver: {
    header: 'Driver',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{
          flex: 1,
          background: row.teamStyle.background,
          color:      row.teamStyle.text,
          fontWeight: 700,
          letterSpacing: 0.8,
          padding: '2px 8px',
          borderRadius: 3,
          textAlign: 'left',
        }}>
          {row.tla}
        </span>
      </div>
    ),
  },
  gap: {
    header: 'Gap',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <GapCell row={row} style={{ flex: 1 }} />
      </div>
    ),
  },
  interval: {
    header: 'Int',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <IntervalCell row={row} style={{ flex: 1 }} />
      </div>
    ),
  },
  lastlap: {
    header: 'Last',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        <LastLapCell row={row} />
      </div>
    ),
  },
  s1: {
    header: 'S1', headerColor: SECTOR_COLORS[0],
    render: (row, { segCounts }) => (
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto 1fr', alignSelf: 'stretch', justifyItems: 'center', fontSize: '0.85em' }}>
        <SectorCell sector={row.sectors?.[0]} segCount={segCounts[0]} />
      </div>
    ),
  },
  s2: {
    header: 'S2', headerColor: SECTOR_COLORS[1],
    render: (row, { segCounts }) => (
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto 1fr', alignSelf: 'stretch', justifyItems: 'center', fontSize: '0.85em' }}>
        <SectorCell sector={row.sectors?.[1]} segCount={segCounts[1]} />
      </div>
    ),
  },
  s3: {
    header: 'S3', headerColor: SECTOR_COLORS[2],
    render: (row, { segCounts }) => (
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto 1fr', alignSelf: 'stretch', justifyItems: 'center', fontSize: '0.85em' }}>
        <SectorCell sector={row.sectors?.[2]} segCount={segCounts[2]} />
      </div>
    ),
  },
  tyre: {
    header: 'C',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TyreCell row={row} />
      </div>
    ),
  },
  pits: {
    header: 'P',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PitsCell row={row} />
      </div>
    ),
  },
  laps: {
    header: 'L',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.75em' }}>{row.laps || ''}</span>
      </div>
    ),
  },
  best: {
    header: 'Best',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <BestLapCell row={row} />
      </div>
    ),
  },
  sp: {
    header: '',
    render: () => <div />,
  },
};

// ─── Session presets ───────────────────────────────────────────────────────────
const SESSION_PRESETS = {
  Race:              ['sp', 'pos', 'gained', 'driver', 'sp', 'gap', 'interval', 'sp', 'lastlap', 's1', 's2', 's3', 'tyre', 'pits', 'sp'],
  Qualifying:        ['sp', 'pos', 'driver', 'sp', 'best', 'gap', 'interval', 'sp', 'lastlap', 's1', 's2', 's3', 'tyre', 'sp'],
  'Sprint':          ['sp', 'pos', 'gained', 'driver', 'sp', 'gap', 'interval', 'sp', 'lastlap', 's1', 's2', 's3', 'tyre', 'pits', 'sp'],
  'Sprint Qualifying': ['sp', 'pos', 'driver', 'sp', 'best', 'gap', 'interval', 'sp', 'lastlap', 's1', 's2', 's3', 'tyre', 'sp'],
  Practice:          ['sp', 'pos', 'driver', 'sp', 'best', 'gap', 'interval', 'sp', 'lastlap', 's1', 's2', 's3', 'tyre', 'laps', 'sp'],
};
const DEFAULT_PRESET = SESSION_PRESETS.Race;

// ─── Row renderer ─────────────────────────────────────────────────────────────
function TimingRow({ row, ghost = false, segCounts = [0, 0, 0], cols, cutoffPos = 0, index = 0, nodeRef }) {
  const isOut       = !ghost && (row.retired || row.stopped || row.knockedOut);
  const isChequered = !ghost && row.takenChequered;
  const isCutoff    = !ghost && cutoffPos > 0 && row.pos === cutoffPos + 1;
  return (
    <div ref={nodeRef} style={{
      display: 'grid',
      gridColumn: '1 / -1',
      gridTemplateColumns: 'subgrid',
      alignItems: 'center',
      paddingBlock: ghost ? 0 : '3px 5px',
      visibility: ghost ? 'hidden' : 'visible',
      height: ghost ? 0 : 'auto',
      overflow: ghost ? 'hidden' : 'visible',
      position: 'relative',
      background: isChequered
        ? 'repeating-conic-gradient(hsl(0 0% 100% / .08) 0 25%, transparent 0 50%) 0 0 / 10px 25%'
        : index % 2 === 1 ? 'rgba(255,255,255,0.05)' : undefined,
      borderTop: isCutoff ? '1px solid var(--session-color)' : undefined,
    }}>
      {isOut && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(180, 0, 0, 0.35)',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}
      {cols.map((key, i) => (
        <React.Fragment key={i}>
          {COL_DEFS[key].render(row, { segCounts })}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Ghost row — locks column widths ──────────────────────────────────────────
const GHOST = {
  num: '__ghost__',
  pos: 20, posGained: -10,
  gap: '+99.999', interval: '+99.999', intervalCatching: true,
  tla: 'AAA', teamStyle: { background: '#444', text: '#fff' },
  lastLap: { value: '1:36.968', overallFastest: false, personalFastest: false },
  bestLap: { value: '1:36.968', overallFastest: false },
  bestLapTyre: 'SOFT', bestLapTyreNew: true,
  sectors: [
    { value: '28.968', overallFastest: false, personalFastest: false, segments: Object.fromEntries(Array.from({length: 8}, (_, i) => [i, { Status: 0 }])) },
    { value: '28.968', overallFastest: false, personalFastest: false, segments: Object.fromEntries(Array.from({length: 8}, (_, i) => [i, { Status: 0 }])) },
    { value: '28.968', overallFastest: false, personalFastest: false, segments: Object.fromEntries(Array.from({length: 8}, (_, i) => [i, { Status: 0 }])) },
  ],
  compound: 'SOFT', tyreNew: false, lapsOnTyre: 99, laps: 20,
  pits: 2,
  __ghost__: true,
};

// ─── Header row ───────────────────────────────────────────────────────────────
function HeaderRow({ cols }) {
  return (
    <div style={{ display: 'contents', fontSize: '0.65em' }}>
      {cols.map((key, i) => {
        const col = COL_DEFS[key];
        return (
          <div key={i} style={{
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: col.headerColor ?? 'var(--color-muted)',
            paddingBlock: 4,
            textAlign: 'center',
          }}>
            {col.header}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
function detectSegCounts(rows) {
  const counts = [0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 3; i++) {
      if (!counts[i]) {
        const segs = Object.values(row.sectors?.[i]?.segments ?? {});
        if (segs.length) counts[i] = segs.length;
      }
    }
    if (counts.every(c => c > 0)) break;
  }
  return counts;
}

export default function TimingTableOverlay({ state }) {
  const rows      = buildRows(state);
  const segCounts = detectSegCounts(rows);

  // ── FLIP position animations ─────────────────────────────────────────────────
  const rowEls      = useRef({});
  const prevTopRef  = useRef({});
  const prevOrderRef = useRef([]);

  useLayoutEffect(() => {
    // Only run when row order actually changes — guards against every-render resets
    const currentOrder = rows.map(r => r.num);
    const prevOrder    = prevOrderRef.current;
    const orderChanged = currentOrder.length !== prevOrder.length ||
      currentOrder.some((num, i) => num !== prevOrder[i]);
    prevOrderRef.current = currentOrder;
    if (!orderChanged) return;

    const entries = Object.entries(rowEls.current).filter(([, el]) => el);
    if (!entries.length) return;

    // Snap any in-progress animation
    entries.forEach(([, el]) => { el.style.transition = 'none'; el.style.transform = ''; });
    entries[0][1].getBoundingClientRect(); // force reflow

    // Read natural positions
    const newTop = {};
    entries.forEach(([num, el]) => { newTop[num] = el.getBoundingClientRect().top; });

    // Apply inverse transforms
    const moving = [];
    entries.forEach(([num, el]) => {
      if (prevTopRef.current[num] == null) return;
      const delta = prevTopRef.current[num] - newTop[num];
      if (Math.abs(delta) < 1) return;
      el.style.transform = `translateY(${delta}px)`;
      moving.push(el);
    });

    // Animate to natural position
    if (moving.length) {
      moving[0].getBoundingClientRect(); // force reflow
      moving.forEach(el => {
        el.style.transition = 'transform 800ms cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.transform  = '';
      });
    }

    prevTopRef.current = newTop;
  });
  const sessionType = state?.SessionInfo?.Type ?? null;
  const sessionName = state?.SessionInfo?.Name ?? null;
  const presetKey = sessionName === 'Sprint' ? 'Sprint'
    : sessionName === 'Sprint Qualifying' ? 'Sprint Qualifying'
    : sessionType ?? 'Race';
  const cols = SESSION_PRESETS[presetKey] ?? DEFAULT_PRESET;

  const sessionPart = state?.TimingData?.SessionPart ?? state?.SessionPart ?? null;
  const noEntries   = state?.TimingData?.NoEntries ?? {};
  const cutoffPos   = sessionPart != null ? Number(noEntries[sessionPart] ?? 0) : 0;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: Array(cols.length).fill('auto').join(' '),
      gridTemplateRows: '0 auto',
      gridAutoRows: '1fr',
      columnGap: 8,
      height: '100%',
      overflow: 'hidden',
      fontFamily: 'inherit',
      color: '#fff',
    }}>
      {/* Ghost row — height 0, locks column widths */}
      <TimingRow row={GHOST} segCounts={[8, 8, 8]} cols={cols} ghost />

      <HeaderRow cols={cols} />

      {rows.map((row, i) => (
        <TimingRow key={row.num} row={row} segCounts={segCounts} cols={cols} cutoffPos={cutoffPos} index={i} nodeRef={el => { rowEls.current[row.num] = el; }} />
      ))}
    </div>
  );
}

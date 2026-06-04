/**
 * QualifyingLapWidget
 *
 * Shows drivers currently on a hot lap in qualifying, ordered by lap progress
 * (furthest into lap first). Drops from the list as soon as the lap completes.
 *
 * Per driver: team strip, TLA, compound, 3 sector columns each showing
 * live segment colors. After each sector completes, shows the time and a
 * cumulative delta vs the fastest lap holder in the session.
 *   S1 done  → S1 time vs ref S1
 *   S2 done  → cumulative S1+S2 vs ref S1+S2
 *   Lap done → full lap time vs ref best lap
 */

import { useRef, useLayoutEffect } from 'react';
import TEAM_STYLES from '../../teamStyles';
import TyreIcon from '../../components/TyreIcon';
import { parseTime, segsOf } from '../../qualifyingUtils';

// ─── Constants ────────────────────────────────────────────────────────────────
const C_PURPLE = '#e040fb';
const C_GREEN  = '#39d600';
const C_YELLOW = '#ffc906';

const SLOW_LAP_THRESHOLD = 1.07;

const SEG_COLORS = {
  2051: C_PURPLE,
  2049: C_GREEN,
  2048: C_YELLOW,
  2064: '#1565c0',
  2052: '#e65100',
  2068: '#b71c1c',
};

function segColor(status) {
  return SEG_COLORS[status] ?? 'rgba(255,255,255,0.13)';
}

function isSectorCurrent(sector, nextSector) {
  const segs = segsOf(sector);
  if (segs.length === 0) return false;
  if (segs.every(seg => seg.Status !== 0)) return true;
  if (nextSector && segsOf(nextSector).some(seg => seg.Status !== 0)) return true;
  return false;
}

function currentSectorValue(sector, nextSector) {
  if (!sector?.Value) return null;
  return isSectorCurrent(sector, nextSector) ? sector.Value : null;
}

function lapProgressScore(sectors) {
  let score = 0;
  for (let i = 0; i < 3; i++) {
    const s = sectors?.[i];
    if (!s) break;
    const segs = segsOf(s);
    const nonZeroCount = segs.filter(seg => seg.Status !== 0).length;
    if (s.Value && isSectorCurrent(s, sectors[i + 1])) {
      score += segs.length;
    } else {
      score += nonZeroCount;
      break;
    }
  }
  return score;
}

function fmtSec(sec) {
  if (sec === null) return null;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(3).padStart(6, '0');
    return `${m}:${s}`;
  }
  return sec.toFixed(3);
}

// ─── SectorCell ───────────────────────────────────────────────────────────────
function fmtDelta(sec) {
  if (sec === null) return null;
  return `${sec >= 0 ? '+' : ''}${sec.toFixed(3)}`;
}

function SectorCell({ sector, sectorValue, accSec, refAccSec, cutoffAccSec }) {
  const segs = segsOf(sector);

  const delta       = (sectorValue && accSec !== null && refAccSec !== null)    ? accSec - refAccSec    : null;
  const cutoffDelta = (sectorValue && accSec !== null && cutoffAccSec !== null) ? accSec - cutoffAccSec : null;

  const deltaColor       = delta       === null ? 'transparent' : delta       <= 0 ? C_GREEN : '#ff6b6b';
  const cutoffDeltaColor = cutoffDelta === null ? 'transparent' : cutoffDelta <= 0 ? C_GREEN : '#ff6b6b';

  const hasData = !!sectorValue;
  const sectorTimeColor = !hasData ? '#fff'
    : sector?.OverallFastest  ? C_PURPLE
    : sector?.PersonalFastest ? C_GREEN
    : C_YELLOW;

  return (
    <div style={{
      gridColumn: 'span 3',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      rowGap: 3,
      columnGap: 4,
    }}>
      {/* Segments — full width */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 2 }}>
        {segs.map((seg, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 1, background: segColor(seg.Status) }} />
        ))}
      </div>

      {/* Col 1: sector time (row 1) + acc time (row 2) */}
      <span style={{ fontSize: 11, color: sectorTimeColor, opacity: hasData ? 1 : 0, textAlign: 'center' }}>
        {sectorValue ?? '—'}
      </span>
      {/* Col 2: p1 delta — spans both rows */}
      <span style={{ gridRow: 'span 2', fontSize: 12, fontWeight: 700, color: hasData ? deltaColor : 'transparent', textAlign: 'center', alignSelf: 'center' }}>
        {fmtDelta(delta) ?? '—'}
      </span>
      {/* Col 3: p{N} delta — spans both rows */}
      <span style={{ gridRow: 'span 2', fontSize: 12, fontWeight: 700, color: hasData ? cutoffDeltaColor : 'transparent', textAlign: 'center', alignSelf: 'center' }}>
        {fmtDelta(cutoffDelta) ?? '—'}
      </span>
      {/* Col 1 row 2: acc time */}
      <span style={{ fontSize: 11, color: '#fff', opacity: hasData ? 1 : 0, textAlign: 'center' }}>
        {fmtSec(accSec) ?? '—'}
      </span>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────
export default function QualifyingLapWidget({ state }) {
  const bestLapSectorsRef  = useRef(new Map());
  const prevStatusRef      = useRef(new Map());
  const genuineLapRef      = useRef(new Set());
  const scoreTimestampRef  = useRef(new Map());
  const completedTimesRef  = useRef(new Map());
  const slowDriverRef      = useRef(new Set());
  const rowRefsMap         = useRef(new Map());
  const prevTopRef         = useRef(new Map());
  const prevOrderRef       = useRef([]);
  const currentOrderRef    = useRef([]);
  const sessionPartRef     = useRef(null);

  // ── FLIP position animation ───────────────────────────────────────────────
  useLayoutEffect(() => {
    const DURATION = 300;
    const EASING   = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    const currentOrder = currentOrderRef.current;
    const prevOrder    = prevOrderRef.current;
    const orderChanged = currentOrder.length !== prevOrder.length ||
      currentOrder.some((num, i) => num !== prevOrder[i]);

    prevOrderRef.current = currentOrder;
    if (!orderChanged) return;

    rowRefsMap.current.forEach((el, num) => {
      const prevTop = prevTopRef.current.get(num);
      const newTop  = el.getBoundingClientRect().top;

      if (prevTop !== undefined) {
        const delta = prevTop - newTop;
        if (delta >= 1) {
          el.style.transform  = `translateY(${delta}px)`;
          el.style.transition = 'none';
          el.getBoundingClientRect();
          el.style.transition = `transform ${DURATION}ms ${EASING}`;
          el.style.transform  = 'translateY(0)';
        }
      }

      prevTopRef.current.set(num, newTop);
    });

    for (const num of prevTopRef.current.keys()) {
      if (!rowRefsMap.current.has(num)) prevTopRef.current.delete(num);
    }
  });

  const sessionType = state?.SessionInfo?.Type ?? '';
  if (sessionType !== 'Qualifying' && sessionType !== 'Sprint Qualifying') return null;

  const timingLines = state?.TimingData?.Lines  ?? {};
  const timingApp   = state?.TimingAppData?.Lines ?? {};
  const driverList  = state?.DriverList ?? {};
  const sessionPart = state?.TimingData?.SessionPart ?? null;
  const noEntries   = state?.TimingData?.NoEntries ?? {};
  const cutoffPos   = Number(noEntries[sessionPart] ?? 0);

  // ── Reset state when qualifying part changes ──────────────────────────────
  if (sessionPart !== null && sessionPart !== sessionPartRef.current) {
    sessionPartRef.current = sessionPart;
    bestLapSectorsRef.current.clear();
    genuineLapRef.current.clear();
    completedTimesRef.current.clear();
    slowDriverRef.current.clear();
    scoreTimestampRef.current.clear();
    prevStatusRef.current.clear();
  }

  // ── Reference driver ──────────────────────────────────────────────────────
  const refNum  = Object.keys(timingLines).find(n => Number(timingLines[n].Position) === 1) ?? null;
  const refBest = refNum ? bestLapSectorsRef.current.get(refNum) : null;
  const refS1Sec  = refBest?.s1Sec ?? null;
  const refS2Sec  = refBest?.s2Sec ?? null;
  const refCumSec = (refS1Sec !== null && refS2Sec !== null) ? refS1Sec + refS2Sec : null;
  const refLapSec = refBest?.lapSec ?? null;

  // ── Cutoff ref: driver sitting at the last safe position ─────────────────
  const cutoffNum    = cutoffPos > 0
    ? Object.keys(timingLines).find(n => Number(timingLines[n].Position) === cutoffPos)
    : null;
  const cutoffBest   = cutoffNum ? bestLapSectorsRef.current.get(cutoffNum) : null;
  const cutoffS1Sec  = cutoffBest?.s1Sec ?? null;
  const cutoffS2Sec  = cutoffBest?.s2Sec ?? null;
  const cutoffCumSec = (cutoffS1Sec !== null && cutoffS2Sec !== null) ? cutoffS1Sec + cutoffS2Sec : null;
  const cutoffLapSec = cutoffBest?.lapSec ?? null;

  // ── Record sector splits when a driver's best lap lingers ────────────────
  // All 3 sectors have values + PersonalFastest/OverallFastest → store them
  for (const [num, line] of Object.entries(timingLines)) {
    if (!line.LastLapTime?.PersonalFastest && !line.LastLapTime?.OverallFastest) continue;
    const secs = Array.isArray(line.Sectors) ? line.Sectors : Object.values(line.Sectors ?? {});
    const s1Str = secs[0]?.Value;
    const s2Str = secs[1]?.Value;
    const s3Str = secs[2]?.Value;
    if (!s1Str || !s2Str || !s3Str) continue;
    const s1Sec  = parseTime(s1Str);
    const s2Sec  = parseTime(s2Str);
    const lapSec = parseTime(line.LastLapTime.Value) ?? null;
    if (s1Sec === null || s2Sec === null) continue;
    bestLapSectorsRef.current.set(num, { s1Sec, s2Sec, lapSec });
  }

  // ── Detect outlap/pit → hot lap transitions ───────────────────────────────
  const justCleared = new Set();
  for (const [num, line] of Object.entries(timingLines)) {
    const sectors = Array.isArray(line.Sectors) ? line.Sectors : Object.values(line.Sectors ?? {});
    const s1HasOutlapSegs = segsOf(sectors[0]).some(seg => seg.Status === 2064);
    const outlap = !!(line.PitOut) || s1HasOutlapSegs;
    const inPit  = !!(line.InPit);
    const prev   = prevStatusRef.current.get(num) ?? { outlap: false, inPit: false };
    if ((prev.outlap && !outlap) || (prev.inPit && !inPit)) {
      justCleared.add(num);
      genuineLapRef.current.delete(num);
      completedTimesRef.current.delete(num);
      slowDriverRef.current.delete(num);
    }
    if ((!prev.outlap && outlap) || (!prev.inPit && inPit)) {
      genuineLapRef.current.delete(num);
      completedTimesRef.current.delete(num);
      slowDriverRef.current.delete(num);
    }
    prevStatusRef.current.set(num, { outlap, inPit });
  }

  // ── Build entries ─────────────────────────────────────────────────────────
  const entries = [];

  for (const [num, line] of Object.entries(timingLines)) {
    const sectors = Array.isArray(line.Sectors)
      ? line.Sectors
      : Object.values(line.Sectors ?? {});
    const s1HasOutlapSegs = segsOf(sectors[0]).some(seg => seg.Status === 2064);
    const s3Done = sectors[2]?.Value && segsOf(sectors[2]).some(seg => seg.Status !== 0);
    const takenChequered = line.Status === 1104;

    if (line.PitOut || s1HasOutlapSegs || line.KnockedOut || line.Retired || line.InPit || line.Stopped
        || (takenChequered && !s3Done && !completedTimesRef.current.has(num) && lapProgressScore(sectors) > 0)) continue;

    const s1 = sectors[0];

    // Clear completed entry when new S1 segment fires — checked BEFORE setting,
    // so a freshly completed entry survives at least one render before being cleared.
    {
      const ce = completedTimesRef.current.get(num);
      if (ce && segsOf(s1).some(s => s.Status !== 0)) completedTimesRef.current.delete(num);
    }

    if (s3Done && genuineLapRef.current.has(num) && !completedTimesRef.current.has(num)) {
      const cS1Str = currentSectorValue(sectors[0], sectors[1]);
      const cS2Str = currentSectorValue(sectors[1], sectors[2]);
      const cS3Str = sectors[2].Value;
      const cS1Sec = parseTime(cS1Str);
      const cS2Sec = parseTime(cS2Str);
      const cS3Sec = parseTime(cS3Str);
      const cCum   = cS1Sec !== null && cS2Sec !== null ? cS1Sec + cS2Sec : null;
      const cLap   = cCum   !== null && cS3Sec !== null ? cCum   + cS3Sec : null;
      const lapIsSlow =
        (refS1Sec  !== null && cS1Sec !== null && cS1Sec > refS1Sec  * SLOW_LAP_THRESHOLD) ||
        (refLapSec !== null && cLap   !== null && cLap   > refLapSec * SLOW_LAP_THRESHOLD);
      if (lapIsSlow) {
        slowDriverRef.current.add(num);
      } else {
        completedTimesRef.current.set(num, {
          dS1Str: cS1Str, dS2Str: cS2Str, dS3Str: cS3Str,
          dS1Sec: cS1Sec, dS2Sec: cS2Sec,
          dCumSec: cCum,  dLapSec: cLap,
          score: lapProgressScore(sectors),
          snapRefS1Sec:  refS1Sec,
          snapRefCumSec: refCumSec,
          snapRefLapSec: refLapSec,
        });
      }
    }

    if (!s1?.Value && !justCleared.has(num)
        && segsOf(s1).some(s => s.Status !== 0)
        && !segsOf(sectors[1]).some(s => s.Status !== 0)) {
      genuineLapRef.current.add(num);
      completedTimesRef.current.delete(num);
    }
    if (s1?.Value && !justCleared.has(num)) {
      genuineLapRef.current.add(num);
    }

    const completedEntry = completedTimesRef.current.get(num);
    if (!genuineLapRef.current.has(num) && !completedEntry) continue;

    const dS1Str  = completedEntry ? completedEntry.dS1Str : currentSectorValue(sectors[0], sectors[1]);
    const dS2Str  = completedEntry ? completedEntry.dS2Str : currentSectorValue(sectors[1], sectors[2]);
    const dS3Str  = completedEntry ? completedEntry.dS3Str : null;
    const dS1Sec  = completedEntry ? completedEntry.dS1Sec : parseTime(dS1Str);
    const dS2Sec  = completedEntry ? completedEntry.dS2Sec : parseTime(dS2Str);
    const dCumSec = completedEntry ? completedEntry.dCumSec : (dS1Sec !== null && dS2Sec !== null ? dS1Sec + dS2Sec : null);
    const dLapSec = completedEntry ? completedEntry.dLapSec : null;

    if (!completedEntry) {
      if (refS1Sec  !== null && dS1Sec  !== null && dS1Sec  > refS1Sec  * SLOW_LAP_THRESHOLD) {
        slowDriverRef.current.add(num); continue;
      }
      if (refCumSec !== null && dCumSec !== null && dCumSec > refCumSec * SLOW_LAP_THRESHOLD) {
        slowDriverRef.current.add(num); continue;
      }
      if (dS1Sec === null && slowDriverRef.current.has(num)) continue;
      if (dS1Sec !== null) slowDriverRef.current.delete(num);
    }

    const stints    = timingApp[num]?.Stints;
    const stintsArr = Array.isArray(stints) ? stints : Object.values(stints ?? {});
    const stint     = stintsArr.length ? stintsArr[stintsArr.length - 1] : null;

    const score  = completedEntry ? completedEntry.score : lapProgressScore(sectors);
    const prevST = scoreTimestampRef.current.get(num);
    if (!prevST || score !== prevST.score) {
      scoreTimestampRef.current.set(num, { score, ts: Date.now() });
    }

    const lastLap = line.LastLapTime;
    const lapColor = completedEntry
      ? (lastLap?.OverallFastest ? C_PURPLE : lastLap?.PersonalFastest ? C_GREEN : C_YELLOW)
      : null;

    const pos = Number(timingLines[num]?.Position ?? 0);
    entries.push({
      num, sectors, score, stint,
      isCompleted: !!completedEntry,
      lapColor,
      driver: driverList[num],
      dS1Sec, dS2Sec, dCumSec, dLapSec,
      dS1Str, dS2Str, dS3Str,
      snapRefS1Sec:  completedEntry?.snapRefS1Sec  ?? null,
      snapRefCumSec: completedEntry?.snapRefCumSec ?? null,
      snapRefLapSec: completedEntry?.snapRefLapSec ?? null,
      inDropZone: cutoffPos > 0 && pos > cutoffPos,
    });
  }

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tsA = scoreTimestampRef.current.get(a.num)?.ts ?? 0;
    const tsB = scoreTimestampRef.current.get(b.num)?.ts ?? 0;
    return tsA - tsB;
  });
  currentOrderRef.current = entries.map(e => e.num);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '2px auto 3px auto auto 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 2px',
      columnGap: 8,
      rowGap: 8,
      alignContent: 'start',
      overflowY: 'auto',
      scrollbarWidth: 'none',
    }}>
      {/* Header */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'subgrid',
        background: '#1a1a1a',
        borderRadius: 4,
        padding: '10px 0',
        fontSize: 9, fontWeight: 600, letterSpacing: 2,
        color: '#fff', textTransform: 'uppercase',
        alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 1,
      }}>
        <div style={{ gridColumn: '1 / 6', paddingLeft: 10 }}>Hot Laps</div>

        {[
          { label: 'S1', color: '#f44336', refTime: refS1Sec,  cutoffTime: cutoffS1Sec  },
          { label: 'S2', color: '#2196f3', refTime: refCumSec, cutoffTime: cutoffCumSec },
          { label: 'S3', color: '#ffb74d', refTime: refLapSec, cutoffTime: cutoffLapSec },
        ].map(({ label, color, refTime, cutoffTime }) => (
          <div key={label} style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'center' }}>
            <span style={{ color, textAlign: 'center', alignSelf: 'center' }}>{label}</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ color: '#fff' }}>p1</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{refTime != null ? fmtSec(refTime) : '—'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ color: '#fff' }}>{cutoffPos ? `p${cutoffPos}` : '—'}</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{cutoffTime != null ? fmtSec(cutoffTime) : '—'}</span>
            </div>
          </div>
        ))}
      </div>

      {entries.map(({ num, sectors, isCompleted, lapColor, stint, driver, dS1Str, dS2Str, dS3Str, dS1Sec, dS2Sec, dCumSec, dLapSec, snapRefS1Sec, snapRefCumSec, snapRefLapSec, inDropZone }) => {
        const teamStyle = TEAM_STYLES[driver?.TeamName] ?? { background: '#555', text: '#fff' };
        const tla       = driver?.Tla ?? num;
        const bg = isCompleted && lapColor
          ? `linear-gradient(${lapColor}26, ${lapColor}26), rgba(0,0,0,0.55)`
          : 'rgba(255,255,255,0.05)';

        const compound = stint?.Compound ?? null;
        const isNew    = !(stint?.New === false || stint?.New === 'false');

        return (
          <div
            key={num}
            ref={el => { if (el) rowRefsMap.current.set(num, el); else rowRefsMap.current.delete(num); }}
            style={{
              display: 'grid',
              gridColumn: '1 / -1',
              gridTemplateColumns: 'subgrid',
              alignItems: 'center',
              padding: '10px 0',
              background: bg, borderRadius: 4,
            }}
          >
            <div />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', minWidth: '1.5ch', textAlign: 'right' }}>
              {timingLines[num]?.Position ?? ''}
            </span>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: teamStyle.background, alignSelf: 'center' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{tla}</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {compound && (
                <TyreIcon
                  compound={compound}
                  isNew={isNew}
                  size={18}
                  label={stint?.TotalLaps != null ? String(stint.TotalLaps) : undefined}
                />
              )}
            </div>

            <SectorCell
              sector={sectors[0]}
              sectorValue={dS1Str}
              accSec={dS1Sec}
              refAccSec={isCompleted ? snapRefS1Sec : refS1Sec}
              cutoffAccSec={cutoffS1Sec}
              cutoffPos={cutoffPos}
            />
            <SectorCell
              sector={sectors[1]}
              sectorValue={dS2Str}
              accSec={dCumSec}
              refAccSec={isCompleted ? snapRefCumSec : refCumSec}
              cutoffAccSec={cutoffCumSec}
              cutoffPos={cutoffPos}
            />
            <SectorCell
              sector={sectors[2]}
              sectorValue={dS3Str}
              accSec={dLapSec}
              refAccSec={isCompleted ? snapRefLapSec : refLapSec}
              cutoffAccSec={cutoffLapSec}
              cutoffPos={cutoffPos}
            />

            <div />
          </div>
        );
      })}
    </div>
  );
}

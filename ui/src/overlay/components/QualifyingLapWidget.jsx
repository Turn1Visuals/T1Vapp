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
 *
 * Hot-lap detection lives in useHotLaps (shared with the pole announcement).
 */

import { useRef, useLayoutEffect } from 'react';
import TEAM_STYLES from '../../teamStyles';
import TyreIcon from '../../components/TyreIcon';
import { segsOf } from '../../qualifyingUtils';
import useHotLaps from '../useHotLaps';

// ─── Constants ────────────────────────────────────────────────────────────────
const C_PURPLE = '#e040fb';
const C_GREEN  = '#39d600';
const C_YELLOW = '#ffc906';

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
  const rowRefsMap      = useRef(new Map());
  const prevTopRef      = useRef(new Map());
  const prevOrderRef    = useRef([]);
  const currentOrderRef = useRef([]);

  const {
    entries,
    refS1Sec, refCumSec, refLapSec,
    cutoffPos, cutoffS1Sec, cutoffCumSec, cutoffLapSec,
  } = useHotLaps(state);

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

  const timingLines = state?.TimingData?.Lines ?? {};

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

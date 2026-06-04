import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import TEAM_STYLES from '../../teamStyles';
import TyreIcon from '../../components/TyreIcon';

// ─── Config ───────────────────────────────────────────────────────────────────
const GAP_THRESHOLD     = 1.5;  // seconds
const QUALIFY_MS        = 3000; // must be within threshold for this long before showing
const HOLD_MS           = 5000; // keep showing after gap exceeds threshold
const OVERTAKE_FLASH_MS = 4000; // how long to flash "OVERTAKE" header

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseGap(value) {
  if (!value || String(value).includes('LAP')) return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : Math.abs(n);
}

// ─── Driver side ──────────────────────────────────────────────────────────────
function DriverSide({ num, line, driver, speed, stint, side }) {
  const teamStyle = TEAM_STYLES[driver?.TeamName] ?? { background: '#555', text: '#fff' };
  const pos       = line?.Position ?? '?';
  const tla       = driver?.Tla ?? num;
  const laps      = stint?.TotalLaps ?? null;
  const isRight   = side === 'right';
  const compound  = stint?.Compound ?? null;
  const isNew     = !(stint?.New === false || stint?.New === 'false');

  const strip = (
    <div style={{
      width: 4, borderRadius: 2,
      background: teamStyle.background,
      alignSelf: 'stretch',
      flexShrink: 0,
    }} />
  );

  const content = (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      alignItems: isRight ? 'flex-end' : 'flex-start',
    }}>
      <div style={{ fontSize: 11, opacity: 0.6, color: '#fff' }}>P{pos}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>{tla}</div>
      {speed != null && (
        <div style={{ fontSize: 11, color: '#fff', opacity: 0.7 }}>{speed} km/h</div>
      )}
      {compound && (
        <TyreIcon
          compound={compound}
          isNew={isNew}
          size={22}
          label={laps != null ? String(laps) : undefined}
        />
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isRight ? 'row-reverse' : 'row' }}>
      {strip}
      {content}
    </div>
  );
}

// ─── Battle card ──────────────────────────────────────────────────────────────
function BattleCard({ aheadNum, behindNum, gap, overtakenAt, timingLines, driverList, latestCars, timingApp, style }) {
  function getStint(num) {
    const stints    = timingApp[num]?.Stints;
    const stintsArr = Array.isArray(stints) ? stints : Object.values(stints ?? {});
    return stintsArr.length ? stintsArr[stintsArr.length - 1] : null;
  }

  const overtakeActive = overtakenAt > 0 && (Date.now() - overtakenAt < OVERTAKE_FLASH_MS);

  const leftNum  = overtakeActive ? behindNum : aheadNum;
  const rightNum = overtakeActive ? aheadNum  : behindNum;

  const leftLine  = timingLines[leftNum];
  const rightLine = timingLines[rightNum];
  const aheadPos  = timingLines[aheadNum]?.Position ?? '?';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      gap: 4, padding: 10, boxSizing: 'border-box',
      background: 'rgba(255,255,255,0.05)', borderRadius: 4,
      ...style,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase',
        color: overtakeActive ? '#ffd700' : '#fff',
        opacity: 1,
      }}>
        {overtakeActive ? 'Overtake' : `Battle for P${aheadPos}`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6 }}>
        <DriverSide
          num={leftNum}
          line={leftLine}
          driver={driverList[leftNum]}
          speed={latestCars[leftNum]?.Channels?.[2] ?? null}
          stint={getStint(leftNum)}
          side="left"
        />
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {gap.toFixed(3)}s
          </div>
        </div>
        <DriverSide
          num={rightNum}
          line={rightLine}
          driver={driverList[rightNum]}
          speed={latestCars[rightNum]?.Channels?.[2] ?? null}
          stint={getStint(rightNum)}
          side="right"
        />
      </div>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────
export default function BattleWidget({ state }) {
  const holdRef        = useRef(new Map());
  const firstSeenRef   = useRef(new Map()); // behindNum → timestamp when gap first came within threshold
  const pairHistoryRef = useRef(new Map());
  const computedRef    = useRef([]);
  const prevKeysRef    = useRef('');
  const [renderedCards, setRenderedCards] = useState([]);

  const sessionType  = state?.SessionInfo?.Type ?? null;
  const isRace       = sessionType === 'Race' || sessionType === 'Sprint';
  const trackStatus  = state?.TrackStatus?.Status ?? null;
  const isNeutralised = ['4', '5'].includes(trackStatus);
  const timingLines  = state?.TimingData?.Lines ?? {};
  const driverList   = state?.DriverList ?? {};
  const timingApp    = state?.TimingAppData?.Lines ?? {};
  const carEntries   = state?.CarData?.Entries ?? [];
  const latestCars   = carEntries.length ? (carEntries[carEntries.length - 1]?.Cars ?? {}) : {};

  let toShow = [];
  if (isNeutralised) {
    holdRef.current.clear();
    firstSeenRef.current.clear();
  } else if (isRace) {
    const sorted = Object.keys(timingLines)
      .filter(num => {
        const l = timingLines[num];
        return l?.Position && !l.Retired && !l.InPit && l.Status !== 1104;
      })
      .sort((a, b) => parseInt(timingLines[a].Position) - parseInt(timingLines[b].Position));

    const now = Date.now();
    const withinThreshold = new Set();

    const candidates = [];
    for (const behindNum of sorted) {
      const line = timingLines[behindNum];
      if (line.Position === '1') continue;
      const gap = parseGap(line.IntervalToPositionAhead?.Value);
      if (gap == null || gap >= GAP_THRESHOLD) {
        firstSeenRef.current.delete(behindNum);
        continue;
      }

      const aheadPos = String(parseInt(line.Position) - 1);
      const aheadNum = sorted.find(n => timingLines[n].Position === aheadPos);
      if (!aheadNum) continue;

      if (!firstSeenRef.current.has(behindNum)) firstSeenRef.current.set(behindNum, now);
      withinThreshold.add(behindNum);

      const pairKey   = [aheadNum, behindNum].sort().join('_');
      const prevAhead = pairHistoryRef.current.get(pairKey);
      const overtakenAt = (prevAhead !== undefined && prevAhead !== aheadNum)
        ? now
        : (holdRef.current.get(behindNum)?.data?.overtakenAt ?? 0);
      pairHistoryRef.current.set(pairKey, aheadNum);

      candidates.push({ aheadNum, behindNum, gap, overtakenAt });
    }

    // Only promote to battles once the pair has been within threshold long enough
    const battles = candidates.filter(b => now - firstSeenRef.current.get(b.behindNum) >= QUALIFY_MS);

    for (const b of battles) {
      holdRef.current.set(b.behindNum, { data: b, seenAt: now });
    }

    const expired = [];
    for (const [key, { data, seenAt }] of holdRef.current) {
      const ahead  = timingLines[data.aheadNum];
      const behind = timingLines[data.behindNum];
      const eitherInPit = ahead?.InPit || ahead?.Retired || behind?.InPit || behind?.Retired;
      if (now - seenAt < HOLD_MS && !eitherInPit) {
        toShow.push(data);
      } else {
        expired.push(key);
      }
    }
    for (const key of expired) holdRef.current.delete(key);

    toShow.sort((a, b) => {
      const posA = parseInt(timingLines[a.aheadNum]?.Position ?? '99');
      const posB = parseInt(timingLines[b.aheadNum]?.Position ?? '99');
      return posA - posB;
    });
    toShow = toShow.slice(0, 6);
  }

  computedRef.current = toShow;

  useEffect(() => {
    const next = computedRef.current;
    const keys = next.map(b => b.behindNum).join(',');

    if (keys === prevKeysRef.current) {
      setRenderedCards([...next]);
      return;
    }
    prevKeysRef.current = keys;

    if (!document.startViewTransition) {
      setRenderedCards([...next]);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setRenderedCards([...next]));
    });
  }, [state]);

  if (!isRace) return null;
  if (renderedCards.length === 0) return null;

  return (
    <>
      <style>{`
        ::view-transition-old(root),
        ::view-transition-new(root) { animation: none; }
      `}</style>
      <div style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignContent: 'start',
        gap: 12,
      }}>
        {renderedCards.map((b) => (
          <BattleCard
            key={b.behindNum}
            aheadNum={b.aheadNum}
            behindNum={b.behindNum}
            gap={b.gap}
            overtakenAt={b.overtakenAt}
            timingLines={timingLines}
            driverList={driverList}
            latestCars={latestCars}
            timingApp={timingApp}
            style={{ viewTransitionName: `battle-${b.behindNum}` }}
          />
        ))}
      </div>
    </>
  );
}

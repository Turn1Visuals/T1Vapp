/**
 * useHotLaps
 *
 * Shared hot-lap detection for qualifying. Tracks drivers currently on a
 * genuine hot lap (started from S1, not an outlap/cooldown/pit lap), plus
 * freshly completed laps that linger for display.
 *
 * Used by QualifyingLapWidget (rendering) and the overlay announcement
 * logic (pole gate) so both always agree on who is on a lap.
 *
 * Returns { entries, refS1Sec, refCumSec, refLapSec, cutoffPos,
 *           cutoffS1Sec, cutoffCumSec, cutoffLapSec }.
 * Each entry has isCompleted: false while the lap is in progress.
 */

import { useRef } from 'react';
import { parseTime, segsOf } from '../qualifyingUtils';

export const SLOW_LAP_THRESHOLD = 1.07;

export function isSectorCurrent(sector, nextSector) {
  const segs = segsOf(sector);
  if (segs.length === 0) return false;
  if (segs.every(seg => seg.Status !== 0)) return true;
  if (nextSector && segsOf(nextSector).some(seg => seg.Status !== 0)) return true;
  return false;
}

export function currentSectorValue(sector, nextSector) {
  if (!sector?.Value) return null;
  return isSectorCurrent(sector, nextSector) ? sector.Value : null;
}

export function lapProgressScore(sectors) {
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

const EMPTY = {
  entries: [],
  refS1Sec: null, refCumSec: null, refLapSec: null,
  cutoffPos: 0, cutoffS1Sec: null, cutoffCumSec: null, cutoffLapSec: null,
};

export default function useHotLaps(state) {
  const bestLapSectorsRef = useRef(new Map());
  const prevStatusRef     = useRef(new Map());
  const genuineLapRef     = useRef(new Set());
  const scoreTimestampRef = useRef(new Map());
  const completedTimesRef = useRef(new Map());
  const slowDriverRef     = useRef(new Set());
  const sessionPartRef    = useRef(null);

  const sessionType = state?.SessionInfo?.Type ?? '';
  if (sessionType !== 'Qualifying' && sessionType !== 'Sprint Qualifying') return EMPTY;

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
      ? (lastLap?.OverallFastest ? '#e040fb' : lastLap?.PersonalFastest ? '#39d600' : '#ffc906')
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

  return { entries, refS1Sec, refCumSec, refLapSec, cutoffPos, cutoffS1Sec, cutoffCumSec, cutoffLapSec };
}

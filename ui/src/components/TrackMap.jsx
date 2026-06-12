import { useMemo, useEffect, useRef, useState } from 'react';
import { FLAG_COLORS, SECTOR_COLORS } from '../colors';
import TEAM_STYLES from '../teamStyles';
import { getCompoundBorderStyle } from '../compoundStyles';
import { isOnHotLap, parseTime, segsOf } from '../qualifyingUtils';

// ── Track geometry ─────────────────────────────────────────────────────────────
const TRACK_SCALE        = 500;   // SVG coordinate space size — track fits within this many units
const TRACK_OUTER_W      = 10;    // track surface width multiplier (× re)
const TRACK_BACKDROP_W   = 1.2;   // backdrop (dark border behind track) relative to outer width
const TRACK_INNER_W      = 0.25;  // white center line width relative to outer width
const TRACK_PADDING      = 8;     // viewBox padding around track bounds (× re, + 600 base)

// ── Track colors ───────────────────────────────────────────────────────────────
const COLOR_BACKDROP     = '#000000'; // dark halo behind the track surface
const COLOR_BACKDROP_AMT = 0.3;       // how much to lighten the backdrop
const COLOR_TRACK        = '#121212'; // track surface color
const COLOR_TRACK_AMT    = 0.1;       // how much to lighten the track surface
const COLOR_TRACK_LINE   = '#ffffff'; // center line / inner edge
const COLOR_TRACK_LINE_AMT = 0.2;     // how much to lighten the center line
const COLOR_PIT          = '#000000'; // pit lane surface
const COLOR_PIT_AMT      = 0.6;       // how much to lighten the pit lane
const COLOR_DRS          = '#4caf50'; // DRS / overtake zone highlight
const COLOR_DRS_ALPHA    = 0.7;       // opacity of DRS zone overlay

// ── Marker sizes ───────────────────────────────────────────────────────────────
const MARKER_SIZE        = 10;  // corner & marshal light marker size (× re)
const MARKER_LABEL_DIST  = 4;   // extra distance from track edge to label (× re)

// ── Driver dot ─────────────────────────────────────────────────────────────────
const DOT_RADIUS      = 7;    // dot radius (× re)
const DOT_FONT_SIZE   = 6.5;  // TLA label font size (× re)
const DOT_RING_OUTER  = 1.25; // compound ring outer radius (× dotR)
const DOT_RING_GAP    = 1.1;  // black separator radius (× dotR) — ring thickness = OUTER − GAP
const DOT_PIT_SCALE    = 0.5;  // size multiplier for drivers currently in the pit lane
const DOT_PITOUT_SCALE = 0.75; // size multiplier for drivers leaving the pits (rejoining)
const DOT_COLD_SCALE   = 0.5;  // size multiplier for on-track drivers not on a hot lap (qualifying)
const DOT_LAPPED_SCALE = 0.65; // size multiplier for lapped drivers in race/sprint


// ── Pure math helpers ─────────────────────────────────────────────────────────

function rotPt(p, ctr, deg) {
  if (!deg) return p;
  const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const x0 = p.x - ctr.x, y0 = p.y - ctr.y;
  return { x: x0 * cos - y0 * sin + ctr.x, y: x0 * sin + y0 * cos + ctr.y };
}

function lighten(hex, amt) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r+(255-r)*amt)},${Math.round(g+(255-g)*amt)},${Math.round(b+(255-b)*amt)})`;
}

function alphaColor(hex, opacity) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function moveByAngle(p, dist, deg) {
  const r = deg * Math.PI / 180;
  return { x: p.x + dist * Math.cos(r), y: p.y + dist * Math.sin(r) };
}

function ptPath(pts, close = false) {
  let d = pts.map((p, i) => `${i===0?'M':'L'}${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' ');
  if (close && pts.length) d += ` L${pts[0].x.toFixed(2)},${(-pts[0].y).toFixed(2)}`;
  return d;
}

function closestIdx(pts, fp) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - fp.x, dy = pts[i].y - fp.y, d = dx*dx + dy*dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function slicePath(pts, from, to) {
  const n = pts.length, arr = [];
  let i = from;
  while (i !== to) { arr.push(pts[i]); i = (i + 1) % n; }
  arr.push(pts[to]);
  return ptPath(arr, false);
}

function catmullRom(p0, p1, p2, p3, t) {
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2*p0 - 5*p1 + 4*p2 - p3) * t * t +
    (-p0 + 3*p1 - 3*p2 + p3) * t * t * t
  );
}




// ── Main component ────────────────────────────────────────────────────────────

export default function TrackMap({ layout, layers, trackState = {}, positionFrames = [], driverList = {}, timingAppData = null, timingData = null, sessionCategory = null, sessionEvent = null, clock = null }) {
  // positionFrames: array of raw frames from server, accumulated into per-car buffers below
  const { trackStatusColor = null, flagSectors = new Map() } = trackState;

  const geo = useMemo(() => {
    if (!layout) return null;
    try {
    const { trackPath, features, rotation: rot = 0 } = layout;
    const { corners, marshalLights, marshalSectors, sectors, speedTrap, pitLane } = features ?? {};
    const drsZoneList  = features?.drs?.zones ?? [];
    const straightZones = features?.straightModeZones ?? [];
    const overtakeMode  = features?.overtakeMode ?? null;

    // Raw center (use reduce — spread crashes on large arrays)
    const minOf = (arr, fn) => arr.reduce((m, v) => Math.min(m, fn(v)), Infinity);
    const maxOf = (arr, fn) => arr.reduce((m, v) => Math.max(m, fn(v)), -Infinity);
    const xArr = trackPath.x, yArr = trackPath.y;
    const rawMinX = xArr.reduce((m,v) => Math.min(m,v), Infinity),  rawMaxX = xArr.reduce((m,v) => Math.max(m,v), -Infinity);
    const rawMinY = yArr.reduce((m,v) => Math.min(m,v), Infinity),  rawMaxY = yArr.reduce((m,v) => Math.max(m,v), -Infinity);
    const center  = { x: (rawMinX+rawMaxX)/2, y: (rawMinY+rawMaxY)/2 };

    const rp = tp => rotPt({ x: tp.x, y: tp.y }, center, rot);

    const trackPts = trackPath.x.map((x, i) => rotPt({ x, y: trackPath.y[i] }, center, rot));
    const pitPts   = pitLane ? pitLane.x.map((x, i) => rotPt({ x, y: pitLane.y[i] }, center, rot)) : [];

    const allPts = [...trackPts, ...pitPts];
    const bMinX = minOf(allPts, p=>p.x), bMaxX = maxOf(allPts, p=>p.x);
    const bMinY = minOf(allPts, p=>p.y), bMaxY = maxOf(allPts, p=>p.y);

    const re       = Math.max(bMaxX-bMinX, bMaxY-bMinY) / TRACK_SCALE;
    const pad      = re * TRACK_PADDING + 600;
    const viewBox  = `${bMinX-pad} ${-(bMaxY+pad)} ${bMaxX-bMinX+2*pad} ${bMaxY-bMinY+2*pad}`;

    const outerW    = re * TRACK_OUTER_W;
    const backdropW = outerW * TRACK_BACKDROP_W;
    const innerW    = outerW * TRACK_INNER_W;
    const pointSize = 2 * re;
    const markerSize = re * MARKER_SIZE, mlSize = re * MARKER_SIZE;
    const markerScale = markerSize / 40, mlScale = mlSize / 40;
    const labelR  = 20 * markerScale, mlLabelR = 20 * mlScale;
    const cornerDist = backdropW / 2 + labelR + re * MARKER_LABEL_DIST;
    const mlDist     = backdropW / 2 + mlLabelR + re * MARKER_LABEL_DIST;

    const trackBackdrop = lighten(COLOR_BACKDROP,    COLOR_BACKDROP_AMT);
    const trackOuter    = lighten(COLOR_TRACK,       COLOR_TRACK_AMT);
    const trackInner    = lighten(COLOR_TRACK_LINE,  COLOR_TRACK_LINE_AMT);
    const pitInner      = lighten(COLOR_PIT,         COLOR_PIT_AMT);
    const drsColor      = alphaColor(COLOR_DRS,      COLOR_DRS_ALPHA);

    const trackD = ptPath(trackPts, true);
    const pitD   = pitPts.length ? ptPath(pitPts, false) : null;

    // Sector start indices
    const secStarts = (sectors ?? []).map(sec => {
      const sp = sec.startPoint?.trackPosition;
      return sp ? closestIdx(trackPts, rp(sp)) : 0;
    });

    // Marshal sector paths
    const msSegments = [];
    if ((marshalSectors ?? []).length) {
      const sorted = [...marshalSectors].sort((a,b) => a.number - b.number);
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i], nxt = sorted[(i+1) % sorted.length];
        msSegments.push({ number: cur.number, d: slicePath(trackPts, closestIdx(trackPts, rp(cur.trackPosition)), closestIdx(trackPts, rp(nxt.trackPosition))) });
      }
    }

    // DRS / overtake zone paths
    const drsPaths = [];
    for (const z of drsZoneList) {
      const act = z?.activation?.trackPosition, deact = z?.deactivation?.trackPosition;
      if (act && deact) drsPaths.push(slicePath(trackPts, closestIdx(trackPts, rp(act)), closestIdx(trackPts, rp(deact))));
    }
    for (const z of straightZones) {
      const g = z?.normalGrip ?? z?.lowGrip;
      const act = g?.activation?.trackPosition, deact = g?.deactivation?.trackPosition;
      if (act && deact) drsPaths.push(slicePath(trackPts, closestIdx(trackPts, rp(act)), closestIdx(trackPts, rp(deact))));
    }
    const detectionPts = [];
    if (overtakeMode?.detection?.trackPosition) detectionPts.push(rp(overtakeMode.detection.trackPosition));
    for (const z of drsZoneList) { if (z?.detection?.trackPosition) detectionPts.push(rp(z.detection.trackPosition)); }

    // Corner markers
    const cornerMarkers = (corners ?? []).filter(c => c?.trackPosition && Number.isFinite(c.number)).map(c => {
      const ang = Number.isFinite(c.angle) ? c.angle : 0;
      return { base: rp(c.trackPosition), label: rotPt(moveByAngle({ x: c.trackPosition.x, y: c.trackPosition.y }, cornerDist, ang), center, rot), num: String(c.number) };
    });

    // Marshal light markers
    const mlMarkers = (marshalLights ?? []).filter(m => m?.trackPosition && Number.isFinite(m.number)).map(m => {
      const ang = Number.isFinite(m.angle) ? m.angle : 0;
      return { base: rp(m.trackPosition), label: rotPt(moveByAngle({ x: m.trackPosition.x, y: m.trackPosition.y }, mlDist, ang), center, rot), text: `${m.number}${m.letter ?? ''}` };
    });

    // Sector label markers
    const sectorMarkers = (sectors ?? []).map((sec, i) => {
      const sp = sec.startPoint?.trackPosition; if (!sp) return null;
      return { p: rp(sp), label: `S${i+1}`, color: SECTOR_COLORS[i] ?? '#fff' };
    }).filter(Boolean);

    // Speed trap
    const stPt = speedTrap?.trackPosition ? rp(speedTrap.trackPosition) : null;

    // Finish line
    let finishLine = null;
    if (trackPts.length >= 4) {
      const start = trackPts[0];
      const rotAngle = Math.atan2(trackPts[3].y - trackPts[0].y, trackPts[3].x - trackPts[0].x) * 180 / Math.PI;
      const flR = (2 * outerW) / 2, flA = (2 * outerW) / 8, flS = flR / 2;
      finishLine = {
        r: flR, h: 2 * outerW, a: flA,
        transform: `translate(${(start.x-flS).toFixed(2)},${(-start.y-flS).toFixed(2)}) rotate(${(-rotAngle).toFixed(4)} ${flS.toFixed(2)} ${flS.toFixed(2)}) translate(0,${(-flS).toFixed(2)})`,
      };
    }

    // Marshal sector dot positions (pre-rotated)
    const msDots = (marshalSectors ?? []).map(m => ({ number: m.number, p: rp(m.trackPosition) }));

    return {
      viewBox, trackD, pitD, trackPts, secStarts, msSegments, msDots,
      drsPaths, detectionPts, cornerMarkers, mlMarkers, sectorMarkers, stPt, finishLine,
      re, outerW, backdropW, innerW, pointSize, markerScale, mlScale,
      trackBackdrop, trackOuter, trackInner, pitInner, drsColor,
      center, rot,
    };
    } catch (e) { console.error('TrackMap geo error:', e); return null; }
  }, [layout]);

  const driverListRef    = useRef(driverList);
  const timingAppDataRef = useRef(timingAppData);
  const timingDataRef    = useRef(timingData);
  const sessionCategoryRef = useRef(sessionCategory);
  const sessionEventRef    = useRef(sessionEvent);
  const bestS1Ref        = useRef(null); // session best S1 in seconds (running minimum)
  const bestS2Ref        = useRef(null); // session best S2 in seconds (running minimum)
  const clockRef         = useRef(clock);
  const geoRef         = useRef(geo);
  const driversRef     = useRef(null);
  const carBufsRef     = useRef(new Map()); // per-car circular buffer: Map<num, {ts,entry}[]>
  const carSeenRef     = useRef(new Map()); // per-car dedup Set
  const renderDelayRef = useRef(1000);
  const prevPlaybackRef = useRef(null);
  driverListRef.current    = driverList;
  timingAppDataRef.current = timingAppData;
  timingDataRef.current    = timingData;
  sessionCategoryRef.current = sessionCategory;
  sessionEventRef.current    = sessionEvent;
  clockRef.current         = clock;
  geoRef.current        = geo;

  // Reset session best S1/S2 when session type changes
  useEffect(() => {
    bestS1Ref.current = null;
    bestS2Ref.current = null;
  }, [sessionCategory, sessionEvent]);

  // Track running session best S1/S2 from TimingData sector values
  useEffect(() => {
    if (!timingData?.Lines) return;
    for (const line of Object.values(timingData.Lines)) {
      const sectors = Array.isArray(line.Sectors) ? line.Sectors : Object.values(line.Sectors ?? {});
      // Skip outlap sectors (blue segments) — they inflate the reference
      if (segsOf(sectors[0]).some(s => s.Status === 2064)) continue;
      const s1 = parseTime(sectors[0]?.Value);
      const s2 = parseTime(sectors[1]?.Value);
      if (s1 !== null && (bestS1Ref.current === null || s1 < bestS1Ref.current)) bestS1Ref.current = s1;
      if (s2 !== null && (bestS2Ref.current === null || s2 < bestS2Ref.current)) bestS2Ref.current = s2;
    }
  }, [timingData]);

  // Accumulate incoming position frames into per-car buffers
  useEffect(() => {
    if (!positionFrames.length) return;
    for (const frame of positionFrames) {
      const raw = frame.Timestamp;
      const ts = /^\d+(\.\d*)?$/.test(String(raw).trim()) ? Number(raw) : new Date(raw).getTime();
      if (!Number.isFinite(ts) || !frame.Entries) continue;
      for (const [num, entry] of Object.entries(frame.Entries)) {
        let buf  = carBufsRef.current.get(num);
        let seen = carSeenRef.current.get(num);
        if (!buf) { buf = []; seen = new Set(); carBufsRef.current.set(num, buf); carSeenRef.current.set(num, seen); }
        if (!seen.has(ts)) {
          seen.add(ts);
          buf.push({ ts, entry });
          if (buf.length > 10) { seen.delete(buf[0].ts); buf.shift(); }
        }
      }
    }
  }, [positionFrames]);

  useEffect(() => {
    let rafId;
    function frame() {
      const c = clockRef.current, g = geoRef.current, el = driversRef.current;
      if (!c || !g || !el || !carBufsRef.current.size) { rafId = requestAnimationFrame(frame); return; }

      const elapsed      = c.paused ? 0 : Math.max(0, Date.now() - Number(c.systemTime));
      const playbackTime = Number(c.trackTime) + elapsed;

      // Seek/calibration detection — reset on large forward jump or any backward jump > 200ms
      if (prevPlaybackRef.current !== null) {
        const dt = playbackTime - prevPlaybackRef.current;
        if (dt > 3000 || dt < -200) {
          carBufsRef.current.clear(); carSeenRef.current.clear(); renderDelayRef.current = 0;
          bestS1Ref.current = null; bestS2Ref.current = null;
          prevPlaybackRef.current = playbackTime; rafId = requestAnimationFrame(frame); return;
        }
      }
      prevPlaybackRef.current = playbackTime;

      // Measure frame interval from first car's buffer
      let frameInterval = 270;
      const firstBuf = carBufsRef.current.values().next().value;
      if (firstBuf && firstBuf.length >= 3) {
        const n = firstBuf.length;
        let sum = 0, cnt = 0;
        for (let i = Math.max(0, n - 6); i < n - 1; i++) {
          const gap = firstBuf[i + 1].ts - firstBuf[i].ts;
          if (gap > 0 && gap < 10000) { sum += gap; cnt++; }
        }
        if (cnt > 0) frameInterval = sum / cnt;
      }

      // Clamp renderTime to global buffer range
      let minTs = Infinity, maxTs = -Infinity;
      for (const buf of carBufsRef.current.values()) {
        if (!buf.length) continue;
        if (buf[0].ts < minTs) minTs = buf[0].ts;
        if (buf[buf.length - 1].ts > maxTs) maxTs = buf[buf.length - 1].ts;
      }
      const latestTs = firstBuf ? firstBuf[firstBuf.length - 1].ts : maxTs;
      // Target: stay just behind latest frame for smooth interpolation.
      // Use faster decay (0.99) so spikes in live data recover in ~1s instead of ~12s.
      const rawTarget = (playbackTime - latestTs) + frameInterval * 1.5;
      renderDelayRef.current = Math.max(renderDelayRef.current * 0.99, rawTarget);
      const renderTime = playbackTime - renderDelayRef.current;
      const clampedTime = Math.max(minTs, Math.min(renderTime, maxTs));

      const dotR = g.re * DOT_RADIUS, fs = g.re * DOT_FONT_SIZE;

      // Interpolate each car and split into pit / pit-out / on-track layers
      const pitParts    = [];
      const pitOutParts = [];
      const coldParts   = []; // on track but not on a hot lap (qualifying only)
      const hotParts    = []; // on track and on a hot lap

      for (const [num, buf] of carBufsRef.current.entries()) {
        if (buf.length < 2) continue;

        // Find bracketing index
        let i = buf.length - 2;
        for (let j = 0; j < buf.length - 1; j++) {
          if (buf[j + 1].ts > clampedTime) { i = j; break; }
        }

        const i0 = Math.max(0, i - 1), i1 = i, i2 = Math.min(buf.length - 1, i + 1), i3 = Math.min(buf.length - 1, i + 2);
        const a = buf[i1], b = buf[i2];
        const span = b.ts - a.ts;
        const t = span > 0 ? Math.max(0, Math.min(1, (clampedTime - a.ts) / span)) : 0;

        const e0 = buf[i0].entry, e1 = a.entry, e2 = b.entry, e3 = buf[i3].entry;
        const rx = catmullRom(Number(e0.X), Number(e1.X), Number(e2.X), Number(e3.X), t);
        const ry = catmullRom(Number(e0.Y), Number(e1.Y), Number(e2.Y), Number(e3.Y), t);
        if (rx === 0 && ry === 0) continue;

        const p = rotPt({ x: rx, y: ry }, g.center, g.rot);
        const driver    = driverListRef.current[num];
        if (!driver) continue; // skip non-driver entries (SC, medical car, etc.)
        const teamStyle = TEAM_STYLES[driver?.TeamName];
        const color     = teamStyle?.background ?? (driver.TeamColour ? `#${driver.TeamColour}` : '#ffffff');
        const textColor = teamStyle?.text ?? (teamStyle ? '#ffffff' : '#000000');
        const tla       = driver.Tla ?? num;

        const appLine     = timingAppDataRef.current?.Lines?.[num];
        const stints      = appLine?.Stints ? Object.values(appLine.Stints) : [];
        const stint       = stints[stints.length - 1];
        const borderColor = getCompoundBorderStyle(stint?.Compound ?? null, true).color;

        const tdLine    = timingDataRef.current?.Lines?.[num];
        if (tdLine?.KnockedOut === true || tdLine?.Retired === true || tdLine?.Stopped === true) continue;
        const inPit     = tdLine?.InPit === true;
        const pitOut    = !inPit && tdLine?.PitOut === true;
        const pos       = tdLine?.Position ?? 999;
        const isQual    = sessionEventRef.current === 'qualifying';
        const hotLap    = !isQual || inPit || pitOut || isOnHotLap(tdLine ?? {}, bestS1Ref.current, bestS2Ref.current);
        const isRace    = sessionEventRef.current === 'race';
        const isLapped  = isRace && !inPit && !pitOut && /^(\+\d+ LAPS?|\d+ L)$/i.test(String(tdLine?.GapToLeader ?? '').trim());
        const scale     = inPit ? DOT_PIT_SCALE : 1;

        const cx = p.x.toFixed(1), cy = (-p.y).toFixed(1);
        const r      = (dotR  * scale).toFixed(1);
        const rO     = (dotR  * scale * DOT_RING_OUTER).toFixed(1);
        const rG     = (dotR  * scale * DOT_RING_GAP).toFixed(1);
        const fsPit  = (fs    * scale).toFixed(1);
        const html =
          `<circle cx="${cx}" cy="${cy}" r="${rO}" fill="${borderColor}"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${rG}" fill="#000"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` +
          `<text x="${cx}" y="${cy}" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-size="${fsPit}" font-weight="bold" font-family="Gotham, monospace">${tla}</text>`;

        (inPit ? pitParts : pitOut ? pitOutParts : hotLap ? hotParts : coldParts).push({ pos, html });
      }

      // Sort each layer P20 → P1 (higher pos renders first = below)
      const byPosDesc = (a, b) => b.pos - a.pos;
      pitParts.sort(byPosDesc);
      pitOutParts.sort(byPosDesc);
      coldParts.sort(byPosDesc);
      hotParts.sort(byPosDesc);

      el.innerHTML = [...pitParts, ...pitOutParts, ...coldParts, ...hotParts].map(d => d.html).join('');
      window._tmDebug = { renderDelay: Math.round(renderDelayRef.current), frameInterval: Math.round(frameInterval), maxTsAheadOfPlay: Math.round(maxTs - playbackTime), renderTime: Math.round(renderTime), clampedTime: Math.round(clampedTime), clamped: clampedTime !== renderTime };
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (!geo) return <div style={{color:'#e10600',padding:'20px'}}>Track geometry error — check console</div>;

  const {
    viewBox, trackD, pitD, trackPts, secStarts, msSegments, msDots,
    drsPaths, detectionPts, cornerMarkers, mlMarkers, sectorMarkers, stPt, finishLine,
    re, outerW, backdropW, innerW, pointSize, markerScale, mlScale,
    trackBackdrop, trackOuter, trackInner, pitInner, drsColor,
  } = geo;


  const dash = (backdropW / 5).toFixed(2);

  const P = ({ d, stroke, strokeWidth, ...rest }) => (
    <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" {...rest} />
  );

  const activeOuterColor = trackStatusColor ?? trackOuter;

  return (
    <svg viewBox={viewBox} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        {finishLine && (
          <pattern id="sf_checker" patternUnits="userSpaceOnUse" width={finishLine.a * 2} height={finishLine.a * 2}>
            <rect fill="#fff" x={0} y={0} width={finishLine.a} height={finishLine.a} />
            <rect fill="#fff" x={finishLine.a} y={finishLine.a} width={finishLine.a} height={finishLine.a} />
            <rect fill="#000" x={0} y={finishLine.a} width={finishLine.a} height={finishLine.a} />
            <rect fill="#000" x={finishLine.a} y={0} width={finishLine.a} height={finishLine.a} />
          </pattern>
        )}
      </defs>

      {/* Pit backdrop */}
      {layers.pitlane && pitD && <P d={pitD} stroke={trackBackdrop} strokeWidth={backdropW} />}
      {/* Track backdrop */}
      <P d={trackD} stroke={trackBackdrop} strokeWidth={backdropW} />
      {/* Pit outer */}
      {layers.pitlane && pitD && <P d={pitD} stroke={trackOuter} strokeWidth={outerW} />}
      {/* Track outer */}
      <P d={trackD} stroke={activeOuterColor} strokeWidth={outerW} />

      {/* Marshal sector flag highlights */}
      {flagSectors.size > 0 && msSegments.filter(s => flagSectors.has(s.number)).map(s => (
        <P key={`flag-${s.number}`} d={s.d} stroke={FLAG_COLORS[flagSectors.get(s.number)] ?? FLAG_COLORS['YELLOW']} strokeWidth={outerW} opacity={0.7} />
      ))}

      {/* Overtake / DRS zone dashes */}
      {layers.drs && drsPaths.map((d, i) => (
        <P key={`drs-${i}`} d={d} stroke={drsColor} strokeWidth={backdropW} strokeDasharray={`${dash} ${dash}`} opacity={0.85} />
      ))}

      {/* Pit inner */}
      {layers.pitlane && pitD && <P d={pitD} stroke={pitInner} strokeWidth={innerW} opacity={0.9} />}
      {/* Track inner */}
      <P d={trackD} stroke={trackInner} strokeWidth={innerW} />

      {/* Sector color segments */}
      {layers.sectors && secStarts.length === 3 && (() => {
        const [i1, i2, i3] = secStarts, n = trackPts.length;
        return [
          { from: i1, to: i2, c: SECTOR_COLORS[0] },
          { from: i2, to: i3, c: SECTOR_COLORS[1] },
          { from: i3, to: i1 === 0 ? n-1 : i1, c: SECTOR_COLORS[2] },
        ].map(({ from, to, c }, i) => (
          <P key={i} d={slicePath(trackPts, from, to)} stroke={c} strokeWidth={innerW} strokeLinecap="round" />
        ));
      })()}

      {/* Detection points — on top */}
      {layers.drs && detectionPts.map((p, i) => (
        <g key={`det-${i}`}>
          <circle cx={p.x} cy={-p.y} r={backdropW/4}   fill="rgba(0,230,118,0.9)" />
          <circle cx={p.x} cy={-p.y} r={backdropW/1.5} fill="rgba(0,230,118,0.3)" />
        </g>
      ))}

      {/* Marshal sector dots */}
      {layers.marshalSectors && msDots.map(({ number, p }) => (
        <g key={`ms-${number}`}>
          <circle cx={p.x} cy={-p.y} r={re * 5} fill="#333" stroke="#555" strokeWidth={re} />
          <text x={p.x} y={-p.y} dominantBaseline="middle" textAnchor="middle" fill="#888" fontSize={re * 7} fontFamily="monospace">{number}</text>
        </g>
      ))}

      {/* Speed trap */}
      {layers.speedTrap && stPt && (
        <g>
          <circle cx={stPt.x} cy={-stPt.y} r={backdropW/4}   fill="#fff" />
          <circle cx={stPt.x} cy={-stPt.y} r={backdropW/1.5} fill="rgba(255,255,255,0.4)" />
        </g>
      )}

      {/* Sector labels */}
      {layers.sectorLabels && sectorMarkers.map(({ p, label, color }) => (
        <g key={label}>
          <circle cx={p.x} cy={-p.y} r={re * 13} fill={color} />
          <text x={p.x} y={-p.y} dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize={re * 12} fontWeight="bold" fontFamily="monospace">{label}</text>
        </g>
      ))}

      {/* Corner markers */}
      {layers.corners && cornerMarkers.map(({ base, label, num }, i) => (
        <g key={`corner-${i}`}>
          <circle cx={base.x} cy={-base.y} r={pointSize/2} fill="rgba(255,255,255,0.7)" />
          <line x1={base.x} y1={-base.y} x2={label.x} y2={-label.y} stroke="rgba(255,255,255,0.3)" strokeWidth={pointSize/2} />
          <g transform={`translate(${label.x},${-label.y}) scale(${markerScale})`}>
            <circle r={20} fill="#121212" />
            <circle r={20} fill="rgba(255,255,255,0.2)" />
            <text textAnchor="middle" dy="0.35em" fill="#fff" fontWeight="600" fontSize={20} fontFamily="monospace">{num}</text>
          </g>
        </g>
      ))}

      {/* Marshal light markers */}
      {layers.marshalLights && mlMarkers.map(({ base, label, text }, i) => (
        <g key={`ml-${i}`}>
          <circle cx={base.x} cy={-base.y} r={pointSize/2} fill="rgba(255,255,255,0.7)" />
          <line x1={base.x} y1={-base.y} x2={label.x} y2={-label.y} stroke="rgba(255,255,255,0.3)" strokeWidth={pointSize/2} />
          <g transform={`translate(${label.x},${-label.y}) scale(${mlScale})`}>
            <rect x={-19} y={-15} width={38} height={30} rx={4} fill="#121212" />
            <rect x={-19} y={-15} width={38} height={30} rx={4} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
            <text textAnchor="middle" dy="0.35em" fill="#fff" fontWeight="600" fontSize={20} fontFamily="monospace">{text}</text>
          </g>
        </g>
      ))}

      {/* Finish line */}
      {layers.sf && finishLine && (
        <rect fill="url(#sf_checker)" width={finishLine.r} height={finishLine.h} transform={finishLine.transform} opacity={0.95} />
      )}

      {/* Driver dots — updated directly via RAF, no React re-render */}
      <g ref={driversRef} />
    </svg>
  );
}

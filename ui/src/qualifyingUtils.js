export function parseTime(str) {
  if (!str) return null;
  const parts = str.split(':');
  const val = parts.length === 2
    ? parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    : parseFloat(str);
  return isNaN(val) ? null : val;
}

export function segsOf(sector) {
  if (!sector?.Segments) return [];
  return Array.isArray(sector.Segments) ? sector.Segments : Object.values(sector.Segments);
}

export function isOnHotLap(line, refS1Sec, refS2Sec = null) {
  // Not on track
  if (line.KnockedOut || line.Retired || line.InPit || line.PitOut || line.Stopped) return false;
  const sectors = Array.isArray(line.Sectors) ? line.Sectors : Object.values(line.Sectors ?? {});
  // Outlap — blue segments in S1
  if (segsOf(sectors[0]).some(s => s.Status === 2064)) return false;
  // Lap already complete — S3 time is set
  if (sectors[2]?.Value) return false;
  // No sector activity — not currently on a lap
  if (!sectors.some(s => segsOf(s).some(seg => seg.Status !== 0))) return false;
  // Sector times too slow — cooldown or abandoned lap
  if (refS1Sec !== null) {
    const s1Val = parseTime(sectors[0]?.Value);
    if (s1Val !== null && s1Val > refS1Sec * 1.07) return false;
  }
  if (refS2Sec !== null) {
    const s2Val = parseTime(sectors[1]?.Value);
    if (s2Val !== null && s2Val > refS2Sec * 1.07) return false;
  }
  return true;
}

import TEAM_STYLES, { teamLogoUrl } from '../teamStyles';
import TyreIcon from './TyreIcon';
import styles from './TimingTable.module.css';

const HEADSHOT_BASE = 'https://media.formula1.com/image/upload/ar_1:1,c_crop,g_north,w_1000/';

const SEG_COLORS = {
  2064: '#0067ff', // blue — pit in/out segment
  2051: '#bf00ff', // purple — overall fastest
  2049: '#00c820', // green — personal best
  2048: '#ffc906', // yellow — slower than personal best
     0: '#333',    // grey — not yet reached
};

function SegmentBlocks({ segments }) {
  const segs = Object.values(segments ?? {});
  if (!segs.length) return '—';
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {segs.map((seg, i) => (
        <span key={i} style={{ width: 5, height: 10, background: SEG_COLORS[seg.Status] ?? '#333', display: 'inline-block' }} />
      ))}
    </span>
  );
}

// Parse "1:36.968" or "36.968" to ms
function parseTime(str) {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length === 2) return (parseInt(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
  return parseFloat(parts[0]) * 1000;
}

// Format ms difference as "+0.000" string
function fmtDiff(ms) {
  if (ms == null) return '—';
  const s = (ms / 1000).toFixed(3);
  return ms >= 0 ? `+${s}` : s;
}

// Build gap/interval map for qualifying from BestLapTime values
function buildQualGaps(rows) {
  // Build time map for all drivers that have a time
  const timeMap = {};
  rows.forEach(r => {
    const ms = parseTime(r.line.BestLapTime?.Value);
    if (ms != null && !isNaN(ms)) timeMap[r.num] = ms;
  });

  const times = Object.values(timeMap);
  if (!times.length) return {};
  const fastest = Math.min(...times);

  const gaps = {};
  rows.forEach((r, i) => {
    const ms = timeMap[r.num];
    if (ms == null) return; // no time — leave as '—'

    // Gap to leader (fastest timed driver)
    const gap = ms === fastest ? '—' : fmtDiff(ms - fastest);

    // Interval: driver directly ahead in position order
    // If that driver has no time, interval is '—'
    const prev = rows[i - 1];
    const prevMs = prev ? timeMap[prev.num] : null;
    const interval = !prev ? '—' : prevMs != null ? fmtDiff(ms - prevMs) : '—';

    gaps[r.num] = { gap, interval };
  });
  return gaps;
}

function driverStatus(line) {
  if (line.Retired)     return 'RETIRED';
  if (line.Stopped)     return 'STOPPED';
  if (line.KnockedOut)  return 'KO';
  if (line.InPit)       return 'PIT';
  if (line.PitOut)      return 'PIT OUT';
  return '—';
}

function headshotUrl(driver, direction = 'front') {
  const raw = driver?.PublicIdRight;
  if (!raw) return null;
  const base = raw.replace(/(front|left|right)$/i, '');
  return HEADSHOT_BASE + base + direction + '.png';
}

export default function TimingTable({ state }) {
  const isQualifying = state?.SessionPart != null;
  const timing      = state?.TimingData?.Lines ?? {};
  const drivers     = state?.DriverList ?? {};
  const bestSectors = state?.BestLapSectors ?? {};
  const timingStats  = state?.TimingStats?.Lines ?? {};
  const timingApp    = state?.TimingAppData?.Lines ?? {};
  const carEntries   = state?.CarData?.Entries ?? [];
  const latestCars   = carEntries[carEntries.length - 1]?.Cars ?? {};

  const noEntries   = state?.TimingData?.NoEntries ?? {};
  const sessionPart = state?.TimingData?.SessionPart ?? state?.SessionPart ?? null;
  const cutoffPos   = sessionPart != null ? Number(noEntries[sessionPart + 1] ?? 0) : 0;

  const rows = Object.entries(timing)
    .map(([num, line]) => ({ num, line, driver: drivers[num] ?? {} }))
    .sort((a, b) => Number(a.line.Position ?? 99) - Number(b.line.Position ?? 99));

  const qualGaps = isQualifying ? buildQualGaps(rows) : null;

  if (!rows.length) return <div className={styles.empty}>No timing data</div>;

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>P</th>
            <th className={styles.th}>Grid</th>
            <th className={styles.th}>+/-</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Cutoff</th>
            <th className={styles.th}>Chequered</th>
            <th className={styles.th}>Best Lap</th>
            <th className={styles.th}>Gap</th>
            <th className={styles.th}>Interval</th>
            <th className={styles.th}>Pits</th>
            <th className={styles.th}>Tyre</th>
            <th className={styles.th}>Tyre Laps</th>
            <th className={styles.th}>Tyre History</th>
            <th className={styles.th}>Laps</th>
            <th className={styles.th}>Last Lap</th>
            <th className={styles.th}>S1</th>
            <th className={styles.th}>Prev S1</th>
            <th className={styles.th}>Segs S1</th>
            <th className={styles.th}>S2</th>
            <th className={styles.th}>Prev S2</th>
            <th className={styles.th}>Segs S2</th>
            <th className={styles.th}>S3</th>
            <th className={styles.th}>Prev S3</th>
            <th className={styles.th}>Segs S3</th>
            <th className={styles.th}>Best Tyre</th>
            <th className={styles.th}>Best S1</th>
            <th className={styles.th}>Best S2</th>
            <th className={styles.th}>Best S3</th>
            <th className={styles.th}>Overall S1</th>
            <th className={styles.th}>Overall S2</th>
            <th className={styles.th}>Overall S3</th>
            <th className={styles.th}>I1</th>
            <th className={styles.th}>I2</th>
            <th className={styles.th}>FL</th>
            <th className={styles.th}>ST</th>
            <th className={styles.th}>Best I1</th>
            <th className={styles.th}>Best I2</th>
            <th className={styles.th}>Best FL</th>
            <th className={styles.th}>Best ST</th>
            <th className={styles.th}>No</th>
            <th className={styles.th}>TLA</th>
            <th className={styles.th}>First</th>
            <th className={styles.th}>Last</th>
            <th className={styles.th}>Team</th>
            <th className={styles.th}>Team Short</th>
            <th className={styles.th}>Team Code</th>
            <th className={styles.th}>Team Color</th>
            <th className={styles.th}>Logo</th>
            <th className={styles.th}>RPM</th>
            <th className={styles.th}>Speed</th>
            <th className={styles.th}>Gear</th>
            <th className={styles.th}>Throttle</th>
            <th className={styles.th}>Brake</th>
            <th className={styles.th}>DRS</th>
            <th className={styles.th}>Helmet</th>
            <th className={styles.th}>Headshot Front</th>
            <th className={styles.th}>Headshot Left</th>
            <th className={styles.th}>Headshot Right</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ num, line, driver }) => (
            <tr key={num} className={styles.row}>
              <td className={styles.pos}>{line.Position ?? '—'}</td>
              <td className={styles.cell}>{line.GridPos ?? timingApp[num]?.GridPos ?? '—'}</td>
              {(() => {
                const grid = Number(line.GridPos ?? timingApp[num]?.GridPos ?? 0);
                const pos  = Number(line.Position ?? 0);
                if (!grid || !pos) return <td className={styles.cell}>—</td>;
                const diff = grid - pos;
                const color = diff > 0 ? '#00c820' : diff < 0 ? '#e8002d' : '#555';
                const label = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '=';
                return <td className={styles.cell} style={{ color }}>{label}</td>;
              })()}
              <td className={styles.cell}>{driverStatus(line)}</td>
              {(() => {
                const pos = Number(line.Position ?? 0);
                const inDanger = cutoffPos > 0 && pos > cutoffPos && !line.KnockedOut;
                return (
                  <td className={styles.cell}>
                    {cutoffPos === 0 ? '—' : inDanger ? 'YES' : 'NO'}
                  </td>
                );
              })()}
              <td className={styles.cell}>{line.TakenChequered == null ? '—' : line.TakenChequered ? 'YES' : 'NO'}</td>
              <td className={styles.cell}>{line.BestLapTime?.Value || '—'}</td>
              <td className={styles.cell}>{isQualifying ? (qualGaps[num]?.gap ?? '—') : (line.GapToLeader || '—')}</td>
              <td className={styles.cell}>{isQualifying ? (qualGaps[num]?.interval ?? '—') : (line.IntervalToPositionAhead?.Value || '—')}{!isQualifying && line.IntervalToPositionAhead?.Catching ? ' ▲' : ''}</td>
              <td className={styles.cell}>{line.NumberOfPitStops ?? '—'}</td>
              {(() => {
                const stints = timingApp[num]?.Stints ?? {};
                const lastStint = Object.values(stints).at(-1);
                return <>
                  <td className={styles.cell}>
                    {lastStint?.Compound
                      ? <TyreIcon compound={lastStint.Compound} isNew={String(lastStint.New) === 'true'} size="2em" />
                      : '—'}
                  </td>
                  <td className={styles.cell}>{lastStint?.TotalLaps ?? '—'}</td>
                  <td className={styles.cell}>
                    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', verticalAlign: 'middle' }}>
                      {Object.values(stints).map((stint, i) => (
                        stint.Compound
                          ? <TyreIcon key={i} compound={stint.Compound} isNew={String(stint.New) === 'true'} label={String(stint.TotalLaps ?? '?')} size="2em" />
                          : null
                      ))}
                    </span>
                  </td>
                  <td className={styles.cell}>{line.NumberOfLaps ?? '—'}</td>
                </>;
              })()}
              <td className={styles.cell}>{line.LastLapTime?.Value || '—'}</td>
              <td className={styles.cell}>{line.Sectors?.[0]?.Value || '—'}</td>
              <td className={styles.cell}>{line.Sectors?.[0]?.PreviousValue || '—'}</td>
              <td className={styles.cell}><SegmentBlocks segments={line.Sectors?.[0]?.Segments} /></td>
              <td className={styles.cell}>{line.Sectors?.[1]?.Value || '—'}</td>
              <td className={styles.cell}>{line.Sectors?.[1]?.PreviousValue || '—'}</td>
              <td className={styles.cell}><SegmentBlocks segments={line.Sectors?.[1]?.Segments} /></td>
              <td className={styles.cell}>{line.Sectors?.[2]?.Value || '—'}</td>
              <td className={styles.cell}>{line.Sectors?.[2]?.PreviousValue || '—'}</td>
              <td className={styles.cell}><SegmentBlocks segments={line.Sectors?.[2]?.Segments} /></td>
              <td className={styles.cell}>
                {bestSectors[num]?.compound
                  ? <TyreIcon compound={bestSectors[num].compound} isNew={bestSectors[num].isNew} size="2em" />
                  : '—'}
              </td>
              <td className={styles.cell}>{bestSectors[num]?.S1 || '—'}</td>
              <td className={styles.cell}>{bestSectors[num]?.S2 || '—'}</td>
              <td className={styles.cell}>{bestSectors[num]?.S3 || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSectors?.[0]?.Value || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSectors?.[1]?.Value || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSectors?.[2]?.Value || '—'}</td>
              <td className={styles.cell}>{line.Speeds?.I1?.Value || '—'}</td>
              <td className={styles.cell}>{line.Speeds?.I2?.Value || '—'}</td>
              <td className={styles.cell}>{line.Speeds?.FL?.Value || '—'}</td>
              <td className={styles.cell}>{line.Speeds?.ST?.Value || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSpeeds?.I1?.Value || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSpeeds?.I2?.Value || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSpeeds?.FL?.Value || '—'}</td>
              <td className={styles.cell}>{timingStats[num]?.BestSpeeds?.ST?.Value || '—'}</td>
              <td className={styles.cell}>{driver.RacingNumber ?? num}</td>
              <td className={styles.cell}>{driver.Tla ?? '—'}</td>
              <td className={styles.cell}>{driver.FirstName ?? '—'}</td>
              <td className={styles.cell}>{driver.LastName ?? '—'}</td>
              <td className={styles.cell}>{driver.TeamName ?? '—'}</td>
              <td className={styles.cell}>{TEAM_STYLES[driver.TeamName]?.shortName ?? driver.TeamName?.split(' ')[0] ?? '—'}</td>
              <td className={styles.cell}>{TEAM_STYLES[driver.TeamName]?.code ?? '—'}</td>
              <td className={styles.cell}>
                <span style={{ color: TEAM_STYLES[driver.TeamName]?.background ?? (driver.TeamColour ? `#${driver.TeamColour}` : '#888') }}>█</span>
              </td>
              <td className={styles.cell}>
                {teamLogoUrl(driver.TeamName, driver.PublicIdRight)
                  ? <img src={teamLogoUrl(driver.TeamName, driver.PublicIdRight)} alt="" style={{ height: 24, display: 'block' }} />
                  : '—'}
              </td>
              {(() => {
                const ch = latestCars[num]?.Channels ?? {};
                return <>
                  <td className={styles.cell}>{ch[0] ?? '—'}</td>
                  <td className={styles.cell}>{ch[2] ?? '—'}</td>
                  <td className={styles.cell}>{ch[3] ?? '—'}</td>
                  <td className={styles.cell}>{ch[4] ?? '—'}</td>
                  <td className={styles.cell}>{ch[5] ?? '—'}</td>
                  <td className={styles.cell}>{ch[45] != null ? (ch[45] > 0 ? 'ON' : 'off') : '—'}</td>
                </>;
              })()}
              <td className={styles.cell}>
                <img
                  src={`/helmets/${driver.LastName?.toLowerCase().replace(/\s+/g, '')}.png`}
                  alt=""
                  style={{ height: 32, display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              </td>
              {['front','left','right'].map(dir => (
                <td key={dir} className={styles.cell}>
                  {headshotUrl(driver, dir)
                    ? <img src={headshotUrl(driver, dir)} alt={dir} style={{ height: 32, display: 'block' }} />
                    : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useRef } from 'react';
import TEAM_STYLES from '../../teamStyles';
import TyreIcon from '../../components/TyreIcon';

const PIT_STATUS = {
  inPit:  { label: 'IN PIT',  bg: '#1565c0' },
  pitOut: { label: 'PIT OUT', bg: '#2e7d32' },
};

export default function PitLaneWidget({ state }) {
  const orderRef     = useRef(new Map()); // num → enteredAt (ms)
  const prevStateRef = useRef(new Map()); // num → { inPit, pitOut }

  const sessionType = state?.SessionInfo?.Type ?? null;
  const sessionEvent = state?.SessionInfo?.SessionEvent ?? null;
  if (sessionEvent !== 'race') return null;

  const timingLines = state?.TimingData?.Lines  ?? {};
  const driverList  = state?.DriverList ?? {};
  const timingApp   = state?.TimingAppData?.Lines ?? {};
  const now = Date.now();

  for (const num of Object.keys(timingLines)) {
    const line    = timingLines[num];
    const inPit     = !!(line?.InPit);
    const pitOut    = !!(line?.PitOut);
    const knockedOut= !!(line?.KnockedOut);
    const retired   = !!(line?.Retired);
    const stopped   = !!(line?.Stopped);
    const prev      = prevStateRef.current.get(num) ?? { inPit: false, pitOut: false };

    if (inPit && !prev.inPit && !retired && !stopped) {
      orderRef.current.set(num, now);
    }
    if ((!inPit && !pitOut && (prev.inPit || prev.pitOut)) || retired || stopped || knockedOut) {
      orderRef.current.delete(num);
    }

    prevStateRef.current.set(num, { inPit, pitOut });
  }

  const rows = [];
  for (const [num, enteredAt] of orderRef.current) {
    const line = timingLines[num];
    if (!line) continue;
    const inPit  = !!(line.InPit);
    const pitOut = !!(line.PitOut);
    const stints    = timingApp[num]?.Stints;
    const stintsArr = Array.isArray(stints) ? stints : Object.values(stints ?? {});
    const stint     = stintsArr.length ? stintsArr[stintsArr.length - 1] : null;
    rows.push({ num, enteredAt, inPit, pitOut, stint, driver: driverList[num], line });
  }
  rows.sort((a, b) => {
    if (a.pitOut !== b.pitOut) return a.pitOut ? -1 : 1;
    return parseInt(a.line?.Position ?? 99) - parseInt(b.line?.Position ?? 99);
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      boxSizing: 'border-box',
      display: 'grid', gridTemplateRows: 'auto 1fr',
      padding: 10, gap: 6,
      background: 'rgba(255,255,255,0.05)', borderRadius: 4,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: 2, color: '#fff',
        textTransform: 'uppercase',
      }}>
        Pit Lane
      </div>

      <div style={{
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '3px auto auto 1fr',
        columnGap: 10,
        rowGap: 6,
        alignContent: 'start',
        overflowY: 'auto', scrollbarWidth: 'none',
      }}>
        {rows.map(({ num, inPit, pitOut, stint, driver }) => {
          const teamStyle = TEAM_STYLES[driver?.TeamName] ?? { background: '#555', text: '#fff' };
          const tla    = driver?.Tla ?? num;
          const status = inPit ? PIT_STATUS.inPit : pitOut ? PIT_STATUS.pitOut : null;
          const compound = stint?.Compound ?? null;
          const isNew    = !(stint?.New === false || stint?.New === 'false');

          return (
            <div key={num} style={{
              display: 'grid',
              gridColumn: '1 / -1',
              gridTemplateColumns: 'subgrid',
              alignItems: 'center',
            }}>
              <div style={{ width: 3, borderRadius: 2, background: teamStyle.background, alignSelf: 'stretch' }} />
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
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {status && (
                  <div style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                    padding: '2px 4px', borderRadius: 3,
                    background: status.bg, color: '#fff',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>
                    {status.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

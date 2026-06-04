import { useEffect, useState } from 'react';
import TrackMap from '../../components/TrackMap';
import { TRACK_STATUS_COLORS } from '../../colors';

const OVERLAY_LAYERS = {
  pitlane: true, sectors: true, sectorLabels: false, corners: true,
  marshalLights: true, marshalSectors: false, speedTrap: true, sf: true, drs: true,
};

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : Object.values(val);
}

function computeTrackState(s) {
  const trackStatusColor = TRACK_STATUS_COLORS[String(s?.TrackStatus?.Status)] ?? null;
  const flagSectors = new Map();
  for (const msg of toArray(s?.RaceControlMessages?.Messages)) {
    if (msg?.Category !== 'Flag') continue;
    const flag   = String(msg.Flag  ?? '').toUpperCase();
    const scope  = String(msg.Scope ?? '').toUpperCase();
    const sector = typeof msg.Sector === 'number' ? msg.Sector : null;
    if (scope === 'TRACK' && flag === 'GREEN') {
      flagSectors.clear();
    } else if (scope === 'SECTOR' && sector != null) {
      if (flag === 'DOUBLE YELLOW' || flag === 'YELLOW') {
        flagSectors.set(sector, flag);
      } else if (flag === 'GREEN' || flag === 'CLEAR') {
        flagSectors.delete(sector);
      }
    }
  }
  let overtakeEnabled = true;
  for (const msg of toArray(s?.RaceControlMessages?.Messages)) {
    if (msg?.Category !== 'Other') continue;
    const text = String(msg.Message ?? '').toUpperCase();
    if (text === 'OVERTAKE ENABLED')  overtakeEnabled = true;
    if (text === 'OVERTAKE DISABLED') overtakeEnabled = false;
  }
  return { trackStatusColor, flagSectors, overtakeEnabled };
}

export default function TrackMapOverlay({ state, clock, positionFrames = [] }) {
  const [layout,  setLayout]  = useState(null);
  const [loadKey, setLoadKey] = useState(null);

  const circuitKey = state?.SessionInfo?.Meeting?.Circuit?.Key;
  const season     = state?.SessionInfo?.Path?.match(/^(\d{4})\//)?.[1];
  const cacheKey   = circuitKey && season ? `${circuitKey}_${season}` : null;

  useEffect(() => {
    if (!cacheKey || cacheKey === loadKey) return;
    setLoadKey(cacheKey);
    setLayout(null);
    fetch(`/f1/circuits/${circuitKey}/${season}`)
      .then(r => r.json())
      .then(setLayout)
      .catch(() => {});
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!layout) return null;

  const trackState = computeTrackState(state);
  const layers     = { ...OVERLAY_LAYERS, drs: OVERLAY_LAYERS.drs && trackState.overtakeEnabled };

  return (
    <TrackMap
      layout={layout}
      layers={layers}
      trackState={trackState}
      positionFrames={positionFrames}
      driverList={state?.DriverList ?? {}}
      timingAppData={state?.TimingAppData ?? null}
      timingData={state?.TimingData ?? null}
      sessionCategory={state?.SessionInfo?.SessionCategory ?? null}
      sessionEvent={state?.SessionInfo?.SessionEvent ?? null}
      clock={clock}
    />
  );
}

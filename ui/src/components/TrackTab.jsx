import { useEffect, useState } from 'react';
import TrackMap from './TrackMap';
import styles from './TrackTab.module.css';
import { TRACK_STATUS_COLORS, FLAG_COLORS } from '../colors';

const DEFAULT_LAYERS = {
  pitlane: true, sectors: true, sectorLabels: false, corners: true,
  marshalLights: true, marshalSectors: false, speedTrap: true, sf: true, drs: true,
};

const LAYER_LABELS = [
  ['pitlane',       'Pit lane'],
  ['drs',           'Overtake zones'],
  ['sectors',       'Sector colors'],
  ['sectorLabels',  'S1/S2/S3'],
  ['corners',       'Corners'],
  ['marshalLights', 'Marshal lights'],
  ['marshalSectors','Marshal sectors'],
  ['speedTrap',     'Speed trap'],
  ['sf',            'SF / finish'],
];

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

export default function TrackTab({ state: s, clock, positionFrames = [] }) {
  const [layers, setLayers]       = useState(DEFAULT_LAYERS);
  const [layout, setLayout]       = useState(null);
  const [loadKey, setLoadKey]     = useState(null);
  const [loadError, setLoadError] = useState(null);

  const circuitKey = s?.SessionInfo?.Meeting?.Circuit?.Key;
  const season     = s?.SessionInfo?.Path?.match(/^(\d{4})\//)?.[1];
  const cacheKey   = circuitKey && season ? `${circuitKey}_${season}` : null;

  useEffect(() => {
    if (!cacheKey || cacheKey === loadKey) return;
    setLoadKey(cacheKey);
    setLayout(null);
    setLoadError(null);
    fetch(`/f1/circuits/${circuitKey}/${season}`)
      .then(r => r.json())
      .then(setLayout)
      .catch(e => setLoadError(e.message));
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const trackState = computeTrackState(s);
  const effectiveLayers = { ...layers, drs: layers.drs && trackState.overtakeEnabled };

  function toggleLayer(key) {
    setLayers(l => ({ ...l, [key]: !l[key] }));
  }

  if (!circuitKey || !season) return <div className={styles.empty}>No SessionInfo yet</div>;
  if (loadError)               return <div className={styles.empty}>Circuit fetch failed: {loadError}</div>;
  if (!layout)                 return <div className={styles.empty}>Loading circuit…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.meta}>{typeof layout.meeting === 'string' ? layout.meeting : (layout.meeting?.name ?? '')} · {layout.circuit?.name ?? ''} · {layout.year ?? ''}</span>
        {LAYER_LABELS.map(([key, label]) => (
          <label key={key} className={styles.check}>
            <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
            {label}
          </label>
        ))}
      </div>
      <div className={styles.mapWrap}>
        <TrackMap layout={layout} layers={effectiveLayers} trackState={trackState} positionFrames={positionFrames} driverList={s?.DriverList ?? {}} timingAppData={s?.TimingAppData ?? null} timingData={s?.TimingData ?? null} sessionCategory={s?.SessionInfo?.SessionCategory ?? null} sessionEvent={s?.SessionInfo?.SessionEvent ?? null} clock={clock} />
      </div>
    </div>
  );
}

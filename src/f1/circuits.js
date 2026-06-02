'use strict';

const { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } = require('fs');
const path = require('path');

const MV_API     = 'https://api.multiviewer.app/api/v2/circuits';
const MV_HEADERS = { 'x-mv-api-terms-accepted': 'true' };
const TTL_MS     = 6 * 60 * 60 * 1000; // 6 hours

function getCacheDir() {
  const dir = process.env.CACHE_DIR
    ? path.join(process.env.CACHE_DIR, 'circuits')
    : path.join(__dirname, '../../cache/circuits');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(circuitKey, season) {
  return path.join(getCacheDir(), `${circuitKey}_${season}.json`);
}

function isFresh(file) {
  try { return Date.now() - statSync(file).mtimeMs < TTL_MS; } catch { return false; }
}

async function getCircuitLayout(circuitKey, season) {
  const file   = cachePath(circuitKey, season);
  const cached = existsSync(file);

  if (cached && isFresh(file)) {
    return JSON.parse(readFileSync(file, 'utf-8'));
  }

  let data = null;
  try {
    const url = `${MV_API}/${encodeURIComponent(circuitKey)}/${encodeURIComponent(season)}`;
    const res = await fetch(url, { headers: MV_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    if (cached) return JSON.parse(readFileSync(file, 'utf-8'));
    throw new Error(`Circuit layout unavailable for key=${circuitKey} season=${season}: ${err.message}`);
  }

  mkdirSync(getCacheDir(), { recursive: true });
  writeFileSync(file, JSON.stringify(data), 'utf-8');
  return data;
}

module.exports = { getCircuitLayout };

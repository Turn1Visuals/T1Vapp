'use strict';

/**
 * F1 Live Timing static archive fetcher.
 * Base URL: https://livetiming.formula1.com/static/
 */

const BASE_URL = 'https://livetiming.formula1.com/static';
const HEADERS  = { 'User-Agent': 'BestHTTP', 'Accept-Encoding': 'gzip, identity' };

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const text = await res.text();
  return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
}

async function fetchStream(path) {
  const res = await fetch(`${BASE_URL}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const buf  = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function parseStream(text) {
  const entries = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d+)([\s\S]*)$/);
    if (!match) continue;
    const [, hh, mm, ss, ms, json] = match;
    const offset = (parseInt(hh) * 3600 + parseInt(mm) * 60 + parseInt(ss)) * 1000
                 + parseInt(ms.padEnd(3, '0').slice(0, 3));
    let data;
    try { data = JSON.parse(json.trim()); } catch { data = json.trim(); }
    entries.push({ offset, data });
  }
  return entries;
}

async function fetchSeasonIndex(year) {
  const index = await fetchJson(`${year}/Index.json`);
  return index.Meetings ?? [];
}

module.exports = { fetchJson, fetchStream, parseStream, fetchSeasonIndex, BASE_URL };

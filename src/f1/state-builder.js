'use strict';

/**
 * Builds and maintains F1 session state from .jsonStream topic files.
 * Handles deep merging of incremental updates and zlib-compressed topics.
 */

const { inflateRaw }  = require('zlib');
const { promisify }   = require('util');
const path            = require('path');
const fs              = require('fs');
const { fetchStream, parseStream } = require('./fetch');
const { isCached, writeCache, readCache } = require('./cache');

const inflateRawAsync = promisify(inflateRaw);

const _FALLBACK_PATH = path.join(__dirname, 'fallback-driverlist.json');
let fallbackDriverList = null;

function getFallbackDriverList() {
  if (!fallbackDriverList) {
    try {
      const data = JSON.parse(fs.readFileSync(_FALLBACK_PATH, 'utf-8'));
      fallbackDriverList = data.DriverList ?? {};
      console.log(`  [fallback] Loaded fallback DriverList with ${Object.keys(fallbackDriverList).length} drivers`);
    } catch (e) {
      console.warn(`  [fallback] Failed to load fallback DriverList: ${e.message}`);
      fallbackDriverList = {};
    }
  }
  return fallbackDriverList;
}

function applyDriverListFallback(driverList) {
  const fallback = getFallbackDriverList();
  if (!driverList || typeof driverList !== 'object') return driverList;

  for (const [racingNumber, driver] of Object.entries(driverList)) {
    if (!driver || typeof driver !== 'object') continue;
    const fallbackDriver = fallback[racingNumber];
    if (!fallbackDriver) continue;

    // Fill missing fields from fallback
    for (const field of ['TeamName', 'TeamColour', 'FirstName', 'LastName', 'Reference', 'PublicIdRight', 'HeadshotUrl']) {
      if (!driver[field] && fallbackDriver[field]) {
        driver[field] = fallbackDriver[field];
      }
    }
  }
  return driverList;
}

const TOPICS = [
  'SessionInfo',
  'SessionData',
  'SessionStatus',
  'DriverList',
  'TimingData',
  'TimingAppData',
  'TimingStats',
  'RaceControlMessages',
  'TrackStatus',
  'ExtrapolatedClock',
  'TopThree',
  'LapCount',
  'WeatherData',
  'Position.z',
  'CarData.z',
];

function deepMerge(target, source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return source;
  if (target === null || typeof target !== 'object' || Array.isArray(target)) target = {};
  for (const [key, val] of Object.entries(source)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      target[key] = deepMerge(target[key] ?? {}, val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

async function decompress(b64) {
  const buf = Buffer.from(b64, 'base64');
  const raw = await inflateRawAsync(buf);
  return JSON.parse(raw.toString('utf-8'));
}

async function parseEntry(data) {
  if (typeof data === 'string') return decompress(data);
  return data;
}

async function fetchTopic(sessionPath, topic) {
  try {
    const raw = await fetchStream(sessionPath + `${topic}.jsonStream`);
    return parseStream(raw);
  } catch (e) {
    console.warn(`  [warn] ${topic}: ${e.message}`);
    return [];
  }
}

async function loadSession(sessionPath) {
  let timeline;

  if (isCached(sessionPath)) {
    console.log(`  [cache] Loading from cache: ${sessionPath}`);
    timeline = readCache(sessionPath);
  } else {
    console.log(`  [fetch] Fetching session: ${sessionPath}`);
    const results = await Promise.all(
      TOPICS.map(async topic => ({ topic, entries: await fetchTopic(sessionPath, topic) }))
    );
    for (const { topic, entries } of results) {
      console.log(`  [fetch]   ${topic.padEnd(22)} ${entries.length} events`);
    }
    timeline = [];
    for (const { topic, entries } of results) {
      for (const { offset, data } of entries) {
        timeline.push({ offset, topic, data });
      }
    }
    timeline.sort((a, b) => a.offset - b.offset);
    console.log(`  [fetch] Total: ${timeline.length} events — saving to cache…`);
    writeCache(sessionPath, timeline);
  }

  // Derive streamStartUnix from first Position.z to align offsets with unix ms
  let streamStartUnix = null;
  const firstPos = timeline.find(e => e.topic === 'Position.z');
  if (firstPos) {
    try {
      const parsed   = await parseEntry(firstPos.data);
      const firstTs  = parsed?.Position?.[0]?.Timestamp;
      if (firstTs) streamStartUnix = new Date(firstTs).getTime() - firstPos.offset;
    } catch {}
  }

  const state = {};
  for (const event of timeline) await applyEvent(state, event);

  // Apply fallback to fill missing DriverList fields
  if (state.DriverList) {
    state.DriverList = applyDriverListFallback(state.DriverList);
  }

  console.log(`Session ready — ${timeline.length} events`);
  return { state, timeline, streamStartUnix };
}

async function applyEvent(state, { topic, data }) {
  const parsed = await parseEntry(data);
  state[topic] = deepMerge(state[topic] ?? {}, parsed);
}

module.exports = { loadSession, applyEvent, parseEntry, deepMerge, applyDriverListFallback, TOPICS };

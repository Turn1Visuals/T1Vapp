'use strict';

/**
 * Session cache — stores fetched timeline data to disk.
 * Cache files: {CACHE_DIR}/{year}_{eventKey}_{sessionName}.ndjson
 */

const { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } = require('fs');
const path = require('path');

function getRoot() {
  const root = process.env.CACHE_DIR ?? path.join(__dirname, '../../cache');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

function cacheKey(sessionPath) {
  return sessionPath.replace(/\//g, '_').replace(/_$/, '');
}

function cachePath(sessionPath) {
  return path.join(getRoot(), cacheKey(sessionPath) + '.ndjson');
}

function isCached(sessionPath) {
  return existsSync(cachePath(sessionPath));
}

function writeCache(sessionPath, timeline) {
  const file  = cachePath(sessionPath);
  const lines = timeline.map(e => JSON.stringify(e)).join('\n');
  writeFileSync(file, lines + '\n', 'utf-8');
  console.log(`Cached ${timeline.length} events → ${file}`);
}

function appendCache(sessionPath, event) {
  appendFileSync(cachePath(sessionPath), JSON.stringify(event) + '\n', 'utf-8');
}

function readCache(sessionPath) {
  const file     = cachePath(sessionPath);
  const lines    = readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  const timeline = lines.map(l => JSON.parse(l));
  console.log(`Loaded ${timeline.length} events from cache`);
  return timeline;
}

module.exports = { isCached, writeCache, appendCache, readCache, cachePath };

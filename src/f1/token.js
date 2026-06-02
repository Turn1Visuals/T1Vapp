'use strict';

/**
 * F1 subscription token storage.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const path = require('path');

function getTokenPath() {
  const dir = process.env.CACHE_DIR ?? path.join(__dirname, '../../cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, 'f1token.json');
}

function decodeJwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8')); }
  catch { return null; }
}

function loadToken() {
  try {
    const { token } = JSON.parse(readFileSync(getTokenPath(), 'utf-8'));
    const payload = decodeJwtPayload(token);
    if (payload?.exp * 1000 > Date.now()) return { token, payload };
  } catch {}
  return null;
}

function saveToken(token) {
  writeFileSync(getTokenPath(), JSON.stringify({ token, savedAt: Date.now() }));
}

module.exports = { decodeJwtPayload, loadToken, saveToken };

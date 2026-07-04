'use strict';

// Standalone probe: does the F1 live-timing endpoint deliver the FULL feed
// WITHOUT a login token? It uses the exact same endpoint and SignalR-Core
// protocol as the app (src/f1/livefeed.js) but sends NO Authorization header.
//
// Confirmed already: /signalrcore/negotiate returns 200 anonymously, and the
// old /signalr endpoint is dead (401). This checks the part that still matters —
// whether CarData.z (telemetry) and Position.z (driver tracker) arrive anonymously.
//
// Run during a live session (practice/quali/race):  node test-anon-f1.js
// Read-only, no login, touches nothing in the app.

const WebSocket = require('ws');

const HUB_URL = 'https://livetiming.formula1.com/signalrcore';
const HEADERS = { 'User-Agent': 'BestHTTP', 'Accept-Encoding': 'gzip, identity' };
const RUN_MS  = 60_000;

const TOPICS = [
  'Heartbeat', 'AudioStreams', 'DriverList', 'ExtrapolatedClock', 'RaceControlMessages',
  'SessionInfo', 'SessionStatus', 'TeamRadio', 'TimingAppData', 'TimingStats', 'TrackStatus',
  'WeatherData', 'Position.z', 'CarData.z', 'ContentStreams', 'SessionData', 'TimingData',
  'TopThree', 'RcmSeries', 'LapCount',
];

const seen = new Set();
let telemetry = false; // CarData.z carried data
let positions = false; // Position.z carried data

function note(topic, data) {
  if (!topic || data == null) return;
  seen.add(topic);
  if (topic === 'CarData.z' && typeof data === 'string' && data.length) telemetry = true;
  if (topic === 'Position.z' && typeof data === 'string' && data.length) positions = true;
}

async function main() {
  console.log('→ Negotiating (anonymous /signalrcore — NO token)…');
  const res = await fetch(`${HUB_URL}/negotiate?negotiateVersion=1`, { method: 'POST', headers: HEADERS });
  if (!res.ok) throw new Error(`Negotiate failed: ${res.status} ${await res.text()}`);
  const body  = await res.json();
  const token = body.connectionToken ?? body.connectionId;
  if (!token) throw new Error('No connectionToken in negotiate response');
  console.log('  ✓ negotiated');

  const wsUrl = `${HUB_URL.replace('https://', 'wss://')}?${new URLSearchParams({ id: token })}`;
  const ws = new WebSocket(wsUrl, { headers: HEADERS }); // no Authorization

  ws.on('open', () => {
    // SignalR-Core handshake, then subscribe (record separator \x1e)
    ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + '\x1e');
  });

  ws.on('message', raw => {
    for (const part of raw.toString().split('\x1e').filter(Boolean)) {
      let msg; try { msg = JSON.parse(part); } catch { continue; }
      if (msg.type === 1 && msg.target === 'feed' && Array.isArray(msg.arguments)) {
        note(msg.arguments[0], msg.arguments[1]);
      } else if (msg.type === 3 && msg.invocationId === '0' && msg.result && typeof msg.result === 'object') {
        for (const [topic, data] of Object.entries(msg.result)) note(topic, data);
        console.log(`  ✓ snapshot received — ${Object.keys(msg.result).length} topics`);
      } else if (msg.type === 6) {
        ws.send(JSON.stringify({ type: 6 }) + '\x1e'); // pong
      } else if (!msg.type) {
        // handshake response — subscribe now
        if (msg.error) { console.error('  ✗ handshake error:', msg.error); return; }
        ws.send(JSON.stringify({ type: 1, invocationId: '0', target: 'Subscribe', arguments: [TOPICS] }) + '\x1e');
        console.log('  ✓ handshake ok — subscribed to', TOPICS.length, 'topics');
      }
    }
  });

  ws.on('error', err => console.error('  ✗ websocket error:', err.message));
  ws.on('close', () => console.log('  · websocket closed'));

  console.log(`\nListening for ${RUN_MS / 1000}s…\n`);
  await new Promise(r => setTimeout(r, RUN_MS));
  ws.close();

  console.log('\n──────── RESULT (anonymous) ────────');
  const missing = TOPICS.filter(t => !seen.has(t));
  console.log(`Topics received: ${seen.size}/${TOPICS.length}`);
  console.log(`Telemetry (CarData.z): ${telemetry ? '✓ present' : '✗ none'}`);
  console.log(`Positions (Position.z): ${positions ? '✓ present' : '✗ none'}`);
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
  console.log('────────────────────────────────────');
  if (seen.size >= TOPICS.length - 2 && telemetry && positions) {
    console.log('VERDICT: full feed arrives anonymously — the F1 login can be dropped.');
  } else if (seen.size === 0) {
    console.log('VERDICT: nothing received — likely no live session right now. Re-run during a session.');
  } else {
    console.log('VERDICT: partial — the token gates some data (probably CarData.z/Position.z). Keep the login.');
  }
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exitCode = 1; });

'use strict';

const { EventEmitter } = require('events');
const WebSocket        = require('ws');
const { getToken }     = require('./f1auth');

const HUB_URL      = 'https://livetiming.formula1.com/signalrcore';
const BASE_HEADERS = { 'User-Agent': 'BestHTTP', 'Accept-Encoding': 'gzip, identity' };

const TOPICS = [
  'Heartbeat','AudioStreams','DriverList','ExtrapolatedClock','RaceControlMessages',
  'SessionInfo','SessionStatus','TeamRadio','TimingAppData','TimingStats','TrackStatus',
  'WeatherData','Position.z','CarData.z','ContentStreams','SessionData','TimingData',
  'TopThree','RcmSeries','LapCount',
];

class LiveFeed extends EventEmitter {
  constructor() {
    super();
    this._ws    = null;
    this._token = null;
    this._msgId = 1;
  }

  async connect() {
    console.log('  Authenticating with F1...');
    this._token = await getToken();
    console.log('  Negotiating SignalR Core connection...');
    const { connectionToken } = await this._negotiate();
    console.log('  Connecting WebSocket...');
    await this._connectWs(connectionToken);
  }

  disconnect() {
    this._ws?.close();
    this._ws = null;
  }

  async _negotiate() {
    const headers = { ...BASE_HEADERS, 'Authorization': `Bearer ${this._token}` };
    const res     = await fetch(`${HUB_URL}/negotiate?negotiateVersion=1`, { method: 'POST', headers });
    if (!res.ok) throw new Error(`Negotiate failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    console.log('  Negotiate response:', JSON.stringify(body).slice(0, 200));
    const connectionToken = body.connectionToken ?? body.connectionId;
    if (!connectionToken) throw new Error('No connectionToken in negotiate response');
    return { connectionToken };
  }

  _connectWs(connectionToken) {
    return new Promise((resolve, reject) => {
      const qs = new URLSearchParams({ id: connectionToken });
      const wsUrl = `${HUB_URL.replace('https://', 'wss://')}?${qs}`;
      const headers = { ...BASE_HEADERS, 'Authorization': `Bearer ${this._token}` };
      this._ws = new WebSocket(wsUrl, { headers });
      this._ws.once('open', () => { this._handshake(); resolve(); });
      this._ws.once('error', err => {
        const msg = err.message?.includes('404') ? 'No active F1 session' : err.message;
        reject(new Error(msg));
        this.emit('error', new Error(msg));
      });
      this._ws.on('message', raw => this._onMessage(raw));
      this._ws.on('close',   ()  => this.emit('disconnected'));
      this._ws.on('error',   err => this.emit('error', err));
    });
  }

  _handshake() {
    // SignalR Core requires a handshake before any other messages
    this._ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + '\x1e');
  }

  _subscribe() {
    // Include invocationId so server returns type 3 completion with full current state snapshot
    const msg = JSON.stringify({ type: 1, invocationId: '0', target: 'Subscribe', arguments: [TOPICS] }) + '\x1e';
    this._ws.send(msg);
    console.log(`  Subscribed to ${TOPICS.length} topics`);
  }

  _onMessage(raw) {
    // Messages are delimited by \x1e (record separator)
    const parts = raw.toString().split('\x1e').filter(Boolean);
    for (const part of parts) {
      let msg;
      try { msg = JSON.parse(part); } catch { continue; }
      // type 1 = invocation, type 3 = completion, type 6 = ping, type 7 = close
      if (msg.type === 1 && msg.target === 'feed' && Array.isArray(msg.arguments)) {
        const [topic, data] = msg.arguments;
        if (topic && data != null) this.emit('data', { topic, data });
      } else if (msg.type === 3 && msg.invocationId === '0') {
        // Completion of Subscribe — result contains full current state for all topics
        const result = msg.result;
        if (result && typeof result === 'object') {
          for (const [topic, data] of Object.entries(result)) {
            if (data != null) this.emit('data', { topic, data });
          }
        }
      } else if (msg.type === 6) {
        // Ping — respond with pong
        this._ws.send(JSON.stringify({ type: 6 }) + '\x1e');
      } else if (msg.type === 7) {
        this.emit('disconnected');
      } else if (!msg.type) {
        // Handshake response — now subscribe
        if (msg.error) { this.emit('error', new Error('Handshake error: ' + msg.error)); return; }
        this._subscribe();
        this.emit('connected');
      }
    }
  }
}

module.exports = { LiveFeed };

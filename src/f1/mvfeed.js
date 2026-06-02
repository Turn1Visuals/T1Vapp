'use strict';

const { EventEmitter } = require('events');

const MV_URL       = 'http://localhost:10101/api/graphql';
const POLL_INTERVAL = 500;
const QUERY = `query {
  f1LiveTimingState {
    SessionStatus SessionInfo SessionData DriverList
    TimingData TimingAppData TimingStats RaceControlMessages
    TrackStatus ExtrapolatedClock TopThree LapCount WeatherData
    Position CarData
  }
  f1LiveTimingClock {
    liveTimingStartTime paused systemTime trackTime
  }
}`;

class MvFeed extends EventEmitter {
  constructor() {
    super();
    this._running = false;
    this._timer   = null;
  }

  async connect() {
    const data = await this._fetch();
    if (!data) throw new Error('Multiviewer not available at localhost:10101');
    this._running = true;
    this.emit('connected');
    this.emit('data', data);
    this._schedule();
  }

  async _fetch() {
    try {
      const res = await fetch(MV_URL, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ query: QUERY }),
        signal:  AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch {
      return null;
    }
  }

  _schedule() {
    if (!this._running) return;
    this._timer = setTimeout(async () => {
      try {
        const data = await this._fetch();
        if (data) this.emit('data', data);
      } catch {}
      this._schedule();
    }, POLL_INTERVAL);
  }

  disconnect() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this.emit('disconnected');
  }
}

module.exports = { MvFeed };

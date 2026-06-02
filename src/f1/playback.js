'use strict';

const { deepMerge, applyEvent, parseEntry } = require('./state-builder');

const POSITION_BUFFER_SIZE = 60;

class Playback {
  constructor(timeline, streamStartUnix = null) {
    this.timeline            = timeline;
    this.streamStartUnix     = streamStartUnix;
    this.calibratedStartUnix = streamStartUnix; // updated on first live Position.z
    this.state               = {};
    this.cursor          = 0;
    this.emitCursor      = 0;
    this.startedAt       = null;
    this.offsetAt        = 0;
    this.playing         = false;
    this.speed           = 1;
    this.sessionPart     = null;
    this.bestLapSectors  = {};
  }

  get currentOffset() {
    if (!this.playing) return this.offsetAt;
    return this.offsetAt + (Date.now() - this.startedAt) * this.speed;
  }

  start(speed = 1) {
    this.speed     = speed;
    this.startedAt = Date.now();
    this.playing   = true;
  }

  pause() {
    this.offsetAt = this.currentOffset;
    this.playing  = false;
  }

  async seek(offsetMs) {
    const wasPlaying = this.playing;
    this.pause();
    if (offsetMs < this.offsetAt) {
      this.state          = {};
      this.cursor         = 0;
      this.sessionPart    = null;
      this.bestLapSectors = {};
    }
    this.offsetAt = offsetMs;
    await this._applyUpTo(offsetMs);
    this.emitCursor = this.cursor;
    if (wasPlaying) this.start(this.speed);
  }

  async tick() {
    await this._applyUpTo(this.currentOffset);
    return this.getSnapshot();
  }

  async drainNewEvents() {
    const offset = this.currentOffset;
    const events = [];
    while (this.emitCursor < this.timeline.length && this.timeline[this.emitCursor].offset <= offset) {
      const evt = this.timeline[this.emitCursor++];
      if (evt.topic === 'Position.z') {
        const parsed = await parseEntry(evt.data);
        if (parsed?.Position?.length) events.push({ topic: 'Position.z', frames: parsed.Position });
      } else if (evt.topic === 'CarData.z') {
        const parsed = await parseEntry(evt.data);
        if (parsed?.Entries?.length) events.push({ topic: 'CarData.z', frames: parsed.Entries });
      } else {
        events.push({ topic: evt.topic, isState: true });
      }
    }
    return events;
  }

  async _applyUpTo(offsetMs) {
    while (this.cursor < this.timeline.length && this.timeline[this.cursor].offset <= offsetMs) {
      await this._applyEvent(this.timeline[this.cursor++]);
    }
  }

  async _applyEvent({ topic, data }) {
    if (topic === 'Position.z' || topic === 'CarData.z') {
      const parsed = await parseEntry(data);
      if (!this.state[topic]) this.state[topic] = {};
      const key      = topic === 'Position.z' ? 'Position' : 'Entries';
      const incoming = parsed?.[key];
      if (Array.isArray(incoming)) {
        if (!this.state[topic][key]) this.state[topic][key] = [];
        this.state[topic][key].push(...incoming);
        if (this.state[topic][key].length > POSITION_BUFFER_SIZE) {
          this.state[topic][key] = this.state[topic][key].slice(-POSITION_BUFFER_SIZE);
        }
      }
    } else {
      await applyEvent(this.state, { topic, data });
      if (topic === 'TimingData') this._trackBestLaps(data);
    }
  }

  _trackBestLaps(data) {
    if (data.SessionPart != null && data.SessionPart !== this.sessionPart) {
      this.sessionPart = data.SessionPart;
      const lines = this.state['TimingData']?.Lines ?? {};
      for (const num of Object.keys(this.bestLapSectors)) {
        if (!lines[num]?.KnockedOut) delete this.bestLapSectors[num];
      }
    }
    for (const [num, patch] of Object.entries(data.Lines ?? {})) {
      if (!patch.BestLapTime?.Value) continue;
      const line    = this.state['TimingData']?.Lines?.[num];
      if (!line) continue;
      const sectors   = Array.isArray(line.Sectors) ? line.Sectors : Object.values(line.Sectors ?? {});
      const stints    = this.state['TimingAppData']?.Lines?.[num]?.Stints ?? {};
      const lastStint = Object.values(stints).at(-1);
      this.bestLapSectors[num] = {
        S1: sectors[0]?.Value ?? null, S2: sectors[1]?.Value ?? null, S3: sectors[2]?.Value ?? null,
        total: line.BestLapTime?.Value ?? null, lap: line.BestLapTime?.Lap ?? null,
        compound: lastStint?.Compound ?? null, isNew: String(lastStint?.New) === 'true',
      };
    }
  }

  getSnapshot() {
    const offset    = this.currentOffset;
    const lastEvent = this.timeline[Math.min(this.cursor, this.timeline.length - 1)];
    const trackTime = this.calibratedStartUnix !== null ? this.calibratedStartUnix + offset : offset;
    return {
      state:          this.state,
      bestLapSectors: this.bestLapSectors,
      sessionPart:    this.sessionPart,
      clock: {
        offset, trackTime, streamStartUnix: this.streamStartUnix,
        playing: this.playing, speed: this.speed, duration: this.duration,
      },
    };
  }

  get duration() {
    return this.timeline[this.timeline.length - 1]?.offset ?? 0;
  }

  appendLive(topic, data, unixMs) {
    const offset = unixMs - this.streamStartUnix;
    this.timeline.push({ offset, topic, data });
  }
}

module.exports = { Playback };

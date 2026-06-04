import React, { useState, useEffect } from 'react';

const HOLD_MS       = 3000;
const TRANSITION_MS = 400;
const SLOT_H        = 40;

function fmt(n, dec = 1) {
  if (!Number.isFinite(n)) return null;
  const r = Number(n.toFixed(dec));
  return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(dec);
}

function compass(deg) {
  if (!Number.isFinite(deg)) return null;
  const pts = ['N','NE','E','SE','S','SW','W','NW'];
  return pts[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function buildMetrics(w) {
  if (!w) return [];
  const items = [];
  const air   = parseFloat(w.AirTemp);
  const track = parseFloat(w.TrackTemp);
  const hum   = parseFloat(w.Humidity);
  const rain  = parseFloat(w.Rainfall);
  const wspd  = parseFloat(w.WindSpeed);
  const wdir  = parseFloat(w.WindDirection);

  if (Number.isFinite(air))   items.push({ label: 'Air',      value: `${fmt(air)}°C` });
  if (Number.isFinite(track)) items.push({ label: 'Track',    value: `${fmt(track)}°C` });
  if (Number.isFinite(hum))   items.push({ label: 'Humidity', value: `${Math.round(hum)}%` });
  if (Number.isFinite(rain))  items.push({ label: 'Rain',     value: Math.round(rain) ? 'YES' : 'NO' });
  if (Number.isFinite(wspd)) {
    const dir = Number.isFinite(wdir) ? ` ${compass(wdir)}` : '';
    items.push({ label: 'Wind', value: `${Math.round(wspd * 3.6)}km/h${dir}` });
  }
  return items;
}

// Purely structural — no design styles, parent controls appearance
export default function WeatherGroup({ state, style }) {
  const metrics = buildMetrics(state?.WeatherData);
  const slides  = metrics.length > 1 ? [...metrics, metrics[0]] : metrics;

  const [idx,      setIdx]      = useState(0);
  const [snapBack, setSnapBack] = useState(false);

  useEffect(() => {
    if (metrics.length <= 1) return;
    const id = setInterval(() => setIdx(i => i + 1), HOLD_MS);
    return () => clearInterval(id);
  }, [metrics.length]);

  useEffect(() => {
    if (idx < metrics.length) return;
    const t = setTimeout(() => {
      setSnapBack(true);
      requestAnimationFrame(() => {
        setIdx(0);
        requestAnimationFrame(() => setSnapBack(false));
      });
    }, TRANSITION_MS);
    return () => clearTimeout(t);
  }, [idx, metrics.length]);

  if (!metrics.length) return null;

  return (
    <div style={{ height: SLOT_H, overflow: 'hidden', ...style }}>
      <div style={{
        transform: `translateY(${-(idx * SLOT_H)}px)`,
        transition: snapBack ? 'none' : `transform ${TRANSITION_MS}ms ease-in-out`,
        willChange: 'transform',
      }}>
        {slides.map((m, i) => (
          <div key={i} style={{ height: SLOT_H, display: 'flex', flexDirection: 'column', alignItems: 'inherit', justifyContent: 'center', fontSize: '0.75em' }}>
            <div>{m.label}</div>
            <div>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

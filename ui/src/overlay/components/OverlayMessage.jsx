import React from 'react';
import { useTiming } from '../../hooks/useTiming.js';

export default function OverlayMessage() {
  const { state } = useTiming({ autoConnect: true });
  const message = state?.overlayMessage || { text: '', visible: false };

  if (!message.visible || !message.text) return null;

  return (
    <div style={{
      background: 'rgba(255, 77, 0, 0.95)',
      border: '2px solid rgb(255, 100, 20)',
      borderRadius: 4,
      padding: '12px 16px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 14,
      fontWeight: 600,
      color: '#fff',
      boxShadow: '0 4px 12px rgba(255, 77, 0, 0.4)',
    }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>⚠</span>
      <span>{message.text}</span>
    </div>
  );
}

import React, { useState } from 'react';
import Settings from './tabs/Settings.jsx';
import F1Timing from './tabs/F1Timing.jsx';

const TABS = [
  { id: 'f1',       label: 'F1 Timing' },
  { id: 'settings', label: 'Settings'  },
];

export default function App() {
  const [active, setActive] = useState('f1');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', padding: '0 16px' }}>
        <div style={{ fontWeight: 700, color: '#e10600', padding: '12px 20px 12px 0', marginRight: 8, letterSpacing: 1, fontSize: 13 }}>
          TURN1
        </div>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0 16px', height: 44, fontSize: 13,
            color: active === t.id ? '#fff' : '#666',
            borderBottom: active === t.id ? '2px solid #e10600' : '2px solid transparent',
            transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {active === 'f1'       && <F1Timing />}
        {active === 'settings' && <Settings />}
      </div>
    </div>
  );
}

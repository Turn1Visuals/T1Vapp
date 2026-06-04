import React, { useEffect, useState } from 'react';

function LoginCard({ title, description, loggedIn, onLogin }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
      padding: 20, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{description}</div>
        {loggedIn && <div style={{ fontSize: 12, color: '#4caf50', marginTop: 6 }}>✓ Logged in</div>}
      </div>
      <button onClick={onLogin} style={{
        padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: 13, background: loggedIn ? '#333' : '#e10600', color: '#fff',
      }}>
        {loggedIn ? 'Re-login' : 'Login'}
      </button>
    </div>
  );
}

export default function Settings() {
  const [f1LoggedIn, setF1LoggedIn] = useState(false);

  useEffect(() => {
    const isElectron = !!window.hub;
    if (!isElectron) return;
    window.hub.authStatus().then(s => setF1LoggedIn(s.loggedIn));
    window.hub.onAuthChanged(() => {
      window.hub.authStatus().then(s => setF1LoggedIn(s.loggedIn));
    });
  }, []);

  async function handleF1Login() {
    if (window.hub) await window.hub.openF1Login();
  }

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <h2 style={{ marginBottom: 24, fontSize: 18 }}>Settings</h2>

      <h3 style={{ fontSize: 13, color: '#666', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        Accounts
      </h3>

      <LoginCard
        title="F1 Timing"
        description="Access live timing data from Formula 1"
        loggedIn={f1LoggedIn}
        onLogin={handleF1Login}
      />

      <LoginCard
        title="YouTube"
        description="Live streaming and video uploads"
        loggedIn={false}
        onLogin={() => {}}
      />

      <LoginCard
        title="Twitch"
        description="Live streaming"
        loggedIn={false}
        onLogin={() => {}}
      />

      <LoginCard
        title="Twitter / X"
        description="Social media posting"
        loggedIn={false}
        onLogin={() => {}}
      />
    </div>
  );
}

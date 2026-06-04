import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import OverlaySession from './pages/OverlaySession.jsx';
import OverlayStart   from './pages/OverlayStart.jsx';
import OverlayEnd     from './pages/OverlayEnd.jsx';
import './index.css';

const path = window.location.pathname;

function getPage() {
  if (path === '/overlay/session') return <OverlaySession />;
  if (path === '/overlay/start')   return <OverlayStart />;
  if (path === '/overlay/end')     return <OverlayEnd />;
  return <App />;
}

createRoot(document.getElementById('root')).render(getPage());

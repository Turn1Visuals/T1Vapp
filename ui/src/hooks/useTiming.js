import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_POSITION_FRAMES = 20;
const MAX_CARDATA_FRAMES  = 120;

export function useTiming({ autoConnect = false } = {}) {
  const [state,          setState]          = useState(null);
  const [clock,          setClock]          = useState(null);
  const [status,         setStatus]         = useState(null);
  const [positionFrames, setPositionFrames] = useState([]);
  const [carDataFrames,  setCarDataFrames]  = useState([]);

  const esRef          = useRef(null);
  const statusTimerRef = useRef(null);

  const connect = useCallback(() => {
    if (esRef.current) return;

    const es = new EventSource('/f1/stream');
    esRef.current = es;

    es.addEventListener('snapshot', e => {
      const { state: s, clock: c } = JSON.parse(e.data);
      setState(s);
      setClock(c);
      setPositionFrames([]);
      setCarDataFrames([]);
    });

    es.addEventListener('state', e => {
      const { state: s, clock: c } = JSON.parse(e.data);
      setState(s);
      setClock(c);
    });

    es.addEventListener('position', e => {
      const { frames } = JSON.parse(e.data);
      setPositionFrames(prev => {
        const next = [...prev, ...frames];
        return next.length > MAX_POSITION_FRAMES ? next.slice(-MAX_POSITION_FRAMES) : next;
      });
    });

    es.addEventListener('cardata', e => {
      const { frames } = JSON.parse(e.data);
      setCarDataFrames(prev => {
        const next = [...prev, ...frames];
        return next.length > MAX_CARDATA_FRAMES ? next.slice(-MAX_CARDATA_FRAMES) : next;
      });
    });

    es.addEventListener('clock', e => {
      setClock(JSON.parse(e.data));
    });

    es.addEventListener('reset', () => {
      setState(null);
      setClock(null);
      setPositionFrames([]);
      setCarDataFrames([]);
    });

    es.onerror = () => { esRef.current = null; };

    function pollStatus() {
      fetch('/f1/status').then(r => r.json()).then(setStatus).catch(() => {});
    }
    pollStatus();
    statusTimerRef.current = setInterval(pollStatus, 1000);
  }, []);

  function startPolling() { connect(); }

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, []);

  return { state, clock, status, positionFrames, carDataFrames, startPolling };
}

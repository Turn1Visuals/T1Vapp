import { getSessionRemaining, formatSessionClock, formatVenueTime } from '../sessionClock';
import styles from './SessionClock.module.css';

export function VenueTime({ state, clock }) {
  return <span className={styles.venue}>{formatVenueTime(clock?.trackTime, state?.SessionInfo?.GmtOffset)}</span>;
}

export function SessionRemaining({ state, clock }) {
  const remaining = getSessionRemaining(state?.ExtrapolatedClock, clock?.trackTime);
  return <span className={styles.remaining}>{formatSessionClock(remaining)}</span>;
}

export default function SessionClock({ state, clock }) {
  return (
    <div className={styles.wrap}>
      <VenueTime state={state} clock={clock} />
      <span className={styles.sep}>·</span>
      <SessionRemaining state={state} clock={clock} />
    </div>
  );
}

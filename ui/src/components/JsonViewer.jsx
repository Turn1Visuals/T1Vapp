import { useState } from 'react';
import styles from './JsonViewer.module.css';

function isCollapsible(value) {
  return value !== null && typeof value === 'object';
}

function JsonNode({ value, depth = 0, open, onToggle }) {
  const [ownOpen, setOwnOpen] = useState(depth < 2);
  const controlled = open !== undefined;
  const isOpen   = controlled ? open    : ownOpen;
  const toggle   = controlled ? onToggle : () => setOwnOpen(o => !o);

  if (value === null)      return <span className={styles.null}>null</span>;
  if (value === undefined) return <span className={styles.null}>undefined</span>;
  if (typeof value === 'boolean') return <span className={styles.bool}>{String(value)}</span>;
  if (typeof value === 'number')  return <span className={styles.num}>{value}</span>;
  if (typeof value === 'string')  return <span className={styles.str}>"{value}"</span>;

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  const [open0, close0] = isArray ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) return <span className={styles.bracket}>{open0}{close0}</span>;

  if (!isOpen) {
    return (
      <span className={styles.collapsed} onClick={toggle}>
        {open0}<span className={styles.ellipsis}>…{entries.length}</span>{close0}
      </span>
    );
  }

  return (
    <span>
      <span className={styles.bracket} onClick={toggle} style={{ cursor: 'pointer' }}>{open0}</span>
      <div className={styles.block}>
        {entries.map(([k, v], i) => (
          <CollapsibleRow key={k} k={k} v={v} isArray={isArray} depth={depth} last={i === entries.length - 1} />
        ))}
      </div>
      <span className={styles.bracket} onClick={toggle} style={{ cursor: 'pointer' }}>{close0}</span>
    </span>
  );
}

function CollapsibleRow({ k, v, isArray, depth, last }) {
  const [open, setOpen] = useState(depth + 1 < 2);
  const collapsible = isCollapsible(v);

  return (
    <div className={styles.row}>
      {!isArray && (
        <span
          className={collapsible ? `${styles.key} ${styles.keyToggle}` : styles.key}
          onClick={collapsible ? () => setOpen(o => !o) : undefined}
        >
          {k}:{' '}
        </span>
      )}
      <JsonNode value={v} depth={depth + 1} open={collapsible ? open : undefined} onToggle={collapsible ? () => setOpen(o => !o) : undefined} />
      {!last && <span className={styles.comma}>,</span>}
    </div>
  );
}

export default function JsonViewer({ data }) {
  return (
    <div className={styles.root}>
      <JsonNode value={data} depth={0} />
    </div>
  );
}

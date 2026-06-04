const COMPOUND_STYLES = {
  SOFT:         { color: '#ff1801', label: 'Soft',         short: 'S' },
  MEDIUM:       { color: '#ffd600', label: 'Medium',       short: 'M' },
  HARD:         { color: '#f0f0ec', label: 'Hard',         short: 'H' },
  INTERMEDIATE: { color: '#39b54a', label: 'Intermediate', short: 'I' },
  WET:          { color: '#0067ff', label: 'Wet',          short: 'W' },
};

export default COMPOUND_STYLES;

export function getCompoundStyle(compound) {
  return COMPOUND_STYLES[String(compound ?? '').toUpperCase()] ?? null;
}

export function getCompoundColor(compound) {
  return getCompoundStyle(compound)?.color ?? '#888888';
}

export function getCompoundBorderStyle(compound, isNew) {
  return { color: getCompoundStyle(compound)?.color ?? '#888888', opacity: isNew ? 1.0 : 0.45 };
}

export const SESSION_COLORS = {
  practice: '#0062B7',
  sprint:   '#0C7621',
  gp:       '#e10600',
};

export function getSessionColor(state) {
  return getSessionColorFromLabel(state?.SessionInfo?.Name ?? '');
}

export function getSessionColorFromLabel(label) {
  const name = String(label ?? '').trim();
  if (name.startsWith('Practice'))                          return SESSION_COLORS.practice;
  if (name === 'Sprint Qualifying' || name === 'Sprint')    return SESSION_COLORS.sprint;
  return SESSION_COLORS.gp;
}

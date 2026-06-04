const LOGO_BASE = 'https://media.formula1.com/image/upload/common/f1/2026/';

// Derives team slug from a driver's PublicIdRight path:
// "common/f1/2026/{teamSlug}/{driverSlug}/..." → parts[3]
export function teamSlugFromPublicId(publicIdRight) {
  if (!publicIdRight) return null;
  return publicIdRight.split('/')[3] ?? null;
}

export function teamLogoUrl(teamName, publicIdRight) {
  const slug = teamSlugFromPublicId(publicIdRight);
  if (!slug) return null;
  const variant = TEAM_STYLES[teamName]?.logoVariant ?? 'color';
  const suffix = variant === 'color' ? '' : variant;
  return `${LOGO_BASE}${slug}/2026${slug}logo${suffix}.svg`;
}

const TEAM_STYLES = {
  'Red Bull Racing': { background: '#061A4D', text: '#FFFFFF', shortName: 'Red Bull',     code: 'RBR', logoVariant: 'color' },
  'Williams':        { background: '#0142FE', text: '#FFFFFF', shortName: 'Williams',     code: 'WIL', logoVariant: 'white' },
  'Cadillac':        { background: '#15151F', text: '#FFFFFF', shortName: 'Cadillac',     code: 'CAD', logoVariant: 'white' },
  'Audi':            { background: '#6D0507', text: '#FFFFFF', shortName: 'Audi',         code: 'AUD', logoVariant: 'white' },
  'Alpine':          { background: '#E32785', text: '#FFFFFF', shortName: 'Alpine',       code: 'ALP', logoVariant: 'color' },
  'Aston Martin':    { background: '#229971', text: '#FFFFFF', shortName: 'Aston',        code: 'AST', logoVariant: 'white' },
  'Ferrari':         { background: '#DC0000', text: '#FFFFFF', shortName: 'Ferrari',      code: 'FER', logoVariant: 'color' },
  'Haas F1 Team':    { background: '#F8F4F1', text: '#000000', shortName: 'Haas',         code: 'HAA', logoVariant: 'color' },
  'Kick Sauber':     { background: '#52E252', text: '#000000', shortName: 'Sauber',       code: 'SAU', logoVariant: 'color' },
  'McLaren':         { background: '#FD8000', text: '#FFFFFF', shortName: 'McLaren',      code: 'MCL', logoVariant: 'color' },
  'Mercedes':        { background: '#00F5D3', text: '#000000', shortName: 'Mercedes',     code: 'MER', logoVariant: 'white' },
  'Racing Bulls':    { background: '#4862E4', text: '#FFFFFF', shortName: 'Racing Bulls', code: 'VRB', logoVariant: 'color' },
  'RB':              { background: '#4862E4', text: '#FFFFFF', shortName: 'Racing Bulls', code: 'VRB', logoVariant: 'color' },
};

export default TEAM_STYLES;

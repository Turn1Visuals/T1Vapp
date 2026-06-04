// Circuit asset helpers shared by Start/End overlays

// URL slug used in: {year}track{slug}blackoutline.svg
const LOCATION_TO_TRACK_SLUG = {
  'Sakhir':            'bahrain',
  'Jeddah':            'jeddah',
  'Melbourne':         'melbourne',
  'Suzuka':            'suzuka',
  'Shanghai':          'shanghai',
  'Miami':             'miami',
  'Miami Gardens':     'miami',
  'Imola':             'imola',
  'Monte Carlo':       'monaco',
  'Montreal':          'montreal',
  'Barcelona':         'barcelona',
  'Spielberg':         'redbullring',
  'Silverstone':       'silverstone',
  'Budapest':          'budapest',
  'Spa-Francorchamps': 'spa',
  'Zandvoort':         'zandvoort',
  'Monza':             'monza',
  'Baku':              'baku',
  'Marina Bay':        'singapore',
  'Austin':            'austin',
  'Mexico City':       'mexicocity',
  'São Paulo':         'saopaulo',
  'Las Vegas':         'lasvegas',
  'Lusail':            'lusail',
  'Yas Island':        'abudhabi',
  'Madrid':            'madrid',
};

/** Build the F1 media track outline SVG URL from SessionInfo */
export function buildTrackSvgUrl(sessionInfo) {
  const location = sessionInfo?.Meeting?.Location;
  if (!location) return null;
  const slug = LOCATION_TO_TRACK_SLUG[location]
    ?? location.toLowerCase().replace(/[\s-]+/g, '');
  const year = sessionInfo?.StartDate?.slice(0, 4) ?? new Date().getFullYear();
  return `https://media.formula1.com/image/upload/common/f1/${year}/track/${year}track${slug}blackoutline.svg`;
}

/** Build the track outline SVG URL from the event tracker's Cloudinary public_id */
export function buildTrackSvgUrlFromPublicId(publicId) {
  if (!publicId) return null;
  return `https://media.formula1.com/image/upload/${publicId}.svg`;
}

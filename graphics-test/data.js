// Mock session data — same shape as what the app will inject
const SESSION = {
  event:   'Australian Grand Prix',
  session: 'Race',
  type:    'race',           // 'race' | 'sprint' | 'qualifying' | 'sprint_qualifying'
  round:   1,
  season:  2026,
  circuit: 'Albert Park Circuit',
  country: 'Australia',
}

const TEAMS = {
  mclaren:      { name: 'McLaren',        color: '#FF8000', accessible: '#804000', cdnSlug: 'mclaren' },
  ferrari:      { name: 'Ferrari',        color: '#E8002D', accessible: '#740016', cdnSlug: 'ferrari' },
  red_bull:     { name: 'Red Bull Racing', color: '#3671C6', accessible: '#1B3863', cdnSlug: 'redbullracing' },
  mercedes:     { name: 'Mercedes',       color: '#27F4D2', accessible: '#137A69', cdnSlug: 'mercedes' },
  aston_martin: { name: 'Aston Martin',   color: '#229971', accessible: '#114C38', cdnSlug: 'astonmartin' },
  alpine:       { name: 'Alpine',         color: '#00a1e8', accessible: '#005074', cdnSlug: 'alpine' },
  haas:         { name: 'Haas F1 Team',   color: '#dee1e2', accessible: '#6f7374', cdnSlug: 'haasf1team' },
  rb:           { name: 'Racing Bulls',   color: '#6692FF', accessible: '#334980', cdnSlug: 'racingbulls' },
  williams:     { name: 'Williams',       color: '#1868db', accessible: '#0c346d', cdnSlug: 'williams' },
  audi:         { name: 'Audi',           color: '#ff2d00', accessible: '#7f1600', cdnSlug: 'audi' },
  cadillac:     { name: 'Cadillac',       color: '#aaaaad', accessible: '#555557', cdnSlug: 'cadillac' },
}

const YEAR = 2026

function headshot(driverSlug, teamCdnSlug, accessible, angle = 'right') {
  const color = accessible.replace('#', '')
  return `https://media.formula1.com/image/upload/ar_1:1,c_crop,g_north,w_1000/b_rgb:${color}/common/f1/${YEAR}/${teamCdnSlug}/${driverSlug}/${YEAR}${teamCdnSlug}${driverSlug}${angle}.png`
}

function teamLogo(teamCdnSlug, accessible) {
  const color = accessible.replace('#', '')
  return `https://media.formula1.com/image/upload/b_rgb:${color}/common/f1/${YEAR}/${teamCdnSlug}/${YEAR}${teamCdnSlug}logowhite.png`
}

function flag(iso2) {
  return `https://flagcdn.com/w40/${iso2}.png`
}

// SESSION.type determines which columns are shown in the template:
//   'race'              → gap/time, points, fastest lap indicator
//   'sprint'            → gap/time, points
//   'qualifying'        → q1, q2, q3 (best shown based on pos)
//   'sprint_qualifying' → q1, q2, q3
//   'practice'          → bestLap, gap to P1

const RESULTS = [
  // pos  driverSlug    firstName    lastName       team                  nat   race time            gap           pts  FL     status       bestLap        q1           q2           q3
  { pos:1,  driverSlug:'oscpia01', firstName:'Oscar',     lastName:'Piastri',    team:TEAMS.mclaren,      nationality:'au', time:'1:23:45.678', gap:null,      points:25, fastestLap:false, status:'Finished', bestLap:'1:18.345', q1:'1:19.112', q2:'1:18.654', q3:'1:18.345' },
  { pos:2,  driverSlug:'lannor01', firstName:'Lando',     lastName:'Norris',     team:TEAMS.mclaren,      nationality:'gb', time:null,          gap:'+4.231',  points:18, fastestLap:true,  status:'Finished', bestLap:'1:18.512', q1:'1:19.234', q2:'1:18.891', q3:'1:18.512' },
  { pos:3,  driverSlug:'chalec01', firstName:'Charles',   lastName:'Leclerc',    team:TEAMS.ferrari,      nationality:'mc', time:null,          gap:'+8.102',  points:15, fastestLap:false, status:'Finished', bestLap:'1:18.701', q1:'1:19.445', q2:'1:19.012', q3:'1:18.701' },
  { pos:4,  driverSlug:'lewham01', firstName:'Lewis',     lastName:'Hamilton',   team:TEAMS.ferrari,      nationality:'gb', time:null,          gap:'+12.554', points:12, fastestLap:false, status:'Finished', bestLap:'1:18.899', q1:'1:19.678', q2:'1:19.201', q3:'1:18.899' },
  { pos:5,  driverSlug:'maxver01', firstName:'Max',       lastName:'Verstappen', team:TEAMS.red_bull,     nationality:'nl', time:null,          gap:'+18.901', points:10, fastestLap:false, status:'Finished', bestLap:'1:19.102', q1:'1:19.789', q2:'1:19.334', q3:'1:19.102' },
  { pos:6,  driverSlug:'georus01', firstName:'George',    lastName:'Russell',    team:TEAMS.mercedes,     nationality:'gb', time:null,          gap:'+24.123', points:8,  fastestLap:false, status:'Finished', bestLap:'1:19.234', q1:'1:19.901', q2:'1:19.512', q3:'1:19.234' },
  { pos:7,  driverSlug:'andant01', firstName:'Kimi',      lastName:'Antonelli',  team:TEAMS.mercedes,     nationality:'it', time:null,          gap:'+31.445', points:6,  fastestLap:false, status:'Finished', bestLap:'1:19.445', q1:'1:20.123', q2:'1:19.678', q3:'1:19.445' },
  { pos:8,  driverSlug:'feralo01', firstName:'Fernando',  lastName:'Alonso',     team:TEAMS.aston_martin, nationality:'es', time:null,          gap:'+38.220', points:4,  fastestLap:false, status:'Finished', bestLap:'1:19.601', q1:'1:20.234', q2:'1:19.834', q3:'1:19.601' },
  { pos:9,  driverSlug:'isahad01', firstName:'Isack',     lastName:'Hadjar',     team:TEAMS.red_bull,     nationality:'fr', time:null,          gap:'+42.001', points:2,  fastestLap:false, status:'Finished', bestLap:'1:19.789', q1:'1:20.445', q2:'1:20.012', q3:'1:19.789' },
  { pos:10, driverSlug:'fracol01', firstName:'Franco',    lastName:'Colapinto',  team:TEAMS.alpine,       nationality:'ar', time:null,          gap:'+47.889', points:1,  fastestLap:false, status:'Finished', bestLap:'1:19.901', q1:'1:20.567', q2:'1:20.123', q3:'1:19.901' },
  { pos:11, driverSlug:'nichul01', firstName:'Nico',      lastName:'Hulkenberg', team:TEAMS.audi,         nationality:'de', time:null,          gap:'+1 lap',  points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.112', q1:'1:20.678', q2:'1:20.234', q3:null        },
  { pos:12, driverSlug:'gabbor01', firstName:'Gabriel',   lastName:'Bortoleto',  team:TEAMS.audi,         nationality:'br', time:null,          gap:'+1 lap',  points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.234', q1:'1:20.789', q2:'1:20.445', q3:null        },
  { pos:13, driverSlug:'lanstr01', firstName:'Lance',     lastName:'Stroll',     team:TEAMS.aston_martin, nationality:'ca', time:null,          gap:'+1 lap',  points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.445', q1:'1:20.901', q2:'1:20.567', q3:null        },
  { pos:14, driverSlug:'estoco01', firstName:'Esteban',   lastName:'Ocon',       team:TEAMS.haas,         nationality:'fr', time:null,          gap:'+1 lap',  points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.567', q1:'1:21.012', q2:'1:20.678', q3:null        },
  { pos:15, driverSlug:'olibea01', firstName:'Oliver',    lastName:'Bearman',    team:TEAMS.haas,         nationality:'gb', time:null,          gap:'+1 lap',  points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.678', q1:'1:21.123', q2:'1:20.789', q3:null        },
  { pos:16, driverSlug:'arvlin01', firstName:'Arvid',     lastName:'Lindblad',   team:TEAMS.rb,           nationality:'gb', time:null,          gap:'+2 laps', points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.789', q1:'1:21.234', q2:null,        q3:null        },
  { pos:17, driverSlug:'lialaw01', firstName:'Liam',      lastName:'Lawson',     team:TEAMS.rb,           nationality:'nz', time:null,          gap:'+2 laps', points:0,  fastestLap:false, status:'Finished', bestLap:'1:20.901', q1:'1:21.345', q2:null,        q3:null        },
  { pos:18, driverSlug:'alealb01', firstName:'Alexander', lastName:'Albon',      team:TEAMS.williams,     nationality:'th', time:null,          gap:'+2 laps', points:0,  fastestLap:false, status:'Finished', bestLap:'1:21.012', q1:'1:21.456', q2:null,        q3:null        },
  { pos:19, driverSlug:'carsai01', firstName:'Carlos',    lastName:'Sainz',      team:TEAMS.williams,     nationality:'es', time:null,          gap:'DNF',     points:0,  fastestLap:false, status:'Accident', bestLap:'1:21.123', q1:'1:21.567', q2:null,        q3:null        },
  { pos:20, driverSlug:'piegas01', firstName:'Pierre',    lastName:'Gasly',      team:TEAMS.alpine,       nationality:'fr', time:null,          gap:'DNF',     points:0,  fastestLap:false, status:'Engine',   bestLap:'1:21.234', q1:'1:21.678', q2:null,        q3:null        },
].map(r => ({
  ...r,
  headshot: headshot(r.driverSlug, r.team.cdnSlug, r.team.accessible),
  logo:     teamLogo(r.team.cdnSlug, r.team.accessible),
  flag:     flag(r.nationality),
}))

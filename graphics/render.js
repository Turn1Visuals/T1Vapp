// ── Constants ─────────────────────────────────────────────────────────────────
const YEAR = 2026

const BRAND_LOGO = {
  practice:   '../shared/logos/logo-long-practice.svg',
  qualifying:  '../shared/logos/logo-long-practice.svg',
  sprint:      '../shared/logos/logo-long-sprint.svg',
  race:        '../shared/logos/logo-long-gp.svg',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function cdnSlug(teamName) {
  return teamName?.toLowerCase().replace(/\s+/g, '') ?? 'unknown'
}

const TEAM_BG_COLOR = {
  redbullracing: '061A4D', williams:    '0142FE', cadillac:    '15151F',
  audi:          '6D0507', alpine:      'E32785', astonmartin: '229971',
  ferrari:       'DC0000', haasf1team:  'F8F4F1', mclaren:     'FD8000',
  mercedes:      '00F5D3', racingbulls: '4862E4',
}

const LOGO_VARIANT = {
  mclaren:      'white', mercedes:     'black',  ferrari:      '',
  redbullracing:'',      racingbulls:  'white',  haasf1team:   '',
  audi:         'white', alpine:       'white',  williams:     'white',
  cadillac:     'white', astonmartin:  'white',
}

function teamBg(teamSlug) {
  return TEAM_BG_COLOR[teamSlug] ?? '333333'
}

function driverImgUrl(driverSlug, teamSlug, angle = 'right') {
  return `https://media.formula1.com/image/upload/common/f1/${YEAR}/${teamSlug}/${driverSlug}/${YEAR}${teamSlug}${driverSlug}${angle}.png`
}

function logoUrl(teamSlug) {
  const c       = teamBg(teamSlug)
  const variant = LOGO_VARIANT[teamSlug] ?? 'white'
  return `https://media.formula1.com/image/upload/b_rgb:${c}/common/f1/${YEAR}/${teamSlug}/${YEAR}${teamSlug}logo${variant}.svg`
}

function numberUrl(driverSlug, teamSlug) {
  return `https://media.formula1.com/image/upload/common/f1/${YEAR}/${teamSlug}/${driverSlug}/${YEAR}${teamSlug}${driverSlug}numberwhite.svg`
}

function deriveSessionType(info) {
  const cat  = info?.SessionCategory?.toLowerCase() ?? ''
  const type = info?.Type?.toLowerCase() ?? ''
  if (cat === 'sprint' || type === 'sprint')             return 'sprint'
  if (cat.includes('qualifying') || type.includes('qualifying')) return 'qualifying'
  if (type === 'race')                                   return 'race'
  return 'practice'
}

function currentTyre(appLine) {
  const stints = appLine?.Stints ?? []
  return stints[stints.length - 1]?.Compound?.toLowerCase() ?? 'unknown'
}

function racePoints(prediction, num) {
  const d = prediction?.Drivers?.[num]
  return d ? (d.PredictedPoints ?? 0) - (d.CurrentPoints ?? 0) : 0
}

// ── Build sorted results array from state ─────────────────────────────────────
function buildResults(state) {
  const drivers    = state.DriverList            ?? {}
  const timing     = state.TimingData?.Lines     ?? {}
  const appData    = state.TimingAppData?.Lines  ?? {}
  const prediction = state.ChampionshipPrediction ?? null
  const sessionType = deriveSessionType(state.SessionInfo)

  return Object.entries(drivers)
    .map(([num, d]) => {
      const t    = timing[num]  ?? {}
      const app  = appData[num] ?? {}
      const parts      = d.PublicIdRight?.split('/') ?? []
      const teamSlug   = parts[3] ?? cdnSlug(d.TeamName)
      const driverSlug = parts[4] ?? slugFromName(d.FirstName, d.LastName)

      return {
        num,
        pos:        parseInt(t.Position ?? t.Line ?? 99),
        firstName:  d.FirstName ?? '',
        lastName:   d.LastName  ?? '',
        teamName:   d.TeamName  ?? '',
        teamSlug,
        driverSlug,
        tyre:       currentTyre(app),
        gap:        t.GapToLeader ?? '',
        interval:   t.IntervalToPositionAhead?.Value ?? '',
        bestLap:    t.BestLapTime?.Value ?? '',
        lastLap:    t.LastLapTime?.Value ?? '',
        q1:         t.Stats?.['0']?.Value ?? t.BestLapTime?.Value ?? '',
        q2:         t.Stats?.['1']?.Value ?? '',
        q3:         t.Stats?.['2']?.Value ?? '',
        points:     racePoints(prediction, num),
        fastestLap: t.Stats?.OverallFastest === true,
        retired:    !!t.Retired,
        inPit:      t.InPit === true,
        sessionType,
      }
    })
    .filter(d => d.pos < 99)
    .sort((a, b) => a.pos - b.pos)
}

function slugFromName(first, last) {
  const f = (first ?? '').slice(0, 3).toLowerCase()
  const l = (last  ?? '').slice(0, 3).toLowerCase()
  return `${f}${l}01`
}

// ── Render row HTML ───────────────────────────────────────────────────────────
function rowHtml(r, idx, total) {
  const side    = idx < Math.ceil(total / 2) ? 'left' : 'right'
  const dnf     = r.retired
  const posHtml = dnf
    ? `<div class="pos dnf">dnf</div>`
    : `<div class="pos">${r.pos}</div>`

  const nameHtml = `<div class="name">${r.lastName.toUpperCase()}</div>`

  const logoHtml = `<img class="logo" data-team="${r.teamSlug}"
    src="${logoUrl(r.teamSlug)}"
    onerror="this.style.opacity='0'">`

  let timeHtml = ''
  if (r.sessionType === 'race' || r.sessionType === 'sprint') {
    const gap = r.pos === 1 ? (r.lastLap || r.bestLap || '') : (r.gap || r.interval || '')
    timeHtml = `<div class="gap">${dnf ? 'DNF' : gap}</div>
                <div class="points ${r.points === 0 ? 'nopoints' : ''}">${r.points}</div>`
  } else if (r.sessionType === 'qualifying') {
    const best = r.q3 || r.q2 || r.q1 || ''
    timeHtml = `<div class="time" data-tyre="${r.tyre}">${best}</div>
                <div class="gap">${r.pos === 1 ? '' : (r.gap || r.interval || '')}</div>`
  } else {
    // practice
    timeHtml = `<div class="time" data-tyre="${r.tyre}">${r.bestLap}</div>
                <div class="gap">${r.pos === 1 ? '' : (r.gap || r.interval || '')}</div>`
  }

  return `<div class="row ${side}">${posHtml}${nameHtml}${logoHtml}${timeHtml}</div>`
}

// ── Update DOM ────────────────────────────────────────────────────────────────
function render(state) {
  const info    = state.SessionInfo ?? {}
  const results = buildResults(state)
  if (!results.length) return

  const sessionType = results[0].sessionType
  const p1          = results[0]

  // Session labels
  document.getElementById('event-name').textContent  = info.Meeting?.Name ?? ''
  document.getElementById('session-name').textContent = info.Name ?? ''

  // Root attributes for CSS
  const graphic = document.getElementById('graphic')
  graphic.dataset.sessionType = sessionType === 'race' ? 'gp' : sessionType

  const content = document.getElementById('content')
  content.dataset.session = sessionType === 'sprint' ? 'race' : sessionType

  // Highlight (P1 driver)
  const hl = document.getElementById('highlight')
  hl.dataset.team = p1.teamSlug
  document.getElementById('highlight-logo').src   = logoUrl(p1.teamSlug)
  document.getElementById('highlight-driver').src = driverImgUrl(p1.driverSlug, p1.teamSlug, 'front')
  document.getElementById('highlight-number').src = numberUrl(p1.driverSlug, p1.teamSlug)

  // Brand logo
  const brandLogo = document.getElementById('brand-logo')
  brandLogo.src = BRAND_LOGO[sessionType] ?? BRAND_LOGO.practice

  // Results rows
  document.getElementById('results').innerHTML =
    results.map((r, i) => rowHtml(r, i, results.length)).join('')
}

// Exposed globally so the app can push state in via executeJavaScript
window.renderFromState = render

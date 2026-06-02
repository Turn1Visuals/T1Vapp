
// ── F1 Info Tab ───────────────────────────────────────────────────────────────
export function initF1Tab() {
  const JOLPICA = 'https://api.jolpi.ca/ergast/f1'
  const YEAR    = new Date().getFullYear()

  function jolpica(path) {
    return window.api.http.fetchJson(`${JOLPICA}${path}`)
  }

  // Jolpica constructorId → CDN team_id (only the non-obvious ones)
  const JOLPICA_TO_CDN = {
    red_bull: 'redbullracing', aston_martin: 'astonmartin',
    haas:     'haasf1team',    rb:           'racingbulls',
  }
  function cdnTeamId(constructorId) {
    return JOLPICA_TO_CDN[constructorId] ?? constructorId
  }

  // ── Dynamic asset lookups (populated after fetch) ────────────────────────────
  let driverLookup   = {}  // lastName.toLowerCase() → { driver_id, team_id }
  let teamColorLookup = {} // cdnTeamId → hex color
  let fallbackDriverList = null

  function normName(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  async function loadFallbackDriverList() {
    if (fallbackDriverList) return fallbackDriverList
    try {
      const res = await fetch('/src/data/fallback-driverlist.json')
      const data = await res.json()
      fallbackDriverList = data.DriverList ?? {}
      console.log(`[f1-tab] Loaded fallback driverlist with ${Object.keys(fallbackDriverList).length} drivers`)
      return fallbackDriverList
    } catch (e) {
      console.warn(`[f1-tab] Failed to load fallback driverlist: ${e.message}`)
      fallbackDriverList = {}
      return fallbackDriverList
    }
  }

  function applyFallback(driverLookup) {
    if (!fallbackDriverList || Object.keys(fallbackDriverList).length === 0) return

    for (const [racingNum, fallDriver] of Object.entries(fallbackDriverList)) {
      if (!fallDriver.LastName) continue
      const key = normName(fallDriver.LastName)
      const existing = driverLookup[key]

      if (existing) {
        // Fill in missing fields from fallback
        if (!existing.firstName && fallDriver.FirstName) existing.firstName = fallDriver.FirstName
        if (!existing.lastName && fallDriver.LastName) existing.lastName = fallDriver.LastName
        if (!existing.teamName && fallDriver.TeamName) existing.teamName = fallDriver.TeamName
        if (!existing.teamColour && fallDriver.TeamColour) existing.teamColour = fallDriver.TeamColour
      }
    }
  }

  function buildLookups(data) {
    teamColorLookup = {}
    driverLookup    = {}
    for (const t of (data.teams ?? [])) {
      if (t.team_id) teamColorLookup[t.team_id] = {
        color:      t.colours?.team       ?? '#666666',
        accessible: t.colours?.accessible ?? '#333333',
        name:       t.name ?? '',
      }
    }
    for (const d of (data.drivers ?? [])) {
      const key = d.profile?.['Last Name'] ? normName(d.profile['Last Name']) : null
      if (key) driverLookup[key] = {
        driver_id: d.driver_id,
        team_id:   d.profile?.team_id ?? '',
        firstName: d.profile?.['First Name'] ?? '',
        lastName:  d.profile?.['Last Name']  ?? '',
      }
    }
    applyFallback(driverLookup)
  }

  function teamColor(constructorId) {
    return teamColorLookup[cdnTeamId(constructorId)]?.color ?? '#666'
  }

  function teamLogo(cdnTeamSlug) {
    const accessible = (teamColorLookup[cdnTeamSlug]?.accessible ?? '#333333').replace('#', '')
    return `https://media.formula1.com/image/upload/b_rgb:${accessible}/common/f1/${YEAR}/${cdnTeamSlug}/${YEAR}${cdnTeamSlug}logowhite.png`
  }

  function driverImg(driverId, lastName, constructorId, angle = 'right') {
    const byName = driverLookup[normName(lastName)]
    if (!byName) { console.warn(`[f1-tab] no assets entry for ${lastName} (${driverId}) — fetch assets`); return '' }
    const color = (teamColorLookup[byName.team_id]?.color ?? '#333').replace('#', '')
    return `https://media.formula1.com/image/upload/ar_1:1,c_crop,g_north,w_1000/b_rgb:${color}/common/f1/${YEAR}/${byName.team_id}/${byName.driver_id}/${YEAR}${byName.team_id}${byName.driver_id}${angle}.png`
  }

  // ── Assets load + refresh button ─────────────────────────────────────────────
  const assetsDateEl    = document.getElementById('f1-assets-date')
  const assetsRefreshBtn = document.getElementById('btn-f1-assets-refresh')

  function setAssetsDate(isoDate) {
    if (!isoDate) { assetsDateEl.textContent = 'No assets cached'; return }
    const d = new Date(isoDate)
    assetsDateEl.textContent = `Assets: ${d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}`
  }

  async function loadAssets() {
    const data = await window.api.f1assets.load()
    if (data) { buildLookups(data); setAssetsDate(data.fetchedAt) }
    else setAssetsDate(null)
  }

  assetsRefreshBtn.addEventListener('click', async () => {
    assetsRefreshBtn.disabled = true
    assetsRefreshBtn.textContent = '↻ Fetching…'
    try {
      const data = await window.api.f1assets.fetch()
      buildLookups(data)
      setAssetsDate(data.fetchedAt)
      // Reload views so they pick up new data
      loaded.clear()
      const active = document.querySelector('.f1-subtab.active')
      if (active) loadView(active.dataset.f1tab)
    } catch(e) {
      assetsDateEl.textContent = `Fetch failed: ${e.message}`
    } finally {
      assetsRefreshBtn.disabled = false
      assetsRefreshBtn.textContent = '↻ Refresh assets'
    }
  })

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const COUNTRY_ISO = {
    'Australia':    'au', 'China':        'cn', 'Japan':        'jp',
    'Bahrain':      'bh', 'Saudi Arabia': 'sa', 'USA':          'us',
    'Italy':        'it', 'Monaco':       'mc', 'Canada':       'ca',
    'Spain':        'es', 'Austria':      'at', 'UK':           'gb',
    'Hungary':      'hu', 'Belgium':      'be', 'Netherlands':  'nl',
    'Azerbaijan':   'az', 'Singapore':    'sg', 'Mexico':       'mx',
    'Brazil':       'br', 'Qatar':        'qa', 'UAE':          'ae',
    'Germany':      'de', 'France':       'fr', 'Portugal':     'pt',
    'Argentina':    'ar', 'South Africa': 'za', 'Malaysia':     'my',
    'Korea':        'kr', 'India':        'in', 'Turkey':       'tr',
    'Russia':       'ru', 'Switzerland':  'ch', 'Morocco':      'ma',
    'Sweden':       'se',
  }

  function raceFlag(country) {
    const iso = COUNTRY_ISO[country]
    return iso ? `<img class="f1-flag" src="https://flagcdn.com/w20/${iso}.png">` : ''
  }

  function raceShort(raceName) {
    const country = raceName.replace(/ Grand Prix$/, '').trim()
    const SHORT = {
      'Australian': 'AUS', 'Chinese': 'CHN', 'Japanese': 'JPN', 'Bahrain': 'BHR',
      'Saudi Arabian': 'SAU', 'Miami': 'MIA', 'Emilia Romagna': 'EMI', 'Monaco': 'MON',
      'Canadian': 'CAN', 'Spanish': 'ESP', 'Austrian': 'AUT', 'British': 'GBR',
      'Hungarian': 'HUN', 'Belgian': 'BEL', 'Dutch': 'NED', 'Italian': 'ITA',
      'Azerbaijan': 'AZE', 'Singapore': 'SGP', 'United States': 'USA', 'Mexico City': 'MEX',
      'Brazilian': 'BRA', 'Sao Paulo': 'BRA', 'Las Vegas': 'LAS', 'Qatar': 'QAT', 'Abu Dhabi': 'ABU',
      'Barcelona': 'BAR',
    }
    return SHORT[country] ?? country.slice(0, 3).toUpperCase()
  }

  // Subtab switching
  document.querySelectorAll('.f1-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.f1-subtab').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.f1-view').forEach(v => v.classList.remove('active'))
      btn.classList.add('active')
      const view = document.getElementById('f1-view-' + btn.dataset.f1tab)
      view.classList.add('active')
      loadView(btn.dataset.f1tab)
    })
  })

  const loaded = new Set()

  function loadView(name) {
    if (loaded.has(name)) return
    loaded.add(name)
    if (name === 'standings')  loadStandings()
    if (name === 'drivers')    loadDrivers()
    if (name === 'teams')      loadTeams()
    if (name === 'schedule')   loadSchedule()
  }

  // Load assets then trigger default view when F1 tab is opened
  document.querySelector('.tab[data-tab="f1"]').addEventListener('click', async () => {
    await loadFallbackDriverList()
    await loadAssets()
    const active = document.querySelector('.f1-subtab.active')
    if (active) loadView(active.dataset.f1tab)
  })

  // ── Standings ───────────────────────────────────────────────────────────────
  async function loadStandings() {
    const el = document.getElementById('f1-view-standings')
    el.innerHTML = '<p class="muted">Loading...</p>'
    try {
      const [raceData, sprintData, drvRes, conRes, calData] = await Promise.all([
        jolpica(`/${YEAR}/results.json?limit=500`),
        jolpica(`/${YEAR}/sprint.json?limit=100`),
        jolpica(`/${YEAR}/driverstandings.json?limit=25`),
        jolpica(`/${YEAR}/constructorstandings.json?limit=15`),
        jolpica(`/${YEAR}.json?limit=30`),
      ])

      const races    = raceData?.MRData?.RaceTable?.Races   ?? []
      const sprints  = sprintData?.MRData?.RaceTable?.Races ?? []
      const calendar = calData?.MRData?.RaceTable?.Races    ?? []
      const drvList  = drvRes?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? []
      const conList  = conRes?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? []

      // Official position map — includes tiebreaker logic Jolpica already resolved
      const officialPos = {}
      for (const s of drvList) officialPos[s.Driver.driverId] = Number(s.position)

      const sprintRounds = new Set([
        ...sprints.map(s => s.round),
        ...calendar.filter(r => r.Sprint).map(r => r.round),
      ])

      const roundInfo = {}
      for (const race of calendar) roundInfo[race.round] = {
        short:  raceShort(race.raceName),
        flag:   raceFlag(race.Circuit?.Location?.country),
        future: new Date(race.date) > new Date(),
      }
      const rounds = Object.keys(roundInfo).map(Number).sort((a, b) => a - b)

      const driverMap = {}
      function ensureDriver(result) {
        const id = result.Driver.driverId
        if (!driverMap[id]) {
          const scraped = driverLookup[normName(result.Driver.familyName)]
          const cdnSlug = cdnTeamId(result.Constructor.constructorId)
          driverMap[id] = {
            driverId:  id,
            firstName: scraped?.firstName || result.Driver.givenName.split(' ').pop(),
            lastName:  scraped?.lastName  || result.Driver.familyName,
            code:      result.Driver.code,
            teamId:    result.Constructor.constructorId,
            team:      teamColorLookup[cdnSlug]?.name || result.Constructor.name,
            byRound:   {},
            total:     0,
          }
        }
        return driverMap[id]
      }
      for (const race of races) {
        for (const r of (race.Results ?? [])) {
          const d = ensureDriver(r)
          const pts = parseFloat(r.points) || 0
          if (!d.byRound[race.round]) d.byRound[race.round] = { race: null, sprint: null }
          d.byRound[race.round].race = pts
          d.total += pts
        }
      }
      for (const race of sprints) {
        for (const r of (race.SprintResults ?? [])) {
          const d = ensureDriver(r)
          const pts = parseFloat(r.points) || 0
          if (!d.byRound[race.round]) d.byRound[race.round] = { race: null, sprint: null }
          d.byRound[race.round].sprint = pts
          d.total += pts
        }
      }

      const drivers = Object.entries(driverMap)
        .sort(([idA], [idB]) => (officialPos[idA] ?? 99) - (officialPos[idB] ?? 99))
        .map(([id, d]) => ({ ...d, position: officialPos[id] ?? '?' }))

      // Build constructor per-round map by summing driver points
      const conMap = {}
      for (const d of drivers) {
        const id = d.teamId
        if (!conMap[id]) conMap[id] = { byRound: {}, total: 0 }
        for (const [round, entry] of Object.entries(d.byRound)) {
          if (!conMap[id].byRound[round]) conMap[id].byRound[round] = { race: 0, sprint: 0 }
          conMap[id].byRound[round].race   += entry.race   ?? 0
          conMap[id].byRound[round].sprint += entry.sprint ?? 0
          conMap[id].total += (entry.race ?? 0) + (entry.sprint ?? 0)
        }
      }
      const constructors = conList.map(s => ({
        position: s.position,
        constructorId: s.Constructor.constructorId,
        name: teamColorLookup[cdnTeamId(s.Constructor.constructorId)]?.name || s.Constructor.name,
        points: s.points,
        byRound: conMap[s.Constructor.constructorId]?.byRound ?? {},
      }))

      const roundCells = rounds.map(r => `
        <div class="f1-sg-cell f1-round-th${roundInfo[r].future ? ' f1-round-future' : ''}" title="${raceName(calendar, r)}">
          <span class="f1-round-label">${roundInfo[r].short}${sprintRounds.has(String(r)) ? '<sup>S</sup>' : ''}</span>
          <span>${roundInfo[r].flag}</span>
        </div>`).join('')

      function driverRow(d) {
        const headshot = driverImg(d.driverId, d.lastName, d.teamId)
        return `<div class="f1-sg-row">
          <div class="f1-sg-cell f1-pos">${d.position}</div>
          <div class="f1-sg-cell f1-sg-name">
            ${headshot ? `<img class="f1-sg-headshot" src="${headshot}" onerror="this.style.display='none'">` : ''}
            <strong>${d.lastName}</strong>
          </div>
          <div class="f1-sg-cell f1-pts">${d.total}</div>
          ${rounds.map(r => {
            const entry = d.byRound[r]
            const isSprint = sprintRounds.has(String(r))
            return `<div class="f1-sg-cell f1-pts-cell">${fmtRoundCell(entry?.race ?? null, entry?.sprint ?? null, isSprint)}</div>`
          }).join('')}
        </div>`
      }

      function conRow(c) {
        return `<div class="f1-sg-row">
          <div class="f1-sg-cell f1-pos">${c.position}</div>
          <div class="f1-sg-cell f1-sg-name">
            <img class="f1-sg-headshot" src="${teamLogo(cdnTeamId(c.constructorId))}" onerror="this.style.display='none'">
            <strong>${c.name}</strong>
          </div>
          <div class="f1-sg-cell f1-pts">${c.points}</div>
          ${rounds.map(r => {
            const entry = c.byRound[r]
            const isSprint = sprintRounds.has(String(r))
            return `<div class="f1-sg-cell f1-pts-cell">${fmtRoundCell(entry?.race ?? null, entry?.sprint ?? null, isSprint)}</div>`
          }).join('')}
        </div>`
      }

      el.innerHTML = `
        <div class="f1-sg-wrap" style="--f1-rounds:${rounds.length}">
          <div class="f1-sg-section">
            <div class="f1-sg-head f1-sg-row">
              <div class="f1-sg-cell f1-pos-th"></div>
              <div class="f1-sg-cell f1-sg-name">Driver</div>
              <div class="f1-sg-cell f1-pts">Pts</div>
              ${roundCells}
            </div>
            ${drivers.map(driverRow).join('')}
          </div>
          <div class="f1-sg-section">
            <div class="f1-sg-head f1-sg-row">
              <div class="f1-sg-cell f1-pos-th"></div>
              <div class="f1-sg-cell f1-sg-name">Team</div>
              <div class="f1-sg-cell f1-pts">Pts</div>
              ${roundCells}
            </div>
            ${constructors.map(conRow).join('')}
          </div>
        </div>`

    } catch(e) {
      el.innerHTML = `<p class="muted">Failed to load standings: ${e.message}</p>`
    }
  }

  function raceName(list, round) {
    return list.find(r => r.round === String(round))?.raceName ?? ''
  }

  function padPts(val) {
    if (val == null) return '<span class="f1-pts-nil">-</span>'
    const s = String(val)
    return (s.length < 2 ? '<span class="f1-zero">0</span>' : '') + s
  }

  function fmtRoundCell(race, sprint, isSprint) {
    if (isSprint) {
      return `<span class="f1-pts-s">${padPts(sprint)}</span><span class="f1-pts-sep">·</span><span class="f1-pts-r">${padPts(race)}</span>`
    }
    return `<span class="f1-pts-r">${padPts(race)}</span>`
  }

  // ── Drivers ─────────────────────────────────────────────────────────────────
  async function loadDrivers() {
    const el = document.getElementById('f1-view-drivers')
    try {
      const res = await jolpica(`/${YEAR}/driverstandings.json?limit=25`)
      const list = res?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? []
      el.innerHTML = `<div class="f1-driver-grid">${list.map(s => {
        const d         = s.Driver
        const con       = s.Constructors[0]
        const col       = teamColor(con?.constructorId)
        const scraped   = driverLookup[normName(d.familyName)]
        const firstName = scraped?.firstName || d.givenName.split(' ').pop()
        const lastName  = scraped?.lastName  || d.familyName
        const cdnSlug   = cdnTeamId(con?.constructorId)
        const teamName  = teamColorLookup[cdnSlug]?.name || con?.name || ''
        const img       = driverImg(d.driverId, d.familyName, con?.constructorId)
        return `<div class="f1-driver-card" style="border-top-color:${col}">
          <div class="f1-driver-pos">${s.position}</div>
          ${img ? `<img class="f1-driver-img" src="${img}" onerror="this.style.display='none'">` : ''}
          <div class="f1-driver-info">
            <div class="f1-driver-name"><strong>${lastName}</strong> <span class="f1-driver-given">${firstName}</span></div>
            <div class="f1-driver-team">${teamName}  ·  #${d.permanentNumber ?? '?'}</div>
            <div class="f1-driver-pts">${s.points} pts</div>
          </div>
        </div>`
      }).join('')}</div>`
    } catch(e) {
      el.innerHTML = `<p class="muted">Failed to load drivers: ${e.message}</p>`
    }
  }

  // ── Teams ────────────────────────────────────────────────────────────────────
  async function loadTeams() {
    const el = document.getElementById('f1-view-teams')
    try {
      const res = await jolpica(`/${YEAR}/constructorstandings.json?limit=15`)
      const list = res?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? []
      el.innerHTML = `<table class="f1-table">
        <thead><tr>
          <th></th><th>Team</th><th>Nationality</th><th style="text-align:right">Points</th>
        </tr></thead>
        <tbody>${list.map(s => {
          const cdnSlug  = cdnTeamId(s.Constructor?.constructorId)
          const logo     = teamLogo(cdnSlug)
          const teamName = teamColorLookup[cdnSlug]?.name || s.Constructor.name
          return `<tr>
            <td class="f1-pos">${s.position}</td>
            <td>
              <img class="f1-team-logo" src="${logo}" onerror="this.style.display='none'">
              <strong>${teamName}</strong>
            </td>
            <td style="color:var(--muted)">${s.Constructor.nationality}</td>
            <td class="f1-pts">${s.points}</td>
          </tr>`
        }).join('')}</tbody>
      </table>`
    } catch(e) {
      el.innerHTML = `<p class="muted">Failed to load teams: ${e.message}</p>`
    }
  }

  // ── Schedule ─────────────────────────────────────────────────────────────────
  async function loadSchedule() {
    const el = document.getElementById('f1-view-schedule')
    try {
      const res = await jolpica(`/${YEAR}.json?limit=30`)
      const races = res?.MRData?.RaceTable?.Races ?? []
      const today = new Date()
      const nextIdx = races.findIndex(r => new Date(r.date) >= today)
      el.innerHTML = `<div class="f1-round-list">${races.map((r, i) => {
        const isPast = new Date(r.date) < today
        const isNext = i === nextIdx
        const dateStr = new Date(r.date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })
        return `<div class="f1-round ${isPast ? 'past' : ''} ${isNext ? 'next' : ''}">
          <div class="f1-round-num">R${r.round}</div>
          <div class="f1-round-info">
            <div class="f1-round-name">${r.raceName}</div>
            <div class="f1-round-date">${r.Circuit?.circuitName} · ${dateStr}</div>
          </div>
          ${isNext ? '<span class="f1-round-badge next">Next</span>' : ''}
        </div>`
      }).join('')}</div>`
    } catch(e) {
      el.innerHTML = `<p class="muted">Failed to load schedule: ${e.message}</p>`
    }
  }
}

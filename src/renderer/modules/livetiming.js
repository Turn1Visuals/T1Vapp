import { state, saveConfig } from '../state.js'
import { setVcamIcons } from './virtual-camera.js'

// ── Live Timing ───────────────────────────────────────────────────────────────
export function initLiveTiming() {
  const yearSelect    = document.getElementById('lt-year-select')
  const yearLoadBtn   = document.getElementById('lt-year-load')
  const sessionList   = document.getElementById('lt-session-list')
  const statusText    = document.getElementById('lt-status-text')
  const liveBtn       = document.getElementById('lt-live-btn')
  const unloadBtn     = document.getElementById('lt-unload-btn')
  const playbackBar   = document.getElementById('lt-playback-bar')
  const playBtn       = document.getElementById('lt-play-btn')
  const seekEl        = document.getElementById('lt-seek')
  const offsetLabel   = document.getElementById('lt-offset-label')
  const durationLabel = document.getElementById('lt-duration-label')
  const driversEl     = document.getElementById('lt-drivers')

  const valSession  = document.getElementById('lt-val-session')
  const valStatus   = document.getElementById('lt-val-session-status')
  const valTrack    = document.getElementById('lt-val-track')
  const valWeather  = document.getElementById('lt-val-weather')
  const valLap      = document.getElementById('lt-val-lap')
  const valSC       = document.getElementById('lt-val-sc')

  let isPlaying  = false
  let duration   = 0
  let isSeeking  = false
  let activeItem = null
  let liveMode   = false

  // ── Vcam timeline overlay ──
  const vcamTimeline   = document.getElementById('vcam-timeline')
  const vcamTlLabel    = document.getElementById('vcam-tl-label')
  const vcamTlLive     = document.getElementById('vcam-tl-live')
  const vcamTlBar      = document.getElementById('vcam-tl-bar')
  const vcamTlBarWrap  = document.getElementById('vcam-tl-bar-wrap')
  const vcamTlTime     = document.getElementById('vcam-tl-time')
  const vcamTlPlayBtn  = document.getElementById('vcam-tl-play')
  let vcamSessionLabel = ''

  function vcamUpdateClock(clock) {
    if (!clock || !clock.duration) return
    const pct = Math.min(100, (clock.offset / clock.duration) * 100)
    vcamTlBar.style.width = pct + '%'
    vcamTlTime.textContent = fmtMs(clock.offset) + ' / ' + fmtMs(clock.duration)
  }

  function vcamSetLive(live) {
    vcamTlLive.style.display = live ? '' : 'none'
    vcamTlPlayBtn.style.display = live ? 'none' : ''
    vcamTlBar.style.background = live ? '#4caf50' : 'var(--accent)'
    vcamTlBarWrap.style.cursor = live ? 'default' : 'pointer'
    if (live) { vcamTlBar.style.width = '100%'; vcamTlTime.textContent = 'LIVE' }
  }

  // Load icons for vcam controls
  let vcamIconPlay = '▶', vcamIconPause = '⏸', vcamIconExpand = '⛶', vcamIconCompress = '✕'
  Promise.all([
    window.api.fa.get('solid', 'play'),
    window.api.fa.get('solid', 'pause'),
    window.api.fa.get('solid', 'expand'),
    window.api.fa.get('solid', 'compress'),
  ]).then(([play, pause, expand, compress]) => {
    if (play?.svg)     vcamIconPlay     = play.svg
    if (pause?.svg)    vcamIconPause    = pause.svg
    if (expand?.svg)   vcamIconExpand   = expand.svg
    if (compress?.svg) vcamIconCompress = compress.svg
    // Apply to buttons with their current state
    vcamTlPlayBtn.innerHTML = isPlaying ? vcamIconPause : vcamIconPlay
    const fsBtn = document.getElementById('btn-vcam-fullscreen')
    if (fsBtn) fsBtn.innerHTML = vcamIconExpand
    // Update shared icon refs for virtual-camera.js
    setVcamIcons({ play: vcamIconPlay, pause: vcamIconPause, expand: vcamIconExpand, compress: vcamIconCompress })
  })

  // Play/pause from vcam overlay
  vcamTlPlayBtn.addEventListener('click', () => {
    if (isPlaying) window.api.f1.pause()
    else window.api.f1.play()
  })

  // Seek by clicking the bar
  vcamTlBarWrap.addEventListener('click', e => {
    if (liveMode || !duration) return
    const rect = vcamTlBarWrap.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    window.api.f1.seek(Math.floor(pct * duration))
  })

  // Check if a session was restored on startup
  window.api.f1.status().then(s => {
    if (s.loaded && !s.live) {
      const name = s.path?.split('/').filter(Boolean).pop() ?? s.path ?? 'Session'
      setStatus(name)
      vcamTlLabel.textContent = name
      setLoaded(true)
      duration = s.duration
      seekEl.max = s.duration
      durationLabel.textContent = fmtMs(s.duration)
      vcamUpdateClock({ offset: s.offset ?? 0, duration: s.duration })
      // Populate session list and highlight the restored session
      const year = s.path?.match(/^(\d{4})\//)?.[1]
      if (year) {
        yearSelect.value = year
        loadSessionList(year, s.path)
      }
    } else if (s.loaded && s.live) {
      liveMode = true
      liveBtn.textContent = 'Disconnect Live'
      setStatus('Live', true)
      vcamTlLabel.textContent = 'Live'
      setLoaded(true)
    }
  })

  // Populate year dropdown (current year down to 2018)
  const currentYear = new Date().getFullYear()
  for (let y = currentYear; y >= 2018; y--) {
    const opt = document.createElement('option')
    opt.value = y; opt.textContent = y
    yearSelect.appendChild(opt)
  }

  function fmtMs(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
    return `${h}:${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
  }

  function setStatus(text, live = false) {
    statusText.textContent = text
    statusText.style.color = live ? '#4caf50' : '#888'
  }

  function setLoaded(loaded) {
    unloadBtn.style.display = loaded ? '' : 'none'
    playbackBar.style.display = loaded && !liveMode ? '' : 'none'
    if (vcamTimeline) vcamTimeline.style.display = loaded ? '' : 'none'
    if (loaded) vcamSetLive(liveMode)
    if (!loaded && vcamTlBar) { vcamTlBar.style.width = '0%'; vcamTlTime.textContent = '' }
  }

  async function loadSessionList(year, activePath = null) {
    sessionList.innerHTML = '<p class="muted" style="padding:12px">Loading…</p>'
    try {
      const sessions = await window.api.f1.sessions(year)
      if (!sessions.length) { sessionList.innerHTML = '<p class="muted" style="padding:12px">No sessions found.</p>'; return }

      const meetings = {}
      for (const s of sessions) {
        if (!meetings[s.meeting]) meetings[s.meeting] = []
        meetings[s.meeting].push(s)
      }

      sessionList.innerHTML = ''
      for (const [meeting, items] of Object.entries(meetings)) {
        const hasActive = activePath && items.some(i => i.path === activePath)

        const header = document.createElement('div')
        header.className = 'lt-meeting' + (hasActive ? ' open' : '')
        header.innerHTML = `<span>${meeting}</span><span class="lt-meeting-chevron">▶</span>`

        const group = document.createElement('div')
        group.className = 'lt-meeting-items' + (hasActive ? ' open' : '')

        header.addEventListener('click', () => {
          const open = group.classList.toggle('open')
          header.classList.toggle('open', open)
        })

        for (const item of items) {
          const el = document.createElement('div')
          el.className = 'lt-session-item' + (item.cached ? ' cached' : '')
          el.textContent = item.session
          el.addEventListener('click', () => loadSession(item, el))
          group.appendChild(el)
          if (activePath && item.path === activePath) {
            if (activeItem) activeItem.classList.remove('active')
            activeItem = el
            el.classList.add('active')
            setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 50)
          }
        }

        sessionList.appendChild(header)
        sessionList.appendChild(group)
      }
    } catch (e) {
      sessionList.innerHTML = `<p class="muted" style="padding:12px">Error: ${e.message}</p>`
    }
  }

  yearLoadBtn.addEventListener('click', () => loadSessionList(yearSelect.value))

  async function loadSession(item, el) {
    if (activeItem) activeItem.classList.remove('active')
    activeItem = el
    el.classList.add('active')
    liveMode = false
    setStatus(`Loading ${item.session}…`)
    liveBtn.textContent = 'Connect Live'
    try {
      const res = await window.api.f1.load(item.path)
      if (!res.ok) throw new Error(res.error)
      duration = res.duration
      durationLabel.textContent = fmtMs(duration)
      seekEl.max = duration
      ltLoaded = true
      setStatus(`${item.meeting} — ${item.session}`)
      vcamTlLabel.textContent = `${item.meeting} · ${item.session}`
      setLoaded(true)
    } catch (e) {
      setStatus(`Failed: ${e.message}`)
    }
  }

  // Live connect
  liveBtn.addEventListener('click', async () => {
    if (liveMode) {
      await window.api.f1.liveDisconnect()
      liveMode = false
      liveBtn.textContent = 'Connect Live'
      setStatus('No session loaded')
      setLoaded(false)
      if (activeItem) { activeItem.classList.remove('active'); activeItem = null }
      return
    }
    setStatus('Connecting to live feed…')
    try {
      const res = await window.api.f1.liveConnect()
      if (!res.ok) throw new Error(res.error)
      ltLoaded = true
      liveMode = true
      liveBtn.textContent = 'Disconnect Live'
      setStatus('Live', true)
      vcamTlLabel.textContent = 'Live'
      setLoaded(true)
    } catch (e) {
      setStatus(`Live failed: ${e.message}`)
    }
  })

  // Unload
  unloadBtn.addEventListener('click', async () => {
    await window.api.f1.unload()
    liveMode = false
    liveBtn.textContent = 'Connect Live'
    setStatus('No session loaded')
    setLoaded(false)
    if (activeItem) { activeItem.classList.remove('active'); activeItem = null }
    resetInfo()
  })

  // Play / pause
  playBtn.addEventListener('click', async () => {
    if (isPlaying) { await window.api.f1.pause(); setPlayBtn(false) }
    else           { await window.api.f1.play(1);  setPlayBtn(true) }
  })

  function setPlayBtn(playing) {
    isPlaying = playing
    playBtn.innerHTML = playing ? vcamIconPause : vcamIconPlay
    vcamTlPlayBtn.innerHTML = playing ? vcamIconPause : vcamIconPlay
  }

  // Seek
  seekEl.addEventListener('mousedown', () => isSeeking = true)
  seekEl.addEventListener('mouseup', async () => {
    isSeeking = false
    await window.api.f1.seek(Number(seekEl.value))
  })

  // Subscribe to state pushes from main
  window.api.f1.subscribe()

  let ltLoaded = false

  function catchUpLoadedState() {
    if (ltLoaded) return
    ltLoaded = true
    window.api.f1.status().then(s => {
      if (!s.loaded) return
      liveMode = s.live
      liveBtn.textContent = s.live ? 'Disconnect Live' : 'Connect Live'
      const label = s.live ? 'Live' : (s.path?.split('/').filter(Boolean).pop() ?? 'Session')
      setStatus(label, s.live)
      duration = s.duration
      seekEl.max = s.duration
      durationLabel.textContent = fmtMs(s.duration)
      setLoaded(true)
      if (!s.live) {
        const year = s.path?.match(/^(\d{4})\//)?.[1]
        if (year && !activeItem) {
          yearSelect.value = year
          loadSessionList(year, s.path)
        }
      }
    })
  }

  window.api.f1.onSnapshot(({ state, clock }) => {
    catchUpLoadedState()
    updateClock(clock)
    updateState(state)
    appendEvent('snapshot', { topics: Object.keys(state).length + ' topics' })
  })

  window.api.f1.onState(({ state, clock }) => {
    catchUpLoadedState()
    updateClock(clock)
    updateState(state)
    appendEvent('state', state)
  })

  let _lastClockPaused = null
  window.api.f1.onClock((clock) => {
    updateClock(clock)
    if (clock.paused !== _lastClockPaused) {
      _lastClockPaused = clock.paused
      appendEvent('clock', { paused: clock.paused, offset: clock.offset })
    }
  })

  window.api.f1.onPosition((data) => {
    appendEvent('position', data)
  })

  window.api.f1.onCarData((data) => {
    appendEvent('cardata', data)
  })

  window.api.f1.onReset(() => {
    ltLoaded = false
    resetInfo()
    setStatus('No session loaded')
    setLoaded(false)
  })

  window.api.f1.onLiveDisconnected(() => {
    ltLoaded = false
    liveMode = false
    liveBtn.textContent = 'Connect Live'
    setStatus('Live feed disconnected')
    setLoaded(false)
  })

  // Auto-connect/reconnect progress — stay in live mode, just show status
  window.api.f1.onLiveStatus((s) => {
    if (!s) return
    if (s.state === 'connected') {
      if (liveMode) setStatus('Live', true)
    } else if (s.state === 'reconnecting') {
      setStatus(s.attempt ? `Reconnecting… (attempt ${s.attempt})` : 'Reconnecting…')
    } else if (s.state === 'connecting') {
      setStatus(s.attempt ? `Connecting… (attempt ${s.attempt})` : 'Connecting to live feed…')
    }
  })

  function updateClock(clock) {
    if (!clock) return
    setPlayBtn(!clock.paused)
    if (!isSeeking && !liveMode) {
      seekEl.value = clock.offset
      offsetLabel.textContent = fmtMs(clock.offset)
    }
    if (clock.duration) {
      duration = clock.duration
      seekEl.max = clock.duration
      durationLabel.textContent = fmtMs(clock.duration)
    }
    if (!liveMode) vcamUpdateClock(clock)
  }

  function updateState(state) {
    if (!state) return

    // Session info
    const si = state.SessionInfo
    if (si) {
      valSession.textContent = si.Name ?? '—'
      valTrack.textContent   = si.Meeting?.Circuit?.ShortName ?? si.Meeting?.Location ?? '—'
      const meeting = si.Meeting?.Name ?? ''
      const session = si.Name ?? ''
      vcamSessionLabel = [meeting, session].filter(Boolean).join(' · ')
      vcamTlLabel.textContent = vcamSessionLabel
    }

    // Session status
    valStatus.textContent = state.SessionStatus?.Status ?? '—'

    // Track status (SC, VSC, etc)
    // Track status (SC, VSC, etc)
    const ts = state.TrackStatus
    if (ts) {
      const messages = { '1':'Clear','2':'Yellow','4':'Safety Car','5':'Red Flag','6':'VSC','7':'VSC Ending' }
      valSC.textContent = messages[ts.Status] ?? ts.Status ?? '—'
      valSC.style.color = ts.Status === '4' || ts.Status === '6' ? '#ff9800'
                        : ts.Status === '5' ? '#e10600'
                        : ts.Status === '1' ? '#4caf50' : '#f0f0f0'
    }

    // Lap count
    const lc = state.LapCount
    if (lc) valLap.textContent = lc.CurrentLap != null ? `${lc.CurrentLap} / ${lc.TotalLaps}` : '—'

    // Weather
    const w = state.WeatherData
    if (w) valWeather.textContent = `${w.AirTemp ?? '?'}°C · ${w.TrackTemp ?? '?'}°C track`

    // Driver list
    updateDrivers(state)

    // Feed raw tabs (vars declared below but only called async, so fine)
    currentState = state
    if (activeView === 'state') rawStateEl.textContent = JSON.stringify(state, null, 2)
  }

  function updateDrivers(state) {
    const timing = state.TimingData?.Lines
    const drivers = state.DriverList
    if (!timing || !drivers) return

    currentDrivers = drivers
    const rows = Object.entries(timing)
      .map(([num, t]) => ({ num, t, d: drivers[num] }))
      .filter(x => x.d)
      .sort((a, b) => (parseInt(a.t.Position) || 99) - (parseInt(b.t.Position) || 99))

    driversEl.innerHTML = ''
    for (const { num, t, d } of rows) {
      const row = document.createElement('div')
      row.className = 'lt-driver-row'
      const teamColor = getTeamColor(num, d.TeamColour)
      row.style.borderLeft = `3px solid #${teamColor}`
      row.innerHTML = `
        <span class="lt-driver-pos">${t.Position ?? '—'}</span>
        <span class="lt-driver-num" style="color:#${teamColor}">${num}</span>
        <span class="lt-driver-name">${d.LastName ?? d.FullName ?? '—'}</span>
        <span class="lt-driver-gap">${t.GapToLeader || t.IntervalToPositionAhead?.Value || ''}</span>
        <span class="lt-driver-last">${t.LastLapTime?.Value || '—'}</span>
        <span class="lt-driver-best">${t.BestLapTime?.Value || '—'}</span>
      `
      driversEl.appendChild(row)
    }
  }

  function resetInfo() {
    valSession.textContent = '—'; valStatus.textContent = '—'
    valTrack.textContent   = '—'; valWeather.textContent = '—'
    valLap.textContent     = '—'; valSC.textContent = '—'
    driversEl.innerHTML    = ''
    seekEl.value = 0; offsetLabel.textContent = '0:00:00'; durationLabel.textContent = '0:00:00'
    setPlayBtn(false)
  }

  // ── Raw data tabs ──────────────────────────────────────────────────────────
  const ltTabs      = document.querySelectorAll('.lt-tab')
  const ltViews     = document.querySelectorAll('.lt-view')
  const rawStateEl  = document.getElementById('lt-raw-state')
  const eventsLogEl = document.getElementById('lt-events-log')
  const rawFileEl   = document.getElementById('lt-raw-file')
  const ltFileInfo  = document.getElementById('lt-file-info')
  let activeView    = 'drivers'
  let eventsPaused  = false
  let currentState  = null

  // ── Driver Mapping ────────────────────────────────────────────────────────
  const mappingGridEl    = document.getElementById('lt-mapping-grid')
  const mappingStatusEl  = document.getElementById('lt-mapping-status')
  const mappingSaveBtn   = document.getElementById('lt-mapping-save')
  const mappingResetBtn  = document.getElementById('lt-mapping-reset')
  let driverMapping = {}
  let currentDrivers = {}

  const TEAM_COLORS = {
    'Red Bull Racing': 'FF0000', 'Williams': '0142FE', 'Cadillac': '15151F',
    'Audi': '6D0507', 'Alpine': 'E32785', 'Aston Martin': '229971',
    'Ferrari': 'DC0000', 'Haas F1 Team': 'F8F4F1', 'Kick Sauber': '52E252',
    'McLaren': 'FD8000', 'Mercedes': '00F5D3', 'Racing Bulls': '4862E4', 'RB': '4862E4'
  }

  function getTeamColor(driverNum, apiTeamColor) {
    if (apiTeamColor) return apiTeamColor
    const teamName = driverMapping[driverNum]
    return teamName ? (TEAM_COLORS[teamName] || '555') : '555'
  }

  async function loadDriverMapping() {
    driverMapping = await window.api.driverMapping.load()
  }

  function renderDriverMapping() {
    if (!currentDrivers || Object.keys(currentDrivers).length === 0) {
      mappingGridEl.innerHTML = '<div class="lt-mapping-empty">No drivers in current session</div>'
      return
    }

    const teamNames = [
      'Red Bull Racing', 'Williams', 'Cadillac', 'Audi', 'Alpine', 'Aston Martin',
      'Ferrari', 'Haas F1 Team', 'Kick Sauber', 'McLaren', 'Mercedes', 'Racing Bulls', 'RB'
    ]

    mappingGridEl.innerHTML = ''
    Object.entries(currentDrivers)
      .filter(([num, driver]) => /^\d+$/.test(num) && (driver.LastName || driver.FullName))
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .forEach(([num, driver]) => {
        const row = document.createElement('div')
        row.className = 'lt-mapping-row'
        const currentTeam = driverMapping[num] || ''
        if (currentTeam) row.classList.add('has-mapping')

        const options = ['<option value="">— Select team —</option>']
        teamNames.forEach(team => {
          options.push(`<option value="${team}" ${currentTeam === team ? 'selected' : ''}>${team}</option>`)
        })

        row.innerHTML = `
          <span class="lt-mapping-num">${num}</span>
          <span class="lt-mapping-name">${driver.LastName || driver.FullName || '?'}</span>
          <div class="lt-mapping-team">
            <select data-driver-num="${num}">
              ${options.join('')}
            </select>
          </div>
        `
        mappingGridEl.appendChild(row)

        const select = row.querySelector('select')
        select.addEventListener('change', (e) => {
          driverMapping[num] = e.target.value || null
          if (!driverMapping[num]) delete driverMapping[num]
          row.classList.toggle('has-mapping', !!driverMapping[num])
          mappingStatusEl.textContent = 'Unsaved changes'
          mappingStatusEl.style.color = '#ff9800'
        })
      })
  }

  mappingSaveBtn.addEventListener('click', async () => {
    const success = await window.api.driverMapping.save(driverMapping)
    if (success) {
      mappingStatusEl.textContent = 'Saved!'
      mappingStatusEl.style.color = '#4caf50'
      setTimeout(() => { mappingStatusEl.textContent = ''; mappingStatusEl.style.color = '' }, 2000)
    }
  })

  mappingResetBtn.addEventListener('click', () => {
    if (confirm('Reset all driver mappings?')) {
      driverMapping = {}
      renderDriverMapping()
      mappingStatusEl.textContent = 'Reset (unsaved)'
      mappingStatusEl.style.color = '#ff9800'
    }
  })

  ltTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeView = tab.dataset.ltview
      ltTabs.forEach(t => t.classList.toggle('active', t === tab))
      ltViews.forEach(v => v.classList.toggle('active', v.id === `lt-view-${activeView}`))
      if (activeView === 'state' && currentState) rawStateEl.textContent = JSON.stringify(currentState, null, 2)
      if (activeView === 'file') loadRawFile()
      if (activeView === 'mapping') renderDriverMapping()
    })
  })

  document.getElementById('lt-events-clear').addEventListener('click', () => { eventsLogEl.innerHTML = '' })
  document.getElementById('lt-events-pause').addEventListener('change', e => { eventsPaused = e.target.checked })
  document.getElementById('lt-file-open-folder').addEventListener('click', () => window.api.f1.openCacheFolder())

  function appendEvent(topic, data) {
    if (eventsPaused || activeView !== 'events') return
    const row = document.createElement('div')
    row.className = 'lt-event-row'
    const preview = typeof data === 'object' ? JSON.stringify(data).slice(0, 120) : String(data)
    row.innerHTML = `<span class="lt-event-time">${new Date().toLocaleTimeString()}</span><span class="lt-event-topic">${topic}</span><span class="lt-event-data">${preview}</span>`
    eventsLogEl.appendChild(row)
    // Keep max 500 rows
    if (eventsLogEl.children.length > 500) eventsLogEl.removeChild(eventsLogEl.firstChild)
    eventsLogEl.scrollTop = eventsLogEl.scrollHeight
  }

  async function loadRawFile() {
    rawFileEl.textContent = 'Loading…'
    ltFileInfo.textContent = ''
    const result = await window.api.f1.rawFile()
    if (!result) { rawFileEl.textContent = '(no file — live session or nothing loaded)'; return }
    const kb = (result.size / 1024).toFixed(1)
    ltFileInfo.textContent = `${result.path.split(/[\\/]/).pop()}  •  ${kb} KB`
    rawFileEl.textContent = result.content
  }

  // ── Circuit image manager ──────────────────────────────────────────────────

  const ciYearSelect = document.getElementById('ci-year-select')
  const ciYearLoad   = document.getElementById('ci-year-load')
  const ciStatus     = document.getElementById('ci-status')
  const ciGrid       = document.getElementById('ci-grid')

  // Populate year dropdown
  for (let y = new Date().getFullYear(); y >= 2018; y--) {
    const opt = document.createElement('option')
    opt.value = y; opt.textContent = y
    ciYearSelect.appendChild(opt)
  }

  let customKeys = new Set()

  async function refreshCustomKeys() {
    const keys = await window.api.circuit.list()
    customKeys = new Set(keys)
  }

  async function loadCircuitGrid(year) {
    ciStatus.textContent = 'Loading…'
    ciGrid.innerHTML = ''
    await refreshCustomKeys()
    const res = await window.api.f1.yearMeetings(year)
    if (!res.ok) { ciStatus.textContent = `Error: ${res.error}`; return }
    if (!res.meetings.length) { ciStatus.textContent = 'No circuits found for this year.'; return }
    ciStatus.textContent = `${res.meetings.length} circuits`
    for (const m of res.meetings) renderCircuitCard(m)
  }

  function renderCircuitCard(m) {
    const isCustom = customKeys.has(m.circuitKey)

    const card = document.createElement('div')
    card.className = 'ci-card'
    card.dataset.circuitKey = m.circuitKey

    const thumbWrap = document.createElement('div')
    if (isCustom) {
      const img = document.createElement('img')
      img.className = 'ci-thumb'
      img.alt = m.circuitName
      window.api.circuit.getDataUrl(m.circuitKey).then(url => {
        if (url) img.src = url
      })
      thumbWrap.appendChild(img)
    } else {
      const ph = document.createElement('div')
      ph.className = 'ci-thumb-placeholder'
      ph.textContent = 'No image'
      thumbWrap.appendChild(ph)
    }

    const info = document.createElement('div')
    info.className = 'ci-info'
    info.innerHTML = `
      <div class="ci-name">${m.circuitName}</div>
      <div class="ci-key">key ${m.circuitKey}</div>
      ${isCustom ? '<div class="ci-custom-badge">custom</div>' : ''}
      ${m.upcoming ? '<div class="ci-upcoming-badge">upcoming</div>' : ''}
    `

    const actions = document.createElement('div')
    actions.className = 'ci-actions'

    const uploadBtn = document.createElement('button')
    uploadBtn.className = 'btn-ghost'
    uploadBtn.textContent = isCustom ? 'Replace' : 'Upload'
    uploadBtn.addEventListener('click', async () => {
      const paths = await window.api.dialog.openImage()
      if (!paths?.length) return
      await window.api.circuit.import(m.circuitKey, paths[0])
      loadCircuitGrid(ciYearSelect.value)
    })

    actions.appendChild(uploadBtn)

    if (isCustom) {
      const delBtn = document.createElement('button')
      delBtn.className = 'btn-ghost'
      delBtn.textContent = 'Remove'
      delBtn.style.color = '#e10600'
      delBtn.addEventListener('click', async () => {
        await window.api.circuit.delete(m.circuitKey)
        customKeys.delete(m.circuitKey)
        loadCircuitGrid(ciYearSelect.value)
      })
      actions.appendChild(delBtn)
    }

    card.appendChild(thumbWrap)
    card.appendChild(info)
    card.appendChild(actions)
    ciGrid.appendChild(card)
  }

  ciYearLoad.addEventListener('click', () => loadCircuitGrid(ciYearSelect.value))

  // Load driver mapping on init
  loadDriverMapping()

}

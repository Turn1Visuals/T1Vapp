import { state, saveConfig } from '../state.js'

// ── OBS ───────────────────────────────────────────────────────────────────────
export function initObs() {
  const goLiveBtn   = document.getElementById('btn-go-live')

  const streamDetailsBackdrop = document.getElementById('stream-details-backdrop')
  document.getElementById('btn-stream-details').addEventListener('click', () => {
    streamDetailsBackdrop.style.display = 'flex'
  })
  document.getElementById('btn-stream-details-close').addEventListener('click', () => {
    streamDetailsBackdrop.style.display = 'none'
  })
  streamDetailsBackdrop.addEventListener('click', e => {
    if (e.target === streamDetailsBackdrop) streamDetailsBackdrop.style.display = 'none'
  })

  const titleInput    = document.getElementById('stream-title-input')
  const descInput     = document.getElementById('stream-desc-input')
  const categoryInput = document.getElementById('twitch-category-input')
  const tagsInput     = document.getElementById('twitch-tags-input')
  const kickTagsInput = document.getElementById('kick-tags-input')
  const statusEl    = document.getElementById('golive-status')

  // Persist fields in localStorage
  const LS_KEYS = { title: 'stream-title', desc: 'stream-desc', category: 'twitch-category', tags: 'twitch-tags', kickTags: 'kick-tags' }
  titleInput.value    = localStorage.getItem(LS_KEYS.title)    || ''
  descInput.value     = localStorage.getItem(LS_KEYS.desc)     || ''
  categoryInput.value = localStorage.getItem(LS_KEYS.category) || ''
  tagsInput.value     = localStorage.getItem(LS_KEYS.tags)     || ''
  kickTagsInput.value = localStorage.getItem(LS_KEYS.kickTags) || ''
  titleInput.addEventListener('input',    () => localStorage.setItem(LS_KEYS.title,    titleInput.value))
  descInput.addEventListener('input',     () => localStorage.setItem(LS_KEYS.desc,     descInput.value))
  categoryInput.addEventListener('input', () => localStorage.setItem(LS_KEYS.category, categoryInput.value))
  tagsInput.addEventListener('input',     () => localStorage.setItem(LS_KEYS.tags,     tagsInput.value))
  kickTagsInput.addEventListener('input', () => localStorage.setItem(LS_KEYS.kickTags, kickTagsInput.value))

  function setStatus(text, color) {
    statusEl.textContent = text
    statusEl.style.color = color || ''
    if (text) console.log('[status]', text)
  }

  let isLive = false
  function setLiveState(live) {
    isLive = live
    goLiveBtn.textContent = live ? 'End Stream' : 'Go Live'
    goLiveBtn.className   = live ? 'btn-obs btn-start' : 'btn-obs btn-stop'
    goLiveBtn.disabled    = false
    if (live) setStatus('Live', '#e10600')
    else setStatus('')
  }


  // ── Stats ──
  const streamStatsEl = document.getElementById('obs-stream-stats')
  const sysStatsEl    = document.getElementById('obs-sys-stats')
  let statsTimer = null

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
  }

  function updateStats(res) {
    streamStatsEl.innerHTML = ''
    const streamItems = [
      ['Status', res.streaming ? 'Live' : 'Offline'],
      ['Duration', res.streaming ? formatDuration(res.duration) : '—'],
      ['Dropped', res.droppedFrames + ' frames']
    ]
    streamItems.forEach(([label, val]) => {
      const span = document.createElement('span')
      span.className = 'obs-stat'
      span.innerHTML = '<span class="obs-stat-label">' + label + '</span> ' + val
      streamStatsEl.appendChild(span)
    })
    sysStatsEl.innerHTML = ''
    const sysItems = [
      ['CPU', res.cpu + '%'],
      ['Memory', res.memory + ' GB'],
      ['FPS', res.fps]
    ]
    sysItems.forEach(([label, val]) => {
      const span = document.createElement('span')
      span.className = 'obs-stat'
      span.innerHTML = '<span class="obs-stat-label">' + label + '</span> ' + val
      sysStatsEl.appendChild(span)
    })
  }

  function startStats() {
    if (statsTimer) return
    statsTimer = setInterval(async () => {
      const res = await window.api.obs.getStats()
      if (res.ok) updateStats(res)
    }, 2000)
  }

  function stopStats() { clearInterval(statsTimer); statsTimer = null }

  let reconnectTimer = null

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setInterval(async () => {
      const res = await window.api.obs.connect()
      if (res.ok) {
        clearInterval(reconnectTimer)
        reconnectTimer = null
        const status = await window.api.obs.getStatus()
        setLiveState(status.streaming)
        if (!status.streaming) setStatus('Connected', '#4caf50')
        startStats()
        const [scenesRes, currentRes] = await Promise.all([
          window.api.obs.getScenes(),
          window.api.obs.getCurrentScene()
        ])
        if (scenesRes.ok) {
          const current = currentRes.ok ? currentRes.name : scenesRes.current
          renderScenes(scenesRes.scenes, current)
        }
        state.onObsConnected()
      }
    }, 5000)
  }

  async function connect() {
    setStatus('Connecting…')
    setLiveState(false)
    const res = await window.api.obs.connect()
    if (res.ok) {
      const status = await window.api.obs.getStatus()
      setLiveState(status.streaming)
      if (!status.streaming) setStatus('Connected', '#4caf50')
    } else {
      setStatus('OBS not connected', '#e10600')
      goLiveBtn.disabled = true
      scheduleReconnect()
    }
  }

  let pendingTwitchMeta = null
  let pendingKickTitle  = null

  goLiveBtn.addEventListener('click', async () => {
    if (isLive) {
      goLiveBtn.disabled = true
      const res = await window.api.obs.stopStream()
      if (!res.ok) { setStatus('OBS: ' + res.error, '#e10600'); goLiveBtn.disabled = false }
      return
    }

    const title    = titleInput.value.trim()
    const desc     = descInput.value.trim()
    const category = categoryInput.value.trim()
    const tags     = tagsInput.value.trim()
    if (!title) { setStatus('Enter a stream title', '#e10600'); return }
    goLiveBtn.disabled = true

    // Preflight: verify YouTube token is valid before starting OBS
    if (state.config.youtube?.refreshToken) {
      setStatus('Checking YouTube…', '')
      const ytCheck = await window.api.youtube.getLiveBroadcast()
      if (!ytCheck.ok && ytCheck.error !== 'No active broadcast') {
        setStatus(`YouTube: ${ytCheck.error} — reconnect in Settings`, '#e10600')
        goLiveBtn.disabled = false
        return
      }
    }

    setStatus('Setting up…', '')

    if (state.config.twitch?.refreshToken) {
      pendingTwitchMeta = { title, category, tags }
    }
    if (state.config.kick?.refreshToken) {
      const kickTags = kickTagsInput.value.trim()
        ? kickTagsInput.value.split(',').map(t => t.trim()).filter(Boolean)
        : []
      pendingKickTitle = { title, tags: kickTags }
    }

    const [obsRes, ytRes] = await Promise.all([
      window.api.obs.startStream(),
      window.api.youtube.goLive({ title, description: desc })
    ])

    if (!obsRes.ok) {
      setStatus('OBS: ' + obsRes.error, '#e10600')
      goLiveBtn.disabled = false
      pendingTwitchMeta = null
      pendingKickTitle  = null
      return
    }

    if (ytRes.ok && ytRes.broadcastId) {
      state.currentBroadcastId = ytRes.broadcastId
      state.ytStreamLoaded = false
      state.loadYtStream(ytRes.broadcastId)
    }

    if (!ytRes.ok) setStatus('YT: ' + ytRes.error, '#e55')
  })

  window.api.obs.onStreamState(active => {
    setLiveState(active)
    if (active && pendingTwitchMeta) {
      const meta = pendingTwitchMeta
      pendingTwitchMeta = null
      window.api.twitch.setTitle(meta).then(res => {
        if (!res.ok) setStatus('TW: ' + res.error, '#e55')
      })
    }
    if (active && pendingKickTitle) {
      const { title: kt, tags: kTags } = pendingKickTitle
      pendingKickTitle = null
      window.api.kick.setTitle({ title: kt, tags: kTags }).then(res => {
        if (!res.ok) setStatus('Kick: ' + res.error, '#e55')
      })
    }
  })
  // ── Scene switcher ──
  const scenesEl = document.getElementById('obs-scenes')
  let currentScene = null

let eyeSvg = '', eyeSlashSvg = '', volumeSvg = '', volumeMuteSvg = ''
  Promise.all([
    window.api.fa.get('solid', 'eye'),
    window.api.fa.get('solid', 'eye-slash'),
    window.api.fa.get('solid', 'volume-high'),
    window.api.fa.get('solid', 'volume-xmark'),
  ]).then(([e, es, v, vm]) => {
    eyeSvg = e?.svg || '👁'
    eyeSlashSvg = es?.svg || '🚫'
    volumeSvg = v?.svg || '🔊'
    volumeMuteSvg = vm?.svg || '🔇'
  })

  function setSourceIcon(btn, visible) {
    const icon = btn.querySelector('.src-icon')
    if (icon) icon.innerHTML = visible ? eyeSvg : eyeSlashSvg
  }

  function showSourcesPopup(e, sceneName, sources) {
    // Remove any existing popover
    const existing = document.querySelector('.obs-sources-popover')
    if (existing) existing.remove()

    const popover = document.createElement('div')
    popover.className = 'obs-sources-popover'
    popover.style.position = 'fixed'
    popover.style.left = e.clientX + 'px'
    popover.style.top = e.clientY + 'px'
    popover.style.background = 'var(--surface)'
    popover.style.border = '1px solid var(--border)'
    popover.style.borderRadius = '4px'
    popover.style.padding = '8px'
    popover.style.zIndex = '9999'
    popover.style.minWidth = '200px'
    popover.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'

    sources.forEach(src => {
      const sourceBtn = document.createElement('button')
      sourceBtn.style.display = 'flex'
      sourceBtn.style.alignItems = 'center'
      sourceBtn.style.gap = '8px'
      sourceBtn.style.width = '100%'
      sourceBtn.style.padding = '8px'
      sourceBtn.style.border = 'none'
      sourceBtn.style.background = 'transparent'
      sourceBtn.style.color = 'var(--text)'
      sourceBtn.style.fontSize = '12px'
      sourceBtn.style.cursor = 'pointer'
      sourceBtn.style.marginBottom = '4px'

      const icon = document.createElement('span')
      icon.innerHTML = src.visible ? eyeSvg : eyeSlashSvg
      icon.style.width = '16px'
      icon.style.cursor = 'pointer'

      const label = document.createElement('span')
      label.textContent = src.name
      label.style.flex = '1'
      label.style.textAlign = 'left'

      icon.addEventListener('click', async (e) => {
        e.stopPropagation()
        const newVisible = !src.visible
        await window.api.obs.setSourceVisible({ sceneName, sceneItemId: src.id, visible: newVisible })
        src.visible = newVisible
        icon.innerHTML = newVisible ? eyeSvg : eyeSlashSvg
      })

      sourceBtn.appendChild(icon)
      sourceBtn.appendChild(label)

      // Add mute button if applicable
      window.api.obs.getInputMuted(src.name).then(muteRes => {
        if (muteRes.ok) {
          const muteIcon = document.createElement('span')
          muteIcon.innerHTML = muteRes.muted ? volumeMuteSvg : volumeSvg
          muteIcon.style.width = '16px'
          muteIcon.style.cursor = 'pointer'
          muteIcon.addEventListener('click', async (e) => {
            e.stopPropagation()
            const newMuted = !muteRes.muted
            await window.api.obs.setInputMute(src.name, newMuted)
            muteRes.muted = newMuted
            muteIcon.innerHTML = newMuted ? volumeMuteSvg : volumeSvg
          })
          sourceBtn.appendChild(muteIcon)
        }
      })

      popover.appendChild(sourceBtn)
    })

    document.body.appendChild(popover)

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', function closePopover() {
        if (popover.parentNode) popover.remove()
        document.removeEventListener('click', closePopover)
      })
    }, 0)
  }

  async function renderScenes(scenes, current) {
    currentScene = current
    scenesEl.innerHTML = ''
    for (const name of scenes) {
      const block = document.createElement('div')
      block.className = 'obs-scene-block' + (name === current ? ' active' : '')
      block.dataset.scene = name

      const header = document.createElement('div')
      header.className = 'obs-scene-block-name'
      const headerLabel = document.createElement('span')
      headerLabel.textContent = name
      const refreshBtn = document.createElement('button')
      refreshBtn.className = 'obs-scene-refresh-btn'
      refreshBtn.textContent = '↻'
      refreshBtn.title = 'Refresh sources'
      refreshBtn.addEventListener('click', async e => {
        e.stopPropagation()
        await window.api.obs.refreshSceneSources(name)
        const res = await window.api.obs.getSceneScreenshot(name)
        if (res.ok) img.src = res.imageData
      })
      header.appendChild(headerLabel)
      header.appendChild(refreshBtn)
      block.appendChild(header)

      const preview = document.createElement('div')
      preview.className = 'obs-scene-preview'
      const img = document.createElement('img')
      img.className = 'obs-scene-preview-img'
      preview.appendChild(img)
      preview.addEventListener('click', async () => {
        if (name === currentScene) return
        await window.api.obs.setScene(name)
      })
      block.appendChild(preview)
      window.api.obs.getSceneScreenshot(name).then(res => {
        if (res.ok) img.src = res.imageData
      })

      const sourcesDiv = document.createElement('div')
      sourcesDiv.className = 'obs-scene-block-sources'
      sourcesDiv.style.display = 'none'
      block.appendChild(sourcesDiv)
      scenesEl.appendChild(block)

      const res = await window.api.obs.getSources(name)
      if (!res.ok) continue

      // Right-click to show sources popup
      preview.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        showSourcesPopup(e, name, res.sources)
      })

      res.sources.forEach(async src => {
        const btn = document.createElement('button')
        btn.className = 'obs-scene-btn'
        btn.dataset.id = src.id
        btn.dataset.scene = name

        const icon = document.createElement('span')
        icon.className = 'src-icon'
        icon.innerHTML = src.visible ? eyeSvg : eyeSlashSvg

        const label = document.createElement('span')
        label.className = 'src-label'
        label.textContent = src.name

        btn.appendChild(icon)
        btn.appendChild(label)

        btn.addEventListener('click', async () => {
          const newVisible = btn.dataset.visible !== 'true'
          await window.api.obs.setSourceVisible({ sceneName: name, sceneItemId: src.id, visible: newVisible })
          btn.dataset.visible = newVisible
          setSourceIcon(btn, newVisible)
        })

        btn.dataset.visible = src.visible
        sourcesDiv.appendChild(btn)

        const muteRes = await window.api.obs.getInputMuted(src.name)
        if (muteRes.ok) {
          const muteBtn = document.createElement('button')
          muteBtn.className = 'src-mute-btn'
          muteBtn.dataset.muted = muteRes.muted
          muteBtn.innerHTML = muteRes.muted ? volumeMuteSvg : volumeSvg
          muteBtn.title = muteRes.muted ? 'Unmute' : 'Mute'
          muteBtn.addEventListener('click', async e => {
            e.stopPropagation()
            const newMuted = muteBtn.dataset.muted !== 'true'
            await window.api.obs.setInputMute(src.name, newMuted)
            muteBtn.dataset.muted = newMuted
            muteBtn.innerHTML = newMuted ? volumeMuteSvg : volumeSvg
            muteBtn.title = newMuted ? 'Unmute' : 'Mute'
          })
          btn.appendChild(muteBtn)
        }
      })
    }
  }


  window.api.obs.onSourceVisibilityChanged(({ sceneItemId, visible }) => {
    const btn = scenesEl.querySelector(`[data-id="${sceneItemId}"]`)
    if (!btn) return
    btn.dataset.visible = visible
    setSourceIcon(btn, visible)
  })

  window.api.obs.onSceneChanged(name => {
    currentScene = name
    scenesEl.querySelectorAll('.obs-scene-block').forEach(block => {
      block.classList.toggle('active', block.dataset.scene === name)
    })
  })

  // Load scenes after connect
  const _origConnect = connect
  async function connectWithScenes() {
    await _origConnect()
    startStats()
    const [scenesRes, currentRes] = await Promise.all([
      window.api.obs.getScenes(),
      window.api.obs.getCurrentScene()
    ])
    if (scenesRes.ok) {
      const current = currentRes.ok ? currentRes.name : scenesRes.current
      renderScenes(scenesRes.scenes, current)
    }
    state.onObsConnected()
  }

  window.api.obs.onDisconnected(() => {
    setStatus('OBS disconnected', '#e10600')
    goLiveBtn.disabled = true
    stopStats()
    state.onObsDisconnected()
    scheduleReconnect()
  })

  connectWithScenes()
}

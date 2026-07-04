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

  const titleInput         = document.getElementById('stream-title-input')
  const tagsInput          = document.getElementById('stream-tags-input')
  const tagsHint           = document.getElementById('stream-tags-hint')
  const descInput          = document.getElementById('stream-desc-input')
  const ytPrivacyInput     = document.getElementById('yt-privacy-input')
  const ytCategoryInput    = document.getElementById('yt-category-input')
  const twCategoryInput    = document.getElementById('twitch-category-input')
  const twCategoryStatus   = document.getElementById('twitch-category-status')
  const twLanguageInput    = document.getElementById('twitch-language-input')
  const kickCategoryInput  = document.getElementById('kick-category-input')
  const kickCategoryStatus = document.getElementById('kick-category-status')
  const statusEl    = document.getElementById('golive-status')

  // Persist fields in localStorage
  function persistField(el, key) {
    const saved = localStorage.getItem(key)
    if (saved !== null) el.value = saved
    el.addEventListener('input', () => localStorage.setItem(key, el.value))
  }
  persistField(titleInput,        'stream-title')
  persistField(tagsInput,         'stream-tags')
  persistField(descInput,         'stream-desc')
  persistField(ytPrivacyInput,    'yt-privacy')
  persistField(ytCategoryInput,   'yt-category')
  persistField(twCategoryInput,   'twitch-category')
  persistField(twLanguageInput,   'twitch-language')
  persistField(kickCategoryInput, 'kick-category')

  // ── Tags: one shared field, adapted to each platform's rules ──
  function parseTags(value) {
    return value.split(',').map(t => t.trim()).filter(Boolean)
  }
  // Twitch: max 10 tags, 25 chars each, letters/numbers only
  function toTwitchTags(list) {
    return list.map(t => t.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 25)).filter(Boolean).slice(0, 10)
  }
  function updateTagsHint() {
    const list = parseTags(tagsInput.value)
    if (!list.length) { tagsHint.textContent = ''; return }
    const tw = toTwitchTags(list)
    const parts = []
    if (tw.join(',') !== list.join(',')) parts.push('Twitch: ' + tw.join(', '))
    if (list.length > 10) parts.push('only first 10 used on Twitch/Kick')
    tagsHint.textContent = parts.join(' · ')
    tagsHint.className = 'field-hint'
  }
  tagsInput.addEventListener('input', updateTagsHint)
  updateTagsHint()

  // ── Category fields: resolve against the platform as you type ──
  function setupCategoryValidation(input, hintEl, storageKey, searchFn) {
    let resolved = null
    const savedId   = localStorage.getItem(storageKey + '-id')
    const savedName = localStorage.getItem(storageKey + '-name')
    if (savedId && savedName && savedName.toLowerCase() === input.value.trim().toLowerCase()) {
      resolved = { id: savedId, name: savedName }
      hintEl.textContent = '✓ ' + savedName
      hintEl.className = 'field-hint ok'
    }
    let debounceTimer = null
    async function validate() {
      const q = input.value.trim()
      resolved = null
      localStorage.removeItem(storageKey + '-id')
      localStorage.removeItem(storageKey + '-name')
      if (!q) { hintEl.textContent = ''; hintEl.className = 'field-hint'; return }
      hintEl.textContent = 'Checking…'
      hintEl.className = 'field-hint'
      const res = await searchFn({ query: q })
      if (input.value.trim() !== q) return
      if (!res.ok) {
        hintEl.textContent = '✗ ' + res.error
        hintEl.className = 'field-hint error'
        return
      }
      const exact = res.results.find(r => r.name.toLowerCase() === q.toLowerCase())
      const match = exact || res.results[0]
      if (!match) {
        hintEl.textContent = '✗ No match found'
        hintEl.className = 'field-hint error'
        return
      }
      resolved = match
      localStorage.setItem(storageKey + '-id', match.id)
      localStorage.setItem(storageKey + '-name', match.name)
      hintEl.textContent = '✓ ' + match.name
      hintEl.className = 'field-hint ok'
    }
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(validate, 600)
    })
    // Prefilled field whose saved resolution didn't match (fuzzy match,
    // or saved before validation existed) — resolve it now
    if (input.value.trim() && !resolved) validate()
    return () => resolved
  }

  const getTwCategory   = setupCategoryValidation(twCategoryInput, twCategoryStatus, 'twitch-category', window.api.twitch.searchCategory)
  const getKickCategory = setupCategoryValidation(kickCategoryInput, kickCategoryStatus, 'kick-category', window.api.kick.searchCategory)

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

  goLiveBtn.addEventListener('click', async () => {
    if (isLive) {
      goLiveBtn.disabled = true
      const res = await window.api.obs.stopStream()
      if (!res.ok) { setStatus('OBS: ' + res.error, '#e10600'); goLiveBtn.disabled = false }
      return
    }

    const title   = titleInput.value.trim()
    const desc    = descInput.value.trim()
    const allTags = parseTags(tagsInput.value)
    if (!title) { setStatus('Enter a stream title', '#e10600'); return }

    // A typed-but-unresolved category means the platform doesn't know it —
    // refuse instead of silently going live without one.
    if (state.config.twitch?.refreshToken && twCategoryInput.value.trim() && !getTwCategory()) {
      setStatus('Twitch category not resolved — check Stream Details', '#e10600')
      return
    }
    if (state.config.kick?.refreshToken && kickCategoryInput.value.trim() && !getKickCategory()) {
      setStatus('Kick category not resolved — check Stream Details', '#e10600')
      return
    }
    goLiveBtn.disabled = true

    let broadcastId = null
    async function abort(message) {
      if (broadcastId) await window.api.youtube.deleteBroadcast({ broadcastId })
      setStatus(message, '#e10600')
      goLiveBtn.disabled = false
    }

    // All platform setup happens before OBS starts — nothing goes live until
    // OBS pushes data, so any failure here aborts the whole go-live.
    if (state.config.youtube?.refreshToken) {
      setStatus('Setting up YouTube…', '')
      const ytRes = await window.api.youtube.goLive({
        title,
        description: desc,
        privacy:     ytPrivacyInput.value,
        categoryId:  ytCategoryInput.value || undefined,
        tags:        allTags
      })
      if (!ytRes.ok) return abort('YouTube: ' + ytRes.error)
      broadcastId = ytRes.broadcastId
    }

    if (state.config.twitch?.refreshToken) {
      setStatus('Setting up Twitch…', '')
      const twRes = await window.api.twitch.setTitle({
        title,
        categoryId: getTwCategory()?.id,
        tags:       toTwitchTags(allTags),
        language:   twLanguageInput.value
      })
      if (!twRes.ok) return abort('Twitch: ' + twRes.error)
    }

    if (state.config.kick?.refreshToken) {
      setStatus('Setting up Kick…', '')
      const kkRes = await window.api.kick.setTitle({
        title,
        categoryId: getKickCategory()?.id,
        tags:       allTags.slice(0, 10)
      })
      if (!kkRes.ok) return abort('Kick: ' + kkRes.error)
    }

    setStatus('Starting stream…', '')
    const obsRes = await window.api.obs.startStream()
    if (!obsRes.ok) return abort('OBS: ' + obsRes.error)

    if (broadcastId) {
      state.currentBroadcastId = broadcastId
      state.ytStreamLoaded = false
      state.loadYtStream(broadcastId)
      state.pollYtChat()
    }

    // Facebook's draft broadcast only appears once OBS data reaches the
    // persistent stream key, so it can't be part of the pre-OBS setup
    if (state.config.facebook?.pageToken) pollFacebookPublish(title, desc)
  })

  let fbPublishTimer = null
  function pollFacebookPublish(title, description) {
    if (fbPublishTimer) return
    let attempts = 0
    fbPublishTimer = setInterval(async () => {
      attempts++
      const res = await window.api.facebook.publishPending({ title, description })
      if (res.ok && res.published) {
        clearInterval(fbPublishTimer)
        fbPublishTimer = null
        state.currentFbLiveVideoId = res.liveVideoId
        state.loadFbStream()
        console.log('[FB] Live post published')
      } else if (!res.ok) {
        clearInterval(fbPublishTimer)
        fbPublishTimer = null
        setStatus('FB: ' + res.error, '#e55')
      } else if (attempts >= 24) {
        clearInterval(fbPublishTimer)
        fbPublishTimer = null
        setStatus('FB: no incoming stream found — check OBS Facebook output', '#e55')
      }
    }, 5000)
  }

  window.api.obs.onStreamState(active => {
    setLiveState(active)
    if (!active && fbPublishTimer) {
      clearInterval(fbPublishTimer)
      fbPublishTimer = null
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

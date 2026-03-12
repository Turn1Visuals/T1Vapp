// ── State ────────────────────────────────────────────────────────────────────
let config = { launchers: [], obs: { host: 'localhost', port: 4455, password: '' }, pinnedTabs: [], tempTabs: [] }

// ── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  config = await window.api.config.load()

  // Migrate old browserTabs → pinnedTabs
  if (config.browserTabs && !config.pinnedTabs) {
    config.pinnedTabs = config.browserTabs
    delete config.browserTabs
    window.api.config.save(config)
  }
  config.pinnedTabs = config.pinnedTabs || []
  config.tempTabs   = config.tempTabs   || []

  initTitlebar()
  initTabs()
  initLaunchers()
  initObs()
  try { initBrowser() } catch(e) { console.error('initBrowser failed', e) }
  initQuicklinks()
  initSettings()
  initHomeStreams()
  initMedia()
})

// ── Title bar ────────────────────────────────────────────────────────────────
function initTitlebar() {
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.window.minimize())
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.window.maximize())
  document.getElementById('btn-close').addEventListener('click', () => window.api.window.close())
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
    })
  })
}

// ── Launchers ─────────────────────────────────────────────────────────────────
function initLaunchers() {
  const grid   = document.getElementById('launcher-grid')
  const addBtn = document.getElementById('btn-add-launcher')

  let dragSrcIdx = null

  function renderLaunchers() {
    grid.querySelectorAll('.launcher-tile:not(.launcher-add-tile)').forEach(t => t.remove())

    config.launchers.forEach((launcher, i) => {
      const tile = document.createElement('div')
      tile.className = 'launcher-tile'
      tile.draggable = true
      tile.dataset.idx = i

      const iconEl = document.createElement('span')
      iconEl.className = 'tile-icon'
      iconEl.textContent = '📄'

      const nameEl = document.createElement('span')
      nameEl.className = 'tile-name'
      nameEl.textContent = launcher.name

      const removeBtn = document.createElement('button')
      removeBtn.className = 'tile-remove'
      removeBtn.title = 'Remove'
      removeBtn.textContent = '✕'

      tile.appendChild(iconEl)
      tile.appendChild(nameEl)
      tile.appendChild(removeBtn)

      window.api.launcher.getIcon(launcher.path).then(dataUrl => {
        if (dataUrl) {
          const img = document.createElement('img')
          img.src = dataUrl
          img.style.cssText = 'width:32px;height:32px;object-fit:contain'
          iconEl.textContent = ''
          iconEl.appendChild(img)
        }
      })

      // Reorder drag
      tile.addEventListener('dragstart', e => {
        dragSrcIdx = i
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(i))
        setTimeout(() => tile.style.opacity = '0.4', 0)
      })
      tile.addEventListener('dragend', () => { tile.style.opacity = '' })
      tile.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' })
      tile.addEventListener('drop', e => {
        e.preventDefault()
        e.stopPropagation()
        const dropIdx = parseInt(tile.dataset.idx)
        if (dragSrcIdx === null || dragSrcIdx === dropIdx) return
        const moved = config.launchers.splice(dragSrcIdx, 1)[0]
        config.launchers.splice(dropIdx, 0, moved)
        saveConfig()
        renderLaunchers()
      })

      tile.addEventListener('click', (e) => {
        if (e.target.classList.contains('tile-remove')) return
        window.api.launcher.run(launcher.path)
      })
      removeBtn.addEventListener('click', e => {
        e.stopPropagation()
        config.launchers.splice(i, 1)
        saveConfig()
        renderLaunchers()
      })
      grid.insertBefore(tile, addBtn)
    })
  }

  function addLauncherFromPath(filePath) {
    const name = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
    config.launchers.push({ name, path: filePath })
    saveConfig()
    renderLaunchers()
  }

  // Prevent Electron/Chromium from navigating to dropped files globally
  document.addEventListener('dragover', e => e.preventDefault())
  document.addEventListener('drop', e => e.preventDefault())

  addBtn.addEventListener('click', async () => {
    const paths = await window.api.dialog.openFile()
    paths.forEach(p => addLauncherFromPath(p))
  })

  renderLaunchers()
}

// ── Browser ───────────────────────────────────────────────────────────────────
function initBrowser() {
  const views        = document.getElementById('browser-views')
  const empty        = document.getElementById('browser-empty')
  const sidebarTabs  = document.getElementById('sidebar-tabs')
  const sidebarAdd   = document.getElementById('btn-sidebar-add')
  const backBtn      = document.getElementById('browser-back')
  const fwdBtn       = document.getElementById('browser-forward')
  const reloadBtn    = document.getElementById('browser-reload')
  const urlInput     = document.getElementById('browser-url-input')

  let activeTabId = null
  const webviewMap = new Map()  // tabId → <webview>
  const iconCache  = new Map()  // slug  → { svg, hex, title }

  function faviconUrl(url) {
    try {
      const hostname = new URL(url.startsWith('http') ? url : 'https://' + url).hostname
      return `https://icons.duckduckgo.com/ip3/${hostname}.ico`
    } catch { return null }
  }

  async function getIconData(slug) {
    if (iconCache.has(slug)) return iconCache.get(slug)
    const data = await window.api.icons.get(slug)
    if (data) iconCache.set(slug, data)
    return data
  }

  async function setIconContent(btn, tab) {
    btn.innerHTML = ''
    btn.title = tab.label
    if (tab.iconFa) {
      const data = await window.api.fa.get(tab.iconFa.style, tab.iconFa.name)
      if (data) {
        btn.innerHTML = data.svg
        const svg = btn.querySelector('svg')
        if (svg) svg.classList.add('si-icon')
        return
      }
    }
    if (tab.iconSlug) {
      const data = await getIconData(tab.iconSlug)
      if (data) {
        btn.innerHTML = data.svg
        const svg = btn.querySelector('svg')
        if (svg) svg.classList.add('si-icon')
        return
      }
    }
    const fav = faviconUrl(tab.url)
    if (fav) {
      const img = document.createElement('img')
      img.src = fav
      img.onerror = () => { img.remove(); btn.textContent = tab.label.charAt(0).toUpperCase() }
      btn.appendChild(img)
    } else {
      btn.textContent = tab.label.charAt(0).toUpperCase()
    }
  }

  function updateNavBar(wv) {
    if (!wv) { backBtn.disabled = true; fwdBtn.disabled = true; return }
    try {
      backBtn.disabled = !wv.canGoBack()
      fwdBtn.disabled  = !wv.canGoForward()
      const cur = wv.getURL()
      if (cur && cur !== 'about:blank') urlInput.value = cur
    } catch (_) {
      backBtn.disabled = true
      fwdBtn.disabled  = true
    }
  }

  function setActive(tabId) {
    activeTabId = tabId
    sidebarTabs.querySelectorAll('.sidebar-icon-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tabId === String(tabId))
    })
    webviewMap.forEach((wv, id) => wv.classList.toggle('active', id === tabId))
    empty.style.display = (config.pinnedTabs.length + config.tempTabs.length === 0) ? 'flex' : 'none'
    updateNavBar(webviewMap.get(tabId))
  }

  function createWebview(tab) {
    if (webviewMap.has(tab.id)) return webviewMap.get(tab.id)
    const wv = document.createElement('webview')
    wv.src = tab.url
    wv.partition = `persist:tab-${tab.id}`
    wv.useragent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    wv.setAttribute('allowpopups', '')
    views.appendChild(wv)
    webviewMap.set(tab.id, wv)
    const onNav = () => { if (tab.id === activeTabId) updateNavBar(wv) }
    wv.addEventListener('did-navigate', onNav)
    wv.addEventListener('did-navigate-in-page', onNav)
    wv.addEventListener('before-input-event', e => {
      const inp = e.input
      if (!inp || inp.type !== 'keyDown') return
      if (inp.control && inp.key.toLowerCase() === 'l') {
        e.preventDefault()
        switchToBrowserTab()
        urlInput.focus()
        urlInput.select()
      } else if (inp.control && inp.shift && inp.key.toLowerCase() === 'i') {
        e.preventDefault()
        wv.openDevTools()
      }
    })
    return wv
  }

  function createSidebarBtn(tab, removable) {
    const btn = document.createElement('button')
    btn.className = 'sidebar-icon-btn'
    btn.dataset.tabId = String(tab.id)
    setIconContent(btn, tab) // async, fills in when ready
    btn.addEventListener('click', () => {
      if (activeTabId === tab.id) {
        const wv = webviewMap.get(tab.id)
        if (wv) wv.reload()
      } else {
        openInBrowser(tab.url, tab.label)
      }
    })
    btn.addEventListener('contextmenu', e => showCtxMenu(e, tab, !removable))
    return btn
  }

  function renderSidebar() {
    sidebarTabs.innerHTML = ''
    config.pinnedTabs.forEach(tab => sidebarTabs.appendChild(createSidebarBtn(tab, false)))
    if (config.tempTabs.length > 0) {
      if (config.pinnedTabs.length > 0) {
        const sep = document.createElement('div')
        sep.className = 'sidebar-separator'
        sidebarTabs.appendChild(sep)
      }
      config.tempTabs.forEach(tab => sidebarTabs.appendChild(createSidebarBtn(tab, true)))
    }
  }

  function removeTempTab(tabId) {
    const idx = config.tempTabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    config.tempTabs.splice(idx, 1)
    saveConfig()
    const wv = webviewMap.get(tabId)
    if (wv) { wv.remove(); webviewMap.delete(tabId) }
    renderSidebar()
    if (activeTabId === tabId) {
      const all = [...config.pinnedTabs, ...config.tempTabs]
      if (all.length > 0) setActive(all[0].id)
      else { activeTabId = null; empty.style.display = 'flex' }
    }
  }

  // Backfill stable ids
  let dirty = false
  ;[...config.pinnedTabs, ...config.tempTabs].forEach(t => {
    if (!t.id) { t.id = Date.now() + Math.random(); dirty = true }
  })
  if (dirty) saveConfig()

  // Initialize webviews and sidebar
  config.pinnedTabs.forEach(tab => createWebview(tab))
  config.tempTabs.forEach(tab => createWebview(tab))
  renderSidebar()

  const allTabs = [...config.pinnedTabs, ...config.tempTabs]
  if (allTabs.length > 0) setActive(allTabs[0].id)
  else empty.style.display = 'flex'

  // Nav buttons
  backBtn.addEventListener('click', () => { const wv = webviewMap.get(activeTabId); if (wv) wv.goBack() })
  fwdBtn.addEventListener('click',  () => { const wv = webviewMap.get(activeTabId); if (wv) wv.goForward() })
  reloadBtn.addEventListener('click', () => { const wv = webviewMap.get(activeTabId); if (wv) wv.reload() })

  // + button: switch to Browser tab and focus the address bar
  sidebarAdd.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
    document.querySelector('.tab[data-tab="browser"]').classList.add('active')
    document.getElementById('tab-browser').classList.add('active')
    urlInput.focus()
    urlInput.select()
  })

  function commitBrowserAdd() {
    const raw = urlInput.value.trim()
    if (!raw) return
    // If it looks like a URL (has a dot or starts with http), navigate; otherwise treat as new tab
    const fullUrl = raw.startsWith('http') ? raw : 'https://' + raw
    const all = [...config.pinnedTabs, ...config.tempTabs]
    // If the active tab is already a temp tab and the user typed in the bar, navigate it
    const existing = all.find(t => t.url === fullUrl)
    if (existing) { setActive(existing.id); return }
    const label = urlToLabel(fullUrl)
    const tab = { id: Date.now(), label, url: fullUrl }
    config.tempTabs.push(tab)
    saveConfig()
    createWebview(tab)
    renderSidebar()
    setActive(tab.id)
  }

  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') commitBrowserAdd()
    if (e.key === 'Escape') { const wv = webviewMap.get(activeTabId); if (wv) urlInput.value = wv.getURL() }
  })
  document.getElementById('browser-url-go').addEventListener('click', commitBrowserAdd)

  // Exposed for quicklinks and openInBrowser
  window._browserActivate = (url, label) => {
    const all = [...config.pinnedTabs, ...config.tempTabs]
    const existing = all.find(t => t.url === url)
    if (existing) { setActive(existing.id); return }
    const tab = { id: Date.now(), label, url }
    config.tempTabs.push(tab)
    saveConfig()
    createWebview(tab)
    renderSidebar()
    setActive(tab.id)
  }

  // API for settings panel
  window._pinnedTabAPI = {
    add(tab) {
      config.pinnedTabs.push(tab)
      saveConfig()
      createWebview(tab)
      renderSidebar()
      if (activeTabId) setActive(activeTabId)
    },
    update(idx, changes) {
      const tab = config.pinnedTabs[idx]
      if (!tab) return
      const urlChanged = changes.url && changes.url !== tab.url
      Object.assign(tab, changes)
      saveConfig()
      if (urlChanged) {
        const wv = webviewMap.get(tab.id)
        if (wv) wv.src = tab.url
      }
      // Refresh the sidebar icon for this tab
      const btn = sidebarTabs.querySelector(`[data-tab-id="${tab.id}"]`)
      if (btn) setIconContent(btn, tab)
    },
    remove(idx) {
      const tab = config.pinnedTabs[idx]
      if (!tab) return
      config.pinnedTabs.splice(idx, 1)
      saveConfig()
      const wv = webviewMap.get(tab.id)
      if (wv) { wv.remove(); webviewMap.delete(tab.id) }
      renderSidebar()
      if (activeTabId === tab.id) {
        const all = [...config.pinnedTabs, ...config.tempTabs]
        if (all.length > 0) setActive(all[0].id)
        else { activeTabId = null; empty.style.display = 'flex' }
      }
    },
    reorder(orderedIds) {
      config.pinnedTabs = orderedIds.map(id => config.pinnedTabs.find(t => t.id === id)).filter(Boolean)
      saveConfig()
      renderSidebar()
      if (activeTabId) setActive(activeTabId)
    },
    async getIconData(slug) { return getIconData(slug) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function switchToBrowserTab() {
    document.querySelector('.tab[data-tab="browser"]').click()
  }

  function getActiveWv() { return webviewMap.get(activeTabId) }

  function setZoom(wv, factor) {
    const f = Math.min(Math.max(factor, 0.3), 3)
    try { wv.setZoomFactor(f) } catch(_) { return }
    const label = document.getElementById('browser-zoom-label')
    if (label) label.textContent = Math.round(f * 100) + '%'
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  const ctxMenu = document.getElementById('browser-ctx-menu')
  let ctxTarget = null

  function showCtxMenu(e, tab, isPinned) {
    e.preventDefault()
    ctxTarget = { tab, isPinned }
    ctxMenu.querySelector('[data-action="home"]').style.display = isPinned ? '' : 'none'
    ctxMenu.querySelector('.ctx-sep').style.display = isPinned ? 'none' : ''
    ctxMenu.querySelector('[data-action="close"]').style.display = isPinned ? 'none' : ''
    ctxMenu.classList.add('visible')
    const mw = 170, mh = 160
    const x = Math.min(e.clientX, window.innerWidth - mw - 8)
    const y = Math.min(e.clientY, window.innerHeight - mh - 8)
    ctxMenu.style.left = x + 'px'
    ctxMenu.style.top  = y + 'px'
  }

  document.addEventListener('click', () => ctxMenu.classList.remove('visible'))

  ctxMenu.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      if (!ctxTarget) return
      const { tab, isPinned } = ctxTarget
      const wv = webviewMap.get(tab.id)
      switch (btn.dataset.action) {
        case 'home':
          if (isPinned && wv) { wv.src = tab.url; setActive(tab.id) }
          break
        case 'reload':
          if (wv) { wv.reload(); setActive(tab.id) }
          break
        case 'copy-url':
          try { navigator.clipboard.writeText(wv ? wv.getURL() : tab.url) } catch(_) {}
          break
        case 'devtools':
          if (wv) { setActive(tab.id); wv.openDevTools() }
          break
        case 'close':
          if (!isPinned) removeTempTab(tab.id)
          break
      }
      ctxMenu.classList.remove('visible')
    })
  })

  // ── Zoom + DevTools buttons ───────────────────────────────────────────────
  document.getElementById('browser-zoom-out').addEventListener('click', () => {
    const wv = getActiveWv(); if (wv) setZoom(wv, wv.getZoomFactor() - 0.1)
  })
  document.getElementById('browser-zoom-in').addEventListener('click', () => {
    const wv = getActiveWv(); if (wv) setZoom(wv, wv.getZoomFactor() + 0.1)
  })
  document.getElementById('browser-open-edge').addEventListener('click', () => {
    const url = document.getElementById('browser-url-input').value.trim()
    if (url) window.api.app.openExternal(url)
  })
  document.getElementById('browser-devtools').addEventListener('click', () => {
    const wv = getActiveWv(); if (wv) wv.openDevTools()
  })

  // ── Keyboard shortcuts (when focus is outside webview) ────────────────────
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && e.key === 'r') {
      const wv = getActiveWv(); if (wv) { e.preventDefault(); wv.reload() }
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault(); switchToBrowserTab(); urlInput.focus(); urlInput.select()
    } else if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      const wv = getActiveWv(); if (wv) { e.preventDefault(); wv.openDevTools() }
    } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      const wv = getActiveWv(); if (wv) { e.preventDefault(); setZoom(wv, wv.getZoomFactor() + 0.1) }
    } else if (e.ctrlKey && e.key === '-') {
      const wv = getActiveWv(); if (wv) { e.preventDefault(); setZoom(wv, wv.getZoomFactor() - 0.1) }
    } else if (e.ctrlKey && e.key === '0') {
      const wv = getActiveWv(); if (wv) { e.preventDefault(); setZoom(wv, 1) }
    }
  })
}

// ── Browser helpers ───────────────────────────────────────────────────────────
function openInBrowser(url, label) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelector('.tab[data-tab="browser"]').classList.add('active')
  document.getElementById('tab-browser').classList.add('active')
  if (window._browserActivate) window._browserActivate(url, label)
}

function urlToLabel(url) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace('www.', '') }
  catch { return url }
}

// ── Quick links ───────────────────────────────────────────────────────────────
function initQuicklinks() {
  document.querySelectorAll('.btn-quicklink').forEach(btn => {
    btn.addEventListener('click', () => openInBrowser(btn.dataset.url, btn.dataset.label))
  })
}

// ── OBS ───────────────────────────────────────────────────────────────────────
function initObs() {
  const goLiveBtn   = document.getElementById('btn-go-live')
  const endBtn      = document.getElementById('btn-end-stream')
  const titleInput  = document.getElementById('stream-title-input')
  const descInput   = document.getElementById('stream-desc-input')
  const categoryInput = document.getElementById('twitch-category-input')
  const tagsInput   = document.getElementById('twitch-tags-input')
  const statusEl    = document.getElementById('golive-status')

  // Persist fields in localStorage
  const LS_KEYS = { title: 'stream-title', desc: 'stream-desc', category: 'twitch-category', tags: 'twitch-tags' }
  titleInput.value    = localStorage.getItem(LS_KEYS.title)    || ''
  descInput.value     = localStorage.getItem(LS_KEYS.desc)     || ''
  categoryInput.value = localStorage.getItem(LS_KEYS.category) || ''
  tagsInput.value     = localStorage.getItem(LS_KEYS.tags)     || ''
  titleInput.addEventListener('input',    () => localStorage.setItem(LS_KEYS.title,    titleInput.value))
  descInput.addEventListener('input',     () => localStorage.setItem(LS_KEYS.desc,     descInput.value))
  categoryInput.addEventListener('input', () => localStorage.setItem(LS_KEYS.category, categoryInput.value))
  tagsInput.addEventListener('input',     () => localStorage.setItem(LS_KEYS.tags,     tagsInput.value))

  function setStatus(text, color) {
    statusEl.textContent = text
    statusEl.style.color = color || ''
  }

  function setLiveState(live) {
    goLiveBtn.disabled = live
    endBtn.disabled    = !live
    goLiveBtn.style.opacity = live ? '0.4' : '1'
    endBtn.style.opacity    = live ? '1' : '0.4'
    if (live) setStatus('Live', '#e10600')
    else setStatus('')
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
      endBtn.disabled    = true
    }
  }

  let pendingTwitchMeta = null

  goLiveBtn.addEventListener('click', async () => {
    const title    = titleInput.value.trim()
    const desc     = descInput.value.trim()
    const category = categoryInput.value.trim()
    const tags     = tagsInput.value.trim()
    if (!title) { setStatus('Enter a stream title', '#e10600'); return }
    goLiveBtn.disabled = true
    setStatus('Setting up…', '')

    // Store Twitch meta to apply once OBS confirms stream is live
    if (config.twitch?.refreshToken) {
      pendingTwitchMeta = { title, category, tags }
    }

    const [obsRes, ytRes] = await Promise.all([
      window.api.obs.startStream(),
      window.api.youtube.goLive({ title, description: desc })
    ])

    if (!obsRes.ok) {
      setStatus('OBS: ' + obsRes.error, '#e10600')
      goLiveBtn.disabled = false
      pendingTwitchMeta = null
      return
    }

    if (ytRes.ok && ytRes.broadcastId) {
      currentBroadcastId = ytRes.broadcastId
      ytStreamLoaded = false
      loadYtStream(ytRes.broadcastId)
    }

    if (!ytRes.ok) setStatus('YT: ' + ytRes.error, '#e55')
    // OBS stream state event will call setLiveState(true) and apply Twitch meta
  })

  endBtn.addEventListener('click', async () => {
    endBtn.disabled = true
    const res = await window.api.obs.stopStream()
    if (!res.ok) { setStatus('OBS: ' + res.error, '#e10600'); endBtn.disabled = false }
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
  })
  window.api.obs.onDisconnected(() => { setStatus('OBS disconnected', '#e10600'); goLiveBtn.disabled = true; endBtn.disabled = true })

  connect()
}

// ── Home Streams ──────────────────────────────────────────────────────────────
function initHomeStreams() {
  // ── Stream tabs ──
  const tabs = document.querySelectorAll('.stream-tab')
  const views = {
    overlay: document.getElementById('stream-view-overlay'),
    youtube: document.getElementById('stream-view-youtube'),
    twitch:  document.getElementById('stream-view-twitch')
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const target = tab.dataset.view
      Object.entries(views).forEach(([k, v]) => v.classList.toggle('active', k === target))
      if (target === 'youtube') loadYtStream()
      if (target === 'twitch')  loadTwitchStream()
    })
  })

  // ── Overlay (stream source) ──
  const viewport  = document.getElementById('overlay-viewport')
  const overlayWv = document.getElementById('overlay-webview')
  const offlineEl = document.getElementById('overlay-offline')
  const overlayUrl = config.overlayUrl || 'http://localhost:5173/'
  let overlayShown = false

  function applyScale() {
    const scale = viewport.clientWidth / 1920
    overlayWv.style.transform = `scale(${scale})`
  }
  new ResizeObserver(applyScale).observe(viewport)

  async function checkOverlay() {
    const res = await window.api.app.checkUrl(overlayUrl)
    if (res.ok && !overlayShown) {
      overlayWv.src = overlayUrl
      offlineEl.style.display = 'none'
      overlayShown = true
      requestAnimationFrame(applyScale)
    } else if (!res.ok && overlayShown) {
      overlayWv.src = 'about:blank'
      offlineEl.style.display = ''
      overlayShown = false
    }
  }
  checkOverlay()
  setInterval(checkOverlay, 4000)

  // ── YouTube stream tab ──
  const ytStreamWv      = document.getElementById('yt-stream-wv')
  const ytStreamOffline = document.getElementById('yt-stream-offline')
  let ytStreamLoaded = false
  let currentBroadcastId = null

  // Pick up any already-running broadcast on app start
  let broadcastIdReady = Promise.resolve()
  if (config.youtube?.refreshToken) {
    broadcastIdReady = window.api.youtube.getLiveBroadcast().then(res => {
      if (res.ok && res.videoId) currentBroadcastId = res.videoId
    })
  }

  function loadYtStream(videoId) {
    broadcastIdReady.then(() => {
      const id = videoId || currentBroadcastId
      if (!id) { ytStreamOffline.style.display = ''; ytStreamWv.style.display = 'none'; return }
      ytStreamOffline.style.display = 'none'
      ytStreamWv.style.display = ''
      if (ytStreamLoaded && !videoId) return
      ytStreamWv.src = `https://studio.youtube.com/video/${id}/livestreaming`
      ytStreamLoaded = true
    })
  }

  // ── Twitch stream tab ──
  const twitchStreamWv      = document.getElementById('twitch-stream-wv')
  const twitchStreamOffline = document.getElementById('twitch-stream-offline')
  let twitchStreamLoaded = false

  function loadTwitchStream() {
    if (twitchStreamLoaded) return
    const channel = config.twitch?.channel
    if (!channel) { twitchStreamOffline.style.display = ''; return }
    twitchStreamWv.src = `https://dashboard.twitch.tv/u/${channel}/stream-manager`
    twitchStreamLoaded = true
  }

  // ── YouTube chat ──
  const ytChatWv    = document.getElementById('yt-chat-wv')
  const btnLoadChat = document.getElementById('btn-load-yt-chat')
  let currentLiveChatId = null

  async function loadYtChat() {
    btnLoadChat.textContent = '…'
    btnLoadChat.disabled = true
    const result = await window.api.youtube.getLiveBroadcast()
    if (result.ok) {
      currentLiveChatId = result.liveChatId
      ytChatWv.src = `https://studio.youtube.com/live_chat?is_popout=1&v=${result.videoId}`
    } else {
      currentLiveChatId = null
      ytChatWv.src = 'about:blank'
      console.warn('[YT chat]', result.error)
    }
    btnLoadChat.textContent = '↻'
    btnLoadChat.disabled = false
  }

  btnLoadChat.addEventListener('click', loadYtChat)
  if (config.youtube?.refreshToken) loadYtChat()

  // ── Twitch chat ──
  const twitchChatWv = document.getElementById('twitch-chat-wv')

  function loadTwitchChat() {
    const channel = config.twitch?.channel
    if (!channel) return
    twitchChatWv.src = `https://www.twitch.tv/embed/${channel}/chat?parent=localhost&darkpopout`
  }
  loadTwitchChat()

  // ── Shared send bar ──
  const chatInput      = document.getElementById('chat-msg-input')
  const btnSendYt      = document.getElementById('btn-send-yt')
  const btnSendTwitch  = document.getElementById('btn-send-twitch')
  const btnSendBoth    = document.getElementById('btn-send-both')
  const chatSendStatus = document.getElementById('chat-send-status')

  async function sendToYt(message) {
    if (!currentLiveChatId) return { ok: false, error: 'No active YT broadcast' }
    return window.api.youtube.sendChat({ message, liveChatId: currentLiveChatId })
  }

  async function sendToTwitch(message) {
    if (!config.twitch?.refreshToken) return { ok: false, error: 'Twitch not connected' }
    return window.api.twitch.sendChat({ message })
  }

  async function handleSend(targets) {
    const message = chatInput.value.trim()
    if (!message) return
    chatSendStatus.textContent = 'Sending…'
    chatSendStatus.style.color = ''

    const results = await Promise.all(targets.map(fn => fn(message)))
    const errors  = results.filter(r => !r.ok).map(r => r.error)

    if (errors.length) {
      chatSendStatus.textContent = errors.join(' | ')
      chatSendStatus.style.color = '#e10600'
    } else {
      chatSendStatus.textContent = '✓ Sent'
      chatSendStatus.style.color = '#4caf50'
      chatInput.value = ''
      setTimeout(() => { chatSendStatus.textContent = '' }, 2000)
    }
  }

  btnSendYt.addEventListener('click',     () => handleSend([sendToYt]))
  btnSendTwitch.addEventListener('click', () => handleSend([sendToTwitch]))
  btnSendBoth.addEventListener('click',   () => handleSend([sendToYt, sendToTwitch]))
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend([sendToYt, sendToTwitch]) })
}

// ── Settings ──────────────────────────────────────────────────────────────────
function initSettings() {
  // OBS
  const hostEl = document.getElementById('obs-host')
  const portEl = document.getElementById('obs-port')
  const passEl = document.getElementById('obs-password')

  hostEl.value = config.obs?.host || 'localhost'
  portEl.value = config.obs?.port || 4455
  passEl.value = config.obs?.password || ''

  // Start disabled
  hostEl.disabled = true
  portEl.disabled = true
  passEl.disabled = true

  const obsBtn = document.getElementById('btn-save-obs')
  obsBtn.textContent = 'Edit OBS Settings'
  obsBtn.className = 'btn-secondary'

  obsBtn.addEventListener('click', async () => {
    const editing = hostEl.disabled
    if (editing) {
      hostEl.disabled = false
      portEl.disabled = false
      passEl.disabled = false
      obsBtn.textContent = 'Save OBS Settings'
      obsBtn.className = 'btn-primary'
      hostEl.focus()
    } else {
      config.obs = {
        host:     hostEl.value.trim() || 'localhost',
        port:     parseInt(portEl.value) || 4455,
        password: passEl.value
      }
      saveConfig()
      hostEl.disabled = true
      portEl.disabled = true
      passEl.disabled = true
      obsBtn.textContent = 'Edit OBS Settings'
      obsBtn.className = 'btn-secondary'
      await window.api.obs.disconnect()
      const res = await window.api.obs.connect()
      const statusEl = document.getElementById('golive-status')
      statusEl.textContent = res.ok ? 'Connected' : 'Not connected'
      statusEl.style.color = res.ok ? '#4caf50' : '#e10600'
    }
  })

  // Overlay URL
  const overlayInput = document.getElementById('overlay-url-input')
  const overlayBtn   = document.getElementById('btn-save-overlay')

  overlayInput.value    = config.overlayUrl || 'http://localhost:5173/'
  overlayInput.disabled = true

  overlayBtn.addEventListener('click', () => {
    if (overlayInput.disabled) {
      overlayInput.disabled = false
      overlayBtn.textContent = 'Save Overlay URL'
      overlayBtn.className = 'btn-primary'
      overlayInput.focus()
    } else {
      config.overlayUrl = overlayInput.value.trim() || 'http://localhost:5173/'
      saveConfig()
      overlayInput.disabled = true
      overlayBtn.textContent = 'Edit Overlay URL'
      overlayBtn.className = 'btn-secondary'
    }
  })

  // YouTube credentials
  const ytClientId     = document.getElementById('yt-client-id')
  const ytClientSecret = document.getElementById('yt-client-secret')
  const ytChannelId    = document.getElementById('yt-channel-id')
  const ytSaveBtn      = document.getElementById('btn-yt-save')
  const ytConnectBtn   = document.getElementById('btn-yt-connect')
  const ytStatus       = document.getElementById('yt-status')

  const ytCreds = config.youtube || {}
  ytClientId.value     = ytCreds.clientId     || ''
  ytClientSecret.value = ytCreds.clientSecret || ''
  ytChannelId.value    = ytCreds.channelId    || ''

  // Start disabled
  ytClientId.disabled     = true
  ytClientSecret.disabled = true
  ytChannelId.disabled    = true
  ytSaveBtn.textContent   = 'Edit YouTube Settings'
  ytSaveBtn.className     = 'btn-secondary'

  function updateYtStatus() {
    const hasCreds  = !!(config.youtube?.clientId && config.youtube?.clientSecret)
    const hasTokens = !!(config.youtube?.refreshToken)
    ytConnectBtn.disabled = !hasCreds
    if (hasTokens) {
      ytStatus.textContent = '● Connected'
      ytStatus.className = 'yt-status connected'
      ytConnectBtn.textContent = 'Disconnect'
    } else {
      ytStatus.textContent = hasCreds ? 'Not connected' : 'Enter credentials first'
      ytStatus.className = 'yt-status'
      ytConnectBtn.textContent = 'Connect'
    }
  }
  updateYtStatus()

  ytSaveBtn.addEventListener('click', () => {
    const editing = ytClientId.disabled
    if (editing) {
      ytClientId.disabled     = false
      ytClientSecret.disabled = false
      ytChannelId.disabled    = false
      ytSaveBtn.textContent   = 'Save YouTube Settings'
      ytSaveBtn.className     = 'btn-primary'
      ytClientId.focus()
    } else {
      config.youtube = {
        ...(config.youtube || {}),
        clientId:     ytClientId.value.trim(),
        clientSecret: ytClientSecret.value.trim(),
        channelId:    ytChannelId.value.trim()
      }
      saveConfig()
      ytClientId.disabled     = true
      ytClientSecret.disabled = true
      ytChannelId.disabled    = true
      ytSaveBtn.textContent   = 'Edit YouTube Settings'
      ytSaveBtn.className     = 'btn-secondary'
      updateYtStatus()
    }
  })

  ytConnectBtn.addEventListener('click', async () => {
    if (config.youtube?.refreshToken) {
      // Disconnect
      config.youtube.refreshToken = null
      config.youtube.accessToken  = null
      saveConfig()
      updateYtStatus()
      return
    }
    ytStatus.textContent = 'Opening browser…'
    ytStatus.className = 'yt-status'
    const result = await window.api.youtube.auth(config.youtube.clientId, config.youtube.clientSecret)
    if (result.ok) {
      config.youtube.refreshToken = result.refreshToken
      config.youtube.accessToken  = result.accessToken
      saveConfig()
      updateYtStatus()
    } else {
      ytStatus.textContent = 'Auth failed: ' + result.error
      ytStatus.className = 'yt-status error'
    }
  })

  // TikTok credentials
  const ttClientKey    = document.getElementById('tt-client-key')
  const ttClientSecret = document.getElementById('tt-client-secret')
  const ttSaveBtn      = document.getElementById('btn-tt-save')
  const ttConnectBtn   = document.getElementById('btn-tt-connect')
  const ttStatus       = document.getElementById('tt-status')

  const ttCreds = config.tiktok || {}
  ttClientKey.value    = ttCreds.clientKey    || ''
  ttClientSecret.value = ttCreds.clientSecret || ''

  ttClientKey.disabled    = true
  ttClientSecret.disabled = true
  ttSaveBtn.textContent   = 'Edit TikTok Settings'
  ttSaveBtn.className     = 'btn-secondary'

  function updateTtStatus() {
    const hasCreds  = !!(config.tiktok?.clientKey && config.tiktok?.clientSecret)
    const hasTokens = !!(config.tiktok?.refreshToken)
    ttConnectBtn.disabled = !hasCreds
    if (hasTokens) {
      ttStatus.textContent = '● Connected'
      ttStatus.className = 'yt-status connected'
      ttConnectBtn.textContent = 'Disconnect'
    } else {
      ttStatus.textContent = hasCreds ? 'Not connected' : 'Enter credentials first'
      ttStatus.className = 'yt-status'
      ttConnectBtn.textContent = 'Connect'
    }
  }
  updateTtStatus()

  ttSaveBtn.addEventListener('click', () => {
    const editing = ttClientKey.disabled
    if (editing) {
      ttClientKey.disabled    = false
      ttClientSecret.disabled = false
      ttSaveBtn.textContent   = 'Save TikTok Settings'
      ttSaveBtn.className     = 'btn-primary'
      ttClientKey.focus()
    } else {
      config.tiktok = {
        ...(config.tiktok || {}),
        clientKey:    ttClientKey.value.trim(),
        clientSecret: ttClientSecret.value.trim()
      }
      saveConfig()
      ttClientKey.disabled    = true
      ttClientSecret.disabled = true
      ttSaveBtn.textContent   = 'Edit TikTok Settings'
      ttSaveBtn.className     = 'btn-secondary'
      updateTtStatus()
    }
  })

  ttConnectBtn.addEventListener('click', async () => {
    if (config.tiktok?.refreshToken) {
      config.tiktok.refreshToken = null
      config.tiktok.accessToken  = null
      config.tiktok.openId       = null
      saveConfig()
      updateTtStatus()
      return
    }
    ttStatus.textContent = 'Opening browser…'
    ttStatus.className = 'yt-status'
    const result = await window.api.tiktok.auth(config.tiktok.clientKey, config.tiktok.clientSecret)
    if (result.ok) {
      config.tiktok.refreshToken = result.refreshToken
      config.tiktok.accessToken  = result.accessToken
      config.tiktok.openId       = result.openId
      saveConfig()
      updateTtStatus()
    } else {
      ttStatus.textContent = 'Auth failed: ' + result.error
      ttStatus.className = 'yt-status error'
    }
  })

  // Twitch settings
  const twitchChannelInput   = document.getElementById('twitch-channel')
  const twitchClientIdInput  = document.getElementById('twitch-client-id')
  const twitchClientSecInput = document.getElementById('twitch-client-secret')
  const twitchSaveBtn        = document.getElementById('btn-twitch-save')
  const twitchConnectBtn     = document.getElementById('btn-twitch-connect')
  const twitchStatusEl       = document.getElementById('twitch-status')

  const twCreds = config.twitch || {}
  twitchChannelInput.value   = twCreds.channel  || ''
  twitchClientIdInput.value  = twCreds.clientId || ''
  twitchClientSecInput.value = twCreds.clientSecret || ''

  twitchChannelInput.disabled   = true
  twitchClientIdInput.disabled  = true
  twitchClientSecInput.disabled = true
  twitchSaveBtn.textContent     = 'Edit Twitch Settings'
  twitchSaveBtn.className       = 'btn-secondary'

  function updateTwitchStatus() {
    const hasCreds  = !!(config.twitch?.clientId && config.twitch?.clientSecret)
    const hasTokens = !!(config.twitch?.refreshToken)
    twitchConnectBtn.disabled = !hasCreds
    if (hasTokens) {
      twitchStatusEl.textContent = '● Connected'
      twitchStatusEl.className   = 'yt-status connected'
      twitchConnectBtn.textContent = 'Disconnect'
    } else {
      twitchStatusEl.textContent   = hasCreds ? 'Not connected' : 'Enter credentials first'
      twitchStatusEl.className     = 'yt-status'
      twitchConnectBtn.textContent = 'Connect'
    }
  }
  updateTwitchStatus()

  twitchSaveBtn.addEventListener('click', () => {
    if (twitchChannelInput.disabled) {
      twitchChannelInput.disabled   = false
      twitchClientIdInput.disabled  = false
      twitchClientSecInput.disabled = false
      twitchSaveBtn.textContent     = 'Save Twitch Settings'
      twitchSaveBtn.className       = 'btn-primary'
      twitchChannelInput.focus()
    } else {
      config.twitch = {
        ...(config.twitch || {}),
        channel:      twitchChannelInput.value.trim(),
        clientId:     twitchClientIdInput.value.trim(),
        clientSecret: twitchClientSecInput.value.trim()
      }
      saveConfig()
      twitchChannelInput.disabled   = true
      twitchClientIdInput.disabled  = true
      twitchClientSecInput.disabled = true
      twitchSaveBtn.textContent     = 'Edit Twitch Settings'
      twitchSaveBtn.className       = 'btn-secondary'
      updateTwitchStatus()
    }
  })

  twitchConnectBtn.addEventListener('click', async () => {
    if (config.twitch?.refreshToken) {
      config.twitch.refreshToken = null
      config.twitch.accessToken  = null
      config.twitch.userId       = null
      saveConfig()
      updateTwitchStatus()
      return
    }
    twitchStatusEl.textContent = 'Opening browser…'
    twitchStatusEl.className   = 'yt-status'
    const result = await window.api.twitch.auth(config.twitch.clientId, config.twitch.clientSecret)
    if (result.ok) {
      config.twitch.refreshToken = result.refreshToken
      config.twitch.accessToken  = result.accessToken
      config.twitch.userId       = result.userId
      saveConfig()
      updateTwitchStatus()
    } else {
      twitchStatusEl.textContent = 'Auth failed: ' + result.error
      twitchStatusEl.className   = 'yt-status error'
    }
  })

  // Browser tabs
  const tabList = document.getElementById('browser-tab-list')

  function renderBrowserTabList() {
    tabList.innerHTML = ''

    config.pinnedTabs.forEach((tab, i) => {
      // Row
      const row = document.createElement('div')
      row.className = 'tab-settings-row'
      row.draggable = true
      row.dataset.idx = i

      // Drag handle
      const handle = document.createElement('div')
      handle.className = 'drag-handle'
      handle.textContent = '⠿'
      row.appendChild(handle)

      // Icon preview — click to open/close picker
      const iconPreview = document.createElement('div')
      iconPreview.className = 'tab-icon-preview'
      iconPreview.title = 'Click to set icon'
      if (tab.iconFa) {
        window.api.fa.get(tab.iconFa.style, tab.iconFa.name).then(data => {
          if (data) { iconPreview.innerHTML = data.svg; const s = iconPreview.querySelector('svg'); if (s) s.classList.add('si-icon-sm') }
          else iconPreview.textContent = tab.label.charAt(0).toUpperCase()
        })
      } else if (tab.iconSlug) {
        window.api.icons.get(tab.iconSlug).then(data => {
          if (data) { iconPreview.innerHTML = data.svg; const s = iconPreview.querySelector('svg'); if (s) s.classList.add('si-icon-sm') }
          else iconPreview.textContent = tab.label.charAt(0).toUpperCase()
        })
      } else {
        iconPreview.textContent = tab.label.charAt(0).toUpperCase()
      }
      row.appendChild(iconPreview)

      // Label
      const labelInput = document.createElement('input')
      labelInput.type = 'text'
      labelInput.value = tab.label
      labelInput.placeholder = 'Label'
      labelInput.className = 'tab-settings-input'
      labelInput.disabled = true
      row.appendChild(labelInput)

      // URL
      const urlInput = document.createElement('input')
      urlInput.type = 'text'
      urlInput.value = tab.url
      urlInput.placeholder = 'https://...'
      urlInput.className = 'tab-settings-input url-input'
      urlInput.disabled = true
      row.appendChild(urlInput)

      // Edit / Save toggle
      const saveBtn = document.createElement('button')
      saveBtn.className = 'btn-secondary'
      saveBtn.textContent = 'Edit'
      saveBtn.style.cssText = 'font-size:11px;padding:5px 10px;flex-shrink:0'
      saveBtn.addEventListener('click', () => {
        const editing = labelInput.disabled
        if (editing) {
          // Enter edit mode
          labelInput.disabled = false
          urlInput.disabled = false
          delBtn.disabled = false
          saveBtn.textContent = 'Save'
          saveBtn.className = 'btn-primary'
          labelInput.focus()
        } else {
          // Save
          const rawUrl = urlInput.value.trim()
          const label  = labelInput.value.trim() || tab.label
          const fullUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl) : tab.url
          window._pinnedTabAPI.update(i, { label, url: fullUrl })
          labelInput.disabled = true
          urlInput.disabled = true
          delBtn.disabled = true
          saveBtn.textContent = 'Edit'
          saveBtn.className = 'btn-secondary'
        }
      })
      row.appendChild(saveBtn)

      // Delete (only active in edit mode)
      const delBtn = document.createElement('button')
      delBtn.className = 'btn-secondary'
      delBtn.textContent = '✕'
      delBtn.title = 'Remove pinned tab'
      delBtn.disabled = true
      delBtn.style.cssText = 'font-size:11px;padding:5px 8px;flex-shrink:0'
      delBtn.addEventListener('click', () => {
        window._pinnedTabAPI.remove(i)
        renderBrowserTabList()
      })
      row.appendChild(delBtn)

      tabList.appendChild(row)

      // ── Icon picker (below this row) ──────────────────────────────────────
      const picker = document.createElement('div')
      picker.className = 'icon-picker'
      picker.style.display = 'none'

      const pickerHeader = document.createElement('div')
      pickerHeader.className = 'icon-picker-header'

      const searchInput = document.createElement('input')
      searchInput.type = 'text'
      searchInput.placeholder = 'Search icons — e.g. youtube, play, star…'
      searchInput.className = 'tab-settings-input'
      searchInput.style.flex = '1'

      const clearBtn = document.createElement('button')
      clearBtn.className = 'btn-secondary'
      clearBtn.textContent = 'Clear'
      clearBtn.style.cssText = 'font-size:11px;padding:5px 10px;flex-shrink:0;white-space:nowrap'
      clearBtn.addEventListener('click', () => {
        window._pinnedTabAPI.update(i, { iconSlug: '', iconFa: null })
        iconPreview.innerHTML = ''
        iconPreview.textContent = tab.label.charAt(0).toUpperCase()
        picker.style.display = 'none'
      })

      const closeBtn = document.createElement('button')
      closeBtn.className = 'btn-secondary'
      closeBtn.textContent = '✕'
      closeBtn.style.cssText = 'font-size:11px;padding:5px 8px;flex-shrink:0'
      closeBtn.addEventListener('click', () => { picker.style.display = 'none' })

      pickerHeader.appendChild(searchInput)
      pickerHeader.appendChild(clearBtn)
      pickerHeader.appendChild(closeBtn)
      picker.appendChild(pickerHeader)

      const iconGrid = document.createElement('div')
      iconGrid.className = 'icon-picker-grid'
      picker.appendChild(iconGrid)

      function makeIconItem(svg, label, onClick) {
        const item = document.createElement('button')
        item.className = 'icon-grid-item'
        item.title = label
        item.innerHTML = svg || ''
        const el = item.querySelector('svg')
        if (el) el.style.cssText = 'width:26px;height:26px;fill:currentColor;flex-shrink:0'
        const lbl = document.createElement('span'); lbl.textContent = label
        item.appendChild(lbl)
        item.addEventListener('click', onClick)
        return item
      }

      async function runSearch() {
        const q = searchInput.value.trim()
        const empty = '<span class="muted" style="padding:8px;font-size:11px">Start typing to search…</span>'
        const none  = '<span class="muted" style="padding:8px;font-size:11px">No icons found</span>'
        iconGrid.innerHTML = q ? '' : empty
        if (!q) return
        const [siResults, faResults] = await Promise.all([
          window.api.icons.search(q),
          window.api.fa.search(q, null)
        ])
        iconGrid.innerHTML = ''
        if (!siResults.length && !faResults.length) { iconGrid.innerHTML = none; return }
        siResults.forEach(icon => iconGrid.appendChild(makeIconItem(icon.svg, icon.slug, () => {
          window._pinnedTabAPI.update(i, { iconSlug: icon.slug, iconFa: null })
          iconPreview.innerHTML = icon.svg || ''
          const s = iconPreview.querySelector('svg'); if (s) s.classList.add('si-icon-sm')
          picker.style.display = 'none'
        })))
        faResults.forEach(icon => iconGrid.appendChild(makeIconItem(icon.svg, icon.name, () => {
          window._pinnedTabAPI.update(i, { iconFa: { style: icon.style, name: icon.name }, iconSlug: '' })
          iconPreview.innerHTML = icon.svg || ''
          const s = iconPreview.querySelector('svg'); if (s) s.classList.add('si-icon-sm')
          picker.style.display = 'none'
        })))
      }

      let searchTimer
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer)
        searchTimer = setTimeout(runSearch, 280)
      })

      // Toggle picker on icon preview click
      iconPreview.addEventListener('click', () => {
        const isOpen = picker.style.display !== 'none'
        tabList.querySelectorAll('.icon-picker').forEach(p => p.style.display = 'none')
        if (!isOpen) {
          picker.style.display = 'flex'
          searchInput.value = ''
          iconGrid.innerHTML = '<span class="muted" style="padding:8px;font-size:11px">Start typing to search…</span>'
          searchInput.focus()
        }
      })

      tabList.appendChild(picker)
    })

    // Drag & drop reorder
    let dragSrcIdx = null
    tabList.querySelectorAll('.tab-settings-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragSrcIdx = parseInt(row.dataset.idx)
        e.dataTransfer.effectAllowed = 'move'
        setTimeout(() => row.classList.add('dragging'), 0)
      })
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging')
        tabList.querySelectorAll('.tab-settings-row').forEach(r => r.classList.remove('drag-over'))
      })
      row.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        tabList.querySelectorAll('.tab-settings-row').forEach(r => r.classList.remove('drag-over'))
        row.classList.add('drag-over')
      })
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'))
      row.addEventListener('drop', e => {
        e.preventDefault()
        row.classList.remove('drag-over')
        const dropIdx = parseInt(row.dataset.idx)
        if (dragSrcIdx === null || dragSrcIdx === dropIdx) return
        const moved = config.pinnedTabs.splice(dragSrcIdx, 1)[0]
        config.pinnedTabs.splice(dropIdx, 0, moved)
        window._pinnedTabAPI.reorder(config.pinnedTabs.map(t => t.id))
        renderBrowserTabList()
      })
    })

    // ── Add pinned tab inline form ────────────────────────────────────────────
    const addForm = document.createElement('div')
    addForm.className = 'add-tab-form'

    const addUrlInput = document.createElement('input')
    addUrlInput.type = 'text'
    addUrlInput.placeholder = 'https://studio.youtube.com'
    addUrlInput.className = 'tab-settings-input url-input'

    const addLabelInput = document.createElement('input')
    addLabelInput.type = 'text'
    addLabelInput.placeholder = 'Label (auto-filled)'
    addLabelInput.className = 'tab-settings-input'

    // Auto-fill label when URL is typed
    addUrlInput.addEventListener('blur', () => {
      if (addUrlInput.value && !addLabelInput.value) {
        addLabelInput.value = urlToLabel(addUrlInput.value)
      }
    })

    const addConfirmBtn = document.createElement('button')
    addConfirmBtn.className = 'btn-primary'
    addConfirmBtn.textContent = '+ Add'
    addConfirmBtn.style.cssText = 'font-size:11px;padding:5px 12px;flex-shrink:0'
    addConfirmBtn.addEventListener('click', () => {
      const rawUrl = addUrlInput.value.trim()
      if (!rawUrl) return
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl
      const label = addLabelInput.value.trim() || urlToLabel(fullUrl)
      window._pinnedTabAPI.add({ id: Date.now(), label, url: fullUrl })
      addUrlInput.value = ''
      addLabelInput.value = ''
      renderBrowserTabList()
    })

    // Also add on Enter in either field
    ;[addUrlInput, addLabelInput].forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') addConfirmBtn.click() })
    })

    addForm.appendChild(addUrlInput)
    addForm.appendChild(addLabelInput)
    addForm.appendChild(addConfirmBtn)
    tabList.appendChild(addForm)
  }

  renderBrowserTabList()
  document.querySelector('.tab[data-tab="settings"]').addEventListener('click', renderBrowserTabList)
}

// ── Media ─────────────────────────────────────────────────────────────────────
function initMedia() {
  const btnPickVideo    = document.getElementById('btn-pick-video')
  const btnPickJson     = document.getElementById('btn-pick-json')
  const btnClearJson    = document.getElementById('btn-clear-json')
  const videoFilename   = document.getElementById('video-filename')
  const jsonFilename    = document.getElementById('json-filename')
  const titleInput      = document.getElementById('media-title')
  const descTextarea    = document.getElementById('media-description')
  const hashtagsInput   = document.getElementById('media-hashtags')
  const btnUpload        = document.getElementById('btn-upload')
  const uploadStatus     = document.getElementById('upload-status')
  const ytVisibility     = document.getElementById('yt-visibility')
  const ytCategory       = document.getElementById('yt-category')
  const ttVisibility     = document.getElementById('tt-visibility')
  const videoEl          = document.getElementById('media-video')
  const videoWrap        = document.getElementById('video-preview-wrap')
  const videoPlaceholder = document.getElementById('video-placeholder')

  let sessionData = null
  let currentVideoPath = null

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  function applyTemplate(data) {
    const title = `F1 ${data.event_name} - ${data.session_name} - Results`
    const desc  = (data.results || [])
      .map(r => `${r.position}. ${r.driver}  ${r.value}`)
      .join('\n')
    const hashtags = `#f1 #formula1 #${slugify(data.event_name)} #turn1visuals`

    titleInput.value    = title
    descTextarea.value  = desc
    hashtagsInput.value = hashtags
  }

  function clearTemplate() {
    titleInput.value    = ''
    descTextarea.value  = ''
    hashtagsInput.value = '#f1 #formula1 #turn1visuals'
  }

  btnPickVideo.addEventListener('click', async () => {
    const paths = await window.api.media.pickVideo()
    if (!paths.length) return
    const filePath = paths[0]
    const name = filePath.split(/[\\/]/).pop()
    videoFilename.textContent = name
    currentVideoPath = filePath
    videoEl.src = 'file:///' + filePath.replace(/\\/g, '/')
    videoWrap.style.display = ''
    videoPlaceholder.style.display = 'none'
    btnUpload.disabled = false
  })

  btnPickJson.addEventListener('click', async () => {
    const paths = await window.api.media.pickJson()
    if (!paths.length) return
    const data = await window.api.media.readJson(paths[0])
    if (!data) { jsonFilename.textContent = 'Failed to read file'; return }
    sessionData = data
    const name = paths[0].split(/[\\/]/).pop()
    jsonFilename.textContent = name
    btnClearJson.style.display = ''
    applyTemplate(data)
  })

  btnClearJson.addEventListener('click', () => {
    sessionData = null
    jsonFilename.textContent = 'No file selected'
    btnClearJson.style.display = 'none'
    clearTemplate()
  })

  btnUpload.addEventListener('click', async () => {
    const doYoutube = document.getElementById('plat-youtube').checked
    const doTiktok  = document.getElementById('plat-tiktok').checked

    const missing = []
    if (!currentVideoPath)                    missing.push('video')
    if (!titleInput.value.trim())             missing.push('title')
    if (!hashtagsInput.value.trim())          missing.push('hashtags')
    if (!descTextarea.value.trim())           missing.push('description')
    if (!doYoutube && !doTiktok)              missing.push('platform')

    if (missing.length) {
      uploadStatus.textContent = `Required: ${missing.join(', ')}`
      uploadStatus.style.color = '#e10600'
      return
    }
    uploadStatus.style.color = ''

    btnUpload.disabled = true
    uploadStatus.textContent = 'Uploading…'
    uploadStatus.style.color = ''

    const resultsCol  = document.getElementById('media-results')
    const resultsEmpty = document.getElementById('results-empty')
    const timestamp   = new Date().toLocaleTimeString()

    function addResultCard({ platform, success, statusText, url, detail }) {
      if (resultsEmpty) resultsEmpty.style.display = 'none'
      const card = document.createElement('div')
      card.className = `result-card ${success ? 'success' : 'error'}`

      const plat = document.createElement('div')
      plat.className = 'result-platform'
      plat.textContent = platform
      card.appendChild(plat)

      const status = document.createElement('div')
      status.className = 'result-status'
      status.textContent = (success ? '✓ ' : '✗ ') + statusText
      card.appendChild(status)

      if (url) {
        const link = document.createElement('div')
        link.className = 'result-link'
        link.textContent = url
        link.addEventListener('click', () => window.api.app.openExternal(url))
        card.appendChild(link)
      }

      if (detail) {
        const det = document.createElement('div')
        det.className = 'result-time'
        det.textContent = detail
        card.appendChild(det)
      }

      const time = document.createElement('div')
      time.className = 'result-time'
      time.textContent = timestamp
      card.appendChild(time)

      resultsCol.prepend(card)
    }

    if (doYoutube) {
      const yt = config.youtube || {}
      if (!yt.refreshToken) {
        addResultCard({ platform: 'YouTube', success: false, statusText: 'Not connected' })
      } else {
        uploadStatus.textContent = 'Uploading to YouTube…'
        const result = await window.api.youtube.upload({
          filePath:     currentVideoPath,
          title:        titleInput.value.trim(),
          description:  descTextarea.value.trim(),
          tags:         hashtagsInput.value.trim(),
          visibility:   ytVisibility.value,
          categoryId:   ytCategory.value,
          clientId:     yt.clientId,
          clientSecret: yt.clientSecret,
          refreshToken: yt.refreshToken
        })
        if (result.ok) {
          addResultCard({ platform: 'YouTube', success: true, statusText: 'Published', url: result.url })
        } else {
          addResultCard({ platform: 'YouTube', success: false, statusText: result.error })
        }
      }
    }

    if (doTiktok) {
      const tt = config.tiktok || {}
      if (!tt.refreshToken) {
        addResultCard({ platform: 'TikTok', success: false, statusText: 'Not connected' })
      } else {
        uploadStatus.textContent = 'Uploading to TikTok…'
        const result = await window.api.tiktok.upload({
          filePath:     currentVideoPath,
          title:        titleInput.value.trim(),
          description:  descTextarea.value.trim(),
          privacyLevel: ttVisibility.value,
          clientKey:    tt.clientKey,
          clientSecret: tt.clientSecret,
          refreshToken: tt.refreshToken
        })
        if (result.ok) {
          if (result.statusRaw) console.log('[TikTok status]', result.statusRaw)
          addResultCard({
            platform:   'TikTok',
            success:    true,
            statusText: result.status || 'Sent to inbox',
            detail:     `ID: ${result.publishId}`
          })
        } else {
          addResultCard({ platform: 'TikTok', success: false, statusText: result.error })
        }
      }
    }

    uploadStatus.textContent = 'Done'
    btnUpload.disabled = false
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function saveConfig() {
  window.api.config.save(config)
}

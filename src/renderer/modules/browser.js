import { state, saveConfig } from '../state.js'

// ── Browser ───────────────────────────────────────────────────────────────────
export function initBrowser() {
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
    empty.style.display = (state.config.pinnedTabs.length + state.config.tempTabs.length === 0) ? 'flex' : 'none'
    updateNavBar(webviewMap.get(tabId))
  }

  function createWebview(tab) {
    if (webviewMap.has(tab.id)) return webviewMap.get(tab.id)
    const wv = document.createElement('webview')
    wv.src = tab.url
    wv.partition = 'persist:browser'
    wv.useragent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
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
        // Switch to browser main tab if not already there
        if (!document.getElementById('tab-browser').classList.contains('active')) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
          document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
          document.querySelector('.tab[data-tab="browser"]').classList.add('active')
          document.getElementById('tab-browser').classList.add('active')
        }
      } else {
        openInBrowser(tab.url, tab.label)
      }
    })
    btn.addEventListener('contextmenu', e => showCtxMenu(e, tab, !removable))
    return btn
  }

  function renderSidebar() {
    sidebarTabs.innerHTML = ''
    state.config.pinnedTabs.forEach(tab => sidebarTabs.appendChild(createSidebarBtn(tab, false)))
    if (state.config.tempTabs.length > 0) {
      if (state.config.pinnedTabs.length > 0) {
        const sep = document.createElement('div')
        sep.className = 'sidebar-separator'
        sidebarTabs.appendChild(sep)
      }
      state.config.tempTabs.forEach(tab => sidebarTabs.appendChild(createSidebarBtn(tab, true)))
    }
  }

  function removeTempTab(tabId) {
    const idx = state.config.tempTabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    state.config.tempTabs.splice(idx, 1)
    saveConfig()
    const wv = webviewMap.get(tabId)
    if (wv) { wv.remove(); webviewMap.delete(tabId) }
    renderSidebar()
    if (activeTabId === tabId) {
      const all = [...state.config.pinnedTabs, ...state.config.tempTabs]
      if (all.length > 0) setActive(all[0].id)
      else { activeTabId = null; empty.style.display = 'flex' }
    }
  }

  // Backfill stable ids
  let dirty = false
  ;[...state.config.pinnedTabs, ...state.config.tempTabs].forEach(t => {
    if (!t.id) { t.id = Date.now() + Math.random(); dirty = true }
  })
  if (dirty) saveConfig()

  // Initialize webviews and sidebar
  state.config.pinnedTabs.forEach(tab => createWebview(tab))
  state.config.tempTabs.forEach(tab => createWebview(tab))
  renderSidebar()

  const allTabs = [...state.config.pinnedTabs, ...state.config.tempTabs]
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
    const all = [...state.config.pinnedTabs, ...state.config.tempTabs]
    // If the active tab is already a temp tab and the user typed in the bar, navigate it
    const existing = all.find(t => t.url === fullUrl)
    if (existing) { setActive(existing.id); return }
    const label = urlToLabel(fullUrl)
    const tab = { id: Date.now(), label, url: fullUrl }
    state.config.tempTabs.push(tab)
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
    const all = [...state.config.pinnedTabs, ...state.config.tempTabs]
    const existing = all.find(t => t.url === url)
    if (existing) { setActive(existing.id); return }
    const tab = { id: Date.now(), label, url }
    state.config.tempTabs.push(tab)
    saveConfig()
    createWebview(tab)
    renderSidebar()
    setActive(tab.id)
  }

  // API for settings panel
  window._pinnedTabAPI = {
    add(tab) {
      state.config.pinnedTabs.push(tab)
      saveConfig()
      createWebview(tab)
      renderSidebar()
      if (activeTabId) setActive(activeTabId)
    },
    update(idx, changes) {
      const tab = state.config.pinnedTabs[idx]
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
      const tab = state.config.pinnedTabs[idx]
      if (!tab) return
      state.config.pinnedTabs.splice(idx, 1)
      saveConfig()
      const wv = webviewMap.get(tab.id)
      if (wv) { wv.remove(); webviewMap.delete(tab.id) }
      renderSidebar()
      if (activeTabId === tab.id) {
        const all = [...state.config.pinnedTabs, ...state.config.tempTabs]
        if (all.length > 0) setActive(all[0].id)
        else { activeTabId = null; empty.style.display = 'flex' }
      }
    },
    reorder(orderedIds) {
      state.config.pinnedTabs = orderedIds.map(id => state.config.pinnedTabs.find(t => t.id === id)).filter(Boolean)
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

  const loginBtn = document.getElementById('browser-login')
  let siteLoginPending = false
  loginBtn.addEventListener('click', async () => {
    if (!siteLoginPending) {
      const url = document.getElementById('browser-url-input').value.trim()
      if (!url) return
      loginBtn.disabled = true
      loginBtn.textContent = '…'
      const res = await window.api.browser.siteLogin(url)
      if (!res.ok) {
        loginBtn.textContent = 'Login'
        loginBtn.disabled = false
        console.error('[browser] Site login failed:', res.error)
        return
      }
      siteLoginPending = true
      loginBtn.textContent = 'Done'
      loginBtn.title = `Log in to ${res.domain} in Chrome, then click Done`
      loginBtn.disabled = false
    } else {
      loginBtn.disabled = true
      loginBtn.textContent = '…'
      const res = await window.api.browser.finishSiteLogin()
      siteLoginPending = false
      loginBtn.title = res.ok ? `Imported ${res.count} cookies for ${res.domain}` : res.error
      loginBtn.textContent = res.ok ? '✓' : '✕'
      console.log('[browser] Site login:', res)
      if (res.ok) { const wv = getActiveWv(); if (wv) wv.reload() }
      setTimeout(() => { loginBtn.textContent = 'Login'; loginBtn.disabled = false; loginBtn.title = 'Open login window for this site' }, 3000)
    }
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
export function openInBrowser(url, label) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelector('.tab[data-tab="browser"]').classList.add('active')
  document.getElementById('tab-browser').classList.add('active')
  if (window._browserActivate) window._browserActivate(url, label)
}

export function urlToLabel(url) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace('www.', '') }
  catch { return url }
}

// ── Quick links ───────────────────────────────────────────────────────────────
export function initQuicklinks() {
  document.querySelectorAll('.btn-quicklink').forEach(btn => {
    btn.addEventListener('click', () => openInBrowser(btn.dataset.url, btn.dataset.label))
  })
}

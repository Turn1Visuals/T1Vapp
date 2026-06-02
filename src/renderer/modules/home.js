import { state, saveConfig } from '../state.js'

// ── Home Streams ──────────────────────────────────────────────────────────────
export function initHomeStreams() {
  // ── Layout swap ──
  const controlsPanel = document.querySelector('.controls-panel')
  const swapBtn = document.getElementById('btn-swap-layout')
  if (localStorage.getItem('layoutSwapped') === '1') controlsPanel.style.flexDirection = 'row-reverse'
  swapBtn.addEventListener('click', () => {
    const swapped = controlsPanel.style.flexDirection === 'row-reverse'
    controlsPanel.style.flexDirection = swapped ? '' : 'row-reverse'
    localStorage.setItem('layoutSwapped', swapped ? '0' : '1')
  })

  // ── Stream tabs ──
  const tabs = document.querySelectorAll('.stream-tab')
  const views = {
    controls: document.getElementById('stream-view-controls'),
    overlay:  document.getElementById('stream-view-overlay'),
    youtube:  document.getElementById('stream-view-youtube'),
    twitch:   document.getElementById('stream-view-twitch'),
    kick:     document.getElementById('stream-view-kick'),
  }

  const streamTabIcons = { youtube: 'youtube', twitch: 'twitch', kick: 'kick' }
  tabs.forEach(tab => {
    const slug = streamTabIcons[tab.dataset.view]
    if (slug) {
      window.api.icons.get(slug).then(data => {
        if (!data) return
        const svg = document.createElement('span')
        svg.innerHTML = data.svg
        const s = svg.querySelector('svg')
        if (s) { s.classList.add('si-icon-sm'); tab.prepend(s) }
      })
    }
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const target = tab.dataset.view
      Object.entries(views).forEach(([k, v]) => v.classList.toggle('active', k === target))
      overlayReloadBtn.style.display = target === 'overlay' ? '' : 'none'
      if (target === 'youtube') state.loadYtStream()
      if (target === 'twitch')  loadTwitchStream()
      if (target === 'kick')    loadKickStream()
    })
  })

  // ── Overlay (stream source) ──
  const viewport        = document.getElementById('overlay-viewport')
  const overlayWv       = document.getElementById('overlay-webview')
  const overlayReloadBtn = document.getElementById('btn-overlay-reload')
  const offlineEl = document.getElementById('overlay-offline')
  const overlayUrl = state.config.overlayUrl || 'http://localhost:5173/'
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
  document.getElementById('btn-overlay-reload').addEventListener('click', () => {
    if (overlayShown) overlayWv.reload()
  })

  checkOverlay()
  setInterval(checkOverlay, 4000)

  // ── YouTube stream tab ──
  const ytStreamWv      = document.getElementById('yt-stream-wv')
  const ytStreamOffline = document.getElementById('yt-stream-offline')
  // Pick up any already-running broadcast on app start
  let broadcastIdReady = Promise.resolve()
  if (!state.config.youtube?.refreshToken) {
    ytStreamOffline.textContent = 'YouTube not connected — go to Settings to connect your account'
  } else {
    ytStreamOffline.textContent = 'No active broadcast — go live to load YouTube Studio'
    broadcastIdReady = window.api.youtube.getLiveBroadcast().then(res => {
      if (res.ok && res.videoId) state.currentBroadcastId = res.videoId
    })
  }

  state.loadYtStream = function(videoId) {
    broadcastIdReady.then(() => {
      const id = videoId || state.currentBroadcastId
      if (!id) { ytStreamOffline.style.display = ''; ytStreamWv.style.display = 'none'; return }
      ytStreamOffline.style.display = 'none'
      ytStreamWv.style.display = ''
      if (state.ytStreamLoaded && !videoId) return
      ytStreamWv.src = `https://studio.youtube.com/video/${id}/livestreaming`
      state.ytStreamLoaded = true
    })
  }

  // ── Twitch stream tab ──
  const twitchStreamWv      = document.getElementById('twitch-stream-wv')
  const twitchStreamOffline = document.getElementById('twitch-stream-offline')
  let twitchStreamLoaded = false

  function loadTwitchStream() {
    if (twitchStreamLoaded) return
    const channel = state.config.twitch?.channel
    if (!channel) { twitchStreamOffline.style.display = ''; return }
    twitchStreamWv.src = `https://dashboard.twitch.tv/u/${channel}/stream-manager`
    twitchStreamLoaded = true
  }

  // ── Kick stream tab ──
  const kickStreamWv      = document.getElementById('kick-stream-wv')
  const kickStreamOffline = document.getElementById('kick-stream-offline')
  let kickStreamLoaded = false

  // Auto re-inject saved cookies on startup
  if (state.config.kick?.cookieSession) {
    window.api.kick.injectCookies({
      kickSession:  state.config.kick.cookieSession,
      sessionToken: state.config.kick.cookieToken || '',
      xsrfToken:    state.config.kick.cookieXsrf  || ''
    }).then(() => { kickStreamLoaded = false })
  }

  function loadKickStream() {
    if (kickStreamLoaded) return
    const channel = state.config.kick?.channel
    if (!channel) { kickStreamOffline.style.display = ''; kickStreamWv.style.display = 'none'; return }
    kickStreamOffline.style.display = 'none'
    kickStreamWv.style.display = ''
    kickStreamWv.src = `https://kick.com/dashboard`
    kickStreamLoaded = true
  }

  // Stream reload buttons
  document.getElementById('btn-reload-yt-stream').addEventListener('click', () => ytStreamWv.reload())
  document.getElementById('btn-reload-twitch-stream').addEventListener('click', () => twitchStreamWv.reload())
  document.getElementById('btn-reload-kick-stream').addEventListener('click', () => kickStreamWv.reload())

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
  if (state.config.youtube?.refreshToken) loadYtChat()

  // ── Twitch chat ──
  const twitchChatWv = document.getElementById('twitch-chat-wv')

  function loadTwitchChat() {
    const channel = state.config.twitch?.channel
    if (!channel) return
    twitchChatWv.src = `https://www.twitch.tv/embed/${channel}/chat?parent=localhost&darkpopout`
  }
  loadTwitchChat()
  document.getElementById('btn-reload-twitch-chat').addEventListener('click', () => twitchChatWv.reload())

  // ── Kick chat ──
  const kickChatWv = document.getElementById('kick-chat-wv')

  function loadKickChat() {
    const channel = state.config.kick?.channel
    if (!channel) return
    kickChatWv.src = `https://kick.com/popout/${channel}/chat`
  }
  loadKickChat()

  document.getElementById('btn-reload-kick-chat').addEventListener('click', () => kickChatWv.reload())

  // Expose webview internals for settings module
  window._webviewAPI = {
    ytChatWv,
    ytStreamWv,
    twitchChatWv,
    twitchStreamWv,
    kickChatWv,
    kickStreamWv,
    loadKickChat,
    kickStreamOffline,
    getKickStreamLoaded: () => kickStreamLoaded,
    setKickStreamLoaded: (v) => { kickStreamLoaded = v },
  }

  // ── Chat col expand on click ──
  const chatCols = document.querySelectorAll('.chat-col')
  chatCols.forEach(col => {
    col.addEventListener('click', () => {
      const isExpanded = col.classList.contains('expanded')
      chatCols.forEach(c => c.classList.remove('expanded'))
      if (!isExpanded) col.classList.add('expanded')
    })
  })

  // ── Shared send bar ──
  const chatInput      = document.getElementById('chat-msg-input')
  const btnSendBoth    = document.getElementById('btn-send-both')
  const chatSendStatus = document.getElementById('chat-send-status')

  async function sendToYt(message) {
    if (!currentLiveChatId) return { ok: false, error: 'No active YT broadcast' }
    return window.api.youtube.sendChat({ message, liveChatId: currentLiveChatId })
  }

  async function sendToTwitch(message) {
    if (!state.config.twitch?.refreshToken) return { ok: false, error: 'Twitch not connected' }
    return window.api.twitch.sendChat({ message })
  }

  async function sendToKick(message) {
    if (!state.config.kick?.refreshToken) return { ok: false, error: 'Kick not connected' }
    return window.api.kick.sendChat({ message })
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

  btnSendBoth.addEventListener('click', () => handleSend([sendToYt, sendToTwitch, sendToKick]))
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend([sendToYt, sendToTwitch, sendToKick]) })

  // ── Platform viewer stats ──
  const ytViewersRow   = document.getElementById('yt-viewers-row')
  const twViewersRow   = document.getElementById('tw-viewers-row')
  const kickViewersRow = document.getElementById('kick-viewers-row')
  const ytViewersCount   = document.getElementById('yt-viewers-count')
  const twViewersCount   = document.getElementById('tw-viewers-count')
  const kickViewersCount = document.getElementById('kick-viewers-count')

  function fmtViewers(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    return String(n)
  }

  function fmtUptime(startedAt) {
    const secs = Math.floor((Date.now() - new Date(startedAt)) / 1000)
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`
  }

  async function pollViewers() {
    // YouTube
    if (state.config.youtube?.refreshToken) {
      await broadcastIdReady
      if (state.currentBroadcastId) {
        const res = await window.api.youtube.getViewers({ broadcastId: state.currentBroadcastId })
        if (res.ok) { ytViewersCount.textContent = fmtViewers(res.viewers); ytViewersRow.style.display = '' }
        else ytViewersRow.style.display = 'none'
      }
    }
    // Twitch
    if (state.config.twitch?.refreshToken) {
      const res = await window.api.twitch.getViewers()
      if (res.ok) { twViewersCount.textContent = fmtViewers(res.viewers); twViewersRow.style.display = '' }
      else twViewersRow.style.display = 'none'
    }
    // Kick
    if (state.config.kick?.channel) {
      const res = await window.api.kick.getViewers({ channel: state.config.kick.channel })
      if (res.ok && res.viewers != null) { kickViewersCount.textContent = fmtViewers(res.viewers); kickViewersRow.style.display = '' }
      else kickViewersRow.style.display = 'none'
    }
  }

  // Poll every 30s, start after a short delay
  setTimeout(() => {
    pollViewers()
    setInterval(pollViewers, 30000)
  }, 3000)
}

import { state, saveConfig } from '../state.js'
import { urlToLabel } from './browser.js'

// ── Settings ──────────────────────────────────────────────────────────────────
export function initSettings() {
  // OBS
  const hostEl = document.getElementById('obs-host')
  const portEl = document.getElementById('obs-port')
  const passEl = document.getElementById('obs-password')

  hostEl.value = state.config.obs?.host || 'localhost'
  portEl.value = state.config.obs?.port || 4455
  passEl.value = state.config.obs?.password || ''

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
      state.config.obs = {
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

  overlayInput.value    = state.config.overlayUrl || 'http://localhost:5173/'
  overlayInput.disabled = true

  overlayBtn.addEventListener('click', () => {
    if (overlayInput.disabled) {
      overlayInput.disabled = false
      overlayBtn.textContent = 'Save Overlay URL'
      overlayBtn.className = 'btn-primary'
      overlayInput.focus()
    } else {
      state.config.overlayUrl = overlayInput.value.trim() || 'http://localhost:5173/'
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

  const ytCreds = state.config.youtube || {}
  ytClientId.value     = ytCreds.clientId     || ''
  ytClientSecret.value = ytCreds.clientSecret || ''
  ytChannelId.value    = ytCreds.channelId    || ''

  // Start disabled + hidden
  ytClientId.disabled     = true
  ytClientSecret.disabled = true
  ytChannelId.disabled    = true
  ytClientId.closest('label').style.display     = 'none'
  ytClientSecret.closest('label').style.display = 'none'
  ytSaveBtn.textContent   = 'Edit YouTube Settings'
  ytSaveBtn.className     = 'btn-secondary'

  function updateYtStatus() {
    const hasCreds  = !!(state.config.youtube?.clientId && state.config.youtube?.clientSecret)
    const hasTokens = !!(state.config.youtube?.refreshToken)
    const isBrowserAuth = !!(state.config.youtube?.browserAuthenticated)
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

  // Check if browser cookies still exist
  if (state.config.youtube?.browserAuthenticated) {
    window.api.browser.checkCookies('persist:yt-stream', 'youtube.com').then(res => {
      if (!res.hasCookies) {
        state.config.youtube.browserAuthenticated = false
        saveConfig()
      }
    })
  }

  ytSaveBtn.addEventListener('click', () => {
    const editing = ytClientId.disabled
    if (editing) {
      ytClientId.disabled     = false
      ytClientSecret.disabled = false
      ytChannelId.disabled    = false
      ytClientId.closest('label').style.display     = ''
      ytClientSecret.closest('label').style.display = ''
      ytSaveBtn.textContent   = 'Save YouTube Settings'
      ytSaveBtn.className     = 'btn-primary'
      ytClientId.focus()
    } else {
      state.config.youtube = {
        ...(state.config.youtube || {}),
        clientId:     ytClientId.value.trim(),
        clientSecret: ytClientSecret.value.trim(),
        channelId:    ytChannelId.value.trim()
      }
      saveConfig()
      ytClientId.disabled     = true
      ytClientSecret.disabled = true
      ytChannelId.disabled    = true
      ytClientId.closest('label').style.display     = 'none'
      ytClientSecret.closest('label').style.display = 'none'
      ytSaveBtn.textContent   = 'Edit YouTube Settings'
      ytSaveBtn.className     = 'btn-secondary'
      updateYtStatus()
    }
  })

  ytConnectBtn.addEventListener('click', async () => {
    if (state.config.youtube?.refreshToken) {
      // Disconnect
      state.config.youtube.refreshToken = null
      state.config.youtube.accessToken  = null
      saveConfig()
      updateYtStatus()
      return
    }
    ytStatus.textContent = 'Opening browser…'
    ytStatus.className = 'yt-status'
    const result = await window.api.youtube.auth(state.config.youtube.clientId, state.config.youtube.clientSecret)
    if (result.ok) {
      state.config.youtube.refreshToken = result.refreshToken
      state.config.youtube.accessToken  = result.accessToken
      saveConfig()
      updateYtStatus()
    } else {
      ytStatus.textContent = 'Auth failed: ' + result.error
      ytStatus.className = 'yt-status error'
    }
  })

  // YouTube chat/stream login
  // TikTok credentials
  const ttClientKey    = document.getElementById('tt-client-key')
  const ttClientSecret = document.getElementById('tt-client-secret')
  const ttSaveBtn      = document.getElementById('btn-tt-save')
  const ttConnectBtn   = document.getElementById('btn-tt-connect')
  const ttStatus       = document.getElementById('tt-status')

  const ttCreds = state.config.tiktok || {}
  ttClientKey.value    = ttCreds.clientKey    || ''
  ttClientSecret.value = ttCreds.clientSecret || ''

  ttClientKey.disabled    = true
  ttClientSecret.disabled = true
  ttClientKey.closest('label').style.display    = 'none'
  ttClientSecret.closest('label').style.display = 'none'
  ttSaveBtn.textContent   = 'Edit TikTok Settings'
  ttSaveBtn.className     = 'btn-secondary'

  function updateTtStatus() {
    const hasCreds  = !!(state.config.tiktok?.clientKey && state.config.tiktok?.clientSecret)
    const hasTokens = !!(state.config.tiktok?.refreshToken)
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
      ttClientKey.closest('label').style.display    = ''
      ttClientSecret.closest('label').style.display = ''
      ttSaveBtn.textContent   = 'Save TikTok Settings'
      ttSaveBtn.className     = 'btn-primary'
      ttClientKey.focus()
    } else {
      state.config.tiktok = {
        ...(state.config.tiktok || {}),
        clientKey:    ttClientKey.value.trim(),
        clientSecret: ttClientSecret.value.trim()
      }
      saveConfig()
      ttClientKey.disabled    = true
      ttClientSecret.disabled = true
      ttClientKey.closest('label').style.display    = 'none'
      ttClientSecret.closest('label').style.display = 'none'
      ttSaveBtn.textContent   = 'Edit TikTok Settings'
      ttSaveBtn.className     = 'btn-secondary'
      updateTtStatus()
    }
  })

  ttConnectBtn.addEventListener('click', async () => {
    if (state.config.tiktok?.refreshToken) {
      state.config.tiktok.refreshToken = null
      state.config.tiktok.accessToken  = null
      state.config.tiktok.openId       = null
      saveConfig()
      updateTtStatus()
      return
    }
    ttStatus.textContent = 'Opening browser…'
    ttStatus.className = 'yt-status'
    const result = await window.api.tiktok.auth(state.config.tiktok.clientKey, state.config.tiktok.clientSecret)
    if (result.ok) {
      state.config.tiktok.refreshToken = result.refreshToken
      state.config.tiktok.accessToken  = result.accessToken
      state.config.tiktok.openId       = result.openId
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

  const twCreds = state.config.twitch || {}
  twitchChannelInput.value   = twCreds.channel  || ''
  twitchClientIdInput.value  = twCreds.clientId || ''
  twitchClientSecInput.value = twCreds.clientSecret || ''

  twitchChannelInput.disabled   = true
  twitchClientIdInput.disabled  = true
  twitchClientSecInput.disabled = true
  twitchClientIdInput.closest('label').style.display  = 'none'
  twitchClientSecInput.closest('label').style.display = 'none'
  twitchSaveBtn.textContent     = 'Edit Twitch Settings'
  twitchSaveBtn.className       = 'btn-secondary'

  function updateTwitchStatus() {
    const hasCreds  = !!(state.config.twitch?.clientId && state.config.twitch?.clientSecret)
    const hasTokens = !!(state.config.twitch?.refreshToken)
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

  // Check if browser cookies still exist
  if (state.config.twitch?.browserAuthenticated) {
    window.api.browser.checkCookies('persist:twitch-chat', 'twitch.tv').then(res => {
      if (!res.hasCookies) {
        state.config.twitch.browserAuthenticated = false
        saveConfig()
      }
    })
  }

  twitchSaveBtn.addEventListener('click', () => {
    if (twitchChannelInput.disabled) {
      twitchChannelInput.disabled   = false
      twitchClientIdInput.disabled  = false
      twitchClientSecInput.disabled = false
      twitchClientIdInput.closest('label').style.display  = ''
      twitchClientSecInput.closest('label').style.display = ''
      twitchSaveBtn.textContent     = 'Save Twitch Settings'
      twitchSaveBtn.className       = 'btn-primary'
      twitchChannelInput.focus()
    } else {
      state.config.twitch = {
        ...(state.config.twitch || {}),
        channel:      twitchChannelInput.value.trim(),
        clientId:     twitchClientIdInput.value.trim(),
        clientSecret: twitchClientSecInput.value.trim()
      }
      saveConfig()
      twitchChannelInput.disabled   = true
      twitchClientIdInput.disabled  = true
      twitchClientSecInput.disabled = true
      twitchClientIdInput.closest('label').style.display  = 'none'
      twitchClientSecInput.closest('label').style.display = 'none'
      twitchSaveBtn.textContent     = 'Edit Twitch Settings'
      twitchSaveBtn.className       = 'btn-secondary'
      updateTwitchStatus()
    }
  })

  twitchConnectBtn.addEventListener('click', async () => {
    if (state.config.twitch?.refreshToken) {
      state.config.twitch.refreshToken = null
      state.config.twitch.accessToken  = null
      state.config.twitch.userId       = null
      saveConfig()
      updateTwitchStatus()
      return
    }
    twitchStatusEl.textContent = 'Opening browser…'
    twitchStatusEl.className   = 'yt-status'
    const result = await window.api.twitch.auth(state.config.twitch.clientId, state.config.twitch.clientSecret)
    if (result.ok) {
      state.config.twitch.refreshToken = result.refreshToken
      state.config.twitch.accessToken  = result.accessToken
      state.config.twitch.userId       = result.userId
      saveConfig()
      updateTwitchStatus()
    } else {
      twitchStatusEl.textContent = 'Auth failed: ' + result.error
      twitchStatusEl.className   = 'yt-status error'
    }
  })

  // Twitch chat/stream login
  // ── Kick settings ──
  const kickChannelInput  = document.getElementById('kick-channel')
  const kickClientIdInput = document.getElementById('kick-client-id')
  const kickClientSecInput = document.getElementById('kick-client-secret')
  const kickSaveBtn       = document.getElementById('btn-kick-save')
  const kickConnectBtn    = document.getElementById('btn-kick-connect')
  const kickStatusEl      = document.getElementById('kick-status')

  const kickCreds = state.config.kick || {}
  kickChannelInput.value   = kickCreds.channel      || ''
  kickClientIdInput.value  = kickCreds.clientId     || ''
  kickClientSecInput.value = kickCreds.clientSecret || ''

  // Hide credentials by default (edit/save toggle pattern)
  kickClientIdInput.disabled  = true
  kickClientSecInput.disabled = true
  kickClientIdInput.closest('label').style.display  = 'none'
  kickClientSecInput.closest('label').style.display = 'none'
  kickSaveBtn.textContent = 'Edit Kick Settings'
  kickSaveBtn.className   = 'btn-secondary'

  function updateKickStatus() {
    if (state.config.kick?.refreshToken) {
      kickStatusEl.textContent = '● Connected'
      kickStatusEl.className   = 'yt-status connected'
      kickConnectBtn.textContent = 'Disconnect'
      kickConnectBtn.disabled    = false
    } else {
      const hasCreds = !!(state.config.kick?.clientId && state.config.kick?.clientSecret)
      kickStatusEl.textContent = hasCreds ? 'Not connected' : 'Enter credentials first'
      kickStatusEl.className   = 'yt-status'
      kickConnectBtn.disabled  = !hasCreds
      kickConnectBtn.textContent = 'Connect'
    }
  }
  updateKickStatus()

  // Check if browser cookies still exist
  if (state.config.kick?.browserAuthenticated) {
    window.api.browser.checkCookies('persist:kick-chat', 'kick.com').then(res => {
      if (!res.hasCookies) {
        state.config.kick.browserAuthenticated = false
        saveConfig()
      }
    })
  }

  kickSaveBtn.addEventListener('click', () => {
    const editing = kickClientIdInput.disabled
    if (editing) {
      kickClientIdInput.disabled  = false
      kickClientSecInput.disabled = false
      kickClientIdInput.closest('label').style.display  = ''
      kickClientSecInput.closest('label').style.display = ''
      document.getElementById('kick-cookie-section').style.display = ''
      kickSaveBtn.textContent = 'Save Kick Settings'
      kickSaveBtn.className   = 'btn-primary'
      kickClientIdInput.focus()
    } else {
      if (!state.config.kick) state.config.kick = {}
      state.config.kick.channel      = kickChannelInput.value.trim()
      state.config.kick.clientId     = kickClientIdInput.value.trim()
      state.config.kick.clientSecret = kickClientSecInput.value.trim()
      saveConfig()
      kickClientIdInput.disabled  = true
      kickClientSecInput.disabled = true
      kickClientIdInput.closest('label').style.display  = 'none'
      kickClientSecInput.closest('label').style.display = 'none'
      document.getElementById('kick-cookie-section').style.display = 'none'
      kickSaveBtn.textContent = 'Edit Kick Settings'
      kickSaveBtn.className   = 'btn-secondary'
      if (window._kickStreamAPI) window._kickStreamAPI.loadKickChat()
      updateKickStatus()
    }
  })

  kickConnectBtn.addEventListener('click', async () => {
    if (state.config.kick?.refreshToken) {
      state.config.kick.refreshToken = null
      state.config.kick.accessToken  = null
      state.config.kick.userId       = null
      saveConfig()
      updateKickStatus()
      return
    }
    kickConnectBtn.disabled = true
    kickStatusEl.textContent = 'Waiting for browser…'
    const result = await window.api.kick.auth(state.config.kick.clientId, state.config.kick.clientSecret)
    if (result.ok) {
      state.config.kick.refreshToken = result.refreshToken
      state.config.kick.accessToken  = result.accessToken
      state.config.kick.userId       = result.userId
      saveConfig()
      kickStatusEl.textContent = '✓ Connected'
      kickStatusEl.className   = 'yt-status connected'
    } else {
      kickStatusEl.textContent = 'Auth failed: ' + result.error
      kickStatusEl.className   = 'yt-status error'
    }
    updateKickStatus()
  })

  // Kick chat/stream login
  // Browser tabs
  const tabList = document.getElementById('browser-tab-list')

  function renderBrowserTabList() {
    tabList.innerHTML = ''

    state.config.pinnedTabs.forEach((tab, i) => {
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
        const moved = state.config.pinnedTabs.splice(dragSrcIdx, 1)[0]
        state.config.pinnedTabs.splice(dropIdx, 0, moved)
        window._pinnedTabAPI.reorder(state.config.pinnedTabs.map(t => t.id))
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

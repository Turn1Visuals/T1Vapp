const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { exec, spawn } = require('child_process')
const OBSWebSocket = require('obs-websocket-js').default

const obs = new OBSWebSocket()
let obsConnected = false

let CONFIG_PATH

function getConfigPath() {
  if (!CONFIG_PATH) CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
  return CONFIG_PATH
}

function loadConfig() {
  const CONFIG_PATH = getConfigPath()
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaults = {
      launchers: [],
      obs: { host: 'localhost', port: 4455, password: '' },
      overlayUrl: 'http://localhost:5173/',
      browserTabs: [],
      windowBounds: { width: 1280, height: 800 }
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2))
    return defaults
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}

function saveConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
}

let mainWindow

function createWindow() {
  const config = loadConfig()
  const bounds = config.windowBounds || { width: 1280, height: 800 }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0e0e0e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize()
    const cfg = loadConfig()
    cfg.windowBounds = { width, height }
    saveConfig(cfg)
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Patch webview contents to pass bot/CAPTCHA checks ────────────────────────
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

app.on('web-contents-created', (_, contents) => {
  contents.setUserAgent(CHROME_UA)
  contents.on('dom-ready', () => {
    contents.executeJavaScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      if (!window.chrome) window.chrome = { runtime: {}, app: { isInstalled: false } };
    `).catch(() => {})
  })
})

// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('launcher:getIcon', async (_, filePath) => {
  try {
    const icon = await app.getFileIcon(filePath, { size: 'large' })
    return icon.toDataURL()
  } catch { return null }
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Add Launcher'
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('config:load', () => loadConfig())

ipcMain.handle('config:save', (_, config) => {
  saveConfig(config)
  return true
})

ipcMain.handle('launcher:run', (_, launcherPath) => {
  const ext = path.extname(launcherPath).toLowerCase()
  if (ext === '.bat' || ext === '.cmd') {
    exec(`"${launcherPath}"`, { shell: true })
  } else if (ext === '.lnk' || ext === '.exe' || ext === '') {
    shell.openPath(launcherPath)
  } else {
    shell.openPath(launcherPath)
  }
  return true
})

// ── OBS handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('obs:connect', async () => {
  const config = loadConfig()
  const { host, port, password } = config.obs || {}
  try {
    await obs.connect(`ws://${host || 'localhost'}:${port || 4455}`, password || undefined)
    obsConnected = true
    return { ok: true }
  } catch (e) {
    obsConnected = false
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:disconnect', async () => {
  try { await obs.disconnect() } catch {}
  obsConnected = false
  return { ok: true }
})

ipcMain.handle('obs:startStream', async () => {
  try {
    await obs.call('StartStream')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:stopStream', async () => {
  try {
    await obs.call('StopStream')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:getStatus', async () => {
  try {
    const res = await obs.call('GetStreamStatus')
    return { ok: true, streaming: res.outputActive }
  } catch (e) {
    return { ok: false, streaming: false }
  }
})

obs.on('StreamStateChanged', (data) => {
  if (mainWindow) mainWindow.webContents.send('obs:streamState', data.outputActive)
})

obs.on('ConnectionClosed', () => {
  obsConnected = false
  if (mainWindow) mainWindow.webContents.send('obs:disconnected')
})

ipcMain.handle('app:checkUrl', (_, url) => {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume()
        resolve({ ok: true })
      })
      req.on('error', () => resolve({ ok: false }))
      req.on('timeout', () => { req.destroy(); resolve({ ok: false }) })
    } catch { resolve({ ok: false }) }
  })
})

ipcMain.handle('app:openExternal', (_, url) => shell.openExternal(url))

// ── Media handlers ────────────────────────────────────────────────────────────
ipcMain.handle('media:pickVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }]
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('media:pickJson', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Session Data',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('media:readJson', (_, filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  catch { return null }
})

// ── YouTube OAuth ─────────────────────────────────────────────────────────────
const YOUTUBE_REDIRECT_PORT = 8985
const YOUTUBE_REDIRECT_URI  = `http://localhost:${YOUTUBE_REDIRECT_PORT}`
const YOUTUBE_SCOPES        = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube'

ipcMain.handle('youtube:auth', (_, clientId, clientSecret) => {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url   = new URL(req.url, YOUTUBE_REDIRECT_URI)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="background:#0e0e0e;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>' +
        (code ? '✓ Connected! You can close this tab.' : '✗ Auth failed. You can close this tab.') +
        '</p></body></html>')

      server.close()

      if (error || !code) {
        resolve({ ok: false, error: error || 'No code received' })
        return
      }

      // Exchange code for tokens
      try {
        const params = new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  YOUTUBE_REDIRECT_URI,
          grant_type:    'authorization_code'
        })
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        })
        const tokens = await tokenRes.json()
        if (tokens.error) {
          resolve({ ok: false, error: tokens.error_description || tokens.error })
        } else {
          resolve({ ok: true, accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
        }
      } catch (e) {
        resolve({ ok: false, error: e.message })
      }
    })

    server.listen(YOUTUBE_REDIRECT_PORT, () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id',     clientId)
      authUrl.searchParams.set('redirect_uri',  YOUTUBE_REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope',         YOUTUBE_SCOPES)
      authUrl.searchParams.set('access_type',   'offline')
      authUrl.searchParams.set('prompt',        'consent')
      shell.openExternal(authUrl.toString())
    })

    server.on('error', (e) => resolve({ ok: false, error: e.message }))
  })
})

async function youtubeRefreshAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  })
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data.access_token
}

ipcMain.handle('youtube:upload', async (_, { filePath, title, description, tags, visibility, categoryId, clientId, clientSecret, refreshToken }) => {
  try {
    // Always refresh to get a fresh access token
    const accessToken = await youtubeRefreshAccessToken(clientId, clientSecret, refreshToken)

    const fileSize = fs.statSync(filePath).size
    const tagList  = tags
      .split(/\s+/)
      .filter(t => t.startsWith('#'))
      .map(t => t.slice(1))

    // Build description with hashtags appended
    const fullDescription = description + (tagList.length ? '\n\n' + tags : '')

    const metadata = {
      snippet: {
        title,
        description: fullDescription,
        tags: tagList,
        categoryId: categoryId || '17'
      },
      status: { privacyStatus: visibility, selfDeclaredMadeForKids: false }
    }

    // Step 1: initiate resumable upload session
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method:  'POST',
        headers: {
          Authorization:           `Bearer ${accessToken}`,
          'Content-Type':          'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(fileSize)
        },
        body: JSON.stringify(metadata)
      }
    )

    if (!initRes.ok) {
      const err = await initRes.text()
      return { ok: false, error: `Init failed: ${initRes.status} ${err}` }
    }

    const uploadUrl = initRes.headers.get('location')
    if (!uploadUrl) return { ok: false, error: 'No upload URL returned' }

    // Step 2: upload the file
    const fileBuffer = fs.readFileSync(filePath)
    const uploadRes  = await fetch(uploadUrl, {
      method:  'PUT',
      headers: {
        'Content-Type':   'video/*',
        'Content-Length': String(fileSize)
      },
      body: fileBuffer
    })

    if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
      const err = await uploadRes.text()
      return { ok: false, error: `Upload failed: ${uploadRes.status} ${err}` }
    }

    const video = await uploadRes.json()
    return { ok: true, videoId: video.id, url: `https://youtu.be/${video.id}` }

  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── TikTok OAuth + Upload ─────────────────────────────────────────────────────
const TIKTOK_REDIRECT_URI  = 'https://turn1visuals.com/tiktok-callback'
const TIKTOK_LOCAL_PORT    = 8986

ipcMain.handle('tiktok:auth', (_, clientKey, clientSecret) => {
  return new Promise((resolve) => {
    const crypto       = require('crypto')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    const server = http.createServer(async (req, res) => {
      const url   = new URL(req.url, `http://localhost:${TIKTOK_LOCAL_PORT}`)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      // Ignore requests without code or error (e.g. favicon)
      if (!code && !error) {
        res.writeHead(204)
        res.end()
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="background:#0e0e0e;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>' +
        (code ? '✓ Connected! You can close this tab.' : '✗ Auth failed. You can close this tab.') +
        '</p></body></html>')

      server.close()

      if (error || !code) { resolve({ ok: false, error: error || 'No code received' }); return }

      try {
        const params = new URLSearchParams({
          client_key:    clientKey,
          client_secret: clientSecret,
          code,
          grant_type:    'authorization_code',
          redirect_uri:  TIKTOK_REDIRECT_URI,
          code_verifier: codeVerifier
        })
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        })
        const data = await tokenRes.json()
        if (data.access_token) {
          resolve({ ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, openId: data.open_id })
        } else {
          resolve({ ok: false, error: JSON.stringify(data) })
        }
      } catch (e) { resolve({ ok: false, error: e.message }) }
    })

    server.listen(TIKTOK_LOCAL_PORT, () => {
      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/')
      authUrl.searchParams.set('client_key',            clientKey)
      authUrl.searchParams.set('scope',                 'user.info.basic,video.upload')
      authUrl.searchParams.set('response_type',         'code')
      authUrl.searchParams.set('redirect_uri',          TIKTOK_REDIRECT_URI)
      authUrl.searchParams.set('state',                 crypto.randomBytes(8).toString('hex'))
      authUrl.searchParams.set('code_challenge',        codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      shell.openExternal(authUrl.toString())
    })

    server.on('error', (e) => resolve({ ok: false, error: e.message }))
  })
})

ipcMain.handle('youtube:getLiveBroadcast', async () => {
  const cfg = loadConfig()
  const yt = cfg.youtube || {}
  if (!yt.refreshToken) return { ok: false, error: 'Not connected' }
  try {
    const accessToken = await youtubeRefreshAccessToken(yt.clientId, yt.clientSecret, yt.refreshToken)
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet&broadcastStatus=active&broadcastType=all',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json()
    const broadcast = data.items?.[0]
    if (!broadcast) return { ok: false, error: 'No active broadcast' }
    return { ok: true, videoId: broadcast.id, liveChatId: broadcast.snippet?.liveChatId, title: broadcast.snippet?.title }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('youtube:sendChat', async (_, { message, liveChatId }) => {
  const cfg = loadConfig()
  const yt = cfg.youtube || {}
  if (!yt.refreshToken) return { ok: false, error: 'Not connected' }
  try {
    const accessToken = await youtubeRefreshAccessToken(yt.clientId, yt.clientSecret, yt.refreshToken)
    const res = await fetch('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: message }
        }
      })
    })
    const data = await res.json()
    if (data.error) return { ok: false, error: data.error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('youtube:goLive', async (_, { title, description }) => {
  const cfg = loadConfig()
  const yt = cfg.youtube || {}
  if (!yt.refreshToken) return { ok: false, error: 'Not connected to YouTube' }
  try {
    const accessToken = await youtubeRefreshAccessToken(yt.clientId, yt.clientSecret, yt.refreshToken)

    // 1. Create broadcast
    const broadcastRes = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status,contentDetails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { title, description: description || '', scheduledStartTime: new Date().toISOString() },
        status:  { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        contentDetails: { enableAutoStart: true, enableAutoStop: true, enableEmbed: true }
      })
    })
    const broadcastData = await broadcastRes.json()
    if (broadcastData.error) return { ok: false, error: broadcastData.error.message }
    const broadcastId = broadcastData.id

    // 2. Get default stream
    const streamsRes = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=id&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const streamsData = await streamsRes.json()
    const streamId = streamsData.items?.[0]?.id
    if (!streamId) return { ok: false, error: 'No default stream found — set up a stream in YouTube Studio first' }

    // 3. Bind broadcast to stream
    const bindRes = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&streamId=${streamId}&part=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const bindData = await bindRes.json()
    if (bindData.error) return { ok: false, error: bindData.error.message }

    return { ok: true, broadcastId }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})


// ── Twitch OAuth + Chat ───────────────────────────────────────────────────────
const TWITCH_REDIRECT_PORT = 80
const TWITCH_REDIRECT_URI  = `http://localhost`

ipcMain.handle('twitch:auth', (_, clientId, clientSecret) => {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url   = new URL(req.url, TWITCH_REDIRECT_URI)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (!code && !error) { res.writeHead(204); res.end(); return }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="background:#0e0e0e;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>' +
        (code ? '✓ Connected! You can close this tab.' : '✗ Auth failed.') +
        '</p></body></html>')
      server.close()

      if (error || !code) { resolve({ ok: false, error: error || 'No code received' }); return }

      try {
        const params = new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          code, grant_type: 'authorization_code', redirect_uri: TWITCH_REDIRECT_URI
        })
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        })
        const data = await tokenRes.json()
        if (!data.access_token) { resolve({ ok: false, error: JSON.stringify(data) }); return }

        const userRes = await fetch('https://api.twitch.tv/helix/users', {
          headers: { Authorization: `Bearer ${data.access_token}`, 'Client-Id': clientId }
        })
        const userData = await userRes.json()
        const userId = userData.data?.[0]?.id
        resolve({ ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, userId })
      } catch (e) { resolve({ ok: false, error: e.message }) }
    })

    server.listen(TWITCH_REDIRECT_PORT, () => {
      const authUrl = new URL('https://id.twitch.tv/oauth2/authorize')
      authUrl.searchParams.set('client_id',     clientId)
      authUrl.searchParams.set('redirect_uri',  TWITCH_REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope',         'user:write:chat user:read:chat channel:manage:broadcast')
      shell.openExternal(authUrl.toString())
    })
    server.on('error', (e) => resolve({ ok: false, error: e.message }))
  })
})

async function twitchRefreshAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    grant_type: 'refresh_token', refresh_token: refreshToken
  })
  const res  = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(JSON.stringify(data))
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

ipcMain.handle('twitch:sendChat', async (_, { message }) => {
  const cfg = loadConfig()
  const tw  = cfg.twitch || {}
  if (!tw.refreshToken) return { ok: false, error: 'Not connected' }
  try {
    const { accessToken, refreshToken: newRefresh } = await twitchRefreshAccessToken(tw.clientId, tw.clientSecret, tw.refreshToken)
    cfg.twitch.refreshToken = newRefresh
    saveConfig(cfg)

    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${tw.channel}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': tw.clientId }
    })
    const userData = await userRes.json()
    const broadcasterId = userData.data?.[0]?.id
    if (!broadcasterId) return { ok: false, error: 'Channel not found' }

    const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': tw.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: tw.userId, message })
    })
    const data = await res.json()
    if (data.error) return { ok: false, error: data.message || data.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('twitch:setTitle', async (_, { title, category, tags }) => {
  const cfg = loadConfig()
  const tw  = cfg.twitch || {}
  if (!tw.refreshToken) return { ok: false, error: 'Not connected to Twitch' }
  try {
    const { accessToken, refreshToken: newRefresh } = await twitchRefreshAccessToken(tw.clientId, tw.clientSecret, tw.refreshToken)
    cfg.twitch.refreshToken = newRefresh
    saveConfig(cfg)

    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${tw.channel}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': tw.clientId }
    })
    const userData = await userRes.json()
    const broadcasterId = userData.data?.[0]?.id
    if (!broadcasterId) return { ok: false, error: 'Channel not found' }

    const body = { title }

    if (category) {
      const gameRes = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(category)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': tw.clientId }
      })
      const gameData = await gameRes.json()
      const gameId = gameData.data?.[0]?.id
      if (gameId) body.game_id = gameId
    }

    if (tags) {
      body.tags = tags.split(',').map(t => t.trim()).filter(Boolean)
    }

    const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': tw.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const data = await res.json()
      return { ok: false, error: data.message || 'Failed to update channel' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('tiktok:upload', async (_, { filePath, title, description, privacyLevel, clientKey, clientSecret, refreshToken }) => {
  try {
    // Refresh access token
    const refreshParams = new URLSearchParams({
      client_key:    clientKey,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken
    })
    const refreshRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: refreshParams.toString()
    })
    const refreshData = await refreshRes.json()
    if (!refreshData.access_token) return { ok: false, error: 'Token refresh failed: ' + JSON.stringify(refreshData) }
    const accessToken = refreshData.access_token

    const fileSize = fs.statSync(filePath).size

    // Step 1: initialize upload
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({
        source_info: {
          source:          'FILE_UPLOAD',
          video_size:      fileSize,
          chunk_size:      fileSize,
          total_chunk_count: 1
        }
      })
    })

    const initData = await initRes.json()
    if (!initData.data?.upload_url) return { ok: false, error: 'Init failed: ' + JSON.stringify(initData) }

    const uploadUrl = initData.data.upload_url
    const publishId = initData.data.publish_id

    // Step 2: upload file as single chunk
    const fileBuffer = fs.readFileSync(filePath)
    const uploadRes  = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type':  'video/mp4',
        'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
        'Content-Length': String(fileSize)
      },
      body: fileBuffer
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return { ok: false, error: `Upload failed: ${uploadRes.status} ${err}` }
    }

    // Poll publish status after a short delay
    await new Promise(r => setTimeout(r, 5000))
    try {
      const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({ publish_id: publishId })
      })
      const statusData = await statusRes.json()
      return { ok: true, publishId, status: statusData?.data?.status, statusRaw: JSON.stringify(statusData) }
    } catch {
      return { ok: true, publishId }
    }

  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('window:minimize', () => mainWindow.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.handle('window:close', () => mainWindow.close())

// ── Font Awesome ──────────────────────────────────────────────────────────────
const FA_SVGS = (() => {
  try { return path.join(path.dirname(require.resolve('@fortawesome/fontawesome-free/package.json')), 'svgs') }
  catch { return null }
})()

let faIndex = null

function buildFaIndex() {
  if (faIndex) return
  faIndex = new Map()
  if (!FA_SVGS) return
  for (const style of ['solid', 'brands', 'regular']) {
    try {
      for (const f of fs.readdirSync(path.join(FA_SVGS, style))) {
        if (!f.endsWith('.svg')) continue
        const name = f.slice(0, -4)
        if (!faIndex.has(name)) faIndex.set(name, [])
        faIndex.get(name).push(style)
      }
    } catch {}
  }
}

ipcMain.handle('fa:get', (_, style, name) => {
  if (!FA_SVGS) return null
  try { return { svg: fs.readFileSync(path.join(FA_SVGS, style, `${name}.svg`), 'utf8'), style, name } }
  catch { return null }
})

ipcMain.handle('fa:search', (_, query, style) => {
  buildFaIndex()
  if (!query) return []
  const q = query.toLowerCase()
  const results = []
  for (const [name, styles] of faIndex) {
    if (!name.includes(q)) continue
    const allowed = style ? [style] : ['solid', 'brands']
    const matchStyles = styles.filter(s => allowed.includes(s))
    for (const s of matchStyles) {
      try {
        const svg = fs.readFileSync(path.join(FA_SVGS, s, `${name}.svg`), 'utf8')
        results.push({ name, style: s, svg })
      } catch {}
    }
    if (results.length >= 40) break
  }
  return results
})

// ── Simple Icons ──────────────────────────────────────────────────────────────
let siBySlug = null
let siList = null

async function initSimpleIcons() {
  if (siBySlug) return
  try {
    const si = await import('simple-icons')
    siBySlug = new Map()
    siList = []
    for (const val of Object.values(si)) {
      if (val && typeof val === 'object' && val.slug && val.svg) {
        siBySlug.set(val.slug, val)
        siList.push({ slug: val.slug, title: val.title, hex: val.hex, svg: val.svg })
      }
    }
  } catch (e) {
    console.error('simple-icons load error:', e.message)
    siBySlug = new Map()
    siList = []
  }
}

ipcMain.handle('icons:get', async (_, slug) => {
  await initSimpleIcons()
  const icon = siBySlug.get(slug)
  if (!icon) return null
  return { svg: icon.svg, hex: icon.hex, title: icon.title, slug: icon.slug }
})

const ICON_ALIASES = {
  twitter: 'x', tweet: 'x', fb: 'facebook', ig: 'instagram',
  yt: 'youtube', tiktok: 'tiktok', discord: 'discord',
  twitch: 'twitch', linkedin: 'linkedin', reddit: 'reddit'
}

ipcMain.handle('icons:search', async (_, query) => {
  await initSimpleIcons()
  if (!query || query.length < 1) return []
  const raw = query.toLowerCase().replace(/[\s\-_]/g, '')
  const q = ICON_ALIASES[raw] || raw
  const exact = [], startsWith = [], partial = []
  for (const icon of siList) {
    const s = icon.slug.replace(/[\s\-_]/g, '')
    const t = icon.title.toLowerCase().replace(/[\s\-_]/g, '')
    if (s === q || t === q) exact.push(icon)
    else if (s.startsWith(q) || t.startsWith(q)) startsWith.push(icon)
    else if (s.includes(q) || t.includes(q)) partial.push(icon)
  }
  return [...exact, ...startsWith, ...partial]
    .slice(0, 20)
    .map(i => ({ slug: i.slug, title: i.title, hex: i.hex, svg: i.svg }))
})

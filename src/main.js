const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { exec, spawn } = require('child_process')
const OBSWebSocket = require('obs-websocket-js').default

app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,BlockThirdPartyCookies')

app.setAppUserModelId('com.turn1visuals.t1v-app')

const obs = new OBSWebSocket()
let obsConnected = false

let CONFIG_PATH

function getConfigPath() {
  if (!CONFIG_PATH) {
    const userDataPath = app.getPath('userData')
    CONFIG_PATH = path.join(userDataPath, 'config.json')
    console.log('[Config] AppData path:', userDataPath)
    console.log('[Config] Config file:', CONFIG_PATH)
  }
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
      windowBounds: { width: 1280, height: 800 },
      overlayMessage: { text: '', visible: false }
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
    ...(bounds.x != null ? { x: bounds.x, y: bounds.y } : {}),
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

  mainWindow.webContents.session.setPermissionCheckHandler((_, permission) => {
    return permission === 'media'
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_, permission, callback) => {
    callback(permission === 'media')
  })

  // Apply preload + header spoofing to browser and Kick partitions
  const kickPreload = path.join(__dirname, 'kick-preload.js')
  const KICK_CH_UA = '"Not_A Brand";v="8", "Chromium";v="131", "Google Chrome";v="131"'
  for (const partition of ['persist:browser', 'persist:kick-stream', 'persist:kick-chat']) {
    const ses = session.fromPartition(partition)
    ses.setPreloads([kickPreload])
    ses.setUserAgent(CHROME_UA)
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = details.requestHeaders
      h['Sec-CH-UA']          = KICK_CH_UA
      h['Sec-CH-UA-Mobile']   = '?0'
      h['Sec-CH-UA-Platform'] = '"Windows"'
      h['Accept-Language']    = 'en-US,en;q=0.9'
      delete h['x-electron-version']
      delete h['X-Electron-Version']
      callback({ requestHeaders: h })
    })
  }

  // Block FingerprintJS TURN/tracking requests from Kick partitions (causes noisy DNS errors)
  for (const p of ['persist:kick-stream', 'persist:kick-chat']) {
    session.fromPartition(p).webRequest.onBeforeRequest({ urls: ['*://*.fpjs.io/*'] }, (_, cb) => cb({ cancel: true }))
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.openDevTools()
    }
  })

  const saveBounds = () => {
    const [width, height] = mainWindow.getSize()
    const [x, y] = mainWindow.getPosition()
    const cfg = loadConfig()
    cfg.windowBounds = { width, height, x, y }
    saveConfig(cfg)
  }

  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
}

app.whenReady().then(() => {
  session.fromPartition('persist:overlay').clearCache()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Patch webview contents to pass bot/CAPTCHA checks ────────────────────────
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function openAuthPopup(url, openerContents) {
  const win = new BrowserWindow({
    width: 500, height: 700,
    title: 'Sign in',
    autoHideMenuBar: true,
    webPreferences: {
      partition: `temp:google-auth-${Date.now()}`,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  win.loadURL(url)
  // Proxy window.opener.postMessage back to the opener webview
  win.webContents.on('dom-ready', () => {
    win.webContents.executeJavaScript(`
      window.opener = {
        postMessage: (msg, origin) => {
          window._authMsg = msg;
          window._authOrigin = origin;
        },
        closed: false,
        location: { href: '' }
      };
    `).catch(() => {})
  })
  // Poll for the postMessage result and forward to opener
  const poll = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(poll); return }
    win.webContents.executeJavaScript('window._authMsg || null').then(msg => {
      if (msg && !openerContents.isDestroyed()) {
        openerContents.executeJavaScript(`window.postMessage(${JSON.stringify(msg)}, '*')`).catch(() => {})
        clearInterval(poll)
        win.close()
      }
    }).catch(() => {})
  }, 500)
}

function openAuthWindow(url) {
  const win = new BrowserWindow({
    width: 500, height: 700,
    title: 'Sign in',
    webPreferences: {
      partition: 'persist:browser',
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  win.loadURL(url)
}

app.on('web-contents-created', (_, contents) => {
  contents.setUserAgent(CHROME_UA)
  contents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('google.com/o/oauth2')) {
      openAuthPopup(url, contents)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  if (contents.getType() === 'webview') {
    contents.on('will-navigate', (e, url) => {
      if (url.includes('accounts.google.com') || url.includes('google.com/o/oauth2')) {
        e.preventDefault()
        openAuthWindow(url)
      }
    })
  }
  contents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.openDevTools()
    }
  })
  contents.on('dom-ready', () => {
    contents.executeJavaScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'vendor',    { get: () => 'Google Inc.' });
      if (navigator.userAgentData) {
        const brands = [
          { brand: 'Not_A Brand',   version: '8'   },
          { brand: 'Chromium',      version: '131' },
          { brand: 'Google Chrome', version: '131' },
        ];
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: () => Promise.resolve({ brands, mobile: false, platform: 'Windows' }),
          }),
        });
      }
      if (!window.chrome) window.chrome = {};
      window.chrome.runtime  = window.chrome.runtime  || {};
      window.chrome.app      = window.chrome.app      || { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' } };
      window.chrome.csi      = window.chrome.csi      || function() { return { startE: Date.now(), onloadT: Date.now(), pageT: 1, tran: 15 }; };
      window.chrome.loadTimes = window.chrome.loadTimes || function() { return { requestTime: Date.now() / 1000, startLoadTime: Date.now() / 1000, commitLoadTime: Date.now() / 1000, finishDocumentLoadTime: Date.now() / 1000, finishLoadTime: Date.now() / 1000, firstPaintTime: Date.now() / 1000, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: false, wasNpnNegotiated: false, npnNegotiatedProtocol: 'http/1.1', wasAlternateProtocolAvailable: false, connectionInfo: 'http/1.1' }; };
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

ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Circuit Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  })
  return result.canceled ? [] : result.filePaths
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

ipcMain.handle('overlayMessage:load', () => {
  const config = loadConfig()
  return config.overlayMessage || { text: '', visible: false }
})

ipcMain.handle('overlayMessage:save', (_, message) => {
  const config = loadConfig()
  config.overlayMessage = message
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

// ── Driver Mapping handlers ──────────────────────────────────────────────────
function getDriverMappingPath() {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'driverMapping.json')
}

function loadDriverMapping() {
  const mappingPath = getDriverMappingPath()
  if (!fs.existsSync(mappingPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
  } catch (e) {
    console.warn('[Driver Mapping] Failed to load:', e.message)
    return {}
  }
}

ipcMain.handle('driverMapping:load', () => {
  const mappingPath = getDriverMappingPath()
  if (!fs.existsSync(mappingPath)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
  } catch (e) {
    console.warn('[Driver Mapping] Failed to load:', e.message)
    return {}
  }
})

ipcMain.handle('driverMapping:save', (_, mapping) => {
  const mappingPath = getDriverMappingPath()
  try {
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2))
    return true
  } catch (e) {
    console.warn('[Driver Mapping] Failed to save:', e.message)
    return false
  }
})

// ── OBS handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('obs:connect', async () => {
  const config = loadConfig()
  const { host, port, password } = config.obs || {}
  const url = `ws://${host || 'localhost'}:${port || 4455}`
  console.log('[OBS] Attempting connection to:', url)
  try {
    await obs.connect(url, password || undefined)
    obsConnected = true
    console.log('[OBS] Connected successfully')
    return { ok: true }
  } catch (e) {
    obsConnected = false
    console.error('[OBS] Connection error:', e.message || e.reason || JSON.stringify(e))
    return { ok: false, error: e.message || e.reason || JSON.stringify(e) }
  }
})

ipcMain.handle('obs:disconnect', async () => {
  try { await obs.disconnect() } catch {}
  obsConnected = false
  return { ok: true }
})

ipcMain.handle('obs:call', async (event, method, params) => {
  try {
    const result = await obs.call(method, params)
    return result
  } catch (e) {
    throw new Error(e.message)
  }
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

ipcMain.handle('obs:getScenes', async () => {
  try {
    const res = await obs.call('GetSceneList')
    return { ok: true, scenes: res.scenes.map(s => s.sceneName).reverse(), current: res.currentProgramSceneName }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:getCurrentScene', async () => {
  try {
    const res = await obs.call('GetCurrentProgramScene')
    return { ok: true, name: res.currentProgramSceneName }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:setScene', async (_, sceneName) => {
  try {
    await obs.call('SetCurrentProgramScene', { sceneName })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:getStats', async () => {
  try {
    const [stats, streamStatus] = await Promise.all([
      obs.call('GetStats'),
      obs.call('GetStreamStatus')
    ])
    return {
      ok: true,
      cpu: stats.cpuUsage.toFixed(1),
      memory: (stats.memoryUsage / 1024).toFixed(1),
      fps: stats.activeFps.toFixed(1),
      droppedFrames: stats.renderSkippedFrames,
      streaming: streamStatus.outputActive,
      duration: streamStatus.outputDuration
    }
  } catch (e) {
    return { ok: false }
  }
})

ipcMain.handle('obs:getSources', async (_, sceneName) => {
  try {
    const res = await obs.call('GetSceneItemList', { sceneName })
    return { ok: true, sources: res.sceneItems.map(s => ({ id: s.sceneItemId, name: s.sourceName, visible: s.sceneItemEnabled })) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:getInputMuted', async (_, inputName) => {
  try {
    const res = await obs.call('GetInputMute', { inputName })
    return { ok: true, muted: res.inputMuted }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:setInputMute', async (_, inputName, muted) => {
  try {
    await obs.call('SetInputMute', { inputName, inputMuted: muted })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:getVirtualCamStatus', async () => {
  try {
    const res = await obs.call('GetVirtualCamStatus')
    return { ok: true, active: res.outputActive }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:startVirtualCam', async () => {
  try {
    await obs.call('StartVirtualCam')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:stopVirtualCam', async () => {
  try {
    await obs.call('StopVirtualCam')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:setSourceVisible', async (_, { sceneName, sceneItemId, visible }) => {
  try {
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: visible })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:refreshBrowserSources', async () => {
  try {
    const { scenes } = await obs.call('GetSceneList')
    for (const scene of scenes) {
      const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: scene.sceneName })
      for (const item of sceneItems) {
        if (item.inputKind === 'browser_source') {
          await obs.call('PressInputPropertiesButton', { inputName: item.sourceName, propertyName: 'refreshnocache' })
        }
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:refreshSceneSources', async (_, sceneName) => {
  try {
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName })
    for (const item of sceneItems) {
      if (item.inputKind === 'browser_source') {
        await obs.call('PressInputPropertiesButton', { inputName: item.sourceName, propertyName: 'refreshnocache' })
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('obs:getSceneScreenshot', async (_, sceneName) => {
  try {
    const res = await obs.call('GetSourceScreenshot', {
      sourceName: sceneName,
      imageFormat: 'jpg',
      imageWidth: 320,
      imageHeight: 180,
      imageCompressionQuality: 70
    })
    return { ok: true, imageData: res.imageData }
  } catch (e) {
    return { ok: false }
  }
})

obs.on('SceneItemEnableStateChanged', (data) => {
  if (mainWindow) mainWindow.webContents.send('obs:sourceVisibilityChanged', { sceneItemId: data.sceneItemId, visible: data.sceneItemEnabled })
})

obs.on('CurrentProgramSceneChanged', (data) => {
  if (mainWindow) mainWindow.webContents.send('obs:sceneChanged', data.sceneName)
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

ipcMain.handle('http:fetchJson', async (_, url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
})

const F1_ASSETS_PATH = () => path.join(app.getPath('userData'), 'f1-assets.json')

ipcMain.handle('f1assets:load', () => {
  const p = F1_ASSETS_PATH()
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf8'))
})

ipcMain.handle('f1assets:fetch', async () => {
  const BASE = 'https://turn1visuals.com/f1-2026-assets'
  const [dr, tr] = await Promise.all([
    fetch(`${BASE}/drivers.json`, { signal: AbortSignal.timeout(10000) }),
    fetch(`${BASE}/teams.json`,   { signal: AbortSignal.timeout(10000) }),
  ])
  if (!dr.ok) throw new Error(`drivers.json: HTTP ${dr.status}`)
  if (!tr.ok) throw new Error(`teams.json: HTTP ${tr.status}`)
  const data = {
    fetchedAt: new Date().toISOString(),
    drivers:   await dr.json(),
    teams:     await tr.json(),
  }
  fs.writeFileSync(F1_ASSETS_PATH(), JSON.stringify(data))
  return data
})

ipcMain.handle('app:openLoginWindow', (_, url) => {
  const ses = session.fromPartition('persist:browser')
  const win = new BrowserWindow({
    width: 1024, height: 768,
    title: 'Login',
    webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true }
  })
  win.setMenu(null)
  win.loadURL(url)
  win.webContents.setUserAgent(CHROME_UA)
  return new Promise((resolve) => {
    win.on('closed', () => resolve({ ok: true }))
  })
})

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
const TIKTOK_REDIRECT_URI  = 'https://turn1visuals.com/t1v-app/tiktok-callback'
const TIKTOK_LOCAL_PORT    = 8986

ipcMain.handle('tiktok:auth', (_, clientKey, clientSecret) => {
  return new Promise((resolve) => {
    const crypto        = require('crypto')
    const codeVerifier  = crypto.randomBytes(32).toString('base64url')
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
        (code ? '✓ Connected! You can close this window.' : '✗ Auth failed. You can close this window.') +
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
      authUrl.searchParams.set('scope',                 'user.info.basic,video.upload,video.publish')
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

ipcMain.handle('youtube:getViewers', async (_, { broadcastId }) => {
  const cfg = loadConfig()
  const yt = cfg.youtube || {}
  if (!yt.refreshToken) return { ok: false, error: 'Not connected' }
  if (!broadcastId) return { ok: false, error: 'No broadcast ID' }
  try {
    const accessToken = await youtubeRefreshAccessToken(yt.clientId, yt.clientSecret, yt.refreshToken)
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${broadcastId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json()
    const details = data.items?.[0]?.liveStreamingDetails
    if (!details) return { ok: false, error: 'No stream details' }
    return {
      ok: true,
      viewers: parseInt(details.concurrentViewers || '0', 10)
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('twitch:getViewers', async () => {
  const cfg = loadConfig()
  const tw = cfg.twitch || {}
  if (!tw.refreshToken) return { ok: false, error: 'Not connected' }
  const channel = tw.channel
  if (!channel) return { ok: false, error: 'No channel configured' }
  try {
    const { accessToken, refreshToken: newRefresh } = await twitchRefreshAccessToken(tw.clientId, tw.clientSecret, tw.refreshToken)
    cfg.twitch.refreshToken = newRefresh
    saveConfig(cfg)
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': tw.clientId }
    })
    const data = await res.json()
    const stream = data.data?.[0]
    if (!stream) return { ok: false, error: 'Not live' }
    return {
      ok: true,
      viewers: stream.viewer_count,
      startedAt: stream.started_at
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── Kick ────────────────────────────────────────────────────────────────────
const KICK_REDIRECT_PORT = 80
const KICK_REDIRECT_URI  = 'http://localhost'

function kickCodeVerifier() {
  return require('crypto').randomBytes(32).toString('base64url')
}
function kickCodeChallenge(verifier) {
  return require('crypto').createHash('sha256').update(verifier).digest('base64url')
}

async function kickRefreshAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: refreshToken,
    client_id: clientId, client_secret: clientSecret
  })
  const res  = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(JSON.stringify(data))
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

ipcMain.handle('kick:auth', (_, clientId, clientSecret) => {
  return new Promise((resolve) => {
    const verifier   = kickCodeVerifier()
    const challenge  = kickCodeChallenge(verifier)
    const server = http.createServer(async (req, res) => {
      const url   = new URL(req.url, KICK_REDIRECT_URI)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (!code && !error) { res.writeHead(204); res.end(); return }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="background:#0e0e0e;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>' +
        (code ? '✓ Connected! You can close this tab.' : '✗ Auth failed.') + '</p></body></html>')
      server.close()
      if (error || !code) { resolve({ ok: false, error: error || 'No code' }); return }
      try {
        const params = new URLSearchParams({
          grant_type: 'authorization_code', code,
          client_id: clientId, client_secret: clientSecret,
          redirect_uri: KICK_REDIRECT_URI, code_verifier: verifier
        })
        const tokenRes = await fetch('https://id.kick.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        })
        const data = await tokenRes.json()
        if (!data.access_token) { resolve({ ok: false, error: JSON.stringify(data) }); return }
        // Get user ID from Kick public API (authenticated)
        let userId = null
        const chRes  = await fetch('https://api.kick.com/public/v1/channels', {
          headers: { Authorization: `Bearer ${data.access_token}` }
        })
        const chData = await chRes.json()
        const ch = Array.isArray(chData?.data) ? chData.data[0] : chData?.data
        userId = ch?.broadcaster_user_id ?? null
        resolve({ ok: true, accessToken: data.access_token, refreshToken: data.refresh_token, userId })
      } catch (e) { resolve({ ok: false, error: e.message }) }
    })
    server.listen(KICK_REDIRECT_PORT, () => {
      const state   = require('crypto').randomBytes(16).toString('hex')
      const authUrl = new URL('https://id.kick.com/oauth/authorize')
      authUrl.searchParams.set('client_id',             clientId)
      authUrl.searchParams.set('redirect_uri',          KICK_REDIRECT_URI)
      authUrl.searchParams.set('response_type',         'code')
      authUrl.searchParams.set('scope',                 'user:read channel:read channel:write chat:write')
      authUrl.searchParams.set('state',                 state)
      authUrl.searchParams.set('code_challenge',        challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      console.log('[kick:auth] Opening:', authUrl.toString())
      shell.openExternal(authUrl.toString())
    })
    server.on('error', (e) => resolve({ ok: false, error: e.message }))
  })
})

ipcMain.handle('kick:sendChat', async (_, { message }) => {
  const cfg = loadConfig()
  const kk  = cfg.kick || {}
  if (!kk.refreshToken) return { ok: false, error: 'Not connected' }
  try {
    const { accessToken, refreshToken: newRefresh } = await kickRefreshAccessToken(kk.clientId, kk.clientSecret, kk.refreshToken)
    cfg.kick.refreshToken = newRefresh
    saveConfig(cfg)
    const payload = { type: 'user', content: message, broadcaster_user_id: Number(kk.userId) }
    const res = await fetch('https://api.kick.com/public/v1/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (!res.ok) console.error('[kick] sendChat failed:', res.status, JSON.stringify(data))
    return res.ok ? { ok: true } : { ok: false, error: data.message || JSON.stringify(data) }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('kick:setTitle', async (_, { title, tags }) => {
  const cfg = loadConfig()
  const kk  = cfg.kick || {}
  if (!kk.refreshToken) return { ok: false, error: 'Not connected to Kick' }
  try {
    const { accessToken, refreshToken: newRefresh } = await kickRefreshAccessToken(kk.clientId, kk.clientSecret, kk.refreshToken)
    cfg.kick.refreshToken = newRefresh
    saveConfig(cfg)
    const body = { stream_title: title }
    if (tags && tags.length) body.custom_tags = tags
    const res = await fetch('https://api.kick.com/public/v1/channels', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
  } catch (e) { return { ok: false, error: e.message } }
})

async function importKickCookiesFromBrowser() {
  const localAppData = process.env.LOCALAPPDATA
  const browsers = [
    { name: 'Chrome', base: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
    { name: 'Edge',   base: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
  ].filter(b => fs.existsSync(path.join(b.base, 'Local State')))

  if (!browsers.length) throw new Error('No Chrome or Edge installation found')

  const initSqlJs = require('sql.js')
  const wasmPath  = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const profiles = ['Default', 'Profile 1', 'Profile 2']
  const tmpCookies = path.join(app.getPath('temp'), 'kick_cookies_tmp.db')

  for (const browser of browsers) {
    // 1. Get AES key: read Local State → DPAPI-decrypt via PowerShell
    const localState = JSON.parse(fs.readFileSync(path.join(browser.base, 'Local State'), 'utf8'))
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key
    if (!encryptedKeyB64) continue

    const encryptedKeyBuf = Buffer.from(encryptedKeyB64, 'base64')
    const dpapiPayload    = encryptedKeyBuf.slice(5).toString('base64')
    const ps = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${dpapiPayload}'),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))`
    let aesKey
    try {
      const aesKeyB64 = require('child_process').execSync(`powershell -NoProfile -Command "${ps}"`).toString().trim()
      aesKey = Buffer.from(aesKeyB64, 'base64')
    } catch { continue }

    // 2. Find and copy the Cookies file
    let cookiesPath = null
    for (const p of profiles) {
      const candidate = path.join(browser.base, p, 'Network', 'Cookies')
      if (fs.existsSync(candidate)) { cookiesPath = candidate; break }
    }
    if (!cookiesPath) continue

    try {
      fs.copyFileSync(cookiesPath, tmpCookies)
      if (fs.existsSync(cookiesPath + '-wal')) fs.copyFileSync(cookiesPath + '-wal', tmpCookies + '-wal')
      if (fs.existsSync(cookiesPath + '-shm')) fs.copyFileSync(cookiesPath + '-shm', tmpCookies + '-shm')
    } catch (e) {
      if (e.code === 'EBUSY') throw new Error(`${browser.name} is running — please close it briefly and try again`)
      continue
    }

    // 3. Read kick.com cookies from SQLite
    const db   = new SQL.Database(fs.readFileSync(tmpCookies))
    fs.unlinkSync(tmpCookies)
    if (fs.existsSync(tmpCookies + '-wal')) fs.unlinkSync(tmpCookies + '-wal')
    if (fs.existsSync(tmpCookies + '-shm')) fs.unlinkSync(tmpCookies + '-shm')
    const rows = db.exec(`SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%kick.com%' AND name IN ('kick_session','session_token','XSRF-TOKEN')`)
    db.close()
    if (!rows.length || !rows[0].values.length) continue

    // 4. Decrypt each cookie value (v10: DPAPI+AES-GCM, v20: App-Bound — cannot decrypt)
    const cookies = {}
    for (const [name, encVal] of rows[0].values) {
      const buf = Buffer.from(encVal)
      const ver = buf.slice(0, 3).toString()
      if (ver === 'v20') throw new Error('Edge 127+ uses App-Bound Encryption — cookie values cannot be decrypted outside the browser. Use the manual paste option instead.')
      if (ver !== 'v10') { cookies[name] = buf.toString(); continue }
      const iv         = buf.slice(3, 15)
      const ciphertext = buf.slice(15, buf.length - 16)
      const tag        = buf.slice(buf.length - 16)
      const decipher   = require('crypto').createDecipheriv('aes-256-gcm', aesKey, iv)
      decipher.setAuthTag(tag)
      cookies[name] = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    }
    if (Object.keys(cookies).length) return cookies
  }

  throw new Error('No Kick cookies found — make sure you are logged in to kick.com in Chrome or Edge')
}

ipcMain.handle('kick:debugBrowserCookies', async () => {
  const localAppData = process.env.LOCALAPPDATA
  const browsers = [
    { name: 'Chrome', base: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
    { name: 'Edge',   base: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
  ]
  const profiles = ['Default', 'Profile 1', 'Profile 2']
  const cookiePaths = ['Network/Cookies', 'Cookies']
  const result = {}
  for (const b of browsers) {
    result[b.name] = { exists: fs.existsSync(b.base), cookiesFiles: [] }
    for (const p of profiles) {
      for (const cp of cookiePaths) {
        const full = path.join(b.base, p, cp)
        if (fs.existsSync(full)) result[b.name].cookiesFiles.push(full)
      }
    }
  }
  // Also try reading host_keys from Edge Default
  try {
    const initSqlJs = require('sql.js')
    const wasmPath  = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    const SQL = await initSqlJs({ locateFile: () => wasmPath })
    const edgeCookies = path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies')
    const edgeCookies2 = path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cookies')
    const cookiesFile = fs.existsSync(edgeCookies) ? edgeCookies : fs.existsSync(edgeCookies2) ? edgeCookies2 : null
    if (cookiesFile) {
      const tmp = path.join(app.getPath('temp'), 'kick_debug.db')
      fs.copyFileSync(cookiesFile, tmp)
      if (fs.existsSync(cookiesFile + '-wal')) fs.copyFileSync(cookiesFile + '-wal', tmp + '-wal')
      if (fs.existsSync(cookiesFile + '-shm')) fs.copyFileSync(cookiesFile + '-shm', tmp + '-shm')
      const db = new SQL.Database(fs.readFileSync(tmp))
      fs.unlinkSync(tmp)
      const tmpBuf = fs.readFileSync(tmp)
      result['Edge_file_size'] = tmpBuf.length
      result['Edge_file_header'] = tmpBuf.slice(0, 16).toString('utf8').replace(/\0/g, '\\0')
      result['Edge_wal_exists'] = fs.existsSync(cookiesFile + '-wal')
      const tables = db.exec(`SELECT name FROM sqlite_master WHERE type='table'`)
      result['Edge_tables'] = tables[0]?.values?.map(r => r[0]) ?? []
      const tbl = result['Edge_tables'].find(t => t.toLowerCase().includes('cookie')) || result['Edge_tables'][0]
      const rows = tbl ? db.exec(`SELECT DISTINCT host_key FROM ${tbl} WHERE host_key LIKE '%kick%'`) : []
      db.close()
      if (fs.existsSync(tmp + '-wal')) fs.unlinkSync(tmp + '-wal')
      if (fs.existsSync(tmp + '-shm')) fs.unlinkSync(tmp + '-shm')
      result['Edge_kick_hostkeys'] = rows[0]?.values?.map(r => r[0]) ?? []
    }
  } catch (e) { result['debug_error'] = e.message }
  return result
})

ipcMain.handle('kick:openLoginWindow', () => {
  return new Promise((resolve) => {
    const kickSes = session.fromPartition('persist:kick-stream')
    const win = new BrowserWindow({
      width: 1280, height: 800,
      title: 'Kick Login',
      webPreferences: {
        session: kickSes,
        preload: path.join(__dirname, 'kick-preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.setMenuBarVisibility(false)
    win.loadURL('https://kick.com/login')

    win.webContents.on('did-navigate', (_, url) => {
      if (url.includes('dashboard.kick.com') || (url.includes('kick.com') && !url.includes('/login'))) {
        setTimeout(() => { if (!win.isDestroyed()) win.close() }, 1500)
        resolve({ ok: true })
      }
    })

    win.on('closed', () => resolve({ ok: false, error: 'Window closed before login completed' }))
  })
})

ipcMain.handle('kick:importBrowserCookies', async () => {
  try {
    const cookies = await importKickCookiesFromBrowser()
    const ses = session.fromPartition('persist:kick-stream')
    const base = { url: 'https://kick.com', domain: '.kick.com', path: '/', secure: true, sameSite: 'lax' }
    if (cookies['kick_session'])  await ses.cookies.set({ ...base, name: 'kick_session',  value: cookies['kick_session'],  httpOnly: true })
    if (cookies['session_token']) await ses.cookies.set({ ...base, name: 'session_token', value: cookies['session_token'] })
    if (cookies['XSRF-TOKEN'])    await ses.cookies.set({ ...base, name: 'XSRF-TOKEN',    value: cookies['XSRF-TOKEN'] })
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('kick:checkSession', async () => {
  const cookies = await session.fromPartition('persist:kick-stream').cookies.get({ url: 'https://kick.com', name: 'kick_session' })
  if (!cookies.length) return { ok: false }
  const exp = cookies[0].expirationDate
  return { ok: true, expiresAt: exp ? new Date(exp * 1000).toLocaleDateString() : null }
})

ipcMain.handle('kick:injectCookies', async (_, { kickSession, sessionToken, xsrfToken }) => {
  try {
    const exp  = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 // 30 days
    const urls = ['https://kick.com', 'https://dashboard.kick.com']
    for (const partition of ['persist:kick-stream', 'persist:kick-chat']) {
      const ses = session.fromPartition(partition)
      for (const url of urls) {
        if (kickSession)  await ses.cookies.set({ url, domain: '.kick.com', path: '/', secure: true, sameSite: 'lax', httpOnly: true, expirationDate: exp, name: 'kick_session',  value: kickSession })
        if (sessionToken) await ses.cookies.set({ url, domain: '.kick.com', path: '/', secure: true, sameSite: 'lax',                 expirationDate: exp, name: 'session_token', value: sessionToken })
        if (xsrfToken)    await ses.cookies.set({ url, domain: '.kick.com', path: '/', secure: true, sameSite: 'lax',                 expirationDate: exp, name: 'XSRF-TOKEN',    value: xsrfToken })
      }
      await ses.cookies.flushStore()
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

function findChromePath() {
  const candidates = [
    path.join(process.env['PROGRAMFILES'],        'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'],   'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['LOCALAPPDATA'],        'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

async function importGoogleCookiesViaCDP() {
  const chromePath    = findChromePath()
  if (!chromePath) throw new Error('Chrome not found')

  // Check if Chrome is already running
  try {
    const out = require('child_process').execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', { encoding: 'utf8' })
    if (out.toLowerCase().includes('chrome.exe')) throw new Error('Chrome is still running — close it completely (including tray icon) and try again')
  } catch (e) { if (e.message.includes('Chrome is still running')) throw e }

  const srcUserDataDir = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
  const debugPort      = 9223
  const chromeErrors   = []

  // Read profile display names from Local State
  const localState   = JSON.parse(fs.readFileSync(path.join(srcUserDataDir, 'Local State'), 'utf8'))
  const infoCache    = localState?.profile?.info_cache ?? {}
  console.log('[google-import] Chrome profiles:', Object.entries(infoCache).map(([dir, v]) => `${dir} → ${v.name}`))

  // Find which profile directory matches the display name or has cookies
  const profileNames = Object.keys(infoCache).filter(dir =>
    fs.existsSync(path.join(srcUserDataDir, dir, 'Network', 'Cookies'))
  )
  if (!profileNames.length) throw new Error('No Chrome profile with cookies found')

  // Prefer a profile named "Turn1Visuals" or pick largest cookies file
  const profileName = profileNames.find(dir => infoCache[dir]?.name?.toLowerCase().includes('turn1'))
    ?? profileNames.sort((a, b) =>
        fs.statSync(path.join(srcUserDataDir, b, 'Network', 'Cookies')).size -
        fs.statSync(path.join(srcUserDataDir, a, 'Network', 'Cookies')).size
      )[0]
  console.log('[google-import] Using profile:', profileName, '→', infoCache[profileName]?.name)

  // Copy Local State + Cookies + Preferences to temp dir (required — Chrome blocks remote debugging on default dir)
  const tempDir = path.join(app.getPath('temp'), `t1v_chrome_${Date.now()}`)
  fs.mkdirSync(path.join(tempDir, 'Default', 'Network'), { recursive: true })
  fs.copyFileSync(path.join(srcUserDataDir, 'Local State'), path.join(tempDir, 'Local State'))
  fs.copyFileSync(path.join(srcUserDataDir, profileName, 'Network', 'Cookies'), path.join(tempDir, 'Default', 'Network', 'Cookies'))
  const prefsSrc = path.join(srcUserDataDir, profileName, 'Preferences')
  if (fs.existsSync(prefsSrc)) fs.copyFileSync(prefsSrc, path.join(tempDir, 'Default', 'Preferences'))

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempDir}`,
    '--profile-directory=Default',
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-default-apps',
    'about:blank',
  ], { detached: false })
  chrome.stderr?.on('data', d => chromeErrors.push(d.toString()))

  try {
    // Wait for CDP to be ready
    await new Promise((resolve, reject) => {
      const start = Date.now()
      const poll = () => {
        require('http').get(`http://127.0.0.1:${debugPort}/json/version`, res => {
          res.resume(); resolve()
        }).on('error', () => {
          if (Date.now() - start > 20000) reject(new Error(`Chrome did not start in time. ${chromeErrors.join(' ').slice(0, 200)}`))
          else setTimeout(poll, 300)
        })
      }
      poll()
    })

    // Get WebSocket URL
    const version = await new Promise((resolve, reject) => {
      require('http').get(`http://127.0.0.1:${debugPort}/json/version`, res => {
        let data = ''
        res.on('data', d => data += d)
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('Bad CDP response')) } })
      }).on('error', reject)
    })

    const wsUrl = version.webSocketDebuggerUrl
    const WebSocket = require('ws')

    const cookies = await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      ws.once('open', () => {
        // Give Chrome a moment to finish loading cookies from disk
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' }))
        }, 1500)
      })
      ws.on('message', raw => {
        const msg = JSON.parse(raw)
        if (msg.id === 1) {
          const all = msg.result?.cookies ?? []
          console.log('[google-import] Total CDP cookies:', all.length)
          resolve(all.filter(c => c.domain.includes('google.com') || c.domain.includes('youtube.com')))
          ws.close()
        }
      })
      ws.once('error', reject)
      setTimeout(() => reject(new Error('CDP timeout')), 15000)
    })

    return cookies.map(c => ({
      name: c.name, value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path, secure: c.secure, httpOnly: c.httpOnly,
      sameSite: c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : 'no_restriction',
      expirationDate: c.expires > 0 ? c.expires : undefined,
    }))
  } finally {
    chrome.kill()
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
}

let googleSignInChrome = null
let googleSignInTempDir = null

ipcMain.handle('browser:googleSignIn', async () => {
  const chromePath = findChromePath()
  if (!chromePath) return { ok: false, error: 'Chrome not found' }

  // Clean up previous session if any
  if (googleSignInChrome) { try { googleSignInChrome.kill() } catch {} }
  if (googleSignInTempDir) { try { fs.rmSync(googleSignInTempDir, { recursive: true, force: true }) } catch {} }

  googleSignInTempDir = path.join(app.getPath('temp'), `t1v_gsignin_${Date.now()}`)
  fs.mkdirSync(googleSignInTempDir, { recursive: true })

  const debugPort = 9224
  googleSignInChrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${googleSignInTempDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://accounts.google.com/signin',
  ], { detached: false })

  // Wait for CDP to be ready
  await new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => require('http').get(`http://127.0.0.1:${debugPort}/json/version`, res => {
      res.resume(); resolve()
    }).on('error', () => {
      if (Date.now() - start > 15000) reject(new Error('Chrome did not start'))
      else setTimeout(poll, 300)
    })
    poll()
  })
  return { ok: true, port: debugPort }
})

ipcMain.handle('browser:finishGoogleSignIn', async () => {
  if (!googleSignInChrome) return { ok: false, error: 'No sign-in session active' }
  const debugPort = 9224
  try {
    const version = await new Promise((resolve, reject) => {
      require('http').get(`http://127.0.0.1:${debugPort}/json/version`, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)))
      }).on('error', reject)
    })
    const targets = await new Promise((resolve, reject) => {
      require('http').get(`http://127.0.0.1:${debugPort}/json/list`, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)))
      }).on('error', reject)
    })
    const pageTarget = targets.find(t => t.type === 'page')
    if (!pageTarget) throw new Error('No page target found')

    const WebSocket = require('ws')
    const raw = await new Promise((resolve, reject) => {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
      ws.once('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }))
        ws.send(JSON.stringify({ id: 2, method: 'Network.getAllCookies' }))
      })
      ws.on('message', d => {
        const m = JSON.parse(d)
        if (m.id === 2) { resolve(m.result?.cookies ?? []); ws.close() }
      })
      ws.once('error', reject)
      setTimeout(() => reject(new Error('CDP timeout')), 5000)
    })
    const cookies = raw.filter(c => c.domain.includes('google.com') || c.domain.includes('youtube.com'))
    const ses = session.fromPartition('persist:browser')
    for (const c of cookies) {
      const url = `https://${c.domain.replace(/^\./, '')}`
      const sameSite = c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : 'no_restriction'
      try { await ses.cookies.set({ name: c.name, value: c.value, url, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite, expirationDate: c.expires > 0 ? c.expires : undefined }) } catch {}
    }
    await ses.cookies.flushStore()
    return { ok: true, count: cookies.length }
  } finally {
    try { googleSignInChrome.kill() } catch {}
    try { fs.rmSync(googleSignInTempDir, { recursive: true, force: true }) } catch {}
    googleSignInChrome = null
    googleSignInTempDir = null
  }
})

ipcMain.handle('browser:importGoogleSession', async () => {
  try {
    const cookies = await importGoogleCookiesViaCDP()
    const ses = session.fromPartition('persist:browser')
    for (const c of cookies) {
      const url = `https://${c.domain.replace(/^\./, '')}`
      try { await ses.cookies.set({ ...c, url }) } catch { /* skip invalid */ }
    }
    await ses.cookies.flushStore()
    const withValue = cookies.filter(c => c.value && c.value.length > 0).length
    console.log(`[google-import] ${cookies.length} cookies, ${withValue} with values`)
    cookies.slice(0, 5).forEach(c => console.log(`  ${c.name} = ${c.value ? c.value.slice(0,20) + '…' : '(empty)'}`))
    return { ok: true, count: cookies.length, withValue }
  } catch (e) { return { ok: false, error: e.message } }
})

let siteLoginChrome  = null
let siteLoginTempDir = null
let siteLoginDomain  = null

ipcMain.handle('browser:siteLogin', async (_, url) => {
  const chromePath = findChromePath()
  if (!chromePath) return { ok: false, error: 'Chrome not found' }

  if (siteLoginChrome)  { try { siteLoginChrome.kill() }                                              catch {} }
  if (siteLoginTempDir) { try { fs.rmSync(siteLoginTempDir, { recursive: true, force: true }) } catch {} }

  try { siteLoginDomain = new URL(url).hostname } catch { siteLoginDomain = url }
  siteLoginTempDir = path.join(app.getPath('temp'), `t1v_sitelogin_${Date.now()}`)
  fs.mkdirSync(siteLoginTempDir, { recursive: true })

  const debugPort = 9225
  console.log(`[site-login] Spawning Chrome for ${siteLoginDomain}...`)
  siteLoginChrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${siteLoginTempDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    url,
  ], { detached: false })
  siteLoginChrome.on('error', (err) => console.error(`[site-login] Chrome error: ${err.message}`))
  siteLoginChrome.on('exit', (code) => console.log(`[site-login] Chrome exited with code ${code}`))

  await new Promise((resolve, reject) => {
    const start = Date.now()
    const poll  = () => require('http').get(`http://127.0.0.1:${debugPort}/json/version`, res => {
      res.resume(); resolve()
    }).on('error', () => {
      if (Date.now() - start > 15000) reject(new Error('Chrome did not start'))
      else setTimeout(poll, 300)
    })
    poll()
  })
  console.log(`[site-login] Chrome started, session ready for ${siteLoginDomain}`)
  return { ok: true, domain: siteLoginDomain }
})

ipcMain.handle('browser:checkCookies', async (_, partition, domain) => {
  try {
    const ses = session.fromPartition(partition)
    const cookies = await ses.cookies.get({ domain })
    return { ok: true, count: cookies.length, hasCookies: cookies.length > 0 }
  } catch (err) {
    return { ok: false, error: err.message, hasCookies: false }
  }
})

ipcMain.handle('browser:injectCookie', async (_, partition, domain, name, value) => {
  try {
    const ses = session.fromPartition(partition)
    const url = `https://${domain}`
    await ses.cookies.set({ name, value, url, domain: `.${domain}` })
    await ses.cookies.flushStore()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('browser:finishSiteLogin', async (_, partitions = ['persist:browser']) => {
  if (!siteLoginChrome) return { ok: false, error: 'No login session active' }
  if (siteLoginChrome.killed) return { ok: false, error: 'Chrome window was closed — please keep it open until you click Done' }
  const debugPort = 9225
  // Ensure partitions is always an array
  const partitionList = Array.isArray(partitions) ? partitions : [partitions]

  try {
    console.log(`[site-login] Connecting to CDP at port ${debugPort}...`)
    const targets = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome connection timeout — keep the browser window open')), 3000)
      require('http').get(`http://127.0.0.1:${debugPort}/json/list`, res => {
        clearTimeout(timeout)
        let d = ''; res.on('data', c => d += c); res.on('end', () => {
          try { resolve(JSON.parse(d)) } catch (e) { reject(e) }
        })
      }).on('error', e => {
        clearTimeout(timeout)
        reject(e)
      })
    })
    const pageTarget = targets.find(t => t.type === 'page')
    if (!pageTarget) throw new Error('No page target found')

    const WebSocket = require('ws')
    const raw = await new Promise((resolve, reject) => {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
      ws.once('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }))
        ws.send(JSON.stringify({ id: 2, method: 'Network.getAllCookies' }))
      })
      ws.on('message', d => {
        const m = JSON.parse(d)
        if (m.id === 2) { resolve(m.result?.cookies ?? []); ws.close() }
      })
      ws.once('error', reject)
      setTimeout(() => reject(new Error('CDP timeout')), 5000)
    })

    // Keep all cookies for the logged-in domain (strip www. for broader match)
    const base    = siteLoginDomain?.replace(/^www\./, '') ?? ''
    const cookies = base ? raw.filter(c => c.domain.includes(base)) : raw

    // Inject into all requested partitions
    for (const partition of partitionList) {
      const ses = session.fromPartition(partition)
      for (const c of cookies) {
        const url      = `https://${c.domain.replace(/^\./, '')}`
        const sameSite = c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : 'no_restriction'
        try { await ses.cookies.set({ name: c.name, value: c.value, url, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite, expirationDate: c.expires > 0 ? c.expires : undefined }) } catch {}
      }
      await ses.cookies.flushStore()
    }
    console.log(`[site-login] imported ${cookies.length} cookies for ${base} into ${partitionList.length} partition(s)`)
    return { ok: true, count: cookies.length, domain: base }
  } catch (err) {
    console.error(`[site-login] Error: ${err.message}`)
    return { ok: false, error: err.message }
  } finally {
    try { siteLoginChrome.kill() }                                              catch {}
    try { fs.rmSync(siteLoginTempDir, { recursive: true, force: true }) } catch {}
    siteLoginChrome  = null
    siteLoginTempDir = null
    siteLoginDomain  = null
  }
})

ipcMain.handle('kick:getViewers', async (_, { channel }) => {
  try {
    const cfg = loadConfig()
    const kk  = cfg.kick || {}
    if (!kk.refreshToken) return { ok: false, error: 'Not connected' }
    const { accessToken, refreshToken: newRefresh } = await kickRefreshAccessToken(kk.clientId, kk.clientSecret, kk.refreshToken)
    cfg.kick.refreshToken = newRefresh
    saveConfig(cfg)
    const res  = await fetch('https://api.kick.com/public/v1/channels', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) return { ok: false }
    const data = await res.json()
    const ch = Array.isArray(data?.data) ? data.data[0] : data?.data
    const viewers = ch?.stream?.viewer_count ?? null
    // Cache userId if we didn't have it
    if (ch?.broadcaster_user_id && !cfg.kick.userId) {
      cfg.kick.userId = ch.broadcaster_user_id
      saveConfig(cfg)
    }
    return { ok: true, viewers }
  } catch (e) { return { ok: false, error: e.message } }
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
          source:            'FILE_UPLOAD',
          video_size:        fileSize,
          chunk_size:        fileSize,
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

// ── F1 Live Timing ────────────────────────────────────────────────────────────

// Set CACHE_DIR before any f1 module is first required.
// app.getPath('userData') is safe to call before ready on all platforms.
process.env.CACHE_DIR = path.join(app.getPath('userData'), 'f1-cache')

const { loadToken, saveToken }                      = require('./f1/token')
const { fetchSeasonIndex }                          = require('./f1/fetch')
const { isCached, appendCache, readCache, cachePath } = require('./f1/cache')
const { loadSession, parseEntry }                   = require('./f1/state-builder')
const { Playback }                                  = require('./f1/playback')
const { LiveFeed }                                  = require('./f1/livefeed')
const { getCircuitLayout }                          = require('./f1/circuits')
const { speak, warmup }                             = require('./tts')

// Engine state
let f1Playback        = null
let f1LiveFeed        = null
let f1LiveConnected   = false
let f1LoadedPath      = null
let f1Listeners     = new Set() // renderer webContents subscribed to state pushes

// ── Session state persistence ─────────────────────────────────────────────────
function f1StateFile() {
  return path.join(process.env.CACHE_DIR, '.session-state.json')
}

function f1SaveState() {
  if (!f1LoadedPath) return
  try {
    fs.writeFileSync(f1StateFile(), JSON.stringify({
      path:           f1LoadedPath,
      offsetMs:       f1Playback?.currentOffset ?? 0,
      streamStartUnix: f1Playback?.streamStartUnix ?? null
    }))
  } catch {}
}

function f1ClearState() {
  try { fs.unlinkSync(f1StateFile()) } catch {}
}

// Save state every 5s during playback (including live)
setInterval(() => {
  if (f1Playback?.playing && f1LoadedPath) f1SaveState()
}, 5000)

// Restore previous session on startup
app.whenReady().then(async () => {
  try {
    const saved = JSON.parse(fs.readFileSync(f1StateFile(), 'utf8'))
    if (!saved?.path) return

    if (saved.path === 'live' && isCached('live')) {
      // Replay cached live events to rebuild derived state, then reconnect live
      console.log('[f1] restoring live session from cache...')
      const timeline = readCache('live')
      f1Playback   = new Playback(timeline, saved.streamStartUnix)
      f1LoadedPath = 'live'
      // Seek to end of cache to rebuild all derived state (bestLapSectors etc.)
      await f1Playback.seek(f1Playback.duration)
      console.log(`[f1] cache replayed — ${timeline.length} events, reconnecting live...`)
      // Pass existing playback so startLiveFeed appends to it rather than replacing
      await startLiveFeed(f1Playback)
    } else if (saved.path !== 'live') {
      console.log(`[f1] restoring playback: ${saved.path} @ ${saved.offsetMs}ms`)
      const driverMapping = loadDriverMapping()
      const { timeline, streamStartUnix } = await loadSession(saved.path, driverMapping)
      f1Playback   = new Playback(timeline, streamStartUnix)
      f1LoadedPath = saved.path
      await f1Playback.seek(saved.offsetMs)
      f1Playback.start(1)
      console.log('[f1] session restored')
    }
    // Notify any renderer windows that subscribed before restore completed
    if (f1Playback && f1Listeners.size > 0) {
      const snap = f1Playback.getSnapshot()
      f1Push('snapshot', { state: statePayload(snap), clock: clockPayload(snap) })
    }
  } catch {}
})

// Push state to all subscribed renderer windows AND SSE clients (OBS overlays)
function f1Push(event, data) {
  for (const wc of f1Listeners) {
    if (!wc.isDestroyed()) wc.send(`f1:${event}`, data)
    else f1Listeners.delete(wc)
  }
  // sseClients/sseSend defined later but only called at runtime — always initialized by then
  for (const res of sseClients) sseSend(res, event, data)
}

// Snapshot helpers (same shape as original routes.js)
function sessionMeta(si) {
  const type = si?.Type ?? null, name = si?.Name ?? null
  if (type === 'Practice')                                   return { SessionCategory: 'practice',  SessionEvent: 'practice'   }
  if (type === 'Race'       && name === 'Sprint')            return { SessionCategory: 'sprint',    SessionEvent: 'race'       }
  if (type === 'Qualifying' && name === 'Sprint Qualifying') return { SessionCategory: 'sprint',    SessionEvent: 'qualifying' }
  if (type === 'Race')                                       return { SessionCategory: 'gp',        SessionEvent: 'race'       }
  if (type === 'Qualifying')                                 return { SessionCategory: 'gp',        SessionEvent: 'qualifying' }
  return { SessionCategory: null, SessionEvent: null }
}

function clockPayload(snap) {
  return {
    trackTime:           String(snap.clock.trackTime),
    systemTime:          String(Date.now()),
    paused:              !snap.clock.playing,
    liveTimingStartTime: String(snap.clock.streamStartUnix ?? 0),
    offset:              snap.clock.offset,
    duration:            snap.clock.duration,
  }
}

function statePayload(snap) {
  const s = snap.state
  const si = s['SessionInfo'] ?? null
  const driverMapping = loadDriverMapping()
  let driverList = s['DriverList'] ?? null

  // Apply driver mapping fallback to fill missing TeamName fields
  if (driverList && typeof driverList === 'object') {
    driverList = JSON.parse(JSON.stringify(driverList))
    for (const [racingNumber, driver] of Object.entries(driverList)) {
      if (driver && typeof driver === 'object' && !driver.TeamName && driverMapping[racingNumber]) {
        driver.TeamName = driverMapping[racingNumber]
      }
    }
  }

  return {
    SessionInfo:         si ? { ...si, ...sessionMeta(si) } : null,
    SessionData:         s['SessionData']          ?? null,
    SessionStatus:       s['SessionStatus']        ?? null,
    DriverList:          driverList,
    TimingData:          s['TimingData']            ?? null,
    TimingAppData:       s['TimingAppData']         ?? null,
    TimingStats:         s['TimingStats']           ?? null,
    RaceControlMessages: s['RaceControlMessages']   ?? null,
    TrackStatus:         s['TrackStatus']           ?? null,
    ExtrapolatedClock:   s['ExtrapolatedClock']     ?? null,
    TopThree:            s['TopThree']              ?? null,
    LapCount:            s['LapCount']              ?? null,
    WeatherData:         s['WeatherData']           ?? null,
    CarData:             s['CarData.z']             ?? null,
    BestLapSectors:      snap.bestLapSectors        ?? {},
    SessionPart:         snap.sessionPart           ?? null,
  }
}

// Ticker — pushes state to renderer at ~20fps
setInterval(async () => {
  if (!f1Playback || !f1Playback.playing || f1Listeners.size === 0) return
  try {
    await f1Playback.tick()
    const events = await f1Playback.drainNewEvents()
    if (!events.length) return
    const snap = f1Playback.getSnapshot()
    let stateChanged = false
    for (const evt of events) {
      if (evt.topic === 'Position.z') f1Push('position', { frames: evt.frames })
      else if (evt.topic === 'CarData.z') f1Push('cardata', { frames: evt.frames })
      else stateChanged = true
    }
    if (stateChanged) f1Push('state', { state: statePayload(snap), clock: clockPayload(snap) })
  } catch {}
}, 50)

// Clock sync
setInterval(() => {
  if (!f1Playback || f1Listeners.size === 0) return
  f1Push('clock', clockPayload(f1Playback.getSnapshot()))
}, 250)

// ── F1 IPC handlers ───────────────────────────────────────────────────────────

// Subscribe renderer to state pushes
ipcMain.on('f1:subscribe', (event) => {
  f1Listeners.add(event.sender)
  // Send current snapshot immediately on subscribe
  if (f1Playback) {
    const snap = f1Playback.getSnapshot()
    event.sender.send('f1:snapshot', { state: statePayload(snap), clock: clockPayload(snap) })
  }
})

ipcMain.handle('f1:sessions', async (_, year) => {
  const meetings = await fetchSeasonIndex(year ?? new Date().getFullYear())
  return meetings.flatMap(m =>
    (m.Sessions ?? []).filter(s => s.Path).map(s => ({
      meeting: m.Name, meetingKey: m.Key, session: s.Name, path: s.Path, cached: isCached(s.Path)
    }))
  )
})

ipcMain.handle('f1:load', async (_, sessionPath) => {
  // Disconnect live feed first so it doesn't override playback
  if (f1LiveFeed) { f1LiveFeed.disconnect(); f1LiveFeed = null; f1LiveConnected = false }
  const driverMapping = loadDriverMapping()
  const { timeline, streamStartUnix } = await loadSession(sessionPath, driverMapping)
  f1Playback   = new Playback(timeline, streamStartUnix)
  f1LoadedPath = sessionPath
  f1SaveState()
  if (f1Listeners.size) {
    const snap = f1Playback.getSnapshot()
    f1Push('snapshot', { state: statePayload(snap), clock: clockPayload(snap) })
  }
  return { ok: true, events: timeline.length, duration: f1Playback.duration }
})

ipcMain.handle('f1:play', async (_, speed = 1) => {
  if (!f1Playback) return { ok: false, error: 'no session loaded' }
  f1Playback.start(speed)
  return { ok: true }
})

ipcMain.handle('f1:pause', async () => {
  if (!f1Playback) return { ok: false, error: 'no session loaded' }
  f1Playback.pause()
  return { ok: true }
})

ipcMain.handle('f1:seek', async (_, offsetMs) => {
  if (!f1Playback) return { ok: false, error: 'no session loaded' }
  await f1Playback.seek(Number(offsetMs))
  if (f1Listeners.size) {
    const snap = f1Playback.getSnapshot()
    f1Push('snapshot', { state: statePayload(snap), clock: clockPayload(snap) })
  }
  return { ok: true, offsetMs: f1Playback.currentOffset }
})

ipcMain.handle('f1:status', () => {
  if (f1LiveConnected) return { loaded: true, live: true, playing: f1Playback?.playing ?? false, offset: f1Playback?.currentOffset ?? 0, duration: f1Playback?.duration ?? 0 }
  if (!f1Playback)     return { loaded: false }
  return { loaded: true, live: false, path: f1LoadedPath, playing: f1Playback.playing, offset: f1Playback.currentOffset, duration: f1Playback.duration, progress: f1Playback.currentOffset / f1Playback.duration }
})

ipcMain.handle('f1:unload', () => {
  if (f1LiveFeed) { f1LiveFeed.disconnect(); f1LiveFeed = null; f1LiveConnected = false }
  f1Playback?.pause()
  if (f1LoadedPath === 'live') try { fs.unlinkSync(cachePath('live')) } catch {}
  f1Playback   = null
  f1LoadedPath = null
  f1ClearState()
  f1Push('reset', {})
  return { ok: true }
})

// Clear live cache and start fresh, or attach to existing playback for restore
async function startLiveFeed(existingPlayback = null) {
  if (!existingPlayback) {
    // Fresh connect — clear old live cache and start new playback
    try { fs.unlinkSync(cachePath('live')) } catch {}
    const streamStartUnix = Date.now()
    f1Playback   = new Playback([], streamStartUnix)
    f1LoadedPath = 'live'
  }

  f1LiveFeed = new LiveFeed()

  let positionCalibrated = !!existingPlayback // skip re-calibration on restore
  f1LiveFeed.on('data', ({ topic, data }) => {
    const now   = Date.now()
    const event = { offset: now - f1Playback.streamStartUnix, topic, data }
    f1Playback.appendLive(topic, data, now)
    appendCache('live', event)
    if (!positionCalibrated && topic === 'Position.z') {
      positionCalibrated = true
      parseEntry(data).then(parsed => {
        const firstTs = parsed?.Position?.[0]?.Timestamp
        if (!firstTs) return
        const tsMs          = new Date(firstTs).getTime()
        const currentOffset = f1Playback.currentOffset
        f1Playback.calibratedStartUnix = tsMs - currentOffset
        console.log(`[f1] clock calibrated from Position.z — broadcast delay ~${Math.round(Date.now() - tsMs)}ms`)
      }).catch(() => {})
    }
  })
  f1LiveFeed.on('connected', () => {
    f1LiveConnected = true
    f1Playback.start(1)
    console.log('[f1] live connected')
  })
  f1LiveFeed.on('disconnected', () => {
    f1LiveConnected = false
    f1LiveFeed      = null
    f1Playback?.pause()
    f1Push('liveDisconnected', {})
    console.log('[f1] live disconnected')
  })
  f1LiveFeed.on('error', err => console.error('[f1] live error:', err.message))

  await f1LiveFeed.connect()
}

ipcMain.handle('f1:liveConnect', async () => {
  if (f1LiveFeed && f1LiveConnected) return { ok: true, already: true }
  if (f1LiveFeed) { f1LiveFeed.disconnect(); f1LiveFeed = null }
  try {
    await startLiveFeed()
    return { ok: true }
  } catch (e) {
    if (f1LiveFeed) { f1LiveFeed.disconnect(); f1LiveFeed = null }
    return { ok: false, error: e.message ?? 'Failed to connect' }
  }
})

ipcMain.handle('f1:liveDisconnect', () => {
  f1LiveFeed?.disconnect()
  f1LiveFeed      = null
  f1LiveConnected = false
  return { ok: true }
})

ipcMain.handle('f1:circuits', async (_, circuitKey, season) => {
  return getCircuitLayout(circuitKey, season)
})

ipcMain.handle('f1:rawFile', () => {
  if (!f1LoadedPath || f1LoadedPath === 'live') return null
  try {
    const p = cachePath(f1LoadedPath)
    const raw = fs.readFileSync(p, 'utf8')
    return { path: p, content: raw, size: fs.statSync(p).size }
  } catch { return null }
})

ipcMain.handle('f1:openCacheFolder', () => {
  shell.openPath(process.env.CACHE_DIR)
})

ipcMain.handle('f1:yearMeetings', async (_, year) => {
  const CIRCUIT_KEY_BY_SHORT_NAME = {
    'Sakhir': 63, 'Melbourne': 10, 'Shanghai': 49, 'Suzuka': 46,
    'Jeddah': 149, 'Miami': 151, 'Imola': 6, 'Monte Carlo': 22,
    'Catalunya': 15, 'Montréal': 23, 'Montreal': 23, 'Spielberg': 19, 'Silverstone': 2,
    'Spa-Francorchamps': 7, 'Hungaroring': 4, 'Zandvoort': 55, 'Monza': 39,
    'Baku': 144, 'Singapore': 61, 'Austin': 9, 'Mexico City': 65,
    'Interlagos': 14, 'Las Vegas': 152, 'Lusail': 150, 'Yas Marina Circuit': 70,
  }
  try {
    const res  = await fetch(`https://livetiming.formula1.com/static/${year}/Index.json`, { signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    const data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
    const seen = new Set()
    const meetings = []
    for (const m of data.Meetings ?? []) {
      const ck = m.Circuit?.Key
      if (!ck || seen.has(ck)) continue
      seen.add(ck)
      meetings.push({ circuitKey: ck, circuitName: m.Circuit?.ShortName ?? m.Location, location: m.Location ?? '' })
    }

    // Also pull the current/next meeting from event-tracker in case it's not in Index.json yet
    try {
      const etRes  = await fetch('https://api.formula1.com/v1/event-tracker', {
        headers: { apikey: 'xZ7AOODSjiQadLsIYWefQrpCSQVDbHGC', locale: 'en', 'content-type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      const et = await etRes.json()
      if (String(et.seasonContext?.seasonYear) === String(year) && et.fomRaceId) {
        // Try to get circuit key from event-tracker data
        let ck = CIRCUIT_KEY_BY_SHORT_NAME[et.race?.circuitShortName] ?? null
        if (ck && !seen.has(ck)) {
          seen.add(ck)
          meetings.push({
            circuitKey: ck,
            circuitName: et.race?.circuitShortName ?? et.race?.meetingLocation ?? '',
            location: et.race?.meetingLocation ?? '',
            upcoming: true,
          })
        }
      }
    } catch {}

    return { ok: true, meetings }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── Circuit images ────────────────────────────────────────────────────────────

function circuitsUserDir() {
  const d = path.join(app.getPath('userData'), 'circuits')
  fs.mkdirSync(d, { recursive: true })
  return d
}

ipcMain.handle('circuit:list', () => {
  return fs.readdirSync(circuitsUserDir())
    .filter(f => /^\d+\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => parseInt(f))
})

ipcMain.handle('circuit:import', (_, circuitKey, srcPath) => {
  const dest = path.join(circuitsUserDir(), `${circuitKey}.jpg`)
  fs.copyFileSync(srcPath, dest)
  return { ok: true }
})

ipcMain.handle('circuit:delete', (_, circuitKey) => {
  const dir = circuitsUserDir()
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    try { fs.unlinkSync(path.join(dir, `${circuitKey}${ext}`)) } catch {}
  }
  return { ok: true }
})

ipcMain.handle('circuit:getDataUrl', (_, circuitKey) => {
  const dir = circuitsUserDir()
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const file = path.join(dir, `${circuitKey}${ext}`)
    if (fs.existsSync(file)) {
      const buf  = fs.readFileSync(file)
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    }
  }
  return null
})

// ── F1 Auth ───────────────────────────────────────────────────────────────────

const F1_LOGIN_URL  = 'https://account.formula1.com/#/en/login?redirect=https%3A%2F%2Ff1tv.formula1.com%2F'
const COOKIE_DOMAIN = 'formula1.com'
const COOKIE_NAME   = 'login-session'

let f1LoginWin = null

function openF1LoginWindow() {
  if (f1LoginWin) { f1LoginWin.focus(); return }

  const ses = session.fromPartition('persist:f1login')
  f1LoginWin = new BrowserWindow({
    width: 520, height: 680, title: 'F1 Login',
    webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true },
  })
  f1LoginWin.loadURL(F1_LOGIN_URL)

  let pollInterval = null

  async function checkForToken() {
    const cookies = await ses.cookies.get({ domain: COOKIE_DOMAIN, name: COOKIE_NAME })
    if (!cookies.length) return
    try {
      const token = JSON.parse(decodeURIComponent(cookies[0].value)).data?.subscriptionToken
      if (!token) return
      clearInterval(pollInterval)
      saveToken(token)
      console.log('[f1] token saved')
      if (mainWindow) mainWindow.webContents.send('f1:authChanged')
      f1LoginWin.close()
    } catch {}
  }

  f1LoginWin.webContents.on('did-navigate', () => {
    clearInterval(pollInterval)
    pollInterval = setInterval(checkForToken, 500)
  })
  f1LoginWin.on('closed', () => { clearInterval(pollInterval); f1LoginWin = null })
}

ipcMain.handle('f1:openLogin', () => openF1LoginWindow())

ipcMain.handle('f1:authStatus', () => {
  const cached = loadToken()
  if (cached) return { loggedIn: true, expiresAt: new Date(cached.payload.exp * 1000).toISOString() }
  return { loggedIn: false, expiresAt: null }
})

ipcMain.handle('f1:logout', () => {
  const { unlinkSync, existsSync } = require('fs')
  const tokenPath = path.join(process.env.CACHE_DIR ?? path.join(app.getPath('userData'), 'f1-cache'), 'f1token.json')
  try { if (existsSync(tokenPath)) unlinkSync(tokenPath) } catch {}
  if (mainWindow) mainWindow.webContents.send('f1:authChanged')
  return { ok: true }
})

ipcMain.handle('clipboard:write', (_, text) => {
  try {
    require('electron').clipboard.writeText(text)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── Overlay HTTP server ───────────────────────────────────────────────────────

const OVERLAY_PORT = 47200
const OVERLAY_DIST  = path.join(__dirname, '../ui/dist')
const SHARED_FONTS  = path.join(__dirname, '../shared/fonts')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.json': 'application/json',
}

const sseClients = new Set()

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${OVERLAY_PORT}`)

  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Session status — lets overlay know if a session is loaded and whether it's live
  if (req.method === 'GET' && url.pathname === '/f1/status') {
    let payload
    if (f1LiveConnected) {
      payload = { loaded: true, live: true, playing: f1Playback?.playing ?? false, offset: f1Playback?.currentOffset ?? 0, duration: f1Playback?.duration ?? 0 }
    } else if (f1Playback) {
      payload = { loaded: true, live: false, path: f1LoadedPath, playing: f1Playback.playing, offset: f1Playback.currentOffset, duration: f1Playback.duration }
    } else {
      payload = { loaded: false }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(payload))
    return
  }

  // Debug: dump timing data to see driver status fields
  if (req.method === 'GET' && url.pathname === '/f1/debug/timing') {
    const snap = f1Playback?.getSnapshot()
    if (!snap) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ error: 'No session loaded' }))
      return
    }
    const timingData = snap.state?.TimingData
    if (!timingData?.Lines) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ error: 'No timing data' }))
      return
    }
    const sample = Object.entries(timingData.Lines).slice(0, 5).reduce((acc, [num, line]) => {
      acc[num] = line
      return acc
    }, {})
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ sample, keys: Object.keys(timingData.Lines[Object.keys(timingData.Lines)[0]] || {}) }))
    return
  }

  // Playback control endpoints — used by debug Controls overlay
  if (req.method === 'POST' && url.pathname === '/f1/play') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      const { speed = 1 } = body ? JSON.parse(body) : {}
      if (f1Playback) f1Playback.start(Number(speed))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }
  if (req.method === 'POST' && url.pathname === '/f1/pause') {
    if (f1Playback) f1Playback.pause()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }
  if (req.method === 'POST' && url.pathname === '/f1/seek') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      const { offsetMs = 0 } = body ? JSON.parse(body) : {}
      if (f1Playback) {
        await f1Playback.seek(Number(offsetMs))
        if (f1Listeners.size) f1Push('snapshot', { state: statePayload(f1Playback.getSnapshot()), clock: clockPayload(f1Playback.getSnapshot()) })
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }
  if (req.method === 'POST' && url.pathname === '/f1/unload') {
    if (f1LiveFeed) { f1LiveFeed.disconnect(); f1LiveFeed = null; f1LiveConnected = false }
    f1Playback?.pause()
    if (f1LoadedPath === 'live') try { fs.unlinkSync(cachePath('live')) } catch {}
    f1Playback   = null
    f1LoadedPath = null
    f1ClearState()
    f1Push('reset', {})
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }

  // Circuit layout — serves track map data to overlay
  const circuitMatch = url.pathname.match(/^\/f1\/circuits\/(\d+)\/(\d+)$/)
  if (req.method === 'GET' && circuitMatch) {
    getCircuitLayout(circuitMatch[1], circuitMatch[2]).then(data => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }).catch(e => {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // TTS — GET /tts?text=... returns WAV audio (cached on disk)
  if (req.method === 'GET' && url.pathname === '/tts') {
    const text = url.searchParams.get('text')
    if (!text) { res.writeHead(400); res.end('text required'); return }
    speak(text).then(buf => {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' })
      res.end(buf)
    }).catch(err => { res.writeHead(500); res.end(err.message) })
    return
  }

  // TTS warmup — POST /tts/warmup { phrases: string[] }
  if (req.method === 'POST' && url.pathname === '/tts/warmup') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      const { phrases = [] } = body ? JSON.parse(body) : {}
      warmup(phrases).catch(err => console.error('[tts] warmup error:', err.message))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, count: phrases.length }))
    })
    return
  }

  // Fonts — serve from shared/fonts directory
  if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
    const filePath = path.join(__dirname, '..', 'shared', 'fonts', url.pathname.replace('/fonts/', ''))
    try {
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.css': 'text/css', '.svg': 'image/svg+xml' }
        const contentType = mimeTypes[ext] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000', 'Access-Control-Allow-Origin': '*' })
        res.end(fs.readFileSync(filePath))
        return
      }
    } catch (e) {
      // File not found
    }
    res.writeHead(404)
    res.end('Not found')
    return
  }

  // Event tracker — proxy to F1 API, augmented with circuitKey
  if (req.method === 'GET' && url.pathname === '/f1/event-tracker') {
    const CIRCUIT_KEY_BY_SHORT_NAME = {
      'Sakhir': 63, 'Melbourne': 10, 'Shanghai': 49, 'Suzuka': 46,
      'Jeddah': 149, 'Miami': 151, 'Imola': 6, 'Monte Carlo': 22,
      'Catalunya': 15, 'Montréal': 23, 'Montreal': 23, 'Spielberg': 19, 'Silverstone': 2,
      'Spa-Francorchamps': 7, 'Hungaroring': 4, 'Zandvoort': 55, 'Monza': 39,
      'Baku': 144, 'Singapore': 61, 'Austin': 9, 'Mexico City': 65,
      'Interlagos': 14, 'Las Vegas': 152, 'Lusail': 150, 'Yas Marina Circuit': 70,
    };
    (async () => {
      const data = await fetch('https://api.formula1.com/v1/event-tracker', {
        headers: { apikey: 'xZ7AOODSjiQadLsIYWefQrpCSQVDbHGC', locale: 'en', 'content-type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(r => r.json())

      // Primary: look up circuit key via fomRaceId = Meeting.Key in livetiming Index.json
      let circuitKey = null
      const year = data.seasonContext?.seasonYear
      const meetingKey = data.fomRaceId
      if (year && meetingKey) {
        try {
          const indexRes = await fetch(
            `https://livetiming.formula1.com/static/${year}/Index.json`,
            { signal: AbortSignal.timeout(5000) }
          )
          const indexText = await indexRes.text()
          const indexData = JSON.parse(indexText.charCodeAt(0) === 0xFEFF ? indexText.slice(1) : indexText)
          const meeting = indexData.Meetings?.find(m => String(m.Key) === String(meetingKey))
          if (meeting?.Circuit?.Key) circuitKey = meeting.Circuit.Key
        } catch {}
      }
      // Fallback: circuitShortName map for meetings not yet published in the index
      if (!circuitKey) {
        circuitKey = CIRCUIT_KEY_BY_SHORT_NAME[data.race?.circuitShortName] ?? null
      }
      data.circuitKey = circuitKey

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    })().catch(e => {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // SSE stream — OBS overlays subscribe here for live data
  if (url.pathname === '/f1/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'
    })
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    if (f1Playback) {
      const snap = f1Playback.getSnapshot()
      sseSend(res, 'snapshot', { state: statePayload(snap), clock: clockPayload(snap) })
    }
    return
  }

  // Serve circuit images from userData
  if (url.pathname.startsWith('/circuits/')) {
    const filename = url.pathname.slice('/circuits/'.length)
    const userFile = path.join(app.getPath('userData'), 'circuits', filename)
    if (fs.existsSync(userFile)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' })
      res.end(fs.readFileSync(userFile))
    } else {
      res.writeHead(404); res.end()
    }
    return
  }

  // Serve shared fonts
  if (url.pathname.startsWith('/fonts/')) {
    const file = path.join(SHARED_FONTS, url.pathname.slice('/fonts/'.length))
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      res.end(fs.readFileSync(file))
    } else {
      res.writeHead(404); res.end()
    }
    return
  }

  // Serve project assets (images only, let dist assets through)
  if (url.pathname.startsWith('/assets/') && (url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg') || url.pathname.endsWith('.gif') || url.pathname.endsWith('.svg'))) {
    const filename = url.pathname.slice('/assets/'.length)
    const appPath = app.getAppPath()
    const file = path.join(appPath, 'assets', filename)
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      res.end(fs.readFileSync(file))
      return
    }
  }

  // Serve overlay static files — SPA fallback to index.html
  const rel  = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const file = path.join(OVERLAY_DIST, rel)
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    res.end(fs.readFileSync(file))
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fs.readFileSync(path.join(OVERLAY_DIST, 'index.html')))
  }
}).listen(OVERLAY_PORT, () => console.log(`[overlay] http://localhost:${OVERLAY_PORT}`))

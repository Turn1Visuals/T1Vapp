const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config)
  },
  overlayMessage: {
    load: () => ipcRenderer.invoke('overlayMessage:load'),
    save: (message) => ipcRenderer.invoke('overlayMessage:save', message)
  },
  launcher: {
    run: (path) => ipcRenderer.invoke('launcher:run', path),
    getIcon: (path) => ipcRenderer.invoke('launcher:getIcon', path)
  },
  dialog: {
    openFile:  () => ipcRenderer.invoke('dialog:openFile'),
    openImage: () => ipcRenderer.invoke('dialog:openImage'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  obs: {
    connect: () => ipcRenderer.invoke('obs:connect'),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    call: (method, params) => ipcRenderer.invoke('obs:call', method, params),
    startStream: () => ipcRenderer.invoke('obs:startStream'),
    stopStream: () => ipcRenderer.invoke('obs:stopStream'),
    getStatus: () => ipcRenderer.invoke('obs:getStatus'),
    onStreamState: (cb) => ipcRenderer.on('obs:streamState', (_, active) => cb(active)),
    onDisconnected: (cb) => ipcRenderer.on('obs:disconnected', () => cb()),
    getScenes: () => ipcRenderer.invoke('obs:getScenes'),
    getCurrentScene: () => ipcRenderer.invoke('obs:getCurrentScene'),
    setScene: (sceneName) => ipcRenderer.invoke('obs:setScene', sceneName),
    onSceneChanged: (cb) => ipcRenderer.on('obs:sceneChanged', (_, sceneName) => cb(sceneName)),
    getStats: () => ipcRenderer.invoke('obs:getStats'),
    getSources: (sceneName) => ipcRenderer.invoke('obs:getSources', sceneName),
    setSourceVisible: (opts) => ipcRenderer.invoke('obs:setSourceVisible', opts),
    onSourceVisibilityChanged: (cb) => ipcRenderer.on('obs:sourceVisibilityChanged', (_, data) => cb(data)),
    getInputMuted: (inputName) => ipcRenderer.invoke('obs:getInputMuted', inputName),
    setInputMute: (inputName, muted) => ipcRenderer.invoke('obs:setInputMute', inputName, muted),
    getVirtualCamStatus: () => ipcRenderer.invoke('obs:getVirtualCamStatus'),
    startVirtualCam: () => ipcRenderer.invoke('obs:startVirtualCam'),
    stopVirtualCam: () => ipcRenderer.invoke('obs:stopVirtualCam'),
    refreshBrowserSources: () => ipcRenderer.invoke('obs:refreshBrowserSources'),
    refreshSceneSources: (sceneName) => ipcRenderer.invoke('obs:refreshSceneSources', sceneName),
    getSceneScreenshot: (sceneName) => ipcRenderer.invoke('obs:getSceneScreenshot', sceneName)
  },
  icons: {
    get: (slug) => ipcRenderer.invoke('icons:get', slug),
    search: (query) => ipcRenderer.invoke('icons:search', query)
  },
  fa: {
    get: (style, name) => ipcRenderer.invoke('fa:get', style, name),
    search: (query, style) => ipcRenderer.invoke('fa:search', query, style)
  },
  app: {
    checkUrl:        (url) => ipcRenderer.invoke('app:checkUrl', url),
    openExternal:    (url) => ipcRenderer.invoke('app:openExternal', url),
    openLoginWindow: (url) => ipcRenderer.invoke('app:openLoginWindow', url)
  },
  clipboard: {
    write: (text) => ipcRenderer.invoke('clipboard:write', text)
  },
  http: {
    fetchJson: (url) => ipcRenderer.invoke('http:fetchJson', url)
  },
  f1assets: {
    load:  ()    => ipcRenderer.invoke('f1assets:load'),
    fetch: ()    => ipcRenderer.invoke('f1assets:fetch'),
  },
  media: {
    pickVideo: () => ipcRenderer.invoke('media:pickVideo'),
    pickJson:  () => ipcRenderer.invoke('media:pickJson'),
    readJson:  (filePath) => ipcRenderer.invoke('media:readJson', filePath)
  },
  youtube: {
    auth:             (clientId, clientSecret) => ipcRenderer.invoke('youtube:auth', clientId, clientSecret),
    upload:           (opts)    => ipcRenderer.invoke('youtube:upload', opts),
    getLiveBroadcast: ()        => ipcRenderer.invoke('youtube:getLiveBroadcast'),
    sendChat:         (opts)    => ipcRenderer.invoke('youtube:sendChat', opts),
    goLive:           (opts)    => ipcRenderer.invoke('youtube:goLive', opts),
    getViewers:       (opts)    => ipcRenderer.invoke('youtube:getViewers', opts)
  },
  tiktok: {
    auth:   (clientKey, clientSecret) => ipcRenderer.invoke('tiktok:auth', clientKey, clientSecret),
    upload: (opts) => ipcRenderer.invoke('tiktok:upload', opts)
  },
  twitch: {
    auth:       (clientId, clientSecret) => ipcRenderer.invoke('twitch:auth', clientId, clientSecret),
    sendChat:   (opts)                   => ipcRenderer.invoke('twitch:sendChat', opts),
    setTitle:   (opts)                   => ipcRenderer.invoke('twitch:setTitle', opts),
    getViewers: ()                       => ipcRenderer.invoke('twitch:getViewers')
  },
  browser: {
    googleSignIn:        () => ipcRenderer.invoke('browser:googleSignIn'),
    finishGoogleSignIn:  () => ipcRenderer.invoke('browser:finishGoogleSignIn'),
    importGoogleSession: () => ipcRenderer.invoke('browser:importGoogleSession'),
    siteLogin:           (url) => ipcRenderer.invoke('browser:siteLogin', url),
    finishSiteLogin:     (partition) => ipcRenderer.invoke('browser:finishSiteLogin', partition),
    checkCookies:        (partition, domain) => ipcRenderer.invoke('browser:checkCookies', partition, domain),
    injectCookie:        (partition, domain, name, value) => ipcRenderer.invoke('browser:injectCookie', partition, domain, name, value),
  },
  kick: {
    auth:          (clientId, clientSecret) => ipcRenderer.invoke('kick:auth', clientId, clientSecret),
    sendChat:      (opts)                   => ipcRenderer.invoke('kick:sendChat', opts),
    setTitle:      (opts)                   => ipcRenderer.invoke('kick:setTitle', opts),
    getViewers:    (opts)                   => ipcRenderer.invoke('kick:getViewers', opts),
    checkSession:         ()     => ipcRenderer.invoke('kick:checkSession'),
    injectCookies:        (opts) => ipcRenderer.invoke('kick:injectCookies', opts),
    openLoginWindow:       ()    => ipcRenderer.invoke('kick:openLoginWindow'),
    importBrowserCookies:  ()    => ipcRenderer.invoke('kick:importBrowserCookies'),
    debugBrowserCookies:   ()    => ipcRenderer.invoke('kick:debugBrowserCookies')
  },
  f1: {
    sessions:       (year)      => ipcRenderer.invoke('f1:sessions', year),
    load:           (path)      => ipcRenderer.invoke('f1:load', path),
    play:           (speed)     => ipcRenderer.invoke('f1:play', speed),
    pause:          ()          => ipcRenderer.invoke('f1:pause'),
    seek:           (offsetMs)  => ipcRenderer.invoke('f1:seek', offsetMs),
    status:         ()          => ipcRenderer.invoke('f1:status'),
    unload:         ()          => ipcRenderer.invoke('f1:unload'),
    liveConnect:    ()          => ipcRenderer.invoke('f1:liveConnect'),
    liveDisconnect: ()          => ipcRenderer.invoke('f1:liveDisconnect'),
    circuits:       (key, season) => ipcRenderer.invoke('f1:circuits', key, season),
    subscribe:      ()          => ipcRenderer.send('f1:subscribe'),
    onSnapshot:     (cb)        => ipcRenderer.on('f1:snapshot',        (_, d) => cb(d)),
    onState:        (cb)        => ipcRenderer.on('f1:state',           (_, d) => cb(d)),
    onClock:        (cb)        => ipcRenderer.on('f1:clock',           (_, d) => cb(d)),
    onPosition:     (cb)        => ipcRenderer.on('f1:position',        (_, d) => cb(d)),
    onCarData:      (cb)        => ipcRenderer.on('f1:cardata',         (_, d) => cb(d)),
    onReset:        (cb)        => ipcRenderer.on('f1:reset',           ()     => cb()),
    onLiveDisconnected: (cb)    => ipcRenderer.on('f1:liveDisconnected',()     => cb()),
    openLogin:      ()          => ipcRenderer.invoke('f1:openLogin'),
    authStatus:     ()          => ipcRenderer.invoke('f1:authStatus'),
    logout:         ()          => ipcRenderer.invoke('f1:logout'),
    onAuthChanged:  (cb)        => ipcRenderer.on('f1:authChanged',     ()     => cb()),
    rawFile:        ()          => ipcRenderer.invoke('f1:rawFile'),
    openCacheFolder:()          => ipcRenderer.invoke('f1:openCacheFolder'),
    yearMeetings:   (year)      => ipcRenderer.invoke('f1:yearMeetings', year)
  },
  circuit: {
    list:       ()               => ipcRenderer.invoke('circuit:list'),
    import:     (key, srcPath)   => ipcRenderer.invoke('circuit:import', key, srcPath),
    delete:     (key)            => ipcRenderer.invoke('circuit:delete', key),
    getDataUrl: (key)            => ipcRenderer.invoke('circuit:getDataUrl', key),
  }
})

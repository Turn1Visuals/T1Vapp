const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config)
  },
  launcher: {
    run: (path) => ipcRenderer.invoke('launcher:run', path),
    getIcon: (path) => ipcRenderer.invoke('launcher:getIcon', path)
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  obs: {
    connect: () => ipcRenderer.invoke('obs:connect'),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    startStream: () => ipcRenderer.invoke('obs:startStream'),
    stopStream: () => ipcRenderer.invoke('obs:stopStream'),
    getStatus: () => ipcRenderer.invoke('obs:getStatus'),
    onStreamState: (cb) => ipcRenderer.on('obs:streamState', (_, active) => cb(active)),
    onDisconnected: (cb) => ipcRenderer.on('obs:disconnected', () => cb())
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
    checkUrl:     (url) => ipcRenderer.invoke('app:checkUrl', url),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
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
    goLive:           (opts)    => ipcRenderer.invoke('youtube:goLive', opts)
  },
  tiktok: {
    auth:   (clientKey, clientSecret) => ipcRenderer.invoke('tiktok:auth', clientKey, clientSecret),
    upload: (opts) => ipcRenderer.invoke('tiktok:upload', opts)
  },
  twitch: {
    auth:     (clientId, clientSecret) => ipcRenderer.invoke('twitch:auth', clientId, clientSecret),
    sendChat: (opts)                   => ipcRenderer.invoke('twitch:sendChat', opts),
    setTitle: (opts)                   => ipcRenderer.invoke('twitch:setTitle', opts)
  }
})

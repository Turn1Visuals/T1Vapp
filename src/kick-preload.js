// Runs before page JS in Kick webview partitions — patches Cloudflare detection
Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true })

Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const arr = [
      { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer',             description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client',      filename: 'internal-nacl-plugin',             description: '' },
    ]
    arr.item   = (i) => arr[i]
    arr.namedItem = (n) => arr.find(p => p.name === n) || null
    arr.refresh = () => {}
    return arr
  },
  configurable: true
})

Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true })

if (!window.chrome) {
  window.chrome = {
    app: { isInstalled: false, getDetails: () => null, getIsInstalled: () => false },
    csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: Date.now(), tran: 15 }),
    loadTimes: () => ({
      commitLoadTime: Date.now() / 1000,
      connectionInfo: 'h2',
      finishDocumentLoadTime: Date.now() / 1000,
      finishLoadTime: Date.now() / 1000,
      firstPaintAfterLoadTime: 0,
      firstPaintTime: Date.now() / 1000,
      navigationType: 'Other',
      npnNegotiatedProtocol: 'h2',
      requestTime: Date.now() / 1000,
      startLoadTime: Date.now() / 1000,
      wasAlternateProtocolAvailable: false,
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true,
    }),
    runtime: {
      id: undefined,
      connect: () => {},
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
  }
}

// Permissions API — return granted for common ones so Cloudflare doesn't flag
const _origQuery = window.navigator?.permissions?.query?.bind(navigator.permissions)
if (_origQuery) {
  navigator.permissions.query = (params) => {
    if (['notifications', 'push', 'midi', 'camera', 'microphone', 'geolocation'].includes(params?.name)) {
      return Promise.resolve({ state: 'prompt', onchange: null })
    }
    return _origQuery(params)
  }
}

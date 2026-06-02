export const state = {
  config: { launchers: [], obs: { host: 'localhost', port: 4455, password: '' }, pinnedTabs: [], tempTabs: [] },
  ytStreamLoaded:    false,
  currentBroadcastId: null,
  loadYtStream:      () => {},
  onObsConnected:    () => {},
  onObsDisconnected: () => {},
}

export function saveConfig() {
  return window.api.config.save(state.config)
}

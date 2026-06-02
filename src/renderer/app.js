import { state }                        from './state.js'
import { initTitlebar, initTabs }        from './modules/titlebar.js'
import { initLaunchers }                 from './modules/launchers.js'
import { initBrowser, initQuicklinks }   from './modules/browser.js'
import { initObs }                       from './modules/obs.js'
import { initHomeStreams }               from './modules/home.js'
import { initSettings }                  from './modules/settings.js'
import { initMedia }                     from './modules/media.js'
import { initNotes }                     from './modules/notes.js'
import { initVirtualCamera }             from './modules/virtual-camera.js'
import { initF1Auth }                    from './modules/f1-auth.js'
import { initF1Tab }                     from './modules/f1-tab.js'
import { initLiveTiming }                from './modules/livetiming.js'

window.addEventListener('DOMContentLoaded', async () => {
  state.config = await window.api.config.load()
  // migrate old browserTabs → pinnedTabs
  if (state.config.browserTabs && !state.config.pinnedTabs) {
    state.config.pinnedTabs = state.config.browserTabs
    delete state.config.browserTabs
    window.api.config.save(state.config)
  }
  state.config.pinnedTabs = state.config.pinnedTabs || []
  state.config.tempTabs   = state.config.tempTabs   || []

  initTitlebar()
  initTabs()
  initLaunchers()
  initObs()
  try { initBrowser() } catch(e) { console.error('initBrowser failed', e) }
  initQuicklinks()
  initSettings()
  initHomeStreams()
  initMedia()
  initNotes()
  initVirtualCamera()
  initF1Auth()
  initF1Tab()
  initLiveTiming()
})

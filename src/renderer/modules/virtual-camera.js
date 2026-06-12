import { state, saveConfig } from '../state.js'

// Shared icon strings — populated async by livetiming.js after FA icons load
export let vcamIconPlay     = '▶'
export let vcamIconPause    = '⏸'
export let vcamIconExpand   = '⛶'
export let vcamIconCompress = '✕'

export function setVcamIcons({ play, pause, expand, compress }) {
  if (play)     vcamIconPlay     = play
  if (pause)    vcamIconPause    = pause
  if (expand)   vcamIconExpand   = expand
  if (compress) vcamIconCompress = compress
}

// ── Virtual Camera ────────────────────────────────────────────────────────────
export async function initVirtualCamera() {
  const video          = document.getElementById('vcam-video')
  const offlineEl      = document.getElementById('vcam-offline')
  const toggleBtn      = document.getElementById('btn-vcam-toggle')
  const fullscreenBtn  = document.getElementById('btn-vcam-fullscreen')
  const vcamBlock      = fullscreenBtn.closest('.vcam-block')

  function toggleVcamExpanded(force) {
    const expanded = force !== undefined ? force : !vcamBlock.classList.contains('vcam-expanded')
    vcamBlock.classList.toggle('vcam-expanded', expanded)
    fullscreenBtn.innerHTML = expanded ? vcamIconCompress : vcamIconExpand
    fullscreenBtn.title = expanded ? 'Exit fullscreen' : 'Fullscreen'
  }

  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleVcamExpanded()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && vcamBlock.classList.contains('vcam-expanded')) toggleVcamExpanded(false)
  })

  let vcamActive = false

  function setToggleBtn(active) {
    vcamActive = active
    toggleBtn.textContent = active ? 'Stop VCAM' : 'Start VCAM'
    toggleBtn.className = active ? 'vcam-toggle-btn btn-obs btn-start' : 'vcam-toggle-btn btn-obs btn-stop'
  }

  toggleBtn.addEventListener('click', async () => {
    toggleBtn.disabled = true
    if (vcamActive) {
      await window.api.obs.stopVirtualCam()
      showOffline()
      setToggleBtn(false)
    } else {
      const res = await window.api.obs.startVirtualCam()
      if (res.ok) setTimeout(startStream, 2500) // give the cam time to init
    }
    toggleBtn.disabled = false
  })

  async function startStream() {
    try {
      // Enumerate first — labels may be empty before permission is granted
      let devices = await navigator.mediaDevices.enumerateDevices()
      let cam = devices.find(d => d.kind === 'videoinput' && d.label.toLowerCase().includes('obs'))

      if (!cam) {
        // Request any video to unlock device labels, then re-enumerate
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: true })
          tmp.getTracks().forEach(t => t.stop())
        } catch {}
        devices = await navigator.mediaDevices.enumerateDevices()
        cam = devices.find(d => d.kind === 'videoinput' && d.label.toLowerCase().includes('obs'))
      }

      if (!cam) { showOffline(); retryLater(); return }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId } }
      })
      video.srcObject = stream
      video.style.display = 'block'
      offlineEl.style.display = 'none'
      setToggleBtn(true)

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        showOffline()
        setToggleBtn(false)
        retryLater()
      })
    } catch {
      showOffline()
      retryLater()
    }
  }

  function showOffline() {
    video.srcObject = null
    video.style.display = 'none'
    offlineEl.style.display = ''
  }

  let retryTimer = null
  function retryLater() {
    if (retryTimer) return
    retryTimer = setInterval(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cam = devices.find(d => d.kind === 'videoinput' && d.label.toLowerCase().includes('obs'))
      if (cam) { clearInterval(retryTimer); retryTimer = null; startStream() }
    }, 5000)
  }

  state.onObsConnected = async () => {
    toggleBtn.disabled = false
    const status = await window.api.obs.getVirtualCamStatus()
    if (status.ok && status.active) {
      setToggleBtn(true)
      if (!video.srcObject) startStream()
    } else if (status.ok && !status.active) {
      // Auto-start virtual cam on OBS connect
      const res = await window.api.obs.startVirtualCam()
      if (res.ok) { setToggleBtn(true); setTimeout(startStream, 2500) }
    }
  }

  state.onObsDisconnected = () => {
    toggleBtn.disabled = true
  }

  // On startup: try to pick up the stream if virtual cam is already running,
  // regardless of whether OBS WS is connected yet
  startStream()
}

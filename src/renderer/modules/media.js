import { state, saveConfig } from '../state.js'

// ── Media ─────────────────────────────────────────────────────────────────────
export function initMedia() {
  const btnPickVideo    = document.getElementById('btn-pick-video')
  const btnPickJson     = document.getElementById('btn-pick-json')
  const btnClearJson    = document.getElementById('btn-clear-json')
  const videoFilename   = document.getElementById('video-filename')
  const jsonFilename    = document.getElementById('json-filename')
  const titleInput      = document.getElementById('media-title')
  const descTextarea    = document.getElementById('media-description')
  const hashtagsInput   = document.getElementById('media-hashtags')
  const btnUpload        = document.getElementById('btn-upload')
  const uploadStatus     = document.getElementById('upload-status')
  const ytVisibility     = document.getElementById('yt-visibility')
  const ytCategory       = document.getElementById('yt-category')
  const ttVisibility     = document.getElementById('tt-visibility')
  const videoEl          = document.getElementById('media-video')
  const videoWrap        = document.getElementById('video-preview-wrap')
  const videoPlaceholder = document.getElementById('video-placeholder')

  let currentVideoPath = null
  let sessionData = null

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  function applyTemplate(data) {
    const title = `F1 ${data.event_name} - ${data.session_name} - Results`
    const desc  = (data.results || [])
      .map(r => `${r.position}. ${r.driver}  ${r.value}`)
      .join('\n')
    const hashtags = `#f1 #formula1 #${slugify(data.event_name)} #turn1visuals`

    titleInput.value    = title
    descTextarea.value  = desc
    hashtagsInput.value = hashtags
  }

  function clearTemplate() {
    titleInput.value    = ''
    descTextarea.value  = ''
    hashtagsInput.value = '#f1 #formula1 #turn1visuals'
  }

  btnPickVideo.addEventListener('click', async () => {
    const paths = await window.api.media.pickVideo()
    if (!paths.length) return
    const filePath = paths[0]
    const name = filePath.split(/[\\/]/).pop()
    videoFilename.textContent = name
    currentVideoPath = filePath
    videoEl.src = 'file:///' + filePath.replace(/\\/g, '/')
    videoWrap.style.display = ''
    videoPlaceholder.style.display = 'none'
    btnUpload.disabled = false
  })

  btnPickJson.addEventListener('click', async () => {
    const paths = await window.api.media.pickJson()
    if (!paths.length) return
    const data = await window.api.media.readJson(paths[0])
    if (!data) { jsonFilename.textContent = 'Failed to read file'; return }
    sessionData = data
    const name = paths[0].split(/[\\/]/).pop()
    jsonFilename.textContent = name
    btnClearJson.style.display = ''
    applyTemplate(data)
  })

  btnClearJson.addEventListener('click', () => {
    sessionData = null
    jsonFilename.textContent = 'No file selected'
    btnClearJson.style.display = 'none'
    clearTemplate()
  })

  btnUpload.addEventListener('click', async () => {
    const doYoutube = document.getElementById('plat-youtube').checked
    const doTiktok  = document.getElementById('plat-tiktok').checked

    const missing = []
    if (!currentVideoPath)                    missing.push('video')
    if (!titleInput.value.trim())             missing.push('title')
    if (!hashtagsInput.value.trim())          missing.push('hashtags')
    if (!descTextarea.value.trim())           missing.push('description')
    if (!doYoutube && !doTiktok)              missing.push('platform')

    if (missing.length) {
      uploadStatus.textContent = `Required: ${missing.join(', ')}`
      uploadStatus.style.color = '#e10600'
      return
    }
    uploadStatus.style.color = ''

    btnUpload.disabled = true
    uploadStatus.textContent = 'Uploading…'
    uploadStatus.style.color = ''

    const resultsCol  = document.getElementById('media-results')
    const resultsEmpty = document.getElementById('results-empty')
    const timestamp   = new Date().toLocaleTimeString()

    function addResultCard({ platform, success, statusText, url, detail }) {
      if (resultsEmpty) resultsEmpty.style.display = 'none'
      const card = document.createElement('div')
      card.className = `result-card ${success ? 'success' : 'error'}`

      const plat = document.createElement('div')
      plat.className = 'result-platform'
      plat.textContent = platform
      card.appendChild(plat)

      const status = document.createElement('div')
      status.className = 'result-status'
      status.textContent = (success ? '✓ ' : '✗ ') + statusText
      card.appendChild(status)

      if (url) {
        const link = document.createElement('div')
        link.className = 'result-link'
        link.textContent = url
        link.addEventListener('click', () => window.api.app.openExternal(url))
        card.appendChild(link)
      }

      if (detail) {
        const det = document.createElement('div')
        det.className = 'result-time'
        det.textContent = detail
        card.appendChild(det)
      }

      const time = document.createElement('div')
      time.className = 'result-time'
      time.textContent = timestamp
      card.appendChild(time)

      resultsCol.prepend(card)
    }

    if (doYoutube) {
      const yt = state.config.youtube || {}
      if (!yt.refreshToken) {
        addResultCard({ platform: 'YouTube', success: false, statusText: 'Not connected' })
      } else {
        uploadStatus.textContent = 'Uploading to YouTube…'
        const result = await window.api.youtube.upload({
          filePath:     currentVideoPath,
          title:        titleInput.value.trim(),
          description:  descTextarea.value.trim(),
          tags:         hashtagsInput.value.trim(),
          visibility:   ytVisibility.value,
          categoryId:   ytCategory.value,
          clientId:     yt.clientId,
          clientSecret: yt.clientSecret,
          refreshToken: yt.refreshToken
        })
        if (result.ok) {
          addResultCard({ platform: 'YouTube', success: true, statusText: 'Published', url: result.url })
        } else {
          addResultCard({ platform: 'YouTube', success: false, statusText: result.error })
        }
      }
    }

    if (doTiktok) {
      const tt = state.config.tiktok || {}
      if (!tt.refreshToken) {
        addResultCard({ platform: 'TikTok', success: false, statusText: 'Not connected' })
      } else {
        uploadStatus.textContent = 'Uploading to TikTok…'
        const result = await window.api.tiktok.upload({
          filePath:     currentVideoPath,
          title:        titleInput.value.trim(),
          description:  descTextarea.value.trim(),
          privacyLevel: ttVisibility.value,
          clientKey:    tt.clientKey,
          clientSecret: tt.clientSecret,
          refreshToken: tt.refreshToken
        })
        if (result.ok) {
          if (result.statusRaw) console.log('[TikTok status]', result.statusRaw)
          addResultCard({
            platform:   'TikTok',
            success:    true,
            statusText: result.status || 'Sent to inbox',
            detail:     `ID: ${result.publishId}`
          })
        } else {
          addResultCard({ platform: 'TikTok', success: false, statusText: result.error })
        }
      }
    }

    uploadStatus.textContent = 'Done'
    btnUpload.disabled = false
  })
}

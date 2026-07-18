const ytChatWv     = document.getElementById('yt-chat-wv')
const twitchChatWv = document.getElementById('twitch-chat-wv')
const kickChatWv   = document.getElementById('kick-chat-wv')
const chatInput    = document.getElementById('chat-msg-input')
const btnSendBoth  = document.getElementById('btn-send-both')
const statusEl     = document.getElementById('chat-send-status')

let config = {}
let currentLiveChatId = null

async function loadYtChat() {
  if (!config.youtube?.refreshToken) return
  const result = await window.api.youtube.getLiveBroadcast()
  if (result.ok) {
    currentLiveChatId = result.liveChatId
    ytChatWv.src = `https://www.youtube.com/live_chat?v=${result.videoId}`
  } else {
    currentLiveChatId = null
    console.warn('[YT chat]', result.error)
  }
}

function loadTwitchChat() {
  const channel = config.twitch?.channel
  if (channel) twitchChatWv.src = `https://www.twitch.tv/embed/${channel}/chat?parent=localhost&darkpopout`
}

function loadKickChat() {
  const channel = config.kick?.channel
  if (channel) kickChatWv.src = `https://kick.com/popout/${channel}/chat`
}

document.getElementById('btn-reload-yt-chat').addEventListener('click', () => {
  if (ytChatWv.src && ytChatWv.src !== 'about:blank') ytChatWv.reload()
  else loadYtChat()
})
document.getElementById('btn-reload-twitch-chat').addEventListener('click', () => twitchChatWv.reload())
document.getElementById('btn-reload-kick-chat').addEventListener('click', () => kickChatWv.reload())

async function sendToYt(message) {
  if (!currentLiveChatId) return { ok: false, error: 'No active YT broadcast' }
  return window.api.youtube.sendChat({ message, liveChatId: currentLiveChatId })
}

async function sendToTwitch(message) {
  if (!config.twitch?.refreshToken) return { ok: false, error: 'Twitch not connected' }
  return window.api.twitch.sendChat({ message })
}

async function sendToKick(message) {
  if (!config.kick?.refreshToken) return { ok: false, error: 'Kick not connected' }
  return window.api.kick.sendChat({ message })
}

async function handleSend() {
  const message = chatInput.value.trim()
  if (!message) return
  statusEl.textContent = 'Sending…'
  statusEl.style.color = ''

  const results = await Promise.all([sendToYt, sendToTwitch, sendToKick].map(fn => fn(message)))
  const errors  = results.filter(r => !r.ok).map(r => r.error)

  if (errors.length) {
    statusEl.textContent = errors.join(' | ')
    statusEl.style.color = '#e10600'
  } else {
    statusEl.textContent = '✓ Sent'
    statusEl.style.color = '#4caf50'
    chatInput.value = ''
    setTimeout(() => { statusEl.textContent = '' }, 2000)
  }
}

btnSendBoth.addEventListener('click', handleSend)
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend() })

window.api.config.load().then(cfg => {
  config = cfg
  loadYtChat()
  loadTwitchChat()
  loadKickChat()
})

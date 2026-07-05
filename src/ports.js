// Loads the port registry from the root .env file. Manage all ports there.
const fs = require('fs')
const path = require('path')

const vars = {}
try {
  const lines = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) vars[m[1]] = m[2]
  }
} catch (e) {
  console.warn('[ports] Could not read .env, using defaults:', e.message)
}

module.exports = {
  OVERLAY_PORT:             Number(vars.OVERLAY_PORT) || 47200,
  UI_DEV_PORT:              Number(vars.UI_DEV_PORT) || 5174,
  OVERLAY_URL:              vars.OVERLAY_URL || 'http://localhost:47200/',
  OBS_PORT:                 Number(vars.OBS_PORT) || 4455,
  YOUTUBE_REDIRECT_PORT:    Number(vars.YOUTUBE_REDIRECT_PORT) || 8985,
  TIKTOK_REDIRECT_PORT:     Number(vars.TIKTOK_REDIRECT_PORT) || 8986,
  FB_REDIRECT_PORT:         Number(vars.FB_REDIRECT_PORT) || 8986,
  TWITCH_REDIRECT_PORT:     Number(vars.TWITCH_REDIRECT_PORT) || 80,
  KICK_REDIRECT_PORT:       Number(vars.KICK_REDIRECT_PORT) || 80,
  DEBUG_PORT_COOKIE_IMPORT: Number(vars.DEBUG_PORT_COOKIE_IMPORT) || 9223,
  DEBUG_PORT_GOOGLE_SIGNIN: Number(vars.DEBUG_PORT_GOOGLE_SIGNIN) || 9224,
  DEBUG_PORT_SITE_LOGIN:    Number(vars.DEBUG_PORT_SITE_LOGIN) || 9225,
}

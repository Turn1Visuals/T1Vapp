import { state, saveConfig } from '../state.js'

// ── F1 Auth ───────────────────────────────────────────────────────────────────
export async function initF1Auth() {
  const loginBtn  = document.getElementById('btn-f1-login')
  const logoutBtn = document.getElementById('btn-f1-logout')
  const statusEl  = document.getElementById('f1-auth-status')

  async function refreshStatus() {
    const s = await window.api.f1.authStatus()
    if (s.loggedIn) {
      const exp = new Date(s.expiresAt).toLocaleDateString()
      statusEl.textContent  = `Logged in · expires ${exp}`
      statusEl.style.color  = '#4caf50'
      loginBtn.style.display  = 'none'
      logoutBtn.style.display = ''
    } else {
      statusEl.textContent  = 'Not logged in'
      statusEl.style.color  = '#888'
      loginBtn.style.display  = ''
      logoutBtn.style.display = 'none'
    }
  }

  loginBtn.addEventListener('click', () => window.api.f1.openLogin())
  logoutBtn.addEventListener('click', async () => {
    await window.api.f1.logout()
    refreshStatus()
  })

  window.api.f1.onAuthChanged(() => refreshStatus())

  refreshStatus()
}

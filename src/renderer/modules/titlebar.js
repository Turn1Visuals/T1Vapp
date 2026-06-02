import { state, saveConfig } from '../state.js'

// ── Title bar ────────────────────────────────────────────────────────────────
export function initTitlebar() {
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.window.minimize())
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.window.maximize())
  document.getElementById('btn-close').addEventListener('click', () => window.api.window.close())
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
export function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
      // Re-trigger active browser subtab so webview redraws
      if (btn.dataset.tab === 'browser') {
        const activeWv = document.querySelector('#browser-views webview.active')
        if (activeWv) { activeWv.style.display = 'none'; requestAnimationFrame(() => { activeWv.style.display = '' }) }
      }
    })
  })
}

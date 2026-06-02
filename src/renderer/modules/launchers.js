import { state, saveConfig } from '../state.js'

// ── Launchers ─────────────────────────────────────────────────────────────────
export function initLaunchers() {
  const grid   = document.getElementById('launcher-grid')
  const addBtn = document.getElementById('btn-add-launcher')

  let dragSrcIdx = null

  function renderLaunchers() {
    grid.querySelectorAll('.launcher-tile:not(.launcher-add-tile)').forEach(t => t.remove())

    state.config.launchers.forEach((launcher, i) => {
      const tile = document.createElement('div')
      tile.className = 'launcher-tile'
      tile.draggable = true
      tile.dataset.idx = i

      const iconEl = document.createElement('span')
      iconEl.className = 'tile-icon'
      iconEl.textContent = '📄'

      const nameEl = document.createElement('span')
      nameEl.className = 'tile-name'
      nameEl.textContent = launcher.name

      const removeBtn = document.createElement('button')
      removeBtn.className = 'tile-remove'
      removeBtn.title = 'Remove'
      removeBtn.textContent = '✕'

      tile.appendChild(iconEl)
      tile.appendChild(nameEl)
      tile.appendChild(removeBtn)

      window.api.launcher.getIcon(launcher.path).then(dataUrl => {
        if (dataUrl) {
          const img = document.createElement('img')
          img.src = dataUrl
          img.style.cssText = 'width:32px;height:32px;object-fit:contain'
          iconEl.textContent = ''
          iconEl.appendChild(img)
        }
      })

      // Reorder drag
      tile.addEventListener('dragstart', e => {
        dragSrcIdx = i
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(i))
        setTimeout(() => tile.style.opacity = '0.4', 0)
      })
      tile.addEventListener('dragend', () => { tile.style.opacity = '' })
      tile.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' })
      tile.addEventListener('drop', e => {
        e.preventDefault()
        e.stopPropagation()
        const dropIdx = parseInt(tile.dataset.idx)
        if (dragSrcIdx === null || dragSrcIdx === dropIdx) return
        const moved = state.config.launchers.splice(dragSrcIdx, 1)[0]
        state.config.launchers.splice(dropIdx, 0, moved)
        saveConfig()
        renderLaunchers()
      })

      tile.addEventListener('click', (e) => {
        if (e.target.classList.contains('tile-remove')) return
        window.api.launcher.run(launcher.path)
      })
      removeBtn.addEventListener('click', e => {
        e.stopPropagation()
        state.config.launchers.splice(i, 1)
        saveConfig()
        renderLaunchers()
      })
      grid.insertBefore(tile, addBtn)
    })
  }

  function addLauncherFromPath(filePath) {
    const name = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
    state.config.launchers.push({ name, path: filePath })
    saveConfig()
    renderLaunchers()
  }

  // Prevent Electron/Chromium from navigating to dropped files globally
  document.addEventListener('dragover', e => e.preventDefault())
  document.addEventListener('drop', e => e.preventDefault())

  addBtn.addEventListener('click', async () => {
    const paths = await window.api.dialog.openFile()
    paths.forEach(p => addLauncherFromPath(p))
  })

  renderLaunchers()
}

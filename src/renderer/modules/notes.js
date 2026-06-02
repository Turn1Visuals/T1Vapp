import { state, saveConfig } from '../state.js'

// ── Notes ─────────────────────────────────────────────────────────────────────
export function initNotes() {
  const list    = document.getElementById('notes-list')
  const addBtn  = document.getElementById('btn-add-note')

  function loadNotes() {
    return JSON.parse(localStorage.getItem('t1v-notes') || '[]')
  }

  function saveNotes(notes) {
    localStorage.setItem('t1v-notes', JSON.stringify(notes))
  }

  function renderNotes() {
    const notes = loadNotes()
    list.innerHTML = ''
    notes.forEach((note, idx) => list.appendChild(makeCard(note, idx)))
  }

  function makeCard(note, idx) {
    const card = document.createElement('div')
    card.className = 'note-card'
    card.draggable = true
    card.innerHTML = `
      <div class="note-card-header">
        <input class="note-title-input" type="text" placeholder="Title…" value="${note.title.replace(/"/g, '&quot;')}" readonly />
        <div class="note-card-actions">
          <button class="btn-secondary note-btn-edit">Edit</button>
          <button class="btn-secondary note-btn-copy">Copy</button>
        </div>
      </div>
      <textarea class="note-body-input" placeholder="Write your note…" readonly>${note.body}</textarea>
    `

    const titleInput = card.querySelector('.note-title-input')
    const bodyInput  = card.querySelector('.note-body-input')
    const copyBtn    = card.querySelector('.note-btn-copy')
    const editBtn    = card.querySelector('.note-btn-edit')

    // Disable drag while selecting text so mouse selection works in view mode
    bodyInput.addEventListener('mousedown', () => { card.draggable = false })
    bodyInput.addEventListener('mouseleave', () => { if (titleInput.readOnly) card.draggable = true })
    bodyInput.addEventListener('blur', () => { if (titleInput.readOnly) card.draggable = true })

    function setEditMode(editing) {
      titleInput.readOnly = !editing
      bodyInput.readOnly  = !editing
      card.draggable      = !editing
      editBtn.textContent = editing ? 'Save' : 'Edit'
      editBtn.className   = editing ? 'btn-primary note-btn-edit' : 'btn-secondary note-btn-edit'
      if (editing) {
        // show delete btn
        if (!card.querySelector('.note-btn-delete')) {
          const del = document.createElement('button')
          del.className = 'btn-ghost note-btn-delete'
          del.textContent = 'Delete'
          del.addEventListener('click', e => { e.stopPropagation(); const n = loadNotes(); n.splice(idx, 1); saveNotes(n); renderNotes() })
          editBtn.insertAdjacentElement('beforebegin', del)
        }
        titleInput.focus()
      } else {
        card.querySelector('.note-btn-delete')?.remove()
        const n = loadNotes(); n[idx].title = titleInput.value; n[idx].body = bodyInput.value; saveNotes(n)
      }
    }

    editBtn.addEventListener('click', e => {
      e.stopPropagation()
      setEditMode(titleInput.readOnly)
    })
    copyBtn.addEventListener('click', e => {
      e.stopPropagation()
      navigator.clipboard.writeText(bodyInput.value)
      copyBtn.textContent = '✓'
      setTimeout(() => { copyBtn.textContent = '⎘' }, 1200)
    })

    // Drag to reorder
    card.addEventListener('dragstart', () => { card.classList.add('dragging'); card.dataset.idx = idx })
    card.addEventListener('dragend',   () => { card.classList.remove('dragging'); document.querySelectorAll('.note-card').forEach(c => c.classList.remove('drag-over')) })
    card.addEventListener('dragover',  e => { e.preventDefault(); card.classList.add('drag-over') })
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'))
    card.addEventListener('drop', e => {
      e.preventDefault()
      card.classList.remove('drag-over')
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain') || card.dataset.idx)
      const n = loadNotes()
      const [moved] = n.splice(fromIdx, 1)
      n.splice(idx, 0, moved)
      saveNotes(n); renderNotes()
    })
    card.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', idx))

    return card
  }

  addBtn.addEventListener('click', () => {
    const notes = loadNotes()
    notes.push({ title: '', body: '' })
    saveNotes(notes)
    renderNotes()
    // Open new card in edit mode
    const editBtns = list.querySelectorAll('.note-btn-edit')
    if (editBtns.length) editBtns[editBtns.length - 1].click()
  })

  renderNotes()
}

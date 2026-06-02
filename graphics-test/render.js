document.getElementById('event-name').textContent  = SESSION.event
document.getElementById('session-name').textContent = SESSION.session

const isQual     = SESSION.type === 'qualifying' || SESSION.type === 'sprint_qualifying'
const isPractice = SESSION.type === 'practice'
const isRace     = SESSION.type === 'race' || SESSION.type === 'sprint'

// Best lap time for P1 (for practice gap calculation)
const p1BestLap = RESULTS[0]?.bestLap ?? null

function timeCol(r) {
  if (isRace) {
    const dnf = r.status !== 'Finished'
    return `<div class="col-time ${dnf ? 'col-time--dnf' : ''}">${dnf ? r.status : (r.gap ?? r.time ?? '')}</div>`
  }
  if (isPractice) {
    return `<div class="col-time">${r.bestLap ?? ''}</div>`
  }
  if (isQual) {
    // Show the best lap from the deepest segment the driver reached
    const best = r.q3 ?? r.q2 ?? r.q1 ?? ''
    return `
      <div class="col-q col-q1 ${r.q1 ? '' : 'col-q--empty'}">${r.q1 ?? ''}</div>
      <div class="col-q col-q2 ${r.q2 ? '' : 'col-q--empty'}">${r.q2 ?? ''}</div>
      <div class="col-q col-q3 ${r.q3 ? '' : 'col-q--empty'}">${r.q3 ?? ''}</div>
    `
  }
  return ''
}

function ptsCol(r) {
  if (!isRace) return ''
  return `<div class="col-pts">${r.points > 0 ? r.points + ' pts' : ''}</div>`
}

function flCol(r) {
  if (!isRace) return ''
  return `<div class="col-fl">${r.fastestLap ? '⬥' : ''}</div>`
}

const container = document.getElementById('results')
container.dataset.type = SESSION.type

container.innerHTML = RESULTS.map(r => `
  <div class="row" style="--team-color: ${r.team.color}; --team-accessible: ${r.team.accessible}">
    <div class="col-pos">${r.pos}</div>
    <div class="col-headshot">
      <img src="${r.headshot}" onerror="this.style.opacity='0'" />
    </div>
    <div class="col-flag">
      <img src="${r.flag}" onerror="this.style.opacity='0'" />
    </div>
    <div class="col-name">
      <span class="first-name">${r.firstName}</span>
      <span class="last-name">${r.lastName}</span>
    </div>
    <div class="col-logo">
      <img src="${r.logo}" onerror="this.style.opacity='0'" />
    </div>
    ${timeCol(r)}
    ${ptsCol(r)}
    ${flCol(r)}
  </div>
`).join('')

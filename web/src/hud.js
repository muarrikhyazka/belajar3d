import { api } from './api.js'

const levelEl = document.getElementById('hud-level')
const fillEl = document.getElementById('hud-xp-fill')

export async function initHUD(clientID) {
  await refresh(clientID)
  window.addEventListener('belajar3d:progress-updated', () => refresh(clientID))
}

async function refresh(clientID) {
  try {
    const p = await api.progress(clientID)
    levelEl.textContent = `Level ${p.level}`
    const xpInLevel = p.xp % 100
    fillEl.style.width = `${xpInLevel}%`
  } catch { /* non-fatal, HUD just stays blank */ }
}

export function updateHUD() {}

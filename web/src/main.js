import * as THREE from 'three'
import { api, getClientID } from './api.js'
import { startQuiz } from './quiz.js'
import { updateHUD, initHUD } from './hud.js'

const clientID = getClientID()
let nickname = localStorage.getItem('belajar3d_nickname') || ''

// ---- DOM refs ----
const nicknameScreen = document.getElementById('nickname-screen')
const nicknameInput = document.getElementById('nickname-input')
const hint = document.getElementById('hud-hint')

nicknameInput.value = nickname
document.getElementById('nickname-start').onclick = () => {
  const v = nicknameInput.value.trim()
  if (!v) { nicknameInput.focus(); return }
  nickname = v
  localStorage.setItem('belajar3d_nickname', nickname)
  nicknameScreen.classList.add('hidden')
  initHUD(clientID)
}
nicknameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('nickname-start').click() })
if (nickname) { /* keep screen until they press play again, simpler UX, no auto-skip */ }

// ---- Three.js scene ----
const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x8ecbff)
scene.fog = new THREE.Fog(0x8ecbff, 40, 140)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x6fae5e })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

// simple road grid for visual interest
const roadMat = new THREE.MeshStandardMaterial({ color: 0x555566 })
for (const z of [-20, 0, 20]) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 4), roadMat)
  road.rotation.x = -Math.PI / 2
  road.position.set(0, 0.01, z)
  scene.add(road)
}

const sun = new THREE.DirectionalLight(0xffffff, 1.2)
sun.position.set(30, 50, 20)
scene.add(sun)
scene.add(new THREE.AmbientLight(0xffffff, 0.6))

// ---- player ----
const player = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0xffcc66 })
)
player.position.set(0, 1, 0)
scene.add(player)

const keys = {}
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true })
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false })

// touch joystick (mobile) - minimal: tap-and-drag on left half of screen = move direction
let touchVec = { x: 0, y: 0 }
let touchActive = false
let touchStart = null
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0]
  if (t.clientX < window.innerWidth / 2) { touchActive = true; touchStart = { x: t.clientX, y: t.clientY } }
}, { passive: true })
canvas.addEventListener('touchmove', (e) => {
  if (!touchActive) return
  const t = e.touches[0]
  touchVec = { x: (t.clientX - touchStart.x) / 40, y: (t.clientY - touchStart.y) / 40 }
}, { passive: true })
canvas.addEventListener('touchend', () => { touchActive = false; touchVec = { x: 0, y: 0 } })

// ---- buildings ----
const buildingMeshes = []
let activeSubjectID = null
let subjects = []

function buildingColor(i) {
  const palette = [0xef6c6c, 0x6ca0ef, 0xefd36c, 0x8ee07a, 0xc08ee0, 0xef9a6c]
  return palette[i % palette.length]
}

async function loadSubjects() {
  subjects = await api.subjects()
  for (const s of subjects) {
    const geo = new THREE.BoxGeometry(4, 5, 4)
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: buildingColor(mesh_i(s)) }))
    mesh.position.set(s.position_x, 2.5, s.position_z)
    mesh.userData.subject = s
    scene.add(mesh)
    buildingMeshes.push(mesh)

    // simple label via sprite (canvas texture)
    const label = makeLabelSprite(`${s.icon} ${s.name}`)
    label.position.set(s.position_x, 5.6, s.position_z)
    scene.add(label)
  }
}
function mesh_i(s) { return subjects.indexOf(s) }

function makeLabelSprite(text) {
  const cnv = document.createElement('canvas')
  cnv.width = 256; cnv.height = 64
  const ctx = cnv.getContext('2d')
  ctx.fillStyle = 'rgba(10,12,24,0.85)'
  ctx.roundRect ? ctx.roundRect(0, 0, 256, 64, 12) : ctx.rect(0, 0, 256, 64)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 32)
  const tex = new THREE.CanvasTexture(cnv)
  const mat = new THREE.SpriteMaterial({ map: tex })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(4, 1, 1)
  return sprite
}

loadSubjects()

// ---- movement + camera follow + proximity check ----
const clock = new THREE.Clock()
const PROXIMITY = 3.2

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05)
  const speed = 6
  let dx = 0, dz = 0
  if (keys['w'] || keys['arrowup']) dz -= 1
  if (keys['s'] || keys['arrowdown']) dz += 1
  if (keys['a'] || keys['arrowleft']) dx -= 1
  if (keys['d'] || keys['arrowright']) dx += 1
  dx += touchVec.x
  dz += touchVec.y
  const len = Math.hypot(dx, dz)
  if (len > 0.05 && !quizOpen) {
    dx /= len; dz /= len
    player.position.x += dx * speed * dt
    player.position.z += dz * speed * dt
    player.rotation.y = Math.atan2(dx, dz)
  }

  camera.position.set(player.position.x, player.position.y + 6, player.position.z + 9)
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z)

  // proximity to buildings
  if (!quizOpen) {
    let nearest = null, nearestDist = Infinity
    for (const b of buildingMeshes) {
      const d = player.position.distanceTo(b.position)
      if (d < nearestDist) { nearestDist = d; nearest = b }
    }
    if (nearest && nearestDist < PROXIMITY) {
      hint.textContent = `Tekan E untuk masuk ${nearest.userData.subject.name}`
      hint.style.display = 'inline-block'
      if (keys['e']) { keys['e'] = false; enterBuilding(nearest.userData.subject) }
    } else {
      hint.style.display = 'none'
    }
  }

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()

let quizOpen = false
async function enterBuilding(subject) {
  if (!nickname) { nicknameScreen.classList.remove('hidden'); return }
  quizOpen = true
  await startQuiz(subject, nickname, clientID, () => { quizOpen = false })
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// mobile tap-to-enter fallback (no physical E key)
window.addEventListener('dblclick', () => {
  if (quizOpen) return
  for (const b of buildingMeshes) {
    if (player.position.distanceTo(b.position) < PROXIMITY) { enterBuilding(b.userData.subject); break }
  }
})

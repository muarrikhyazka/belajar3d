import { api } from './api.js'

const loginScreen = document.getElementById('login-screen')
const appScreen = document.getElementById('app-screen')
const subjectList = document.getElementById('subject-list')
const questionPanel = document.getElementById('question-panel')
const questionPanelTitle = document.getElementById('question-panel-title')
const questionList = document.getElementById('question-list')

let subjects = []
let activeSubject = null

// ---- auth ----
const loginBtn = document.getElementById('login-btn')
const loginError = document.getElementById('login-error')

loginBtn.onclick = async () => {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  loginError.textContent = ''
  if (!email || !password) {
    loginError.textContent = 'Isi email dan kata sandi dulu.'
    return
  }
  loginBtn.disabled = true
  loginBtn.textContent = 'Masuk...'
  try {
    await api.login(email, password)
    await showApp()
  } catch (e) {
    // Surface the real cause instead of a generic message, so a network/
    // server error isn't confused with a wrong password.
    loginError.textContent = describeLoginError(e)
  } finally {
    loginBtn.disabled = false
    loginBtn.textContent = 'Masuk'
  }
}

function describeLoginError(e) {
  const msg = (e && e.message) || ''
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
    return 'Tidak bisa terhubung ke server. Cek koneksi internet lalu coba lagi.'
  }
  if (msg.includes('invalid credentials') || msg.includes('401')) {
    return 'Email atau kata sandi salah.'
  }
  return `Gagal login: ${msg || 'terjadi kesalahan tidak terduga'}`
}

document.getElementById('logout-btn').onclick = async () => { await api.logout(); location.reload() }

async function boot() {
  try {
    await api.me()
    await showApp()
  } catch {
    loginScreen.classList.remove('hidden')
    appScreen.classList.add('hidden')
  }
}
async function showApp() {
  loginScreen.classList.add('hidden')
  appScreen.classList.remove('hidden')
  try {
    await loadSubjects()
  } catch (e) {
    subjectList.innerHTML = `<p style="color:#f87171;font-size:.85rem">Gagal memuat data: ${e.message}</p>`
  }
}

// ---- subjects ----
async function loadSubjects() {
  subjects = await api.subjects()
  renderSubjectList()
}

function renderSubjectList() {
  subjectList.innerHTML = ''
  if (subjects.length === 0) {
    subjectList.innerHTML = '<p style="color:#9ca3af;font-size:.85rem">Belum ada gedung. Tambahkan dulu.</p>'
  }
  subjects.forEach((s) => {
    const row = document.createElement('div')
    row.className = 'item-row' + (activeSubject?.id === s.id ? ' active' : '')
    row.innerHTML = `<span>${s.icon} ${s.name}</span>`
    const actions = document.createElement('div')
    actions.className = 'actions'
    const editBtn = mkBtn('✏️', () => editSubjectForm(s))
    const delBtn = mkBtn('🗑️', async () => {
      if (!confirm(`Hapus gedung "${s.name}" beserta semua soalnya?`)) return
      await api.deleteSubject(s.id)
      if (activeSubject?.id === s.id) { activeSubject = null; questionPanel.style.display = 'none' }
      await loadSubjects()
    })
    actions.append(editBtn, delBtn)
    row.append(actions)
    row.onclick = (e) => { if (e.target === row || e.target.tagName === 'SPAN') selectSubject(s) }
    subjectList.appendChild(row)
  })
}

function mkBtn(label, onClick) {
  const b = document.createElement('button')
  b.textContent = label
  b.onclick = (e) => { e.stopPropagation(); onClick() }
  return b
}

async function selectSubject(s) {
  activeSubject = s
  questionPanel.style.display = 'block'
  questionPanelTitle.textContent = `Soal: ${s.icon} ${s.name}`
  renderSubjectList()
  await loadQuestions()
}

document.getElementById('add-subject-btn').onclick = () => editSubjectForm(null)

function editSubjectForm(subject) {
  const existing = document.getElementById('subject-form')
  if (existing) existing.remove()
  const box = document.createElement('div')
  box.className = 'form-box'
  box.id = 'subject-form'
  box.innerHTML = `
    <label>Nama Mapel</label>
    <input id="sf-name" type="text" value="${subject?.name || ''}" placeholder="Matematika" />
    <label>Ikon (emoji)</label>
    <input id="sf-icon" type="text" value="${subject?.icon || '📘'}" />
    <label>Posisi X (tata letak kota)</label>
    <input id="sf-x" type="number" value="${subject?.position_x ?? (subjects.length * 8 - 16)}" />
    <label>Posisi Z</label>
    <input id="sf-z" type="number" value="${subject?.position_z ?? -10}" />
    <button id="sf-save">💾 Simpan</button>
    <button id="sf-cancel" class="secondary" style="width:100%">Batal</button>
  `
  subjectList.prepend(box)
  document.getElementById('sf-cancel').onclick = () => box.remove()
  document.getElementById('sf-save').onclick = async () => {
    const payload = {
      name: document.getElementById('sf-name').value.trim(),
      icon: document.getElementById('sf-icon').value.trim() || '📘',
      world: 'kota',
      position_x: parseFloat(document.getElementById('sf-x').value) || 0,
      position_z: parseFloat(document.getElementById('sf-z').value) || 0,
      sort_order: subject?.sort_order ?? subjects.length,
    }
    if (!payload.name) return
    if (subject) await api.updateSubject(subject.id, payload)
    else await api.createSubject(payload)
    box.remove()
    await loadSubjects()
  }
}

// ---- questions ----
let questions = []
async function loadQuestions() {
  questions = await api.questions(activeSubject.id)
  renderQuestionList()
}

function renderQuestionList() {
  questionList.innerHTML = ''
  if (questions.length === 0) {
    questionList.innerHTML = '<p style="color:#9ca3af;font-size:.85rem">Belum ada soal.</p>'
  }
  questions.forEach((q) => {
    const row = document.createElement('div')
    row.className = 'item-row'
    row.innerHTML = `<span>${q.prompt.slice(0, 40)}${q.prompt.length > 40 ? '…' : ''}</span>`
    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.append(
      mkBtn('✏️', () => editQuestionForm(q)),
      mkBtn('🗑️', async () => {
        if (!confirm('Hapus soal ini?')) return
        await api.deleteQuestion(q.id)
        await loadQuestions()
      })
    )
    row.append(actions)
    questionList.appendChild(row)
  })
}

document.getElementById('add-question-btn').onclick = () => {
  if (!activeSubject) return alert('Pilih gedung dulu')
  editQuestionForm(null)
}

function editQuestionForm(q) {
  const existing = document.getElementById('question-form')
  if (existing) existing.remove()
  const kind = q?.kind || 'mc'
  const choices = q?.choices || ['', '', '', '']
  const box = document.createElement('div')
  box.className = 'form-box'
  box.id = 'question-form'
  box.innerHTML = `
    <label>Jenis Soal</label>
    <select id="qf-kind">
      <option value="mc" ${kind === 'mc' ? 'selected' : ''}>Pilihan Ganda</option>
      <option value="short" ${kind === 'short' ? 'selected' : ''}>Isian Singkat</option>
    </select>
    <label>Pertanyaan</label>
    <textarea id="qf-prompt" rows="2">${q?.prompt || ''}</textarea>
    <div id="qf-mc-area"></div>
    <div id="qf-short-area" style="display:none">
      <label>Jawaban Benar</label>
      <input id="qf-correct-text" type="text" value="${q?.correct_text || ''}" />
    </div>
    <label>Pembahasan (opsional)</label>
    <input id="qf-explanation" type="text" value="${q?.explanation || ''}" />
    <button id="qf-save">💾 Simpan</button>
    <button id="qf-cancel" class="secondary" style="width:100%">Batal</button>
  `
  questionList.prepend(box)

  const mcArea = document.getElementById('qf-mc-area')
  const shortArea = document.getElementById('qf-short-area')
  function renderChoices() {
    mcArea.innerHTML = '<label>Pilihan Jawaban (centang yang benar)</label>'
    choices.forEach((c, i) => {
      const row = document.createElement('div')
      row.className = 'choice-input-row'
      row.innerHTML = `
        <input type="radio" name="qf-correct" value="${i}" ${q?.correct_index === i ? 'checked' : ''} />
        <input type="text" value="${c}" data-idx="${i}" />
      `
      row.querySelector('input[type=text]').oninput = (e) => { choices[i] = e.target.value }
      mcArea.appendChild(row)
    })
  }
  renderChoices()

  function syncKindUI() {
    const k = document.getElementById('qf-kind').value
    mcArea.style.display = k === 'mc' ? 'block' : 'none'
    shortArea.style.display = k === 'short' ? 'block' : 'none'
  }
  document.getElementById('qf-kind').onchange = syncKindUI
  syncKindUI()

  document.getElementById('qf-cancel').onclick = () => box.remove()
  document.getElementById('qf-save').onclick = async () => {
    const k = document.getElementById('qf-kind').value
    const prompt = document.getElementById('qf-prompt').value.trim()
    if (!prompt) return
    const payload = { kind: k, prompt, explanation: document.getElementById('qf-explanation').value.trim(), sort_order: q?.sort_order ?? questions.length }
    if (k === 'mc') {
      const correctRadio = mcArea.querySelector('input[type=radio]:checked')
      payload.choices = choices.filter((c) => c.trim() !== '')
      payload.correct_index = correctRadio ? parseInt(correctRadio.value) : 0
    } else {
      payload.correct_text = document.getElementById('qf-correct-text').value.trim()
    }
    if (q) await api.updateQuestion(q.id, payload)
    else await api.createQuestion(activeSubject.id, payload)
    box.remove()
    await loadQuestions()
  }
}

boot()

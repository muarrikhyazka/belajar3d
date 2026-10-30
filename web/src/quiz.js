import { api } from './api.js'

const screen = document.getElementById('quiz-screen')
const subjectEl = document.getElementById('quiz-subject')
const progressEl = document.getElementById('quiz-progress')
const promptEl = document.getElementById('quiz-prompt')
const choicesEl = document.getElementById('quiz-choices')
const feedbackEl = document.getElementById('quiz-feedback')
const nextBtn = document.getElementById('quiz-next')
const closeBtn = document.getElementById('quiz-close')
const resultScreen = document.getElementById('result-screen')

export async function startQuiz(subject, nickname, clientID, onClose) {
  screen.classList.remove('hidden')
  subjectEl.textContent = `${subject.icon} ${subject.name}`

  let questions
  try {
    questions = await api.questions(subject.id)
  } catch (e) {
    promptEl.textContent = 'Gagal memuat soal: ' + e.message
    choicesEl.innerHTML = ''
    return
  }

  if (!questions || questions.length === 0) {
    promptEl.textContent = 'Belum ada soal untuk gedung ini. Minta gurumu menambahkan soal dulu!'
    choicesEl.innerHTML = ''
    nextBtn.classList.add('hidden')
    closeBtn.onclick = () => { screen.classList.add('hidden'); onClose() }
    return
  }

  // shuffle so replays feel fresh
  questions = [...questions].sort(() => Math.random() - 0.5)
  let idx = 0
  let score = 0
  let answered = false

  function renderQuestion() {
    answered = false
    const q = questions[idx]
    progressEl.textContent = `Soal ${idx + 1} / ${questions.length}`
    promptEl.textContent = q.prompt
    feedbackEl.textContent = ''
    nextBtn.classList.add('hidden')
    choicesEl.innerHTML = ''

    const choices = q.kind === 'short' ? null : (q.choices || [])
    if (q.kind === 'short') {
      const input = document.createElement('input')
      input.placeholder = 'Jawabanmu...'
      input.className = 'choice-btn'
      input.style.cursor = 'text'
      const submit = document.createElement('button')
      submit.textContent = 'Jawab'
      submit.className = 'choice-btn'
      submit.onclick = () => {
        if (answered) return
        const correct = (input.value || '').trim().toLowerCase() === (q.correct_text || '').trim().toLowerCase()
        handleAnswer(correct, null, q)
      }
      choicesEl.appendChild(input)
      choicesEl.appendChild(submit)
    } else {
      choices.forEach((c, i) => {
        const btn = document.createElement('button')
        btn.className = 'choice-btn'
        btn.textContent = c
        btn.onclick = () => {
          if (answered) return
          handleAnswer(i === q.correct_index, i, q)
        }
        choicesEl.appendChild(btn)
      })
    }
  }

  function handleAnswer(correct, chosenIndex, q) {
    answered = true
    if (correct) score++
    if (chosenIndex !== null) {
      const btns = [...choicesEl.children]
      btns[chosenIndex].classList.add(correct ? 'correct' : 'wrong')
      if (!correct && q.correct_index != null) btns[q.correct_index].classList.add('correct')
    }
    feedbackEl.textContent = correct
      ? '✅ Benar!' + (q.explanation ? ' ' + q.explanation : '')
      : '❌ Kurang tepat.' + (q.explanation ? ' ' + q.explanation : '')
    nextBtn.classList.remove('hidden')
    nextBtn.textContent = idx + 1 < questions.length ? 'Lanjut ➜' : 'Lihat Hasil'
  }

  nextBtn.onclick = async () => {
    idx++
    if (idx >= questions.length) {
      screen.classList.add('hidden')
      await finish()
    } else {
      renderQuestion()
    }
  }

  closeBtn.onclick = () => { screen.classList.add('hidden'); onClose() }

  async function finish() {
    let result
    try {
      result = await api.submitAttempt({ client_id: clientID, nickname, subject_id: subject.id, score, total: questions.length })
    } catch (e) {
      result = { xp_earned: score * 10, total_xp: 0, level: 1 }
    }
    document.getElementById('result-title').textContent = score === questions.length ? '🏆 Sempurna!' : score >= questions.length / 2 ? '🎉 Kerja Bagus!' : '💪 Coba Lagi!'
    document.getElementById('result-score').textContent = `Benar: ${score} / ${questions.length}`
    document.getElementById('result-xp').textContent = `+${result.xp_earned} XP (Total: ${result.total_xp} • Level ${result.level})`
    resultScreen.classList.remove('hidden')
    document.getElementById('result-close').onclick = () => {
      resultScreen.classList.add('hidden')
      onClose()
      window.dispatchEvent(new CustomEvent('belajar3d:progress-updated'))
    }
  }

  renderQuestion()
}

const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  subjects: () => req('/subjects'),
  questions: (subjectId) => req(`/subjects/${subjectId}/questions`),
  submitAttempt: (body) => req('/attempts', { method: 'POST', body: JSON.stringify(body) }),
  progress: (clientId) => req(`/progress/${clientId}`),
  leaderboard: () => req('/leaderboard'),

  // teacher-only
  login: (email, password) => req('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/logout', { method: 'POST' }),
  me: () => req('/me'),
  createSubject: (s) => req('/subjects', { method: 'POST', body: JSON.stringify(s) }),
  updateSubject: (id, s) => req(`/subjects/${id}`, { method: 'PUT', body: JSON.stringify(s) }),
  deleteSubject: (id) => req(`/subjects/${id}`, { method: 'DELETE' }),
  createQuestion: (subjectId, q) => req(`/subjects/${subjectId}/questions`, { method: 'POST', body: JSON.stringify(q) }),
  updateQuestion: (id, q) => req(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(q) }),
  deleteQuestion: (id) => req(`/questions/${id}`, { method: 'DELETE' }),
}

// Anonymous player identity, matching ZuperVerse's "tanpa akun" model.
export function getClientID() {
  let id = localStorage.getItem('belajar3d_client_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('belajar3d_client_id', id)
  }
  return id
}

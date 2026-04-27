import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { surveyApi } from '@/api/surveyApi'

interface QuestionDraft {
  id: string
  text: string
  options: { id: string; text: string }[]
}

function uid() { return Math.random().toString(36).slice(2) }
function makeQuestion(): QuestionDraft {
  return { id: uid(), text: '', options: [{ id: uid(), text: '' }, { id: uid(), text: '' }] }
}

export default function CreateSurveyPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [questions, setQuestions] = useState<QuestionDraft[]>([makeQuestion()])
  const [loading, setLoading] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const updateQ = (qId: string, text: string) =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, text } : q))

  const updateO = (qId: string, oId: string, text: string) =>
    setQuestions((p) => p.map((q) => q.id === qId
      ? { ...q, options: q.options.map((o) => o.id === oId ? { ...o, text } : o) }
      : q))

  const addOption = (qId: string) =>
    setQuestions((p) => p.map((q) => q.id === qId && q.options.length < 10
      ? { ...q, options: [...q.options, { id: uid(), text: '' }] } : q))

  const removeOption = (qId: string, oId: string) =>
    setQuestions((p) => p.map((q) => q.id === qId && q.options.length > 2
      ? { ...q, options: q.options.filter((o) => o.id !== oId) } : q))

  const addQuestion = () => {
    if (questions.length >= 20) { toast.error('Максимум 20 питань'); return }
    setQuestions((p) => [...p, makeQuestion()])
  }

  const removeQuestion = (qId: string) => {
    if (questions.length === 1) { toast.error('Потрібне хоча б одне питання'); return }
    setQuestions((p) => p.filter((q) => q.id !== qId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('Введіть назву'); return }
    for (const q of questions) {
      if (!q.text.trim()) { toast.error('Заповніть текст питань'); return }
      if (q.options.some((o) => !o.text.trim())) { toast.error('Заповніть всі варіанти'); return }
    }
    setLoading(true)
    try {
      const { survey } = await surveyApi.create({
        title: title.trim(), isPublic,
        questions: questions.map((q) => ({
          text: q.text.trim(),
          options: q.options.map((o) => ({ text: o.text.trim() })),
        })),
      })
      setCreatedId(survey.id)
      toast.success('Опитування створено!')
    } catch { toast.error('Помилка створення') }
    finally { setLoading(false) }
  }

  const surveyLink = createdId ? `${window.location.origin}/survey/${createdId}` : ''

  const copyLink = () => {
    navigator.clipboard.writeText(surveyLink).then(() => {
      setCopied(true)
      toast.success('Посилання скопійовано!')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (createdId) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '580px' }}>
          <div className="card card-glow text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Опитування створено!</h2>
            <p style={{ marginBottom: '2rem' }}>Поділіться посиланням з учасниками</p>
            <div className="copy-input-wrap" style={{ marginBottom: '1.5rem' }}>
              <input readOnly value={surveyLink} />
              <button className="btn btn-primary btn-sm" onClick={copyLink}>
                {copied ? '✅ Скопійовано' : '📋 Копіювати'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => navigate(`/survey/${createdId}`)}>
                👀 Переглянути
              </button>
              <button className="btn btn-ghost" onClick={() => navigate(`/survey/${createdId}/results`)}>
                📊 Результати
              </button>
              <button className="btn btn-ghost"
                onClick={() => { setCreatedId(null); setTitle(''); setQuestions([makeQuestion()]) }}>
                ✨ Нове
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '720px' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✨ Нове опитування</h1>
          <p>Заповніть форму — отримаєте унікальне посилання для поширення</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Meta */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--blue)' }}>📝 Інформація</h3>
            <div className="form-group">
              <label className="form-label">Назва <span className="required">*</span></label>
              <input className="form-input" placeholder="Наприклад: Яку мову програмування ви обрали б?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--blue)' }} />
                Публічне опитування (доступне для голосування)
              </label>
            </div>
          </div>

          {/* Questions */}
          {questions.map((q, qIdx) => (
            <div key={q.id} className="card" style={{ marginBottom: '1rem' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
                <span className="badge badge-mauve">Питання {qIdx + 1}</span>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeQuestion(q.id)}>🗑</button>
              </div>
              <div className="form-group">
                <input className="form-input" placeholder={`Текст питання ${qIdx + 1}...`} value={q.text} onChange={(e) => updateQ(q.id, e.target.value)} maxLength={500} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
                {q.options.map((o, oIdx) => (
                  <div key={o.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--overlay0)', fontSize: '0.8rem', minWidth: '20px', textAlign: 'right' }}>{oIdx + 1}.</span>
                    <input className="form-input" placeholder={`Варіант ${oIdx + 1}...`} value={o.text} onChange={(e) => updateO(q.id, o.id, e.target.value)} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeOption(q.id, o.id)} style={{ color: 'var(--red)', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              {q.options.length < 10 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addOption(q.id)}>+ Додати варіант</button>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '2rem', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={addQuestion}>+ Додати питання</button>
            <span style={{ color: 'var(--overlay0)', fontSize: '0.8rem' }}>{questions.length}/20</span>
          </div>

          <button type="submit" className={`btn btn-primary btn-lg w-full ${loading ? 'btn-loading' : ''}`} disabled={loading}>
            {!loading && '🚀 Створити опитування'}
          </button>
        </form>
      </div>
    </div>
  )
}

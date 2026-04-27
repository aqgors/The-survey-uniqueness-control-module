import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { surveyApi } from '@/api/surveyApi'
import { Plus, Trash2, Calendar } from 'lucide-react'

interface QuestionDraft {
  id: string
  text: string
  imageUrl?: string
  options: { id: string; text: string }[]
}

function uid() { return Math.random().toString(36).slice(2) }
function makeQuestion(): QuestionDraft {
  return { id: uid(), text: '', imageUrl: '', options: [{ id: uid(), text: '' }, { id: uid(), text: '' }] }
}

export default function CreateSurveyPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [deadline, setDeadline] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [questions, setQuestions] = useState<QuestionDraft[]>([makeQuestion()])
  const [loading, setLoading] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const updateQ = (qId: string, text: string) =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, text } : q))

  const updateQImage = (qId: string, imageUrl: string) =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, imageUrl } : q))

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
    
    let parsedDeadline: string | undefined = undefined;
    if (deadline) {
      const d = new Date(deadline);
      if (d <= new Date()) {
        toast.error('Дедлайн має бути в майбутньому'); return;
      }
      parsedDeadline = d.toISOString();
    }

    setLoading(true)
    try {
      const { survey } = await surveyApi.create({
        title: title.trim(), 
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        isPublic,
        deadline: parsedDeadline,
        questions: questions.map((q) => ({
          text: q.text.trim(),
          imageUrl: q.imageUrl?.trim() || undefined,
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
      <div className="max-w-2xl mx-auto mt-12 animate-in fade-in duration-500">
        <div className="card p-12 text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="heading-2 mb-2">Опитування створено!</h2>
          <p className="text-textMuted mb-8">Поділіться посиланням з учасниками</p>
          
          <div className="flex gap-2 mb-8 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-borderLight">
            <input 
              readOnly 
              value={surveyLink} 
              className="flex-1 bg-transparent border-none focus:outline-none px-2 text-textMain"
            />
            <button className="btn btn-primary" onClick={copyLink}>
              {copied ? '✅ Скопійовано' : '📋 Копіювати'}
            </button>
          </div>
          
          <div className="flex gap-4 justify-center flex-wrap">
            <button className="btn btn-secondary" onClick={() => navigate(`/survey/${createdId}`)}>
              👀 Переглянути
            </button>
            <button className="btn btn-secondary" onClick={() => navigate(`/results/${createdId}`)}>
              📊 Результати
            </button>
            <button className="btn btn-accent"
              onClick={() => { setCreatedId(null); setTitle(''); setDescription(''); setDeadline(''); setQuestions([makeQuestion()]) }}>
              ✨ Нове опитування
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="heading-1 mb-2">✨ Нове опитування</h1>
        <p className="text-textMuted">Заповніть форму — отримаєте унікальне посилання для поширення</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Meta */}
        <div className="card p-6 md:p-8 space-y-6">
          <h3 className="text-lg font-bold text-accent mb-4">📝 Інформація</h3>
          
          <div>
            <label className="label-text">Назва <span className="text-error">*</span></label>
            <input 
              className="input-field" 
              placeholder="Наприклад: Яку мову програмування ви обрали б?" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              maxLength={200} 
            />
          </div>

          <div>
            <label className="label-text">Опис (необов'язково)</label>
            <textarea 
              className="input-field min-h-[100px] resize-y" 
              placeholder="Короткий опис опитування..." 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              maxLength={1000} 
            />
          </div>

          <div>
            <label className="label-text flex items-center gap-2">Зображення (URL) (необов'язково)</label>
            <input 
              type="url"
              className="input-field" 
              placeholder="https://example.com/image.jpg" 
              value={imageUrl} 
              onChange={(e) => setImageUrl(e.target.value)} 
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="label-text flex items-center gap-2">
                <Calendar className="w-4 h-4 text-textMuted" /> 
                Дедлайн (необов'язково)
              </label>
              <input 
                type="datetime-local" 
                className="input-field" 
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <p className="text-xs text-textMuted mt-1">Після цієї дати голосування буде закрито.</p>
            </div>

            <div className="flex items-center h-full pt-6">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors w-full border border-transparent hover:border-borderLight">
                <input 
                  type="checkbox" 
                  checked={isPublic} 
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent" 
                />
                <div>
                  <div className="font-medium text-textMain">Публічне опитування</div>
                  <div className="text-xs text-textMuted">Відкрите для голосування</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div key={q.id} className="card p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-sm font-bold">
                  Питання {qIdx + 1}
                </span>
                <button type="button" className="btn btn-danger !p-2" onClick={() => removeQuestion(q.id)} title="Видалити питання">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mb-6 space-y-4">
                <div>
                  <label className="label-text">Текст питання</label>
                  <input 
                    className="input-field text-lg font-medium placeholder:font-normal" 
                    placeholder={`Текст питання ${qIdx + 1}...`} 
                    value={q.text} 
                    onChange={(e) => updateQ(q.id, e.target.value)} 
                    maxLength={500} 
                  />
                </div>
                <div>
                  <label className="label-text">URL зображення для питання (необов'язково)</label>
                  <input 
                    className="input-field" 
                    placeholder="https://example.com/question-image.jpg" 
                    value={q.imageUrl || ''} 
                    onChange={(e) => updateQImage(q.id, e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-3 mb-4">
                {q.options.map((o, oIdx) => (
                  <div key={o.id} className="flex gap-3 items-center">
                    <span className="text-textMuted text-sm font-medium w-6 text-right">{oIdx + 1}.</span>
                    <input 
                      className="input-field" 
                      placeholder={`Варіант ${oIdx + 1}...`} 
                      value={o.text} 
                      onChange={(e) => updateO(q.id, o.id, e.target.value)} 
                    />
                    <button 
                      type="button" 
                      className="p-2 text-slate-400 hover:text-error transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0" 
                      onClick={() => removeOption(q.id, o.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              
              {q.options.length < 10 && (
                <button type="button" className="text-sm font-medium text-accent hover:text-accentHover flex items-center gap-1 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => addOption(q.id)}>
                  <Plus className="w-4 h-4" /> Додати варіант
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-borderLight border-dashed">
          <button type="button" className="btn btn-secondary" onClick={addQuestion}>
            <Plus className="w-4 h-4" /> Додати питання
          </button>
          <span className="text-sm font-medium text-textMuted">
            {questions.length} / 20 питань
          </span>
        </div>

        <button type="submit" className="btn btn-primary w-full text-lg py-4 shadow-lg shadow-blue-500/20" disabled={loading}>
          {loading ? 'Створення...' : '🚀 Створити опитування'}
        </button>
      </form>
    </div>
  )
}

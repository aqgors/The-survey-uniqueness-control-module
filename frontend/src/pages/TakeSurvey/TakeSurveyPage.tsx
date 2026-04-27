import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  surveyApi,
  getOrCreateVoterId,
  persistVoterId,
  isAlreadyVotedError,
  type Survey,
  type AlreadyVotedError,
} from '@/api/surveyApi'

// ── Types ──────────────────────────────────────────────────────────────────

type Answers = Record<string, string>   // questionId → optionId (single choice)
type PageStatus = 'loading' | 'ready' | 'submitting' | 'success' | 'already_voted' | 'closed' | 'error'

const SIGNAL_LABELS: Record<NonNullable<AlreadyVotedError['signal']>, string> = {
  cookieId:  'Cookie / localStorage',
  ip:        'IP-адреса',
  userAgent: 'Браузер (User-Agent)',
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeSurveyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [survey,  setSurvey]  = useState<Survey | null>(null)
  const [status,  setStatus]  = useState<PageStatus>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [fraudSignal, setFraudSignal] = useState<AlreadyVotedError['signal'] | null>(null)
  const [fraudMessage, setFraudMessage] = useState('')

  // voter cookie — persisted in localStorage, sent with every vote request
  const voterIdRef = useRef<string>(getOrCreateVoterId())

  // ── Load survey ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    surveyApi.getById(id)
      .then((s) => {
        setSurvey(s)
        setStatus('ready')
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 404) navigate('/404', { replace: true })
        else if (status === 403) setStatus('closed')
        else { setStatus('error'); toast.error('Не вдалося завантажити опитування') }
      })
  }, [id, navigate])

  // ── Select answer ────────────────────────────────────────────────────────

  const selectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  // ── Validate all questions answered ─────────────────────────────────────

  const allAnswered = survey
    ? survey.questions.every((q) => answers[q.id])
    : false

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!survey || !id) return
    if (!allAnswered) {
      toast.error('Будь ласка, дайте відповідь на всі питання')
      return
    }

    setStatus('submitting')

    try {
      const result = await surveyApi.vote(id, {
        cookieId: voterIdRef.current,
        answers: survey.questions.map((q) => ({
          questionId: q.id,
          optionIds:  [answers[q.id]],
        })),
      })

      // Persist the cookieId returned by server (may differ if server read it from cookie header)
      if (result.cookieId) {
        voterIdRef.current = result.cookieId
        persistVoterId(result.cookieId)
      }

      setStatus('success')
    } catch (err) {
      if (isAlreadyVotedError(err)) {
        setFraudSignal(err.response!.data.signal)
        setFraudMessage(err.response!.data.message)
        setStatus('already_voted')
      } else {
        setStatus('ready')
        toast.error('Помилка надсилання голосу. Спробуйте ще раз.')
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER STATES
  // ════════════════════════════════════════════════════════════════════════

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '640px' }}>
          <div className="card">
            <div className="skeleton" style={{ height: '28px', width: '65%', marginBottom: '0.75rem' }} />
            <div className="skeleton" style={{ height: '14px', width: '40%', marginBottom: '2rem' }} />
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: '54px', marginBottom: '0.625rem', borderRadius: '12px' }} />
            ))}
            <div className="skeleton" style={{ height: '48px', marginTop: '1rem', borderRadius: '12px' }} />
          </div>
        </div>
      </div>
    )
  }

  // ── Closed / not public ───────────────────────────────────────────────────
  if (status === 'closed') {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '480px' }}>
          <div className="card text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Опитування закрите</h2>
            <p style={{ marginBottom: '2rem' }}>Це опитування більше не приймає голоси.</p>
            <Link to="/" className="btn btn-secondary">← На головну</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Already voted ─────────────────────────────────────────────────────────
  if (status === 'already_voted') {
    const signalLabel = fraudSignal ? SIGNAL_LABELS[fraudSignal] : 'невідомий сигнал'

    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '540px' }}>
          <div className="card text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🛡️</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Ви вже голосували</h2>
            <p style={{ marginBottom: '1.75rem', color: 'var(--subtext0)' }}>
              Anti-Fraud система виявила повторну спробу. Принцип «один голос» захищає чесність результатів.
            </p>

            {/* Signal breakdown */}
            <div className="card card-sm" style={{ marginBottom: '1.75rem', textAlign: 'left' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--overlay1)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Результат перевірки
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(['cookieId', 'ip', 'userAgent'] as const).map((sig) => {
                  const isTriggered = sig === fraudSignal
                  return (
                    <div key={sig} className="flex items-center gap-1"
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', background: isTriggered ? 'rgba(243,139,168,0.08)' : 'transparent' }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                        {isTriggered ? '🔴' : '🟢'}
                      </span>
                      <span style={{ fontSize: '0.875rem', flex: 1, color: isTriggered ? 'var(--red)' : 'var(--subtext0)' }}>
                        {SIGNAL_LABELS[sig]}
                      </span>
                      {isTriggered && (
                        <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>дублікат</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface0)', fontSize: '0.8rem', color: 'var(--overlay0)' }}>
                Спрацьований сигнал: <strong style={{ color: 'var(--red)' }}>{signalLabel}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to={`/survey/${id}/results`} className="btn btn-primary">
                📊 Переглянути результати
              </Link>
              <Link to="/" className="btn btn-secondary">← На головну</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '480px' }}>
          <div className="card card-glow text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Голос прийнято!</h2>
            <p style={{ marginBottom: '0.5rem' }}>
              Дякуємо за участь в опитуванні
            </p>
            <p style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: '2rem', fontSize: '1.05rem' }}>
              «{survey?.title}»
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to={`/survey/${id}/results`} className="btn btn-primary btn-lg">
                📊 Дивитись результати →
              </Link>
              <Link to="/" className="btn btn-secondary">На головну</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error' || !survey) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '480px' }}>
          <div className="card text-center" style={{ padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ marginBottom: '1rem' }}>Щось пішло не так</h2>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              🔄 Спробувати знову
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Survey form (main state) ──────────────────────────────────────────────

  const answeredCount = Object.keys(answers).length
  const totalCount    = survey.questions.length
  const progress      = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '660px' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="flex items-center gap-1" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span className="badge badge-blue">🗳️ Опитування</span>
            <span className="badge badge-mauve">{totalCount} {totalCount === 1 ? 'питання' : totalCount < 5 ? 'питання' : 'питань'}</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{survey.title}</h1>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
            <div className="progress-bar-wrap" style={{ flex: 1 }}>
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--overlay1)', flexShrink: 0 }}>
              {answeredCount}/{totalCount} відповідей
            </span>
          </div>
        </div>

        {/* ── Questions ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
          {survey.questions.map((question, qIdx) => {
            const selectedOption = answers[question.id]
            const isAnswered = Boolean(selectedOption)

            return (
              <div
                key={question.id}
                className="card"
                style={{
                  borderColor: isAnswered ? 'rgba(137,180,250,0.4)' : 'var(--surface0)',
                  transition: 'border-color 0.2s ease',
                }}
              >
                {/* Question header */}
                <div className="flex items-center gap-1" style={{ marginBottom: '1rem' }}>
                  <span
                    className="badge"
                    style={{
                      background: isAnswered ? 'rgba(166,227,161,0.15)' : 'rgba(203,166,247,0.15)',
                      color: isAnswered ? 'var(--green)' : 'var(--mauve)',
                      border: `1px solid ${isAnswered ? 'rgba(166,227,161,0.3)' : 'rgba(203,166,247,0.3)'}`,
                    }}
                  >
                    {isAnswered ? '✓' : qIdx + 1}
                  </span>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, flex: 1, color: 'var(--text)', margin: 0 }}>
                    {question.text}
                  </h3>
                </div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {question.options.map((option) => {
                    const isSelected = selectedOption === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`option-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => selectOption(question.id, option.id)}
                        style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                      >
                        {/* Radio indicator */}
                        <div
                          style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            border: `2px solid ${isSelected ? 'var(--blue)' : 'var(--surface1)'}`,
                            background: isSelected ? 'var(--blue)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected && (
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--base)' }} />
                          )}
                        </div>
                        <span style={{ flex: 1, fontSize: '0.95rem' }}>{option.text}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Submit button ───────────────────────────────────────────── */}
        <div style={{ position: 'sticky', bottom: '1.5rem' }}>
          <button
            className={`btn btn-primary btn-lg w-full ${status === 'submitting' ? 'btn-loading' : ''}`}
            onClick={handleSubmit}
            disabled={!allAnswered || status === 'submitting'}
            style={{
              boxShadow: allAnswered
                ? '0 8px 32px rgba(137,180,250,0.4)'
                : 'none',
              opacity: allAnswered ? 1 : 0.6,
            }}
          >
            {status !== 'submitting' && (
              <>
                {allAnswered ? '🚀 Проголосувати' : `Дайте відповідь на всі питання (${answeredCount}/${totalCount})`}
              </>
            )}
          </button>
        </div>

        {/* ── Anti-fraud notice ──────────────────────────────────────── */}
        <div className="alert alert-info" style={{ marginTop: '1.5rem', fontSize: '0.8rem' }}>
          <span className="alert-icon">🛡️</span>
          <span>
            Голосування без реєстрації. Система перевіряє унікальність за{' '}
            <strong>Cookie</strong>, <strong>IP-адресою</strong> та <strong>браузером</strong>.
            Повторне голосування буде відхилено.
          </span>
        </div>

      </div>
    </div>
  )
}

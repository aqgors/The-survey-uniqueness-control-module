import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js'
import { surveyApi, type SurveyResults } from '@/api/surveyApi'
import { useResultsWebSocket } from '@/api/useResultsWebSocket'
import toast from 'react-hot-toast'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const PALETTE = [
  'rgba(137,180,250,0.85)', 'rgba(203,166,247,0.85)',
  'rgba(166,227,161,0.85)', 'rgba(249,226,175,0.85)',
  'rgba(250,179,135,0.85)', 'rgba(116,199,236,0.85)',
  'rgba(148,226,213,0.85)', 'rgba(243,139,168,0.85)',
]

export default function ResultsPage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()

  // HTTP bootstrap — load initial results once, seed WS hook
  const [httpResults, setHttpResults] = useState<SurveyResults | null>(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!id) return
    surveyApi.getResults(id)
      .then(setHttpResults)
      .catch((err: unknown) => {
        const e = err as { response?: { status?: number } }
        if (e?.response?.status === 404) navigate('/404')
        else toast.error('Помилка завантаження результатів')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  // WebSocket — real-time updates on top of HTTP seed
  const { liveResults, wsStatus, wsLabel, lastUpdate, reconnect } =
    useResultsWebSocket(id, httpResults)

  // Use live results if available, fall back to HTTP results
  const results = liveResults ?? httpResults

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: '760px' }}>
          <div className="skeleton" style={{ height: '32px', width: '50%', marginBottom: '1rem' }} />
          <div className="skeleton" style={{ height: '16px', width: '25%', marginBottom: '2rem' }} />
          {[1, 2].map((i) => (
            <div key={i} className="card" style={{ marginBottom: '1rem' }}>
              <div className="skeleton" style={{ height: '18px', width: '55%', marginBottom: '1rem' }} />
              <div className="skeleton" style={{ height: '180px' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!results) return null

  const voteLink = `${window.location.origin}/survey/${id}`

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '760px' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="flex items-center gap-1" style={{ marginBottom: '0.875rem', flexWrap: 'wrap' }}>
            <Link to="/" className="btn btn-ghost btn-sm">← Головна</Link>
            <Link to={`/survey/${id}`} className="btn btn-secondary btn-sm">🗳️ Голосувати</Link>
          </div>

          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.875rem' }}>{results.title}</h1>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge badge-mauve" style={{ padding: '0.4rem 0.875rem', fontSize: '0.85rem' }}>
              👥 {results.totalVoters} {results.totalVoters === 1 ? 'голос' : results.totalVoters < 5 ? 'голоси' : 'голосів'}
            </span>
            <span className="badge badge-blue" style={{ padding: '0.4rem 0.875rem', fontSize: '0.85rem' }}>
              📅 {new Date(results.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
            </span>

            {/* ── WebSocket status indicator ─────────────────────────── */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.3rem 0.75rem',
                background: wsStatus === 'connected'    ? 'rgba(166,227,161,0.1)'  :
                            wsStatus === 'reconnecting' ? 'rgba(249,226,175,0.1)'  :
                            wsStatus === 'connecting'   ? 'rgba(137,180,250,0.1)'  :
                                                          'rgba(243,139,168,0.1)',
                border: `1px solid ${
                  wsStatus === 'connected'    ? 'rgba(166,227,161,0.3)'  :
                  wsStatus === 'reconnecting' ? 'rgba(249,226,175,0.3)'  :
                  wsStatus === 'connecting'   ? 'rgba(137,180,250,0.3)'  :
                                               'rgba(243,139,168,0.3)'}`,
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: wsStatus === 'disconnected' ? 'pointer' : 'default',
              }}
              onClick={() => wsStatus === 'disconnected' && reconnect()}
              title={wsStatus === 'disconnected' ? 'Натисніть для перепідключення' : undefined}
            >
              <span>{wsLabel}</span>
              {wsStatus === 'disconnected' && (
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↩ клікніть</span>
              )}
            </div>

            {/* Last update timestamp */}
            {lastUpdate && (
              <span style={{ fontSize: '0.75rem', color: 'var(--overlay0)' }}>
                оновлено {lastUpdate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* ── Share link ──────────────────────────────────────────────── */}
        <div className="card card-sm" style={{ marginBottom: '1.5rem' }}>
          <div className="copy-input-wrap">
            <input readOnly value={voteLink} />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(voteLink)
                toast.success('Посилання скопійовано!')
              }}
            >
              📋 Копіювати
            </button>
          </div>
        </div>

        {/* ── No votes yet ────────────────────────────────────────────── */}
        {results.totalVoters === 0 && (
          <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
            <span className="alert-icon">📭</span>
            <span>Голосів ще немає. Поділіться посиланням — результати з'являться автоматично.</span>
          </div>
        )}

        {/* ── Results per question ─────────────────────────────────────── */}
        {results.questions.map((q, qIdx) => {
          const sorted = [...q.options].sort((a, b) => b.votes - a.votes)

          const chartData = {
            labels: q.options.map((o) =>
              o.text.length > 22 ? o.text.slice(0, 22) + '…' : o.text
            ),
            datasets: [{
              label: 'Голосів',
              data: q.options.map((o) => o.votes),
              backgroundColor: PALETTE.slice(0, q.options.length),
              borderColor: PALETTE.slice(0, q.options.length).map((c) => c.replace('0.85', '1')),
              borderWidth: 1,
              borderRadius: 6,
            }],
          }

          return (
            <div key={q.id} className="card" style={{ marginBottom: '1.25rem' }}>
              {/* Question header */}
              <div className="flex items-center gap-1" style={{ marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                <span className="badge badge-mauve">Питання {qIdx + 1}</span>
                {results.totalVoters > 0 && sorted[0]?.votes > 0 && (
                  <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                    🏆 {sorted[0].text}
                  </span>
                )}
              </div>

              <h3 style={{ fontSize: '1.05rem', marginBottom: '1.25rem', color: 'var(--text)' }}>
                {q.text}
              </h3>

              {/* Bar chart */}
              {results.totalVoters > 0 && (
                <div style={{ marginBottom: '1.25rem', maxHeight: '220px' }}>
                  <Bar
                    data={chartData}
                    options={{
                      responsive: true,
                      animation: { duration: 400 },
                      plugins: { legend: { display: false } },
                      scales: {
                        x: {
                          ticks: { color: '#a6adc8', font: { family: 'Inter', size: 11 } },
                          grid:  { color: 'rgba(69,71,90,0.4)' },
                        },
                        y: {
                          beginAtZero: true,
                          ticks: { color: '#a6adc8', stepSize: 1, precision: 0, font: { family: 'Inter', size: 11 } },
                          grid:  { color: 'rgba(69,71,90,0.4)' },
                        },
                      },
                    }}
                  />
                </div>
              )}

              {/* Progress rows (sorted by votes) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {sorted.map((opt, oIdx) => (
                  <div key={opt.id}>
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span>{oIdx === 0 && results.totalVoters > 0 ? '🥇' : oIdx === 1 ? '🥈' : oIdx === 2 ? '🥉' : ''}</span>
                        {opt.text}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--blue)', flexShrink: 0 }}>
                        {opt.votes} ({opt.percentage}%)
                      </span>
                    </div>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${opt.percentage}%`,
                          background: PALETTE[oIdx % PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* ── Footer notice ────────────────────────────────────────────── */}
        <div className="alert alert-info">
          <span className="alert-icon">⚡</span>
          <div>
            <strong>Результати в реальному часі.</strong>{' '}
            Сторінка оновлюється автоматично через WebSocket після кожного голосу.
            {wsStatus === 'disconnected' && (
              <span style={{ color: 'var(--red)', marginLeft: '0.5rem' }}>
                З'єднання втрачено —{' '}
                <button
                  onClick={reconnect}
                  style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
                >
                  підключитись знову
                </button>
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

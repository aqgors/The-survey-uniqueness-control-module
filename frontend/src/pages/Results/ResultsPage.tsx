import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js'
import { surveyApi, type SurveyResults } from '@/api/surveyApi'
import { useSurveyWebSocket } from '@/api/useSurveyWebSocket'
import { useTheme } from '@/context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeft, Share2, Users, Calendar, Info, Loader2, Lock } from 'lucide-react'
import ExportBlock from '@/components/ExportBlock'
import InviteManagementPanel from './components/InviteManagementPanel'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const PALETTE = [
  'rgba(59, 130, 246, 0.85)',
  'rgba(139, 92, 246, 0.85)',
  'rgba(16, 185, 129, 0.85)',
  'rgba(245, 158, 11, 0.85)',
  'rgba(239, 68, 68, 0.85)',
  'rgba(14, 165, 233, 0.85)',
]

export default function ResultsPage() {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [httpResults, setHttpResults] = useState<SurveyResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')

  const loadResults = useCallback(() => {
    if (!id) return
    const token = sessionStorage.getItem(`unlock_${id}`) || undefined
    surveyApi.getResults(id, token)
      .then((res) => {
        setHttpResults(res)
        setPasswordRequired(false)
      })
      .catch((err: unknown) => {
        const e = err as { response?: { status?: number, data?: { error?: string } } }
        if (e?.response?.status === 404 || e?.response?.status === 410) {
          toast.error(e?.response?.status === 410 ? t('results.errors.closed') : t('results.errors.notFound'), { id: 'status-error' })
          navigate('/', { replace: true })
        } else if (e?.response?.status === 403 && e?.response?.data?.error === 'not_public') {
          setPasswordRequired(true)
        } else if (e?.response?.status === 429) {
          toast.error(t('takeSurvey.rateLimited'), { id: 'rate-limit-error' })
          navigate('/', { replace: true })
        } else {
          toast.error(t('toast.failedLoad'), { id: 'load-error' })
        }
      })
      .finally(() => setLoading(false))
  }, [id, navigate, t])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !passwordInput.trim()) return
    try {
      const res = await surveyApi.unlock(id, passwordInput.trim())
      if (res.success) {
        sessionStorage.setItem(`unlock_${id}`, res.unlockToken)
        toast.success(t('takeSurvey.unlockSuccess'))
        setPasswordInput('')
        loadResults()
      }
    } catch (err: any) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 429) {
        toast.error(data?.message || t('takeSurvey.rateLimited'), { id: 'rate-limit-error' })
      } else if (status === 401) {
        const left = data?.attemptsLeft
        const hint = left !== null && left !== undefined ? ` (${t('takeSurvey.attemptsLeft', { left })})` : ''
        toast.error(`${t('takeSurvey.wrongPassword')}${hint}`, { id: 'unlock-error' })
      } else {
        toast.error(t('takeSurvey.unlockError'), { id: 'unlock-error' })
      }
    }
  }

  const { liveResults } = useSurveyWebSocket(id, httpResults)
  const results = liveResults ?? httpResults

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/3"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/4"></div>
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl mt-8"></div>
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
      </div>
    )
  }

  if (passwordRequired) {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="heading-2 mb-3">{t('results.privateTitle')}</h2>
          <p className="text-textMuted mb-8">{t('results.privateDesc')}</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left w-full">
            <div>
              <label className="block text-sm font-medium text-textMain mb-1">{t('results.passwordLabel')}</label>
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={t('results.passwordPlaceholder')}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-accent outline-none"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-full shadow-md transition-shadow">
              {t('results.confirm')}
            </button>
          </form>
          <button onClick={() => navigate('/')} className="mt-6 text-sm text-textMuted hover:text-primary transition-colors">
            {t('takeSurvey.returnHome')}
          </button>
        </div>
      </div>
    )
  }

  if (!results) return null

  const voteLink = `${window.location.origin}/survey/${id}`

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500">

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <Link to="/" className="btn btn-secondary !py-2 !px-3 text-sm">
            <ArrowLeft className="w-4 h-4" /> {t('results.backHome')}
          </Link>
          <div className="flex gap-3">
            {results.accessType !== 'ANONYMOUS_INVITE' && (
              <button
                className="btn btn-secondary !py-2 !px-3 text-sm"
                onClick={() => {
                  navigator.clipboard.writeText(voteLink)
                  toast.success(t('toast.copied'))
                }}
              >
                <Share2 className="w-4 h-4" /> {t('results.shareLink')}
              </button>
            )}
            <Link
              to={results.accessType === 'ANONYMOUS_INVITE'
                ? `/survey/${id}` // author can still open it (isAuthor check in TakeSurveyPage)
                : `/survey/${id}`}
              className="btn btn-primary !py-2 !px-4 text-sm"
            >
              {t('results.takeSurvey')}
            </Link>
          </div>
        </div>

        {/* @ts-ignore */}
        {results.imageUrl && (
          <div className="w-full h-48 md:h-64 rounded-2xl overflow-hidden mb-6 shadow-sm">
            {/* @ts-ignore */}
            <img src={results.imageUrl} alt={results.title} className="w-full h-full object-cover" />
          </div>
        )}

        <h1 className="heading-1 mb-4 break-words">{results.title}</h1>
        {results.description && <p className="text-lg text-textMuted mb-4 whitespace-pre-wrap break-words">{results.description}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium">
            <Users className="w-4 h-4" />
            {results.totalVoters} {results.totalVoters === 1 ? t('results.responses_one') : t('results.responses')}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium">
            <Calendar className="w-4 h-4" />
            {new Date(results.createdAt).toLocaleDateString(
              i18n.language === 'ua' ? 'uk-UA' : 'en-US',
              { day: 'numeric', month: 'short', year: 'numeric' }
            )}
          </div>
          {results.deadline && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${new Date(results.deadline) < new Date() ? 'bg-red-50 dark:bg-red-900/20 text-error' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'}`}>
              {new Date(results.deadline) < new Date() ? t('results.status.expired') : t('results.status.activeTill') + new Date(results.deadline).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {results.totalVoters === 0 ? (
        <div className="card p-12 text-center bg-slate-50 dark:bg-slate-800/50 border-dashed">
          <Info className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="heading-2 mb-2">{t('results.noResponses')}</h3>
          <p className="text-textMuted mb-6">{t('results.beFirst')}</p>
          <button
            className="btn btn-primary mx-auto"
            onClick={() => {
              navigator.clipboard.writeText(voteLink)
              toast.success(t('toast.copied'))
            }}
          >
            {t('results.copyLink')}
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {results.questions.map((q, qIdx) => {
            const sorted = [...q.options].sort((a, b) => b.votes - a.votes)
            const hasWinner = results.totalVoters > 0 && sorted[0]?.votes > 0

            const chartData = {
              labels: q.options.map(o => o.text.length > 25 ? o.text.slice(0, 25) + '…' : o.text),
              datasets: [{
                data: q.options.map(o => o.votes),
                backgroundColor: PALETTE.slice(0, q.options.length),
                borderColor: PALETTE.slice(0, q.options.length).map(c => c.replace('0.85', '1')),
                borderWidth: 1,
                borderRadius: 4,
              }],
            }

            return (
              <div key={q.id} className="card p-6 md:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-borderLight pb-4">
                  <h3 className="text-xl font-bold text-primary flex-1">
                    <span className="text-accent mr-2">Q{qIdx + 1}.</span>
                    {q.text}
                  </h3>
                  {hasWinner && (
                    <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-800">
                      {t('results.top')} {sorted[0].text}
                    </div>
                  )}
                </div>

                {q.imageUrl && (
                  <div className="mb-6 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-borderLight max-h-[200px]">
                    <img src={q.imageUrl} alt="Question context" className="w-full h-full object-contain" />
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div className="h-[250px] w-full">
                    <Bar
                      data={chartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 500 },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            titleFont: { family: 'Inter' },
                            bodyFont: { family: 'Inter' }
                          }
                        },
                        scales: {
                          x: {
                            grid: { display: false },
                            ticks: {
                              color: theme === 'dark' ? '#94a3b8' : '#64748b',
                              font: { family: 'Inter' }
                            }
                          },
                          y: {
                            beginAtZero: true,
                            ticks: {
                              stepSize: 1,
                              precision: 0,
                              color: theme === 'dark' ? '#94a3b8' : '#64748b',
                              font: { family: 'Inter' }
                            },
                            border: { display: false },
                            grid: { color: theme === 'dark' ? '#334155' : '#f1f5f9' }
                          },
                        },
                      }}
                    />
                  </div>

                  <div className="space-y-4">
                    {sorted.map((opt, oIdx) => (
                      <div key={opt.id} className="relative">
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-sm font-medium text-textMain flex items-center gap-2">
                            {oIdx === 0 && hasWinner && '🥇'}
                            {oIdx === 1 && hasWinner && '🥈'}
                            {oIdx === 2 && hasWinner && '🥉'}
                            {opt.text}
                          </span>
                          <span className="text-sm font-bold text-accent">
                            {opt.percentage}% <span className="text-textMuted font-normal text-xs ml-1">({opt.votes})</span>
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${opt.percentage}%`,
                              backgroundColor: PALETTE[oIdx % PALETTE.length].replace('0.85', '1')
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {results.totalVoters > 0 && user?.id === results.createdById && (
        <div className="card p-6 md:p-8 mt-8 border-t-4 border-t-blue-500">
          <h3 className="heading-2 mb-6 flex items-center gap-2">
            <Users className="text-blue-500" /> {t('results.votersList')}
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {results.voters.map((v, i) => {
              const displayName = v.userName || v.userEmail || null
              const isAnon = !displayName
              return (
                <div key={i} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-borderLight">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isAnon ? 'bg-slate-200 dark:bg-slate-700 text-slate-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'}`}>
                      {isAnon ? '?' : displayName![0].toUpperCase()}
                    </div>
                    <div>
                      <p className={`font-medium text-sm ${isAnon ? 'text-textMuted italic' : 'text-textMain'}`}>
                        {isAnon ? t('results.anonymous') : displayName}
                      </p>
                      {v.userName && v.userEmail && (
                        <p className="text-xs text-textMuted">{v.userEmail}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-textMuted shrink-0">
                    {new Date(v.createdAt).toLocaleString(i18n.language === 'ua' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Export block — owner only */}
      {user?.id === results.createdById && (
        <>
          {results.accessType === 'ANONYMOUS_INVITE' && (
            <InviteManagementPanel surveyId={id!} />
          )}
          <ExportBlock surveyId={id!} surveyTitle={results.title} />
        </>
      )}
    </div>
  )
}

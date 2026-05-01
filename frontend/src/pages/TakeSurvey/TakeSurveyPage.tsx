import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, Lock, AlertTriangle, Loader2, Eye, EyeOff, UserCircle2, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  surveyApi,
  getOrCreateVoterId,
  persistVoterId,
  isAlreadyVotedError,
  type Survey,
  type VotePayload,
} from '@/api/surveyApi'
import { useSurveyWebSocket } from '@/api/useSurveyWebSocket'
import { useAuth } from '@/context/AuthContext'
import { getFingerprint } from '@/api/fingerprint'
import classNames from 'classnames'

type Answers = Record<string, string>
type PageStatus = 'loading' | 'ready' | 'submitting' | 'success' | 'already_voted' | 'closed' | 'error' | 'password_required' | 'closed_by_author' | 'invalid_invite'

export default function TakeSurveyPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [status, setStatus] = useState<PageStatus>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [fingerprint, setFingerprint] = useState<string | undefined>(undefined)

  // Collect device fingerprint once on mount (silently, no UI impact)
  useEffect(() => {
    getFingerprint().then(setFingerprint).catch(() => {})
  }, [])

  const searchParams = new URLSearchParams(location.search)
  const inviteToken = searchParams.get('invite') || undefined

  const voterIdRef = useRef<string>(getOrCreateVoterId())


  const loadSurvey = useCallback(() => {
    if (!id) return
    const token = sessionStorage.getItem(`unlock_${id}`) || undefined
    surveyApi.getById(id, token, inviteToken)
      .then((s) => {
        if (s.deadline && new Date(s.deadline) < new Date()) {
          setStatus('closed')
          return
        }
        setSurvey(s)
        setStatus('ready')
      })
      .catch((err) => {
        const status = err?.response?.status
        const errorData = err?.response?.data?.error
        if (status === 404) {
          toast.error(t('takeSurvey.notFound'), { id: 'status-error' })
          navigate('/', { replace: true })
        }
        else if (status === 403 && errorData === 'not_public') setStatus('password_required')
        else if (status === 410 && errorData === 'survey_closed') setStatus('closed_by_author')
        else if (status === 403 && errorData === 'invalid_invite') setStatus('invalid_invite')
        else if (status === 403 || status === 410) setStatus('closed')
        else if (status === 429) { 
          setStatus('error'); 
          toast.error(t('takeSurvey.rateLimited'), { id: 'rate-limit-error' });
        }
        else { 
          setStatus('error'); 
          toast.error(t('toast.failedLoad'), { id: 'load-error' });
        }
      })
  }, [id, navigate, t])

  useEffect(() => {
    loadSurvey()
  }, [loadSurvey])

  // Listen for real-time survey updates
  useSurveyWebSocket(id, null, (updatedSurvey) => {
    // If the admin edited the survey while we are taking it
    setSurvey(prev => {
      if (!prev) return null;
      return {
        ...prev,
        title: updatedSurvey.title,
        description: updatedSurvey.description,
        imageUrl: updatedSurvey.imageUrl,
        isPrivate: updatedSurvey.isPrivate,
        isActive: updatedSurvey.isActive ?? prev.isActive,
        deadline: updatedSurvey.deadline,
      } as Survey;
    });
    
    if (updatedSurvey.isPrivate && !sessionStorage.getItem(`unlock_${id}`)) setStatus('password_required');
    if (updatedSurvey.isActive === false) {
      setStatus('closed_by_author');
    } else if (updatedSurvey.isActive === true) {
      // Re-fetch survey to get latest questions/options if it was closed
      loadSurvey();
    }
    if (updatedSurvey.deadline && new Date(updatedSurvey.deadline) < new Date()) setStatus('closed');
    toast.success(t('admin.surveyUpdated'), { id: 'survey-updated' });
  }, () => {
    toast.error(t('takeSurvey.surveyDeleted'), { id: 'survey-deleted' });
    navigate('/', { replace: true });
  });

  const selectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const allAnswered = survey ? survey.questions.every((q) => answers[q.id]) : false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !survey) return

    const unansweredCount = survey.questions.length - Object.keys(answers).length
    if (unansweredCount > 0) {
      toast.error(t('takeSurvey.fillAll', { count: unansweredCount }))
      return
    }

    const payload: VotePayload = {
      cookieId: voterIdRef.current,
      inviteToken,
      isAnonymous: user ? isAnonymous : true,
      fingerprint,
      answers: Object.entries(answers).map(([qId, oIds]) => ({
        questionId: qId,
        optionIds: [oIds],
      })),
    }

    try {
      setStatus('submitting')
      const token = sessionStorage.getItem(`unlock_${id}`) || undefined
      const res = await surveyApi.vote(id, payload, token)
      
      if (res.cookieId) {
        voterIdRef.current = res.cookieId
        persistVoterId(res.cookieId)
      }

      setStatus('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      if (isAlreadyVotedError(err)) {
        setStatus('already_voted')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else if ((err.response?.status === 410 || err.response?.status === 403) && (err.response?.data?.error === 'deadline_passed' || err.response?.data?.error === 'not_public')) {
        setStatus('closed')
      } else if (err.response?.status === 403 && (err.response?.data?.error === 'missing_invite' || err.response?.data?.error === 'invalid_invite')) {
        setStatus('error')
        toast.error(err.response.data.message || t('toast.failedSubmit'))
      } else {
        setStatus('ready')
        toast.error(t('toast.failedSubmit'))
      }
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !passwordInput.trim()) return
    try {
      const res = await surveyApi.unlock(id, passwordInput.trim())
      if (res.success) {
        sessionStorage.setItem(`unlock_${id}`, res.unlockToken)
        toast.success(t('takeSurvey.unlockSuccess'))
        setPasswordInput('')
        loadSurvey()
      }
    } catch (err: any) {
      const status = err.response?.status
      const data = err.response?.data
      if (status === 429) {
        toast.error(t('takeSurvey.rateLimited'), { id: 'rate-limit-error' })
      } else if (status === 401) {
        const left = data?.attemptsLeft
        const hint = left !== null && left !== undefined ? ` (${t('takeSurvey.attemptsLeft', { left })})` : ''
        toast.error(`${t('takeSurvey.wrongPassword')}${hint}`, { id: 'unlock-error' })
      } else {
        toast.error(t('takeSurvey.unlockError'), { id: 'unlock-error' })
      }
    }
  }

  // ── Render Helpers ────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
        <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded-lg w-3/4"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/2"></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
        ))}
      </div>
    )
  }

  const isAuthor = localStorage.getItem('userId') === survey?.createdById;

  if (status === 'invalid_invite' || (survey?.accessType === 'ANONYMOUS_INVITE' && !inviteToken && !isAuthor)) {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="mx-auto w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Lock className="w-8 h-8 text-error" />
          </div>
          <h2 className="heading-2 mb-3 text-error">Відсутнє або недійсне посилання</h2>
          <p className="text-textMuted mb-8">Для проходження цього опитування необхідне унікальне посилання-запрошення від автора. Якщо у вас є посилання, можливо, воно деактивоване або його час дії вичерпано.</p>
          <button onClick={() => navigate('/')} className="btn btn-primary w-full">
            {t('takeSurvey.returnHome')}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'password_required') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="heading-2 mb-3">{t('takeSurvey.privateTitle')}</h2>
          <p className="text-textMuted mb-8">{t('takeSurvey.privateDesc')}</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left w-full">
            <div className="relative">
              <label className="block text-sm font-medium text-textMain mb-1">{t('takeSurvey.passwordLabel')}</label>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={t('takeSurvey.passwordPlaceholder')}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent outline-none pr-12 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full shadow-md transition-shadow">
              {t('takeSurvey.confirm')}
            </button>
          </form>
          <button onClick={() => navigate('/')} className="mt-6 text-sm text-textMuted hover:text-primary transition-colors">
            {t('takeSurvey.returnHome')}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'closed_by_author') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="heading-2 mb-2">{t('takeSurvey.closedByAuthor')}</h2>
          <p className="text-textMuted mb-8">{t('takeSurvey.closedByAuthorDesc')}</p>
          <div className="flex gap-4 w-full">
            <Link to={`/results/${id}`} className="btn btn-primary flex-1">{t('takeSurvey.viewResults')}</Link>
            <Link to="/" className="btn btn-secondary flex-1">{t('takeSurvey.returnHome')}</Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'closed') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="heading-2 mb-2">{t('takeSurvey.closedTitle')}</h2>
          <p className="text-textMuted mb-8">{t('takeSurvey.closedDesc')}</p>
          <div className="flex gap-4 w-full">
            <Link to={`/results/${id}`} className="btn btn-primary flex-1">{t('takeSurvey.viewResults')}</Link>
            <Link to="/" className="btn btn-secondary flex-1">{t('takeSurvey.returnHome')}</Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'already_voted') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="card p-10 border-amber-200/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/20">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-amber-500 dark:text-amber-400" />
          </div>
          <h2 className="heading-2 mb-3">{t('takeSurvey.alreadyVotedTitle')}</h2>
          <p className="text-textMuted mb-8 leading-relaxed">
            {t('takeSurvey.alreadyVotedSimpleDesc')}
          </p>
          <div className="flex gap-4">
            <Link to={`/results/${id}`} className="btn btn-primary flex-1">{t('takeSurvey.viewResults')}</Link>
            <Link to="/" className="btn btn-secondary flex-1">{t('takeSurvey.home')}</Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center border-green-200 bg-green-50/30 dark:bg-green-950/20">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="heading-2 mb-2">{t('takeSurvey.successTitle')}</h2>
          <p className="text-textMuted mb-8">{t('takeSurvey.successDesc')}</p>
          <div className="flex gap-4 w-full">
            <Link to={`/results/${id}`} className="btn btn-primary flex-1">{t('takeSurvey.viewResults')}</Link>
            <Link to="/" className="btn btn-secondary flex-1">{t('takeSurvey.home')}</Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error' || !survey) {
    return (
      <div className="max-w-md mx-auto text-center mt-12">
        <div className="card p-10 flex flex-col items-center">
          <AlertTriangle className="w-12 h-12 text-warning mb-4" />
          <h2 className="heading-2 mb-4">{t('takeSurvey.errorTitle')}</h2>
          <button onClick={() => window.location.reload()} className="btn btn-secondary w-full">{t('takeSurvey.tryAgain')}</button>
        </div>
      </div>
    )
  }

  const answeredCount = Object.keys(answers).length
  const totalCount = survey.questions.length
  const progress = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0

  return (
    <div className="max-w-3xl mx-auto pb-24 animate-in fade-in duration-500">
      
      {/* Header section */}
      <div className="mb-10 text-center space-y-4">
        {survey.imageUrl && (
          <div className="w-full aspect-video rounded-2xl overflow-hidden mb-8 shadow-saas">
            <img src={survey.imageUrl} alt={survey.title} className="w-full h-full object-cover" />
          </div>
        )}
        <h1 className="heading-1 break-words">{survey.title}</h1>
        {survey.description && <p className="text-lg text-textMuted whitespace-pre-wrap break-words">{survey.description}</p>}
      </div>

      {/* Anonymous voting hint */}
      {!user && (
        <div className="mb-6 flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="mt-0.5 shrink-0">💡</span>
          <span>
            {t('takeSurvey.anonymousHint')}{' '}
            <Link to="/login" state={{ from: location }} className="underline font-semibold hover:text-blue-900 dark:hover:text-blue-100">
              {t('takeSurvey.loginLink')}
            </Link>{' '}
            {t('takeSurvey.anonymousHint2')}
          </span>
        </div>
      )}

      {/* Anonymous vote selector for logged-in users taking invite surveys */}
      {user && survey.accessType === 'ANONYMOUS_INVITE' && (
        <div className="mb-6 card p-5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <h3 className="font-semibold text-textMain mb-4 text-sm uppercase tracking-wider text-slate-500">
            {t('takeSurvey.privacySettings')}
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className={classNames(
              "flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200",
              !isAnonymous ? "border-accent bg-accent/5" : "border-transparent bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}>
              <input type="radio" className="sr-only" checked={!isAnonymous} onChange={() => setIsAnonymous(false)} />
              <UserCircle2 className={classNames("w-6 h-6 shrink-0 transition-colors", !isAnonymous ? "text-accent" : "text-slate-400")} />
              <div className="flex-1">
                <div className={classNames("font-medium text-sm transition-colors", !isAnonymous ? "text-accent" : "text-textMain")}>
                  {t('takeSurvey.onBehalfOf')} {user.name || user.email}
                </div>
                <div className="text-xs text-textMuted mt-0.5">{t('takeSurvey.authorSeesName')}</div>
              </div>
              {!isAnonymous && <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />}
            </label>
            <label className={classNames(
              "flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200",
              isAnonymous ? "border-accent bg-accent/5" : "border-transparent bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}>
              <input type="radio" className="sr-only" checked={isAnonymous} onChange={() => setIsAnonymous(true)} />
              <UserX className={classNames("w-6 h-6 shrink-0 transition-colors", isAnonymous ? "text-accent" : "text-slate-400")} />
              <div className="flex-1">
                <div className={classNames("font-medium text-sm transition-colors", isAnonymous ? "text-accent" : "text-textMain")}>
                  {t('takeSurvey.anonymous')}
                </div>
                <div className="text-xs text-textMuted mt-0.5">{t('takeSurvey.voteHidden')}</div>
              </div>
              {isAnonymous && <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />}
            </label>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="sticky top-20 z-40 bg-background/95 backdrop-blur py-4 mb-8">
        <div className="flex justify-between items-center text-sm font-medium mb-2 text-textMuted">
          <span>{t('takeSurvey.progress')}</span>
          <span>{t('takeSurvey.answeredOf', { answered: answeredCount, total: totalCount })}</span>
        </div>
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-8">
        {survey.questions.map((question, qIdx) => {
          const isAnswered = !!answers[question.id]

          return (
            <div 
              key={question.id} 
              className={classNames(
                'card p-6 sm:p-8 transition-colors duration-300',
                isAnswered ? 'border-accent/30 bg-accent/5 dark:bg-accent/10' : ''
              )}
            >
              <div className="flex items-start gap-4 mb-6">
                <div className={classNames(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm transition-colors",
                  isAnswered ? "bg-accent text-white" : "bg-slate-100 dark:bg-slate-800 text-textMuted"
                )}>
                  {isAnswered ? <CheckCircle2 className="w-5 h-5" /> : qIdx + 1}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-primary leading-snug">{question.text}</h3>
                </div>
              </div>

              {question.imageUrl && (
                <div className="mb-6 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-borderLight max-h-[300px]">
                  <img src={question.imageUrl} alt="Question context" className="w-full h-full object-contain" />
                </div>
              )}

              <div className="space-y-3">
                {question.options.map((option) => {
                  const isSelected = answers[question.id] === option.id
                  return (
                    <button
                      key={option.id}
                      onClick={() => selectOption(question.id, option.id)}
                      className={classNames(
                        'w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4',
                        isSelected 
                          ? 'border-accent bg-accent/10 dark:bg-accent/20 shadow-sm' 
                          : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      <div className={classNames(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                        isSelected ? 'border-accent' : 'border-slate-300 dark:border-slate-700'
                      )}>
                        {isSelected && <div className="w-2.5 h-2.5 bg-accent rounded-full" />}
                      </div>
                      <span className={classNames(
                        'font-medium transition-colors',
                        isSelected ? 'text-accentHover dark:text-accent' : 'text-textMain'
                      )}>
                        {option.text}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Submit Button */}
      <div className="mt-12 text-center">
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || status === 'submitting'}
          className={classNames(
            'btn btn-primary btn-lg w-full max-w-sm text-lg py-4 shadow-saas transition-all',
            (!allAnswered || status === 'submitting') && 'opacity-50 grayscale'
          )}
        >
          {status === 'submitting' ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin h-5 w-5" />
              {t('takeSurvey.submitting')}
            </div>
          ) : t('takeSurvey.submitBtn')}
        </button>
        
        {!allAnswered && (
          <p className="mt-4 text-sm text-textMuted">{t('takeSurvey.pleaseAnswerAll')}</p>
        )}
      </div>

    </div>
  )
}

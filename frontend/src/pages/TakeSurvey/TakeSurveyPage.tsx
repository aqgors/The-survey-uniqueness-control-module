import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, Lock, AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  surveyApi,
  getOrCreateVoterId,
  persistVoterId,
  isAlreadyVotedError,
  type Survey,
  type AlreadyVotedError,
} from '@/api/surveyApi'
import { useSurveyWebSocket } from '@/api/useSurveyWebSocket'
import { useAuth } from '@/context/AuthContext'
import classNames from 'classnames'

type Answers = Record<string, string>
type PageStatus = 'loading' | 'ready' | 'submitting' | 'success' | 'already_voted' | 'closed' | 'error'

export default function TakeSurveyPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [survey, setSurvey] = useState<Survey | null>(null)
  const [status, setStatus] = useState<PageStatus>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [fraudSignal, setFraudSignal] = useState<AlreadyVotedError['signal'] | null>(null)

  const voterIdRef = useRef<string>(getOrCreateVoterId())

  const SIGNAL_LABELS: Record<NonNullable<AlreadyVotedError['signal']>, string> = {
    cookieId:  t('takeSurvey.cookie'),
    ip:        t('takeSurvey.ip'),
    userAgent: t('takeSurvey.userAgent'),
  }

  useEffect(() => {
    if (!id) return
    surveyApi.getById(id)
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
        if (status === 404) navigate('/404', { replace: true })
        else if (status === 403) setStatus('closed')
        else { setStatus('error'); toast.error(t('toast.failedLoad')) }
      })
  }, [id, navigate, t])

  // If not logged in, show login prompt
  if (status === 'ready' && !user) {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10" />
          </div>
          <h2 className="heading-2 mb-2">Авторизуйтесь, щоб проголосувати</h2>
          <p className="text-textMuted mb-8">Тільки зареєстровані користувачі можуть брати участь в опитуваннях</p>
          <Link 
            to="/login" 
            state={{ from: location }} 
            className="btn btn-primary w-full py-3"
          >
            Увійти
          </Link>
          <Link to="/" className="btn btn-secondary w-full mt-4">На головну</Link>
        </div>
      </div>
    )
  }

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
        isPublic: updatedSurvey.isPublic,
        deadline: updatedSurvey.deadline,
      } as Survey;
    });
    
    if (!updatedSurvey.isPublic) setStatus('closed');
    if (updatedSurvey.deadline && new Date(updatedSurvey.deadline) < new Date()) setStatus('closed');
    toast.success(t('admin.surveyUpdated') || 'Опитування було оновлено адміністратором', { id: 'survey-updated' });
  });

  const selectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const allAnswered = survey ? survey.questions.every((q) => answers[q.id]) : false

  const handleSubmit = async () => {
    if (!survey || !id) return
    if (!allAnswered) {
      toast.error(t('toast.answerAll'))
      return
    }

    setStatus('submitting')

    try {
      const result = await surveyApi.vote(id, {
        cookieId: voterIdRef.current,
        answers: survey.questions.map((q) => ({
          questionId: q.id,
          optionIds: [answers[q.id]],
        })),
      })

      if (result.cookieId) {
        voterIdRef.current = result.cookieId
        persistVoterId(result.cookieId)
      }

      setStatus('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      if (isAlreadyVotedError(err)) {
        setFraudSignal(err.response!.data.signal)
        setStatus('already_voted')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else if (err.response?.status === 403 && err.response?.data?.error === 'deadline_passed') {
        setStatus('closed')
      } else {
        setStatus('ready')
        toast.error(t('toast.failedSubmit'))
      }
    }
  }

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

  if (status === 'closed') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in zoom-in duration-500">
        <div className="card p-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="heading-2 mb-2">{t('takeSurvey.closedTitle')}</h2>
          <p className="text-textMuted mb-8">{t('takeSurvey.closedDesc')}</p>
          <Link to="/" className="btn btn-secondary w-full">{t('takeSurvey.returnHome')}</Link>
        </div>
      </div>
    )
  }

  if (status === 'already_voted') {
    return (
      <div className="max-w-md mx-auto text-center mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="card p-10 border-error/20 bg-red-50/30 dark:bg-red-950/20">
          <div className="w-20 h-20 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-error" />
          </div>
          <h2 className="heading-2 mb-2">{t('takeSurvey.alreadyVotedTitle')}</h2>
          <p className="text-textMuted mb-8 leading-relaxed">
            {t('takeSurvey.alreadyVotedDesc')}
          </p>
          
          <div className="bg-white dark:bg-slate-800 border border-borderLight rounded-lg p-4 text-left mb-8 text-sm">
            <p className="font-medium text-textMain mb-3 uppercase tracking-wider text-xs">{t('takeSurvey.verificationDetails')}</p>
            <div className="space-y-2">
              {(['cookieId', 'ip', 'userAgent'] as const).map((sig) => (
                <div key={sig} className={classNames('flex items-center gap-3 p-2 rounded-md transition-colors', fraudSignal === sig ? 'bg-red-50 dark:bg-red-900/30 text-error' : 'text-textMuted')}>
                  <div className={classNames('w-2 h-2 rounded-full', fraudSignal === sig ? 'bg-error' : 'bg-green-400')} />
                  <span className="flex-1">{SIGNAL_LABELS[sig]}</span>
                  {fraudSignal === sig && <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-100 dark:bg-red-900 text-error rounded-full">{t('takeSurvey.duplicate')}</span>}
                </div>
              ))}
            </div>
          </div>

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
        <h1 className="heading-1">{survey.title}</h1>
        {survey.description && <p className="text-lg text-textMuted">{survey.description}</p>}
      </div>

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

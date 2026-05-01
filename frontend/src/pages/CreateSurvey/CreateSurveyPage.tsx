import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { surveyApi } from '@/api/surveyApi';
import { Plus, Trash2, Calendar, ArrowRight, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

import SurveyTypeSelector, { SurveyAccessType } from './components/SurveyTypeSelector';
import InviteSettingsPanel from './components/InviteSettingsPanel';

interface QuestionDraft {
  id: string;
  text: string;
  imageUrl?: string;
  options: { id: string; text: string }[];
}

function uid() { return Math.random().toString(36).slice(2); }
function makeQuestion(): QuestionDraft {
  return { id: uid(), text: '', imageUrl: '', options: [{ id: uid(), text: '' }, { id: uid(), text: '' }] };
}

export default function CreateSurveyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [accessType, setAccessType] = useState<SurveyAccessType | null>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [deadline, setDeadline] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([makeQuestion()]);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string>(''); // empty means infinite
  
  const [loading, setLoading] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateQ = (qId: string, text: string) =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, text } : q));

  const updateQImage = (qId: string, imageUrl: string) =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, imageUrl } : q));

  const updateO = (qId: string, oId: string, text: string) =>
    setQuestions((p) => p.map((q) => q.id === qId
      ? { ...q, options: q.options.map((o) => o.id === oId ? { ...o, text } : o) }
      : q));

  const addOption = (qId: string) =>
    setQuestions((p) => p.map((q) => q.id === qId && q.options.length < 10
      ? { ...q, options: [...q.options, { id: uid(), text: '' }] } : q));

  const removeOption = (qId: string, oId: string) =>
    setQuestions((p) => p.map((q) => q.id === qId && q.options.length > 2
      ? { ...q, options: q.options.filter((o) => o.id !== oId) } : q));

  const addQuestion = () => {
    if (questions.length >= 20) { toast.error(t('createSurvey.errors.maxQuestions')); return; }
    setQuestions((p) => [...p, makeQuestion()]);
  };

  const removeQuestion = (qId: string) => {
    if (questions.length === 1) { toast.error(t('createSurvey.errors.minQuestion')); return; }
    setQuestions((p) => p.filter((q) => q.id !== qId));
  };

  const nextStep = () => {
    if (!accessType) {
      toast.error(t('createSurvey.errors.selectType', 'Please select a survey type first'));
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!title.trim()) { newErrors.title = t('createSurvey.errors.titleRequired'); }
    if (accessType === 'PRIVATE' && !password.trim()) { newErrors.password = t('createSurvey.errors.passwordRequired'); }

    let parsedDeadline: string | undefined = undefined;
    if (deadline) {
      const d = new Date(deadline);
      if (d <= new Date()) {
        newErrors.deadline = t('createSurvey.errors.deadlineFuture');
      } else {
        parsedDeadline = d.toISOString();
      }
    }

    if (accessType === 'ANONYMOUS_INVITE' && inviteExpiresAt) {
      if (new Date(inviteExpiresAt) <= new Date()) {
        newErrors.inviteExpiresAt = t('createSurvey.errors.inviteExpiresAtFuture');
      }
    }

    for (const q of questions) {
      if (!q.text.trim()) { newErrors[`q_${q.id}`] = t('createSurvey.errors.questionRequired'); }
      q.options.forEach((o) => {
        if (!o.text.trim()) { newErrors[`o_${o.id}`] = t('createSurvey.errors.optionRequired'); }
      });
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error(t('createSurvey.errors.formErrors'));
      return;
    }

    setLoading(true);
    try {
      const { survey } = await surveyApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        accessType: accessType as any,
        isPrivate: accessType === 'PRIVATE',
        password: accessType === 'PRIVATE' && password ? password : undefined,
        deadline: accessType !== 'ANONYMOUS_INVITE' ? parsedDeadline : undefined,
        inviteExpiresAt: accessType === 'ANONYMOUS_INVITE' && inviteExpiresAt 
          ? new Date(inviteExpiresAt).toISOString() 
          : undefined,
        questions: questions.map((q) => ({
          text: q.text.trim(),
          imageUrl: q.imageUrl?.trim() || undefined,
          options: q.options.map((o) => ({ text: o.text.trim() })),
        })),
      });
      setCreatedId(survey.id);
      toast.success(t('createSurvey.toasts.created'));
    } catch { 
      toast.error(t('createSurvey.toasts.error')); 
    } finally { 
      setLoading(false); 
    }
  };

  const surveyLink = createdId ? `${window.location.origin}/survey/${createdId}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(surveyLink).then(() => {
      setCopied(true);
      toast.success(t('createSurvey.toasts.copied'));
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (createdId) {
    return (
      <div className="max-w-2xl mx-auto mt-12 animate-in fade-in duration-500">
        <div className="card p-12 text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="heading-2 mb-2">{t('createSurvey.successTitle')}</h2>
          <p className="text-textMuted mb-8">{t('createSurvey.successDesc')}</p>

          {accessType !== 'ANONYMOUS_INVITE' ? (
            <div className="flex gap-2 mb-8 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-borderLight">
              <input
                readOnly
                value={surveyLink}
                className="flex-1 bg-transparent border-none focus:outline-none px-2 text-textMain"
              />
              <button className="btn btn-primary" onClick={copyLink}>
                {copied ? t('createSurvey.copied') : t('createSurvey.copy')}
              </button>
            </div>
          ) : (
            <div className="mb-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
              <p className="font-bold mb-1">{t('createSurvey.successInviteTitle')}</p>
              <p className="text-sm">{t('createSurvey.successInviteDesc')}</p>
            </div>
          )}

          <div className="flex gap-4 justify-center flex-wrap">
            {accessType !== 'ANONYMOUS_INVITE' && (
              <button className="btn btn-secondary" onClick={() => navigate(`/survey/${createdId}`)}>
                {t('createSurvey.preview')}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => navigate(`/results/${createdId}`)}>
              {accessType === 'ANONYMOUS_INVITE' ? t('createSurvey.manageInvites', 'Manage Invites & Results') : t('createSurvey.viewResults')}
            </button>
            <button className="btn btn-accent"
              onClick={() => { 
                setCreatedId(null); setTitle(''); setDescription(''); setDeadline(''); 
                setQuestions([makeQuestion()]); setStep(1); setAccessType(null); 
              }}>
              {t('createSurvey.newSurvey')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Wizard Header */}
      <div className="mb-10 text-center">
        <h1 className="heading-1 mb-3">{t('createSurvey.title')}</h1>
        <p className="text-textMuted max-w-2xl mx-auto">{t('createSurvey.subtitle')}</p>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col items-center"
          >
            <SurveyTypeSelector selectedType={accessType} onSelect={setAccessType} />
            
            <div className="mt-12 text-center">
              <button 
                onClick={nextStep}
                disabled={!accessType}
                className={`btn btn-primary text-lg px-12 py-4 shadow-xl ${!accessType ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
              >
                {t('createSurvey.nextStep', 'Continue to Details')} <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="mb-6">
              <button onClick={() => setStep(1)} className="text-textMuted hover:text-textMain flex items-center gap-2 font-medium transition-colors">
                <ArrowLeft className="w-4 h-4" /> {t('createSurvey.back', 'Back to Type Selection')}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="card p-6 md:p-8 space-y-6">
                <h3 className="text-lg font-bold text-accent mb-4">{t('createSurvey.infoSection')}</h3>

                <div>
                  <label className="label-text">{t('createSurvey.titleLabel')}</label>
                  <input
                    className={`input-field ${errors.title ? 'border-error ring-1 ring-error' : ''}`}
                    placeholder={t('createSurvey.titlePlaceholder')}
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setErrors(prev => ({ ...prev, title: '' })); }}
                    maxLength={200}
                  />
                  {errors.title && <p className="text-error text-sm mt-1">{errors.title}</p>}
                </div>

                <div>
                  <label className="label-text">{t('createSurvey.descLabel')}</label>
                  <textarea
                    className="input-field min-h-[100px] resize-y"
                    placeholder={t('createSurvey.descPlaceholder')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {accessType !== 'ANONYMOUS_INVITE' ? (
                    <div>
                      <label className="label-text flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-textMuted" />
                        {t('createSurvey.deadlineLabel')}
                      </label>
                      <input
                        type="datetime-local"
                        className={`input-field ${errors.deadline ? 'border-error ring-1 ring-error' : ''}`}
                        value={deadline}
                        onChange={(e) => { setDeadline(e.target.value); setErrors(prev => ({ ...prev, deadline: '' })); }}
                      />
                      {errors.deadline && <p className="text-error text-sm mt-1">{errors.deadline}</p>}
                      <p className="text-xs text-textMuted mt-1">{t('createSurvey.deadlineHint')}</p>
                    </div>
                  ) : (
                    <div>
                      <label className="label-text flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-textMuted" />
                        {t('createSurvey.inviteExpiresAtLabel')}
                      </label>
                      <input 
                        type="datetime-local"
                        className={`input-field h-[42px] ${errors.inviteExpiresAt ? 'border-error ring-1 ring-error' : ''}`} 
                        min={new Date().toISOString().slice(0, 16)}
                        value={inviteExpiresAt} 
                        onChange={(e) => { setInviteExpiresAt(e.target.value); setErrors(prev => ({ ...prev, inviteExpiresAt: '' })); }}
                      />
                      {errors.inviteExpiresAt && <p className="text-error text-sm mt-1">{errors.inviteExpiresAt}</p>}
                      <p className="text-xs text-textMuted mt-1">{t('createSurvey.inviteExpiresAtHint')}</p>
                    </div>
                  )}

                  {accessType === 'PRIVATE' && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <label className="label-text">{t('createSurvey.passwordLabel')}</label>
                      <input
                        type="text"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: '' })); }}
                        placeholder={t('createSurvey.passwordPlaceholder')}
                        className={`input-field ${errors.password ? 'border-error ring-1 ring-error' : ''}`}
                        required
                      />
                      {errors.password && <p className="text-error text-sm mt-1">{errors.password}</p>}
                      <p className="text-xs text-textMuted mt-1">{t('createSurvey.passwordHint')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Questions Section */}
              <div className="space-y-4">
                {questions.map((q, qIdx) => (
                  <div key={q.id} className="card p-6 md:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-sm font-bold">
                        {t('createSurvey.question')} {qIdx + 1}
                      </span>
                      <button type="button" className="btn btn-danger !p-2" onClick={() => removeQuestion(q.id)} title={t('mySurveys.deleteBtn')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mb-6 space-y-4">
                      <div>
                        <label className="label-text">{t('createSurvey.questionLabel')}</label>
                        <input
                          className={`input-field text-lg font-medium placeholder:font-normal ${errors[`q_${q.id}`] ? 'border-error ring-1 ring-error' : ''}`}
                          placeholder={t('createSurvey.questionPlaceholder', { num: qIdx + 1 })}
                          value={q.text}
                          onChange={(e) => { updateQ(q.id, e.target.value); setErrors(prev => ({ ...prev, [`q_${q.id}`]: '' })); }}
                          maxLength={500}
                        />
                        {errors[`q_${q.id}`] && <p className="text-error text-sm mt-1">{errors[`q_${q.id}`]}</p>}
                      </div>
                      <div>
                        <label className="label-text">{t('admin.imageOptional', 'Image URL (Optional)')}</label>
                        <input
                          className="input-field text-sm"
                          placeholder="https://example.com/image.jpg"
                          value={q.imageUrl || ''}
                          onChange={(e) => updateQImage(q.id, e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 mb-4">
                      {q.options.map((o, oIdx) => (
                        <div key={o.id} className="flex gap-3 items-center">
                          <span className="text-textMuted text-sm font-medium w-6 text-right">{oIdx + 1}.</span>
                          <div className="flex-1">
                            <input
                              className={`input-field w-full ${errors[`o_${o.id}`] ? 'border-error ring-1 ring-error' : ''}`}
                              placeholder={t('createSurvey.optionPlaceholder', { num: oIdx + 1 })}
                              value={o.text}
                              onChange={(e) => { updateO(q.id, o.id, e.target.value); setErrors(prev => ({ ...prev, [`o_${o.id}`]: '' })); }}
                            />
                            {errors[`o_${o.id}`] && <p className="text-error text-sm mt-1">{errors[`o_${o.id}`]}</p>}
                          </div>
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
                        <Plus className="w-4 h-4" /> {t('createSurvey.addOption')}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-borderLight border-dashed">
                <button type="button" className="btn btn-secondary" onClick={addQuestion}>
                  <Plus className="w-4 h-4" /> {t('createSurvey.addQuestion')}
                </button>
                <span className="text-sm font-medium text-textMuted">
                  {t('createSurvey.questionsCount', { count: questions.length })}
                </span>
              </div>

              <button type="submit" className="btn btn-primary w-full text-lg py-4 shadow-lg shadow-blue-500/20" disabled={loading}>
                {loading ? t('createSurvey.submitting') : t('createSurvey.submit')}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

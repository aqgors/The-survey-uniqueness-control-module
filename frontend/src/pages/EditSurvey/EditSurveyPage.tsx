import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { surveyApi } from '@/api/surveyApi';
import { Plus, Trash2, Calendar, Save, ArrowLeft, Loader2, Lock, Globe, Users, KeyRound, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PasswordModal, ModalMode } from './PasswordModal';

type AccessType = 'PUBLIC' | 'PRIVATE' | 'ANONYMOUS_INVITE';
interface QuestionDraft { id: string; text: string; imageUrl?: string; options: { id: string; text: string }[]; }
function uid() { return Math.random().toString(36).slice(2); }

// ─────────────────────────────────────────────────────────────────────────────
// What modal is open for?
type ModalPurpose =
  | 'change_password'    // Existing private → Change button → 2 fields (old+new)
  | 'set_password'       // Public→Private → Set button → 1 field (new)
  | 'confirm_save'       // Existing private → Save button → 1 field (current)
  | 'confirm_unpublish'; // Private→Public → Save button → 1 field (current)

export default function EditSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // ── Loading / saving
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Survey meta (from server)
  const [originalAccessType, setOriginalAccessType] = useState<AccessType>('PUBLIC');
  const [surveyHasPassword,  setSurveyHasPassword]  = useState(false);

  // ── Form fields
  const [title,           setTitle]           = useState('');
  const [description,     setDescription]     = useState('');
  const [deadline,        setDeadline]        = useState('');
  const [accessType,      setAccessType]      = useState<AccessType>('PUBLIC');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');

  // ── Questions
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  // ── Staged password change (from modal)
  const [stagedCurrentPwd, setStagedCurrentPwd] = useState<string | null>(null);
  const [stagedNewPwd,     setStagedNewPwd]     = useState<string | null>(null);

  // ── Modal state
  const [modalPurpose, setModalPurpose] = useState<ModalPurpose | null>(null);
  const modalMode: ModalMode = 
    modalPurpose === 'change_password' ? 'change' : 
    modalPurpose === 'set_password' ? 'create' : 
    'confirm';

  // ── Load survey ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    surveyApi.getById(id).then(survey => {
      setTitle(survey.title);
      setDescription(survey.description ?? '');
      setDeadline(survey.deadline ? survey.deadline.slice(0, 16) : '');
      const at = (survey.accessType as AccessType) ?? 'PUBLIC';
      setAccessType(at);
      setOriginalAccessType(at);
      
      // In our system, if it's private, it HAS a password hash in the DB.
      // The backend strips the hash itself, but isPrivate is our indicator.
      const hasPwd = survey.isPrivate;
      setSurveyHasPassword(hasPwd);
      
      setQuestions(survey.questions.map(q => ({
        id: q.id, text: q.text, imageUrl: q.imageUrl ?? '',
        options: q.options.map(o => ({ id: o.id, text: o.text })),
      })));
      setLoading(false);
    }).catch(() => {
      toast.error(t('editSurvey.loadError'));
      navigate('/my-surveys');
    });
  }, [id, navigate, t]);

  // ── Question helpers ──────────────────────────────────────────────────────
  const updateQ      = (qId: string, text: string)                    => setQuestions(p => p.map(q => q.id === qId ? { ...q, text } : q));
  const updateQImage = (qId: string, imageUrl: string)                => setQuestions(p => p.map(q => q.id === qId ? { ...q, imageUrl } : q));
  const updateO      = (qId: string, oId: string, text: string)       => setQuestions(p => p.map(q => q.id === qId ? { ...q, options: q.options.map(o => o.id === oId ? { ...o, text } : o) } : q));
  const addOption    = (qId: string)                                   => setQuestions(p => p.map(q => q.id === qId && q.options.length < 10 ? { ...q, options: [...q.options, { id: uid(), text: '' }] } : q));
  const removeOption = (qId: string, oId: string)                     => setQuestions(p => p.map(q => q.id === qId && q.options.length > 2 ? { ...q, options: q.options.filter(o => o.id !== oId) } : q));
  const addQuestion  = ()                                              => { if (questions.length >= 20) return toast.error(t('createSurvey.errors.maxQuestions')); setQuestions(p => [...p, { id: uid(), text: '', imageUrl: '', options: [{ id: uid(), text: '' }, { id: uid(), text: '' }] }]); };
  const removeQuestion = (qId: string)                                 => { if (questions.length <= 1) return toast.error(t('createSurvey.errors.minQuestion')); setQuestions(p => p.filter(q => q.id !== qId)); };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = t('createSurvey.errors.titleRequired');

    // Public -> Private: require password set
    if (accessType === 'PRIVATE' && !surveyHasPassword && stagedNewPwd === null) {
      errs.password = t('editSurvey.newPasswordRequired');
      toast.error(t('editSurvey.newPasswordRequired'));
    }

    for (const q of questions) {
      if (!q.text.trim()) errs[`q_${q.id}`] = t('createSurvey.errors.questionRequired');
      for (const o of q.options) {
        if (!o.text.trim()) errs[`o_${o.id}`] = t('createSurvey.errors.optionRequired');
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit logic ──────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Trigger confirmation modal if:
    // 1. Private -> Public (unpublishing)
    if (originalAccessType === 'PRIVATE' && accessType !== 'PRIVATE' && surveyHasPassword && stagedCurrentPwd === null) {
      setModalPurpose('confirm_unpublish');
      return;
    }

    // 2. Existing Private -> Save (any change requires password)
    if (originalAccessType === 'PRIVATE' && accessType === 'PRIVATE' && surveyHasPassword && stagedCurrentPwd === null) {
      // Even if we staged a new password, the backend usually needs the current one to authorize the change
      setModalPurpose('confirm_save');
      return;
    }

    doSave(stagedCurrentPwd ?? undefined, stagedNewPwd ?? undefined);
  };

  // ── Modal confirm handler ─────────────────────────────────────────────────
  const handleModalConfirm = (currentPwd: string, newPwd?: string) => {
    const purpose = modalPurpose;
    setModalPurpose(null);

    if (purpose === 'change_password') {
      setStagedCurrentPwd(currentPwd);
      setStagedNewPwd(newPwd ?? '');
      toast.success(t('editSurvey.stagedPwd'));
      return;
    }

    if (purpose === 'set_password') {
      setStagedNewPwd(newPwd ?? '');
      toast.success(t('editSurvey.stagedPwd'));
      return;
    }

    // confirm_save or confirm_unpublish → proceed to save
    doSave(currentPwd, newPwd);
  };

  const doSave = async (currentPwd?: string, newPwd?: string) => {
    if (!id) return;
    setSaving(true);
    try {
      const payload: any = {
        title:       title.trim(),
        description: description.trim() || undefined,
        deadline:    deadline ? new Date(deadline).toISOString() : undefined,
        accessType,
        questions:   questions.map(q => ({
          text: q.text.trim(),
          imageUrl: q.imageUrl?.trim() || undefined,
          options: q.options.map(o => ({ text: o.text.trim() })),
        })),
      };

      if (accessType === 'PRIVATE') {
        if (surveyHasPassword) {
          payload.currentPassword = currentPwd;
          if (newPwd !== undefined) payload.password = newPwd;
        } else {
          payload.password = stagedNewPwd;
        }
      } else if (originalAccessType === 'PRIVATE' && currentPwd) {
        payload.currentPassword = currentPwd;
      }

      if (accessType === 'ANONYMOUS_INVITE' && inviteExpiresAt) {
        payload.inviteExpiresAt = new Date(inviteExpiresAt).toISOString();
      }

      await surveyApi.update(id, payload);
      toast.success(t('editSurvey.saved'));
      navigate(`/results/${id}`);
    } catch (err: any) {
      const errCode = err?.response?.data?.error;
      if (errCode === 'wrong_current_password') {
        toast.error(t('editSurvey.wrongCurrentPassword'));
      } else {
        toast.error(t('editSurvey.saveError'));
      }
      setStagedCurrentPwd(null);
      setStagedNewPwd(null);
    } finally {
      setSaving(false);
    }
  };

  const AccessTypeCard = ({ type, icon, label, desc }: { type: AccessType; icon: React.ReactNode; label: string; desc: string }) => (
    <button
      type="button"
      onClick={() => { setAccessType(type); setStagedCurrentPwd(null); setStagedNewPwd(null); }}
      className={`flex-1 min-w-[110px] p-3 rounded-xl border-2 text-left transition-all duration-200 ${
        accessType === type
          ? 'border-primary bg-primary/10 dark:bg-primary/20'
          : 'border-borderLight hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <div className={`mb-1.5 ${accessType === type ? 'text-primary' : 'text-textMuted'}`}>{icon}</div>
      <div className={`font-semibold text-sm ${accessType === type ? 'text-primary' : 'text-textMain'}`}>{label}</div>
      <div className="text-xs text-textMuted mt-0.5 leading-tight">{desc}</div>
    </button>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate('/my-surveys')} className="p-2 rounded-xl text-textMuted hover:text-textMain hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="heading-1">{t('editSurvey.title')}</h1>
          <p className="text-textMuted text-sm mt-0.5">{t('editSurvey.subtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Info Section */}
        <div className="card p-4 sm:p-8 space-y-5">
          <h3 className="text-base sm:text-lg font-bold text-accent">{t('createSurvey.infoSection')}</h3>
          <div>
            <label className="label-text">{t('createSurvey.titleLabel')}</label>
            <input className={`input-field ${errors.title ? 'border-error ring-1 ring-error' : ''}`} placeholder={t('createSurvey.titlePlaceholder')} value={title} onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: '' })); }} maxLength={200} />
            {errors.title && <p className="text-error text-sm mt-1">{errors.title}</p>}
          </div>
          <div>
            <label className="label-text">{t('createSurvey.descLabel')}</label>
            <textarea className="input-field min-h-[90px] resize-y" placeholder={t('createSurvey.descPlaceholder')} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
          </div>
          {accessType !== 'ANONYMOUS_INVITE' && (
            <div>
              <label className="label-text flex items-center gap-2"><Calendar className="w-4 h-4 text-textMuted" />{t('createSurvey.deadlineLabel')}</label>
              <input type="datetime-local" className="input-field" value={deadline} onChange={e => setDeadline(e.target.value)} />
              <p className="text-xs text-textMuted mt-1">{t('createSurvey.deadlineHint')}</p>
            </div>
          )}
        </div>

        {/* Access Type Section */}
        <div className="card p-4 sm:p-8 space-y-4">
          <h3 className="text-base sm:text-lg font-bold text-accent">{t('editSurvey.accessSection')}</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <AccessTypeCard type="PUBLIC"           icon={<Globe size={20} />} label={t('editSurvey.accessPublic')}    desc={t('createSurvey.typePublicDesc')} />
            <AccessTypeCard type="PRIVATE"          icon={<Lock  size={20} />} label={t('editSurvey.accessPrivate')}   desc={t('createSurvey.typePrivateDesc')} />
            <AccessTypeCard type="ANONYMOUS_INVITE" icon={<Users size={20} />} label={t('editSurvey.accessAnonymous')} desc={t('createSurvey.typeInviteDesc')} />
          </div>

          {/* Privacy Warning */}
          {originalAccessType === 'PRIVATE' && accessType !== 'PRIVATE' && surveyHasPassword && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-sm">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-amber-700 dark:text-amber-300">{t('editSurvey.warnUnpublish')}</p>
            </div>
          )}

          {/* PRIVATE Password Controls */}
          {accessType === 'PRIVATE' && (
            <div className="border border-borderLight rounded-xl p-4 space-y-3 mt-2 bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <span className="font-semibold text-sm">{t('editSurvey.passwordSection')}</span>
              </div>

              <div className="flex items-center justify-between bg-white dark:bg-slate-700/50 p-3 rounded-lg border border-borderLight shadow-sm">
                <div className="flex items-center gap-2 text-sm">
                  <KeyRound size={15} className={surveyHasPassword || stagedNewPwd ? "text-primary" : "text-textMuted"} />
                  {stagedNewPwd !== null
                    ? <span className="text-green-600 dark:text-green-400 font-medium">{t('editSurvey.stagedPwd')}</span>
                    : surveyHasPassword
                      ? <span className="text-textMain">{t('editSurvey.hasPassword')}</span>
                      : <span className="text-textMuted">{t('editSurvey.noPasswordYet', 'Пароль не встановлено')}</span>
                  }
                </div>
                <button
                  type="button"
                  onClick={() => setModalPurpose(surveyHasPassword ? 'change_password' : 'set_password')}
                  className="btn btn-secondary !py-1.5 !px-3 !text-xs"
                >
                  {surveyHasPassword ? t('editSurvey.changePasswordToggle') : t('editSurvey.setPassword', 'Встановити пароль')}
                </button>
              </div>
              {errors.password && <p className="text-error text-sm mt-1">{errors.password}</p>}

              {surveyHasPassword && originalAccessType === 'PRIVATE' && stagedCurrentPwd === null && (
                <p className="text-xs text-textMuted flex items-center gap-1.5 pt-1">
                  <Lock size={12} />{t('editSurvey.saveRequiresPwd')}
                </p>
              )}
            </div>
          )}

          {/* ANONYMOUS_INVITE Settings */}
          {accessType === 'ANONYMOUS_INVITE' && (
            <div className="border border-borderLight rounded-xl p-4 space-y-3 mt-2 bg-slate-50 dark:bg-slate-800/40">
              <label className="label-text flex items-center gap-2"><Calendar className="w-4 h-4 text-textMuted" />{t('editSurvey.inviteExpiresAt')}</label>
              <input type="datetime-local" className="input-field" min={new Date().toISOString().slice(0, 16)} value={inviteExpiresAt} onChange={e => setInviteExpiresAt(e.target.value)} />
              <p className="text-xs text-textMuted">{t('editSurvey.inviteExpiresHint')}</p>
            </div>
          )}
        </div>

        {/* Questions Section */}
        <div className="space-y-3 sm:space-y-4">
          {questions.map((q, qIdx) => (
            <div key={q.id} className="card p-4 sm:p-7">
              <div className="flex items-center justify-between mb-4">
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-sm font-bold">{t('createSurvey.question')} {qIdx + 1}</span>
                <button type="button" className="btn btn-danger !p-2" onClick={() => removeQuestion(q.id)}><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4 mb-5">
                <div>
                  <label className="label-text">{t('createSurvey.questionLabel')}</label>
                  <input className={`input-field w-full font-medium ${errors[`q_${q.id}`] ? 'border-error ring-1 ring-error' : ''}`} placeholder={t('createSurvey.questionPlaceholder', { num: qIdx + 1 })} value={q.text} onChange={e => { updateQ(q.id, e.target.value); setErrors(p => ({ ...p, [`q_${q.id}`]: '' })); }} maxLength={500} />
                  {errors[`q_${q.id}`] && <p className="text-error text-sm mt-1">{errors[`q_${q.id}`]}</p>}
                </div>
                <div>
                  <label className="label-text">{t('admin.imageOptional', 'Image URL (Optional)')}</label>
                  <input className="input-field text-sm w-full" placeholder="https://example.com/image.jpg" value={q.imageUrl || ''} onChange={e => updateQImage(q.id, e.target.value)} />
                </div>
              </div>
              <div className="space-y-3 mb-4">
                {q.options.map((o, oIdx) => (
                  <div key={o.id} className="flex gap-2 items-center">
                    <span className="text-textMuted text-sm w-5 text-right shrink-0">{oIdx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <input className={`input-field w-full py-3 ${errors[`o_${o.id}`] ? 'border-error ring-1 ring-error' : ''}`} placeholder={t('createSurvey.optionPlaceholder', { num: oIdx + 1 })} value={o.text} onChange={e => { updateO(q.id, o.id, e.target.value); setErrors(p => ({ ...p, [`o_${o.id}`]: '' })); }} />
                      {errors[`o_${o.id}`] && <p className="text-error text-sm mt-1">{errors[`o_${o.id}`]}</p>}
                    </div>
                    <button type="button" className="p-2.5 text-slate-400 hover:text-error rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0" onClick={() => removeOption(q.id, o.id)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              {q.options.length < 10 && (
                <button type="button" className="text-sm font-medium text-accent hover:text-accentHover flex items-center gap-1.5 py-2 px-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" onClick={() => addOption(q.id)}>
                  <Plus className="w-4 h-4" />{t('createSurvey.addOption')}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add Question */}
        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-borderLight border-dashed">
          <button type="button" className="btn btn-secondary" onClick={addQuestion}><Plus className="w-4 h-4" />{t('createSurvey.addQuestion')}</button>
          <span className="text-sm text-textMuted">{t('createSurvey.questionsCount', { count: questions.length })}</span>
        </div>

        {/* Final Save */}
        <button type="submit" disabled={saving} className="btn btn-primary w-full text-base sm:text-lg py-4 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
          {saving ? <><Loader2 className="w-5 h-5 animate-spin" />{t('editSurvey.saving')}</> : <><Save className="w-5 h-5" />{t('editSurvey.save')}</>}
        </button>
      </form>

      {/* Modal */}
      {modalPurpose && (
        <PasswordModal
          surveyId={id}
          mode={modalMode}
          onConfirm={handleModalConfirm}
          onClose={() => setModalPurpose(null)}
        />
      )}
    </div>
  );
}

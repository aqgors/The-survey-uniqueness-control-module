import { useState } from 'react';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, X, ShieldCheck, Lock, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { surveyApi } from '@/api/surveyApi';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const passwordRules = z
  .string()
  .min(4, 'Мінімум 4 символи')
  .max(100, 'Максимум 100 символів')
  .regex(/[A-Za-z]/, 'Пароль має містити хоча б одну літеру');

export const confirmSchema = z.object({
  currentPassword: z.string().min(1, 'Поточний пароль обовʼязковий'),
});

export const changeSchema = z.object({
  currentPassword: z.string().min(1, 'Поточний пароль обовʼязковий'),
  newPassword: passwordRules,
});

export const createSchema = z.object({
  newPassword: passwordRules,
});

export type ModalMode =
  | 'change'   // Change password: old + new fields
  | 'confirm'  // Confirm identity: only current password
  | 'create';  // Create password: only new field

interface Props {
  surveyId?: string;
  mode: ModalMode;
  /** Called with validated passwords on OK */
  onConfirm: (currentPassword: string, newPassword?: string) => void;
  onClose: () => void;
}

// ── Password strength helper ─────────────────────────────────────────────────

function getStrength(pwd: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pwd) return { level: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 4) score++;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
  if (score === 1) return { level: 1, label: 'Слабкий', color: 'bg-red-500' };
  if (score === 2) return { level: 2, label: 'Середній', color: 'bg-amber-500' };
  return { level: 3, label: 'Надійний', color: 'bg-emerald-500' };
}

// ── Password Field sub-component ─────────────────────────────────────────────

function PasswordField({
  label,
  value,
  show,
  onToggle,
  onChange,
  error,
  placeholder,
  showStrength = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
  error?: string;
  placeholder: string;
  showStrength?: boolean;
  autoFocus?: boolean;
}) {
  const strength = getStrength(value);

  return (
    <div className="space-y-1.5">
      <label className="label-text">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={`input-field pr-10 ${error ? 'border-error ring-1 ring-error' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="new-password"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Strength bar */}
      {showStrength && value.length > 0 && (
        <div className="space-y-1">
          <div className="flex gap-1 h-1">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all duration-300 ${
                  i <= strength.level ? strength.color : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
          {strength.label && (
            <p className={`text-xs font-medium ${
              strength.level === 1 ? 'text-red-500' :
              strength.level === 2 ? 'text-amber-500' : 'text-emerald-500'
            }`}>
              {strength.label}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-error text-sm">{error}</p>}
    </div>
  );
}

// ── PasswordModal ────────────────────────────────────────────────────────────

export function PasswordModal({ surveyId, mode, onConfirm, onClose }: Props) {
  const { t } = useTranslation();

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [showCur,    setShowCur]    = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});

  const [verifying, setVerifying] = useState(false);

  const clearError = (field: string) =>
    setErrors(p => ({ ...p, [field]: '' }));

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    let data: Record<string, string> = {};
    let schema: z.ZodTypeAny;

    if (mode === 'change') {
      data   = { currentPassword: currentPwd, newPassword: newPwd };
      schema = changeSchema;
    } else if (mode === 'confirm') {
      data   = { currentPassword: currentPwd };
      schema = confirmSchema;
    } else {
      data   = { newPassword: newPwd };
      schema = createSchema;
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue: z.ZodIssue) => {
        const field = String(issue.path[0]);
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // ── Verify current password against server ───────────────────────────────
    if (surveyId && (mode === 'change' || mode === 'confirm')) {
      setVerifying(true);
      try {
        await surveyApi.unlock(surveyId, currentPwd);
      } catch (err: any) {
        const errorData = err?.response?.data;
        if (errorData?.error === 'wrong_password' || err?.response?.status === 401) {
          setErrors({ currentPassword: t('editSurvey.wrongCurrentPassword') });
        } else {
          setErrors({ currentPassword: t('editSurvey.saveError') });
        }
        return;
      } finally {
        setVerifying(false);
      }
    }

    onConfirm(currentPwd, mode !== 'confirm' ? newPwd : undefined);
  };

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  // ── Title & icon by mode ───────────────────────────────────────────────────
  const modalTitle =
    mode === 'create'  ? t('editSurvey.setPassword',         'Встановити пароль') :
    mode === 'change'  ? t('editSurvey.changePasswordToggle', 'Змінити пароль')    :
                         t('editSurvey.confirmIdentity',      'Підтвердження паролем');

  const TitleIcon =
    mode === 'confirm' ? Lock :
    mode === 'change'  ? KeyRound : ShieldCheck;

  const submitLabel =
    mode === 'confirm' ? t('common.confirm', 'Підтвердити') :
                         t('common.save',    'Зберегти');

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop blur layer */}
      <div className="absolute inset-0 backdrop-blur-sm pointer-events-none" />

      {/* Modal card */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-borderLight shadow-2xl overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          animation: 'modalIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Gradient accent top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary" />

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-borderLight bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm">
          <h3 className="font-bold text-textMain flex items-center gap-2 text-sm sm:text-base">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <TitleIcon size={16} />
            </span>
            {modalTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-textMuted hover:text-error hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Contextual hint banner */}
          {mode === 'confirm' && (
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/60 rounded-xl px-3.5 py-3 text-sm text-amber-700 dark:text-amber-300">
              <Lock size={15} className="mt-0.5 shrink-0" />
              <p>{t('editSurvey.confirmDesc', 'Введіть поточний пароль опитування для підтвердження дії')}</p>
            </div>
          )}

          {mode === 'change' && (
            <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/60 rounded-xl px-3.5 py-3 text-sm text-blue-700 dark:text-blue-300">
              <KeyRound size={15} className="mt-0.5 shrink-0" />
              <p>{t('editSurvey.changeDesc', 'Введіть поточний пароль, потім задайте новий')}</p>
            </div>
          )}

          {mode === 'create' && (
            <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/60 rounded-xl px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              <p>{t('editSurvey.createDesc', 'Задайте пароль для захисту цього опитування. Мін. 4 символи, хоча б одна літера.')}</p>
            </div>
          )}

          {/* Current password field */}
          {(mode === 'confirm' || mode === 'change') && (
            <PasswordField
              label={t('editSurvey.currentPassword', 'Поточний пароль')}
              value={currentPwd}
              show={showCur}
              onToggle={() => setShowCur(v => !v)}
              onChange={v => { setCurrentPwd(v); clearError('currentPassword'); }}
              error={errors.currentPassword}
              placeholder={t('editSurvey.currentPasswordPlaceholder', 'Введіть поточний пароль')}
              autoFocus
            />
          )}

          {/* New password field */}
          {(mode === 'create' || mode === 'change') && (
            <PasswordField
              label={t('editSurvey.newPassword', 'Новий пароль')}
              value={newPwd}
              show={showNew}
              onToggle={() => setShowNew(v => !v)}
              onChange={v => { setNewPwd(v); clearError('newPassword'); }}
              error={errors.newPassword}
              placeholder={t('editSurvey.newPasswordPlaceholder', 'Мін. 4 символи, хоча б одна літера')}
              showStrength
              autoFocus={mode === 'create'}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              {t('common.cancel', 'Скасувати')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={verifying}
              className="btn btn-primary flex-1"
            >
              {verifying ? <Loader2 size={18} className="animate-spin" /> : submitLabel}
            </button>
          </div>
        </div>
      </div>

      {/* CSS animation keyframe via style tag */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
}

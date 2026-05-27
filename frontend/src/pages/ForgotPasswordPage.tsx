import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/axios';
import toast from 'react-hot-toast';
import { KeyRound, Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

type Step = 'email' | 'code' | 'done';

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      maxLength={6}
      autoComplete="one-time-code"
      style={{
        textAlign: 'center', letterSpacing: '14px', fontSize: '30px', fontWeight: 700,
        fontFamily: 'monospace', padding: '14px 20px', border: '2px solid #6C63FF',
        borderRadius: '12px', outline: 'none', width: '100%', background: 'transparent',
        color: 'inherit', boxSizing: 'border-box',
      }}
    />
  );
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [emailError, setEmailError] = useState('');

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRequestCode = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError(t('forgotPassword.invalidEmail'));
      return;
    }
    setEmailError('');
    setLoading(true);
    try {
      await authApi.requestForgotPassword(email);
      toast.success(t('forgotPassword.codeInstruction'));
      setStep('code');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('forgotPassword.invalidEmail'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (code.length < 6) return;
    if (newPassword.length < 6) return;
    setLoading(true);
    try {
      await authApi.confirmForgotPassword(email, code, newPassword);
      setStep('done');
      toast.success(t('forgotPassword.successTitle'));
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? t('forgotPassword.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="card p-8 md:p-10 shadow-xl border-t-4 border-t-accent">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent/10 dark:bg-slate-700 text-accent dark:text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8" />
          </div>
          <h1 className="heading-2 mb-2">
            {step === 'done' ? t('forgotPassword.successTitle') : t('forgotPassword.title')}
          </h1>
          <p className="text-textMuted">
            {step === 'email' && t('forgotPassword.subtitle')}
            {step === 'code' && t('forgotPassword.codeInstruction')}
            {step === 'done' && t('forgotPassword.successDesc')}
          </p>
        </div>

        {/* Step: Email */}
        {step === 'email' && (
          <form onSubmit={handleRequestCode} className="space-y-5" noValidate>
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Mail className="w-4 h-4 text-textMuted" />
                {t('forgotPassword.emailLabel')}
              </label>
              <input
                type="email"
                className={`input-field ${emailError ? 'border-red-500' : ''}`}
                placeholder={t('forgotPassword.emailPlaceholder')}
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                autoComplete="email"
                autoFocus
              />
              {emailError && (
                <p className="mt-1.5 text-xs text-error">{emailError}</p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('forgotPassword.sending')}</>
                : <><Mail className="w-5 h-5" /> {t('forgotPassword.sendCodeBtn')}</>
              }
            </button>
          </form>
        )}

        {/* Step: Code + New Password */}
        {step === 'code' && (
          <form onSubmit={handleResetPassword} className="space-y-5" noValidate>
            <div>
              <label className="label-text mb-1.5 block">{t('forgotPassword.codeLabel')}</label>
              <OtpInput value={code} onChange={setCode} />
            </div>

            <div>
              <label className="label-text mb-1.5 block">{t('forgotPassword.newPasswordLabel')}</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input-field pr-11"
                  placeholder={t('forgotPassword.newPasswordPlaceholder')}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain transition-colors"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
              disabled={loading || code.length < 6 || newPassword.length < 6}
            >
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('forgotPassword.resetting')}</>
                : <><KeyRound className="w-5 h-5" /> {t('forgotPassword.resetBtn')}</>
              }
            </button>
          </form>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
            >
              {t('forgotPassword.loginBtn')}
            </button>
          </div>
        )}

        {/* Back to login */}
        {step !== 'done' && (
          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-textMuted hover:text-accent transition-colors inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

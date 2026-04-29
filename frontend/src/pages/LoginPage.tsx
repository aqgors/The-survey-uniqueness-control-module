import { useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Loader2, AlertCircle, Mail, Lock, Eye, EyeOff, CheckCircle2, X } from 'lucide-react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';

// ── Zod Schema ────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'email_required')
    .email('email_invalid'),
  password: z
    .string()
    .min(1, 'password_required')
    .min(6, 'password_min'),
});

type LoginErrors = Partial<Record<keyof z.infer<typeof loginSchema>, string>>;

// ── Success Modal ─────────────────────────────────────────────────────────

function SuccessModal({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in-95 duration-300 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
        </div>

        <h2 className="text-2xl font-bold text-textMain mb-2">{t('login.welcomeBack')}</h2>
        <p className="text-textMuted mb-6">
          {t('login.loggedInAs')} <span className="font-semibold text-textMain">{name}</span>
        </p>

        <button onClick={onClose} className="btn btn-primary w-full py-3">
          {t('login.continue')}
        </button>
      </div>
    </div>
  );
}

// ── Field Error ───────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs text-error flex items-center gap-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {message}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors,   setErrors]   = useState<LoginErrors>({});
  const [globalError, setGlobalError] = useState('');
  const [successUser, setSuccessUser] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || '/';

  // Clear field error on change
  const clearError = useCallback((field: keyof LoginErrors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setGlobalError('');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError('');

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: LoginErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof LoginErrors;
        if (!fieldErrors[key]) {
          // Map internal keys to i18n strings
          const msgMap: Record<string, string> = {
            email_required: t('register.validation.emailRequired'),
            email_invalid: t('register.validation.emailInvalid'),
            password_required: t('register.validation.passwordRequired'),
            password_min: t('register.validation.passwordMin'),
          };
          fieldErrors[key] = msgMap[issue.message] || issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await login(email, password);
      const name = localStorage.getItem('userName') || email;
      setSuccessUser(name);
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('login.wrongCredentials');
      if (err?.response?.status === 401) {
        setErrors({ password: t('login.wrongCredentials') });
      } else {
        setGlobalError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalClose = () => {
    setSuccessUser(null);
    navigate(from, { replace: true });
  };

  const inputClass = (field: keyof LoginErrors) =>
    `input-field ${errors[field] ? 'border-red-500 focus:ring-red-400' : ''}`;

  return (
    <>
      {successUser && <SuccessModal name={successUser} onClose={handleModalClose} />}

      <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="card p-8 md:p-10 shadow-xl border-t-4 border-t-accent">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-accent/10 dark:bg-slate-700 text-accent dark:text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8" />
            </div>
            <h1 className="heading-2 mb-2">{t('login.title')}</h1>
            <p className="text-textMuted">{t('login.subtitle')}</p>
          </div>

          {/* Global error */}
          {globalError && (
            <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {globalError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* Email */}
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Mail className="w-4 h-4 text-textMuted" /> {t('login.emailLabel')}
              </label>
              <input
                type="email"
                className={inputClass('email')}
                placeholder="user@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
                disabled={isLoading}
                autoComplete="email"
              />
              <FieldError message={errors.email} />
            </div>

            {/* Password */}
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Lock className="w-4 h-4 text-textMuted" /> {t('login.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className={`${inputClass('password')} pr-11`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain transition-colors"
                  onClick={() => setShowPwd((v) => !v)}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FieldError message={errors.password} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-accent/20 flex items-center justify-center gap-2 mt-2"
              disabled={isLoading}
            >
              {isLoading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('login.submitting')}</>
                : <><LogIn className="w-5 h-5" /> {t('login.submit')}</>
              }
            </button>
          </form>

          {/* Register link */}
          <div className="mt-8 pt-6 border-t border-borderLight text-center">
            <p className="text-sm text-textMuted mb-3">{t('login.noAccount')}</p>
            <Link to="/register" className="btn btn-secondary w-full flex items-center justify-center gap-2">
              <UserPlus className="w-5 h-5" /> {t('login.register')}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Mail, Lock, User, ArrowLeft, Loader2, Eye, EyeOff, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { z } from 'zod';

// ── Zod Schema ────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z
    .string()
    .min(1, "Імʼя є обовʼязковим")
    .min(2, "Імʼя має містити щонайменше 2 символи"),
  email: z
    .string()
    .min(1, 'Email є обовʼязковим')
    .email('Некоректний формат email')
    .regex(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/, 'Email має містити лише латинські символи'),
  password: z
    .string()
    .min(1, 'Пароль є обовʼязковим')
    .min(6, 'Пароль має містити щонайменше 6 символів')
    .regex(/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?]*$/, 'Пароль має містити лише латинські символи'),
  confirm: z.string().min(1, 'Підтвердіть пароль'),
}).refine((d) => d.password === d.confirm, {
  message: 'Паролі не збігаються',
  path: ['confirm'],
});

type RegisterFields = 'name' | 'email' | 'password' | 'confirm';
type RegisterErrors = Partial<Record<RegisterFields, string>>;

// ── Success Modal ─────────────────────────────────────────────────────────

function SuccessModal({ name, onClose }: { name: string; onClose: () => void }) {
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

        <h2 className="text-2xl font-bold text-textMain mb-2">Акаунт створено! 🎉</h2>
        <p className="text-textMuted mb-6">
          Вітаємо, <span className="font-semibold text-textMain">{name}</span>!<br />
          Тепер ви можете брати участь в опитуваннях.
        </p>

        <button onClick={onClose} className="btn btn-primary w-full py-3">
          До головної
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

export default function RegisterPage() {
  const navigate    = useNavigate();
  const { register } = useAuth();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors,   setErrors]   = useState<RegisterErrors>({});
  const [globalError, setGlobalError] = useState('');
  const [successName, setSuccessName] = useState<string | null>(null);

  // Clear single field error on change
  const clearError = useCallback((field: RegisterFields) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setGlobalError('');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError('');

    // Client-side validation via Zod
    const result = registerSchema.safeParse({ name, email, password, confirm });
    if (!result.success) {
      const fieldErrors: RegisterErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as RegisterFields;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), password);
      setSuccessName(name.trim());
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Помилка реєстрації. Спробуйте ще раз.';
      if (err?.response?.status === 409) {
        setErrors({ email: 'Цей email вже зайнятий' });
      } else {
        setGlobalError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalClose = () => {
    setSuccessName(null);
    navigate('/', { replace: true });
  };

  // ── Input class helper ──
  const inputClass = (field: RegisterFields) =>
    `input-field ${errors[field] ? 'border-red-500 focus:ring-red-400' : ''}`;

  return (
    <>
      {successName && <SuccessModal name={successName} onClose={handleModalClose} />}

      <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="card p-8 md:p-10 shadow-xl border-t-4 border-t-accent">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-accent/10 dark:bg-slate-700 text-accent dark:text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8" />
            </div>
            <h1 className="heading-2 mb-2">Реєстрація</h1>
            <p className="text-textMuted">Створіть акаунт для участі в опитуваннях</p>
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

            {/* Name */}
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <User className="w-4 h-4 text-textMuted" /> Імʼя
              </label>
              <input
                type="text"
                className={inputClass('name')}
                placeholder="Іван Іванов"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError('name'); }}
                disabled={isLoading}
                autoComplete="name"
              />
              <FieldError message={errors.name} />
            </div>

            {/* Email */}
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Mail className="w-4 h-4 text-textMuted" /> Email
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
                <Lock className="w-4 h-4 text-textMuted" /> Пароль
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className={`${inputClass('password')} pr-11`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
                  disabled={isLoading}
                  autoComplete="new-password"
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

            {/* Confirm */}
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Lock className="w-4 h-4 text-textMuted" /> Підтвердження паролю
              </label>
              <input
                type={showPwd ? 'text' : 'password'}
                className={inputClass('confirm')}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); clearError('confirm'); }}
                disabled={isLoading}
                autoComplete="new-password"
              />
              <FieldError message={errors.confirm} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-accent/20 flex items-center justify-center gap-2 mt-2"
              disabled={isLoading}
            >
              {isLoading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Реєстрація...</>
                : <><UserPlus className="w-5 h-5" /> Зареєструватися</>
              }
            </button>
          </form>

          {/* Login link */}
          <div className="mt-8 pt-6 border-t border-borderLight text-center">
            <p className="text-sm text-textMuted mb-3">Вже маєте акаунт?</p>
            <Link to="/login" className="btn btn-secondary w-full flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Увійти
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

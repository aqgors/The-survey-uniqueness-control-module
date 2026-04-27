import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, Loader2, AlertCircle, Mail, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Будь ласка, заповніть усі поля');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Вітаємо! Ви успішно увійшли.');
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Помилка авторизації. Перевірте дані.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="card p-8 md:p-10 shadow-xl border-t-4 border-t-accent">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8" />
          </div>
          <h1 className="heading-2 mb-2">Вхід у систему</h1>
          <p className="text-textMuted">Введіть ваші дані для доступу до опитувань</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Mail className="w-4 h-4 text-textMuted" /> Email
              </label>
              <input 
                type="email"
                required
                className="input-field" 
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Lock className="w-4 h-4 text-textMuted" /> Пароль
              </label>
              <input 
                type="password"
                required
                className="input-field" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary w-full py-3 text-lg shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Вхід...
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Увійти
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-borderLight text-center">
          <p className="text-sm text-textMuted mb-4">Ще не маєте акаунту?</p>
          <button 
            onClick={() => toast('Реєстрація тимчасово недоступна. Використовуйте тестові акаунти.', { icon: 'ℹ️' })}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            <UserPlus className="w-5 h-5" />
            Зареєструватися
          </button>
        </div>
        
        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-borderLight border-dashed">
          <h4 className="text-xs font-bold uppercase tracking-wider text-textMuted mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Тестові дані:
          </h4>
          <ul className="text-xs text-textMuted space-y-1">
            <li>Email: <span className="text-textMain font-medium">test1@mail.com</span></li>
            <li>Пароль: <span className="text-textMain font-medium">123456</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

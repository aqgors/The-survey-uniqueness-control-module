import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, ArrowLeft } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="card p-8 md:p-10 shadow-xl border-t-4 border-t-primary">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8" />
          </div>
          <h1 className="heading-2 mb-2">Реєстрація</h1>
          <p className="text-textMuted">Створіть акаунт для участі в опитуваннях</p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-8 text-sm text-amber-700 dark:text-amber-400">
          <p className="flex items-center gap-2">
            <span className="text-lg">🚧</span>
            Реєстрація наразі в розробці. Будь ласка, використовуйте тестові акаунти на сторінці входу.
          </p>
        </div>

        <form className="space-y-6 opacity-60 pointer-events-none">
          <div className="space-y-4">
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <User className="w-4 h-4 text-textMuted" /> Ім'я
              </label>
              <input 
                type="text"
                className="input-field" 
                placeholder="Іван Іванов"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Mail className="w-4 h-4 text-textMuted" /> Email
              </label>
              <input 
                type="email"
                className="input-field" 
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label-text flex items-center gap-2 mb-1.5">
                <Lock className="w-4 h-4 text-textMuted" /> Пароль
              </label>
              <input 
                type="password"
                className="input-field" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button type="button" className="btn btn-primary w-full py-3 text-lg opacity-50 cursor-not-allowed">
            Зареєструватися
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-borderLight text-center">
          <Link to="/login" className="text-sm font-medium text-accent hover:text-accentHover flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Повернутися до входу
          </Link>
        </div>
      </div>
    </div>
  );
}

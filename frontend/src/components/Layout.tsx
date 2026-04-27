import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings, Sun, Moon, Globe } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'ua' : 'en');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-borderLight shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center font-bold">
                S
              </div>
              <span className="font-bold text-xl tracking-tight text-primary">SurveyPulse</span>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 p-2 text-textMuted hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Change Language"
              >
                <Globe size={18} />
                <span className="text-xs font-bold uppercase">{i18n.language}</span>
              </button>

              <button
                onClick={toggleTheme}
                className="p-2 text-textMuted hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title={theme === 'light' ? t('layout.themeDark') : t('layout.themeLight')}
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>

              <div className="w-px h-6 bg-borderLight mx-1"></div>

              {user ? (
                <>
                  <div className="flex gap-4 mr-4">
                    <Link to="/my-surveys" className="text-sm font-medium text-textMuted hover:text-primary transition-colors hidden sm:inline-block">
                      Мої опитування
                    </Link>
                    <Link to="/create" className="text-sm font-medium text-textMuted hover:text-primary transition-colors hidden sm:inline-block">
                      Створити опитування
                    </Link>
                  </div>
                  <span className="text-sm font-semibold text-primary hidden sm:inline-block bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                    {user.name}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-textMuted hover:text-error transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    title={t('layout.logout')}
                  >
                    <LogOut size={20} />
                  </button>
                </>
              ) : (
                <Link to="/login" className="text-sm font-medium text-textMuted hover:text-primary transition-colors">
                  Увійти
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="py-6 border-t border-borderLight mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-textMuted">
          &copy; {new Date().getFullYear()} SurveyPulse. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

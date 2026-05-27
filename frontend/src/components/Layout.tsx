import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { LogOut, Sun, Moon, Globe, Menu, X, PlusCircle, LayoutList, ChevronRight, Settings, Users } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/');
  };

  const toggleLanguage = () => {
    const next = i18n.language === 'en' ? 'ua' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('i18nextLng', next);
  };

  if (user && (user.role === 'ADMIN' || user.role === 'MODERATOR')) {
    if (!location.pathname.startsWith('/admin')) {
      return <Navigate to="/admin" replace />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-borderLight shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center gap-2">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 bg-primary dark:bg-slate-600 text-white dark:text-slate-100 rounded-lg flex items-center justify-center font-bold">
                S
              </div>
              <span className="font-bold text-xl tracking-tight text-primary">SurveyPulse</span>
            </Link>

            {/* ── Desktop nav ─────────────────────────────────────────────── */}
            <nav className="hidden sm:flex items-center gap-1 sm:gap-2">
              {/* Language toggle */}
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-2.5 py-2 text-textMuted hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Change Language"
              >
                <Globe size={18} />
                <span className="text-xs font-bold uppercase">{i18n.language}</span>
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-textMuted hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title={theme === 'light' ? t('layout.themeDark') : t('layout.themeLight')}
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>

              <div className="w-px h-6 bg-borderLight mx-1" />

              {user ? (
                <>
                  <Link
                    to="/my-surveys"
                    className="text-sm font-medium text-textMuted hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t('layout.mySurveys')}
                  </Link>
                  <Link
                    to="/create"
                    className="text-sm font-medium text-textMuted hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t('layout.createSurvey')}
                  </Link>

                  <Link
                    to="/friends"
                    className="flex items-center gap-1.5 px-2.5 py-2 text-textMuted hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Друзі"
                  >
                    <Users size={18} />
                  </Link>

                  <Link
                    to="/profile"
                    className="flex items-center gap-1.5 px-2.5 py-2 text-textMuted hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Налаштування профілю"
                  >
                    <Settings size={18} />
                  </Link>

                  <div className="w-px h-6 bg-borderLight mx-1" />

                  <span className="text-sm font-semibold text-primary bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
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
                <Link to="/login" className="btn btn-primary text-sm">
                  {t('layout.login')}
                </Link>
              )}
            </nav>

            {/* ── Mobile nav ──────────────────────────────────────────────── */}
            <div className="flex sm:hidden items-center gap-1" ref={menuRef}>
              {/* Quick toggles always visible on mobile */}
              <button
                onClick={toggleLanguage}
                className="p-2 text-textMuted hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Globe size={18} />
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 text-textMuted hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>

              {/* Burger button */}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="p-2 text-textMuted hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Menu"
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="absolute top-16 right-2 left-2 z-50 bg-surface border border-borderLight rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                  {user ? (
                    <>
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-borderLight bg-slate-50 dark:bg-slate-800/60">
                        <p className="text-xs text-textMuted">{t('layout.signedInAs', 'Signed in as')}</p>
                        <p className="font-semibold text-textMain text-sm truncate">{user.name}</p>
                      </div>

                      {/* Nav links */}
                      <Link
                        to="/my-surveys"
                        className="flex items-center justify-between px-4 py-4 text-sm font-medium text-textMain hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <span className="flex items-center gap-3"><LayoutList size={18} className="text-primary" />{t('layout.mySurveys')}</span>
                        <ChevronRight size={16} className="text-textMuted" />
                      </Link>
                      <Link
                        to="/create"
                        className="flex items-center justify-between px-4 py-4 text-sm font-medium text-textMain hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-t border-borderLight"
                      >
                        <span className="flex items-center gap-3"><PlusCircle size={18} className="text-green-500" />{t('layout.createSurvey')}</span>
                        <ChevronRight size={16} className="text-textMuted" />
                      </Link>
                      <Link
                        to="/friends"
                        className="flex items-center justify-between px-4 py-4 text-sm font-medium text-textMain hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-t border-borderLight"
                      >
                        <span className="flex items-center gap-3"><Users size={18} className="text-blue-500" />Друзі</span>
                        <ChevronRight size={16} className="text-textMuted" />
                      </Link>
                      <Link
                        to="/profile"
                        className="flex items-center justify-between px-4 py-4 text-sm font-medium text-textMain hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-t border-borderLight"
                      >
                        <span className="flex items-center gap-3"><Settings size={18} className="text-primary" />Налаштування</span>
                        <ChevronRight size={16} className="text-textMuted" />
                      </Link>

                      {/* Logout */}
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-4 text-sm font-medium text-error hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-borderLight"
                      >
                        <LogOut size={18} />
                        {t('layout.logout')}
                      </button>
                    </>
                  ) : (
                    <Link
                      to="/login"
                      className="flex items-center justify-between px-4 py-4 text-sm font-semibold text-primary hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      {t('layout.login')}
                      <ChevronRight size={16} />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Outlet />
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="py-5 border-t border-borderLight mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-textMuted">
          &copy; {new Date().getFullYear()} SurveyPulse. {t('layout.footer')}.
        </div>
      </footer>
    </div>
  );
}

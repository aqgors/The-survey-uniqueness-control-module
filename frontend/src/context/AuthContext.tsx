import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/axios';

export interface AppUser {
  id:    string;
  email: string;
  name:  string;
  role:  'USER' | 'MODERATOR' | 'ADMIN';
}

interface AuthContextType {
  user:      AppUser | null;
  token:     string | null;
  login:     (email: string, password: string) => Promise<void>;
  register:  (name: string, email: string, password: string) => Promise<void>;
  logout:    () => void;
  isLoading: boolean;
}

const STORAGE = {
  token: 'authToken',
  id:    'userId',
  email: 'userEmail',
  name:  'userName',
  role:  'userRole',
} as const;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AppUser | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE.token);
    const id    = localStorage.getItem(STORAGE.id);
    const email = localStorage.getItem(STORAGE.email);
    const name  = localStorage.getItem(STORAGE.name);
    const role  = localStorage.getItem(STORAGE.role) as AppUser['role'] | null;

    if (savedToken && id && email && name && role) {
      setToken(savedToken);
      setUser({ id, email, name, role });
      // Verify token is still valid
      api.get('/auth/me').catch(() => {});
    }
    setIsLoading(false);

    const handleLogout = () => { setUser(null); setToken(null); };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  function persist(userData: AppUser, jwt: string) {
    localStorage.setItem(STORAGE.token, jwt);
    localStorage.setItem(STORAGE.id,    userData.id);
    localStorage.setItem(STORAGE.email, userData.email);
    localStorage.setItem(STORAGE.name,  userData.name);
    localStorage.setItem(STORAGE.role,  userData.role);
    setToken(jwt);
    setUser(userData);
  }

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    persist(res.data.user as AppUser, res.data.token);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { name, email, password });
    persist(res.data.user as AppUser, res.data.token);
  };

  const logout = () => {
    Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

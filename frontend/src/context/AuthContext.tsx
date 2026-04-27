import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/axios';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'USER';
}

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// ── Storage keys ──────────────────────────────────────────────────────────

const USER_ID_KEY = 'userId';
const USER_EMAIL_KEY = 'userEmail';
const USER_NAME_KEY = 'userName';

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Startup: restore session from localStorage ─────────────────────────

  useEffect(() => {
    const id = localStorage.getItem(USER_ID_KEY);
    const email = localStorage.getItem(USER_EMAIL_KEY);
    const name = localStorage.getItem(USER_NAME_KEY);

    if (id && email && name) {
      setUser({ id, email, name, role: 'USER' });
    }
    setIsLoading(false);
  }, []);

  // ── Real Login ─────────────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const userData = res.data.user as AppUser;

    localStorage.setItem(USER_ID_KEY, userData.id);
    localStorage.setItem(USER_EMAIL_KEY, userData.email);
    localStorage.setItem(USER_NAME_KEY, userData.name);

    setUser(userData);
  };

  // ── Logout ────────────────────────────────────────────────────────────

  const logout = () => {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/axios';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
}

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// ── Storage keys ──────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  id:    'userId',
  email: 'userEmail',
  name:  'userName',
  role:  'userRole',
} as const;

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Startup: restore session from localStorage ─────────────────────────

  useEffect(() => {
    const id    = localStorage.getItem(STORAGE_KEYS.id);
    const email = localStorage.getItem(STORAGE_KEYS.email);
    const name  = localStorage.getItem(STORAGE_KEYS.name);
    const role  = localStorage.getItem(STORAGE_KEYS.role) as 'USER' | 'ADMIN' | null;

    if (id && email && name && role) {
      setUser({ id, email, name, role });
    }
    setIsLoading(false);
  }, []);

  // ── Persist user to localStorage ──────────────────────────────────────

  function persistUser(userData: AppUser) {
    localStorage.setItem(STORAGE_KEYS.id,    userData.id);
    localStorage.setItem(STORAGE_KEYS.email, userData.email);
    localStorage.setItem(STORAGE_KEYS.name,  userData.name);
    localStorage.setItem(STORAGE_KEYS.role,  userData.role);
    setUser(userData);
  }

  // ── Login ─────────────────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    persistUser(res.data.user as AppUser);
  };

  // ── Register ──────────────────────────────────────────────────────────

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post('/auth/register', { name, email, password });
    persistUser(res.data.user as AppUser);
  };

  // ── Logout ────────────────────────────────────────────────────────────

  const logout = () => {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear(); // Clear all unlock tokens and other session data
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
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

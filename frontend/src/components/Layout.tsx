import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <Link to="/" className="navbar-logo">
            <div className="logo-icon">📊</div>
            <span>Survey<span className="accent">Uniq</span></span>
          </Link>
          <div className="navbar-nav">
            <Link
              to="/"
              className={`btn btn-ghost btn-sm ${location.pathname === '/' ? 'btn-secondary' : ''}`}
            >
              🏠 Головна
            </Link>
            <Link to="/create" className="btn btn-primary btn-sm">
              ✨ Створити опитування
            </Link>
          </div>
        </div>
      </nav>
      <main>{children}</main>
      <footer style={{ textAlign: 'center', padding: '2rem', color: 'var(--overlay0)', fontSize: '0.8rem', borderTop: '1px solid var(--surface0)', marginTop: '3rem' }}>
        <p>SurveyUniq — Опитування з контролем унікальності голосів</p>
        <p style={{ marginTop: '0.25rem' }}>Anti-fraud: SHA-256 fingerprint + IP hashing</p>
      </footer>
    </>
  )
}

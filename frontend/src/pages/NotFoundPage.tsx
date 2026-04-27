import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page text-center">
      <div className="container" style={{ maxWidth: '480px' }}>
        <div className="card card-glow" style={{ padding: '3.5rem 2rem' }}>
          <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🔍</div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Сторінку не знайдено</h1>
          <p style={{ marginBottom: '2rem', color: 'var(--subtext0)' }}>
            Опитування не існує або посилання недійсне.
          </p>
          <Link to="/" className="btn btn-primary">← Повернутись на головну</Link>
        </div>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { surveyApi, type SurveyListItem } from '@/api/surveyApi'

export default function HomePage() {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    surveyApi.getAll()
      .then(setSurveys)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="container">

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="text-center" style={{ marginBottom: '4rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗳️</div>
          <h1 style={{ marginBottom: '1rem' }}>
            Швидкі{' '}
            <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              онлайн-опитування
            </span>
          </h1>
          <p style={{ fontSize: '1.1rem', maxWidth: '520px', margin: '0 auto 2rem', color: 'var(--subtext0)' }}>
            Без реєстрації. Один користувач — один голос.
            Захист: Cookie + IP + браузер.
          </p>
          <Link to="/create" className="btn btn-primary btn-lg">✨ Створити опитування</Link>
        </div>

        {/* ── Features ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '4rem' }}>
          {[
            { icon: '🔗', title: 'Посилання', desc: 'Поділіться посиланням /survey/:id' },
            { icon: '🛡️', title: 'Anti-Fraud', desc: 'Cookie + IP + User-Agent блокування' },
            { icon: '📊', title: 'Результати', desc: 'Живі графіки з авто-оновленням' },
          ].map((f) => (
            <div key={f.title} className="card text-center">
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>{f.title}</h3>
              <p style={{ fontSize: '0.85rem' }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ── Survey list ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 style={{ fontSize: '1.5rem' }}>Всі опитування</h2>
            <span className="badge badge-blue">{surveys.length}</span>
          </div>
          <div className="divider" />

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="card card-sm">
                  <div className="skeleton" style={{ height: '18px', width: '55%', marginBottom: '0.625rem' }} />
                  <div className="skeleton" style={{ height: '13px', width: '30%' }} />
                </div>
              ))}
            </div>
          )}

          {!loading && surveys.length === 0 && (
            <div className="card text-center" style={{ padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
              <h3 style={{ marginBottom: '0.5rem' }}>Опитувань ще немає</h3>
              <p style={{ marginBottom: '1.5rem' }}>Створіть перше та поділіться посиланням!</p>
              <Link to="/create" className="btn btn-primary">✨ Створити</Link>
            </div>
          )}

          {!loading && surveys.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {surveys.map((s) => (
                <div key={s.id} className="card card-sm"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-1" style={{ marginBottom: '0.25rem' }}>
                      <h3 style={{ fontSize: '1rem', margin: 0 }}>{s.title}</h3>
                      <span className={`badge ${s.isPublic ? 'badge-green' : 'badge-red'}`}>
                        {s.isPublic ? 'публічне' : 'закрите'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--overlay1)', margin: 0 }}>
                      {s._count.questions} питань · {s._count.votes} голосів ·{' '}
                      {new Date(s.createdAt).toLocaleDateString('uk-UA')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <Link to={`/survey/${s.id}/results`} className="btn btn-ghost btn-sm">📊</Link>
                    {s.isPublic && (
                      <Link to={`/survey/${s.id}`} className="btn btn-primary btn-sm">Голосувати →</Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

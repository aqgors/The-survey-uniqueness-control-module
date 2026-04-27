import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in duration-500">
      <div className="card p-12 max-w-md w-full">
        <div className="text-6xl mb-6">🔍</div>
        <h1 className="heading-2 mb-3">{t('notFound.title')}</h1>
        <p className="text-textMuted mb-8">{t('notFound.desc')}</p>
        <Link to="/" className="btn btn-primary w-full">
          ← {t('notFound.back')}
        </Link>
      </div>
    </div>
  )
}

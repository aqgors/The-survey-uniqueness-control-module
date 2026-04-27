import { Link } from 'react-router-dom';
import { ClipboardList, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="heading-1">
          {t('admin.dashboardTitle', { name: user?.name || 'Admin' })}
        </h1>
        <p className="text-textMuted text-lg mt-2">{t('admin.dashboardDesc')}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-8">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-6">
            <ClipboardList className="w-6 h-6" />
          </div>
          <h2 className="heading-2 mb-2">{t('admin.surveyMgmtTitle')}</h2>
          <p className="text-textMuted mb-6 h-12">
            {t('admin.surveyMgmtDesc')}
          </p>
          <Link to="/admin/surveys" className="btn btn-primary w-full group">
            {t('admin.manageSurveysBtn')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="card p-8">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-6">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="heading-2 mb-2">{t('admin.userMgmtTitle')}</h2>
          <p className="text-textMuted mb-6 h-12">
            {t('admin.userMgmtDesc')}
          </p>
          <Link to="/admin/users" className="btn btn-secondary w-full group">
            {t('admin.manageUsersBtn')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}

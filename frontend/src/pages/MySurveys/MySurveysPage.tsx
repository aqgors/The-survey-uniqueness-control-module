import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/axios';
import { Loader2, Trash2, Edit, Calendar, Users, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

interface Survey {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  isPrivate: boolean;
  isActive: boolean;
  createdAt: string;
  deadline?: string | null;
  _count: { questions: number; votes: number };
}

function isClosed(deadline?: string | null) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

export default function MySurveysPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSurveys = () => {
    if (!user) return;
    setIsLoading(true);
    api.get(`/surveys?authorId=${user.id}`)
      .then(res => setSurveys(res.data.surveys))
      .catch(() => toast.error(t('toast.failedLoad')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchSurveys(); }, [user]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('mySurveys.confirmDelete'))) return;
    try {
      await api.delete(`/surveys/${id}`);
      toast.success(t('mySurveys.deleted'));
      setSurveys(s => s.filter(x => x.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('mySurveys.deleteError'));
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/surveys/${id}`, { isActive: !currentStatus });
      toast.success(!currentStatus ? t('mySurveys.opened') : t('mySurveys.closed'));
      setSurveys(s => s.map(x => x.id === id ? { ...x, isActive: !currentStatus } : x));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('mySurveys.updateError'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  const locale = i18n.language === 'ua' ? 'uk-UA' : 'en-US';

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="heading-1 mb-2">{t('mySurveys.title')}</h1>
          <p className="text-textMuted">{t('mySurveys.subtitle')}</p>
        </div>
        <Link to="/create" className="btn btn-primary">
          {t('mySurveys.createNew')}
        </Link>
      </div>

      {surveys.length === 0 ? (
        <div className="text-center p-16 card bg-slate-50 dark:bg-slate-800/50 border-dashed">
          <p className="text-textMuted text-lg mb-6">{t('mySurveys.empty')}</p>
          <Link to="/create" className="btn btn-primary text-lg px-8 py-3">
            {t('mySurveys.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {surveys.map(survey => {
            const closed = isClosed(survey.deadline);
            const statusLabel = !survey.isActive
              ? t('mySurveys.statusClosed')
              : closed
                ? t('mySurveys.statusExpired')
                : t('mySurveys.statusActive');

            return (
              <div key={survey.id} className={`card flex flex-col sm:flex-row h-full overflow-hidden ${closed ? 'opacity-90' : ''}`}>
                {/* Image Section */}
                <div className="sm:w-48 h-48 sm:h-auto shrink-0 relative bg-slate-100 dark:bg-slate-800">
                  {survey.imageUrl ? (
                    <img src={survey.imageUrl} alt={survey.title} className={`w-full h-full object-cover ${closed ? 'grayscale-[0.5]' : ''}`} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600"></div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className={`px-2 py-1 text-xs font-bold uppercase rounded shadow-sm ${!survey.isActive || closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="font-semibold text-lg text-primary line-clamp-2 mb-2 flex items-center gap-2">
                    {survey.isPrivate && <span title={t('mySurveys.private')} className="text-slate-400">🔒</span>}
                    {survey.title}
                  </h3>
                  
                  <div className="text-sm text-textMuted mb-6 space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(survey.createdAt).toLocaleDateString(locale)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{survey._count.votes} {t('home.votes')} ({survey._count.questions} {t('home.questions')})</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-borderLight mt-auto">
                    <Link to={`/results/${survey.id}`} className="btn btn-secondary flex-1 text-sm py-2 px-3 justify-center">
                      📊 {t('mySurveys.results')}
                    </Link>
                    <Link to={`/survey/${survey.id}`} className="btn btn-secondary text-sm py-2 px-3" title={t('mySurveys.openSurvey')}>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    <button 
                      onClick={() => handleToggleActive(survey.id, survey.isActive)}
                      className={`btn btn-secondary text-sm py-2 px-3 ${!survey.isActive ? 'bg-blue-50 border-blue-200' : ''}`} 
                      title={survey.isActive ? t('mySurveys.closeSurvey') : t('mySurveys.openSurvey')}
                    >
                      {survey.isActive ? t('mySurveys.closeSurveyBtn') : t('mySurveys.openSurveyBtn')}
                    </button>
                    <button
                      className="btn btn-secondary text-sm py-2 px-3"
                      title={t('mySurveys.editComingSoon')}
                      onClick={() => toast(t('mySurveys.editBtn'), { icon: '🚧' })}
                    >
                      <Edit className="w-4 h-4 text-blue-500" />
                    </button>
                    <button onClick={() => handleDelete(survey.id)} className="btn btn-danger text-sm py-2 px-3 hover:bg-red-50" title={t('mySurveys.deleteBtn')}>
                      <Trash2 className="w-4 h-4 text-error" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

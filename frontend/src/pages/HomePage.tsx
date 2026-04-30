import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/axios';
import { ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface Survey {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  deadline?: string | null;
  isActive?: boolean;
  _count: { questions: number; votes: number };
}

function isClosed(survey: Survey) {
  if (survey.isActive === false) return true;
  if (!survey.deadline) return false;
  return new Date(survey.deadline) < new Date();
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');

  useEffect(() => {
    api.get('/surveys')
      .then(res => setSurveys(res.data.surveys))
      .catch(console.error)
      .finally(() => setIsLoading(false));

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', surveyId: 'global' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'survey_created' && data.survey) {
          if (data.survey.accessType === 'ANONYMOUS_INVITE') return;
          setSurveys(prev => {
            if (prev.some(s => s.id === data.survey.id)) return prev;
            return [data.survey, ...prev];
          });
        } else if (data.type === 'survey_updated' && data.survey) {
          setSurveys(prev => prev.map(s => s.id === data.survey.id ? { ...s, ...data.survey } : s));
        }
      } catch (e) {}
    };

    return () => { ws.close(); };
  }, []);

  const { user } = useAuth();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('home.confirmDelete'))) return;
    try {
      await api.delete(`/surveys/${id}`);
      toast.success(t('mySurveys.deleted'));
      setSurveys(s => s.filter(x => x.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('mySurveys.deleteError'));
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h1 className="heading-1">{t('home.title')}</h1>
        <p className="text-textMuted text-lg">{t('home.subtitle')}</p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 max-w-2xl mx-auto mb-8 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-borderLight">
        <input 
          type="text" 
          placeholder={t('home.searchPlaceholder', 'Search surveys...')} 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field flex-1"
        />
        <select 
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="input-field md:w-48"
        >
          <option value="ALL">{t('home.filterAll', 'All Statuses')}</option>
          <option value="ACTIVE">{t('home.filterActive', 'Active')}</option>
          <option value="CLOSED">{t('home.filterClosed', 'Closed')}</option>
        </select>
      </div>

      {surveys.length === 0 ? (
        <div className="text-center p-12 card bg-slate-50 dark:bg-slate-800/50 border-dashed">
          <p className="text-textMuted">{t('home.noSurveys')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {surveys.filter(survey => {
            if (searchQuery && !survey.title.toLowerCase().includes(searchQuery.toLowerCase()) && !survey.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            const closed = isClosed(survey);
            if (filterStatus === 'ACTIVE' && closed) return false;
            if (filterStatus === 'CLOSED' && !closed) return false;
            return true;
          }).map(survey => {
            const closed = isClosed(survey);
            const statusLabel = closed
              ? t('home.surveyDone')
              : survey.deadline
                ? `${t('home.activeTill')} ${new Date(survey.deadline).toLocaleString(locale)}`
                : t('home.active');

            return (
            <Link key={survey.id} to={closed ? `/results/${survey.id}` : `/survey/${survey.id}`} className={`card group flex flex-col h-full hover:-translate-y-1 ${closed ? 'opacity-75 grayscale-[0.5]' : ''}`}>
              {survey.imageUrl ? (
                <div className="aspect-video w-full relative overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-borderLight">
                  <img src={survey.imageUrl} alt={survey.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md shadow-sm ${closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-2 w-full relative bg-gradient-to-r from-accent to-accentHover">
                  <div className="absolute top-4 right-4 z-10">
                    <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md shadow-sm ${closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              )}
              
              <div className={`p-6 flex flex-col flex-1 ${!survey.imageUrl ? 'pt-10' : ''}`}>
                <h3 className="font-semibold text-lg text-primary line-clamp-2 mb-2 group-hover:text-accent transition-colors break-words">
                  {survey.title}
                </h3>
                {survey.description && (
                  <p className="text-sm text-textMuted line-clamp-3 mb-4 flex-1 break-words">
                    {survey.description}
                  </p>
                )}
                <div className="mt-auto pt-4 flex items-center justify-between text-sm text-textMuted border-t border-borderLight/50">
                  <div className="flex gap-3">
                    <span>{survey._count.questions} {t('home.questions')}</span>
                    <span>&bull;</span>
                    <span>{survey._count.votes} {t('home.votes')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {user?.role === 'ADMIN' && (
                      <button 
                        onClick={(e) => handleDelete(e, survey.id)}
                        className="p-1.5 text-error hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title={t('home.deleteAdmin')}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <ChevronRight size={16} className="text-accent opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                  </div>
                </div>
              </div>
            </Link>
          )})}
        </div>
      )}
    </div>
  );
}

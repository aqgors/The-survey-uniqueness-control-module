import { useState, useEffect } from 'react';
import { api } from '../../api/axios';
import { Plus, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

interface Survey {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  _count: { questions: number; votes: number };
}

export default function SurveyManagement() {
  const { t, i18n } = useTranslation();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSurveys = () => {
    setIsLoading(true);
    api.get('/surveys')
      .then(res => setSurveys(res.data.surveys))
      .catch(() => toast.error(t('toast.failedLoad')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchSurveys();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Ви впевнені, що хочете видалити це опитування?')) return;
    try {
      await api.delete(`/surveys/${id}`);
      toast.success('Опитування видалено');
      setSurveys(s => s.filter(x => x.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Помилка видалення');
    }
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="heading-1">{t('admin.surveyMgmtTitle')}</h1>
          <p className="text-textMuted">{t('admin.surveyMgmtDesc')}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full p-12 text-center text-textMuted flex flex-col items-center gap-4">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
            {t('admin.loading')}
          </div>
        ) : surveys.length === 0 ? (
          <div className="col-span-full p-12 text-center card bg-slate-50 dark:bg-slate-800/50 border-dashed">
            <p className="text-textMuted mb-4">No surveys found.</p>
          </div>
        ) : (
          surveys.map(s => (
            <div key={s.id} className="card p-6 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-lg text-primary line-clamp-2">{s.title}</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium ${s.isPublic ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {s.isPublic ? t('admin.public') : t('admin.draft')}
                </span>
              </div>
              <div className="text-sm text-textMuted mb-6 space-y-1">
                <p>{t('admin.joined')}: {new Date(s.createdAt).toLocaleDateString(i18n.language === 'ua' ? 'uk-UA' : 'en-US')}</p>
                <p>{t('admin.questions')}: {s._count.questions} | {t('home.votes')}: {s._count.votes}</p>
              </div>
              <div className="mt-auto flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Link to={`/results/${s.id}`} className="btn btn-secondary flex-1 text-sm py-1.5">
                  {t('admin.results')}
                </Link>
                <Link to={`/survey/${s.id}`} target="_blank" className="btn btn-secondary flex-1 text-sm py-1.5" title="Open survey in new tab">
                  <ExternalLink className="w-4 h-4" /> {t('admin.open')}
                </Link>
                <button onClick={() => handleDelete(s.id)} className="btn btn-danger !p-2" title="Delete survey">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

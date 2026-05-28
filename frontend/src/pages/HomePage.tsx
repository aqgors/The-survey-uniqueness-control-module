import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { surveyApi, SurveyListItem } from '../api/surveyApi';
import { ChevronRight, Loader2, Trash2, Search, LayoutList, CheckCircle2, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/axios';
import toast from 'react-hot-toast';

const API = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://survey-api.avalon.exposed';

type TabKey = 'ALL' | 'MINE' | 'PARTICIPATED';
type StatusFilter = 'ALL' | 'ACTIVE' | 'CLOSED';

function isClosed(survey: SurveyListItem) {
  if ((survey as any).isActive === false) return true;
  if (!survey.deadline) return false;
  return new Date(survey.deadline) < new Date();
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [allSurveys,          setAllSurveys]          = useState<SurveyListItem[]>([]);
  const [mineSurveys,         setMineSurveys]          = useState<SurveyListItem[]>([]);
  const [participatedSurveys, setParticipatedSurveys]  = useState<SurveyListItem[]>([]);

  const [loadingAll,  setLoadingAll]  = useState(true);
  const [loadingMine, setLoadingMine] = useState(false);
  const [loadingPart, setLoadingPart] = useState(false);

  const [tab,          setTab]          = useState<TabKey>('ALL');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('ALL');

  const locale = i18n.language === 'ua' ? 'uk-UA' : 'en-US';

  // ── Load public surveys + WebSocket for real-time ─────────────────────────
  useEffect(() => {
    setLoadingAll(true);
    surveyApi.getAll()
      .then(setAllSurveys)
      .catch(console.error)
      .finally(() => setLoadingAll(false));

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', surveyId: 'global' }));
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'survey_created' && data.survey) {
          if (data.survey.accessType === 'ANONYMOUS_INVITE') return;
          setAllSurveys(prev => prev.some(s => s.id === data.survey.id) ? prev : [data.survey, ...prev]);
        } else if (data.type === 'survey_updated' && data.survey) {
          setAllSurveys(prev => prev.map(s => s.id === data.survey.id ? { ...s, ...data.survey } : s));
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  // ── Load "Mine" tab lazily ─────────────────────────────────────────────────
  const loadMine = useCallback(() => {
    if (!user) return;
    setLoadingMine(true);
    surveyApi.getAll()
      .then(surveys => setMineSurveys(surveys.filter(s => (s as any).createdById === user.id)))
      .catch(console.error)
      .finally(() => setLoadingMine(false));
  }, [user]);

  // ── Load "Participated" tab lazily ─────────────────────────────────────────
  const loadParticipated = useCallback(() => {
    if (!user) return;
    setLoadingPart(true);
    surveyApi.getParticipated()
      .then(setParticipatedSurveys)
      .catch(console.error)
      .finally(() => setLoadingPart(false));
  }, [user]);

  const handleTabChange = (newTab: TabKey) => {
    setTab(newTab);
    if (newTab === 'MINE' && mineSurveys.length === 0 && user) loadMine();
    if (newTab === 'PARTICIPATED' && participatedSurveys.length === 0 && user) loadParticipated();
  };

  // ── Delete (admin) ────────────────────────────────────────────────────────
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t('home.confirmDelete'))) return;
    try {
      await api.delete(`/surveys/${id}`);
      toast.success(t('mySurveys.deleted'));
      setAllSurveys(s => s.filter(x => x.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('mySurveys.deleteError'));
    }
  };

  // ── Derive displayed list ─────────────────────────────────────────────────
  const rawList = tab === 'MINE' ? mineSurveys : tab === 'PARTICIPATED' ? participatedSurveys : allSurveys;
  const isLoading = tab === 'ALL' ? loadingAll : tab === 'MINE' ? loadingMine : loadingPart;

  const displayed = rawList.filter(survey => {
    const titleMatch = survey.title.toLowerCase().includes(searchQuery.toLowerCase());
    const descMatch = survey.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
    if (searchQuery && !titleMatch && !descMatch) return false;
    const closed = isClosed(survey);
    if (filterStatus === 'ACTIVE' && closed) return false;
    if (filterStatus === 'CLOSED' && !closed) return false;
    return true;
  });

  // ── Tabs config ───────────────────────────────────────────────────────────
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'ALL',          label: t('home.tabAll'),          icon: <Globe2 size={15} /> },
    { key: 'MINE',         label: t('home.tabMine'),         icon: <LayoutList size={15} /> },
    { key: 'PARTICIPATED', label: t('home.tabParticipated'), icon: <CheckCircle2 size={15} /> },
  ];

  const renderEmpty = () => {
    if (!user && (tab === 'MINE' || tab === 'PARTICIPATED')) {
      return (
        <div className="text-center p-12 card bg-slate-50 dark:bg-slate-800/50 border-dashed">
          <p className="text-textMuted">{tab === 'MINE' ? t('home.loginToSeeMine') : t('home.loginToSeeParticipated')}</p>
          <Link to="/login" className="btn btn-primary mt-4 inline-block">{t('layout.login')}</Link>
        </div>
      );
    }
    const msg = tab === 'MINE' ? t('home.noMine') : tab === 'PARTICIPATED' ? t('home.noParticipated') : t('home.noSurveys');
    return (
      <div className="text-center p-12 card bg-slate-50 dark:bg-slate-800/50 border-dashed">
        <p className="text-textMuted">{msg}</p>
        {tab === 'MINE' && user && (
          <Link to="/create" className="btn btn-primary mt-4 inline-block">{t('layout.createSurvey')}</Link>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <h1 className="heading-1">{t('home.title')}</h1>
        <p className="text-textMuted text-lg">{t('home.subtitle')}</p>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-borderLight bg-slate-50 dark:bg-slate-800/60 p-1 gap-1">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                tab === key
                  ? 'bg-primary text-white dark:text-slate-900 shadow-md shadow-primary/30'
                  : 'text-textMuted hover:text-textMain hover:bg-white dark:hover:bg-slate-700'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters & Search ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-borderLight">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            placeholder={t('home.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9 w-full"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          className="input-field sm:w-44"
        >
          <option value="ALL">{t('home.filterAll')}</option>
          <option value="ACTIVE">{t('home.filterActive')}</option>
          <option value="CLOSED">{t('home.filterClosed')}</option>
        </select>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
        </div>
      ) : displayed.length === 0 ? renderEmpty() : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {displayed.map(survey => {
            const closed = isClosed(survey);
            const statusLabel = closed
              ? t('home.surveyDone')
              : survey.deadline
                ? `${t('home.activeTill')} ${new Date(survey.deadline).toLocaleString(locale)}`
                : t('home.active');

            return (
              <Link
                key={survey.id}
                to={closed ? `/results/${survey.id}` : `/survey/${survey.id}`}
                className={`card group flex flex-col h-full hover:-translate-y-1 ${closed ? 'opacity-75 grayscale-[0.5]' : ''}`}
              >
                {survey.imageUrl ? (
                  <div className="aspect-video w-full relative overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-borderLight">
                    <img src={survey.imageUrl} alt={survey.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                      <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md shadow-sm ${closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-2 w-full relative bg-gradient-to-r from-accent to-accentHover">
                    <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 items-end">
                      <span className={`px-2 py-1 text-xs font-bold uppercase rounded-md shadow-sm ${closed ? 'bg-slate-800 text-white' : 'bg-green-500 text-white'}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                )}

                <div className={`p-5 flex flex-col flex-1 ${!survey.imageUrl ? 'pt-10' : ''}`}>
                  <h3 className="font-semibold text-lg text-primary line-clamp-2 mb-2 group-hover:text-accent transition-colors break-words">
                    {survey.title}
                  </h3>
                  {survey.description && (
                    <p className="text-sm text-textMuted line-clamp-3 mb-4 flex-1 break-words">{survey.description}</p>
                  )}
                  
                  <div className="mt-auto pt-4 flex flex-col gap-3 border-t border-borderLight/50">
                    {survey.isFriend && (
                      <div className="flex items-center gap-2">
                        {survey.authorAvatar ? (
                          <img src={`${API}${survey.authorAvatar}`} alt={survey.authorName} className="w-6 h-6 rounded-full object-cover shadow-sm border border-slate-200" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shadow-sm border border-blue-200">
                            {survey.authorName?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">{survey.authorName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm text-textMuted">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-3">
                          <span>{survey._count.questions} {t('home.questions')}</span>
                          <span>&bull;</span>
                          <span>{survey._count.votes} {t('home.votes')}</span>
                        </div>
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
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

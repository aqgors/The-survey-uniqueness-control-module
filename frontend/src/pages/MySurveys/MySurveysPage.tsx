import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/axios';
import {
  Loader2, Trash2, Edit, Calendar, Users, ExternalLink,
  Link2, BarChart2, Power, PowerOff, Search, SlidersHorizontal, Copy
} from 'lucide-react';
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
  accessType?: string;
  createdAt: string;
  deadline?: string | null;
  createdById?: string;
  _count: { questions: number; votes: number };
  inviteTokens?: { id: string, token: string, expiresAt: string | null }[];
}

function isClosed(deadline?: string | null) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

const TYPE_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  PRIVATE:          { label: 'Приватне',    icon: '🔒', cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
  ANONYMOUS_INVITE: { label: 'По лінку',   icon: '🛡️', cls: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  PUBLIC:           { label: 'Публічне',   icon: '🌐', cls: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
};

export default function MySurveysPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'PUBLIC' | 'PRIVATE' | 'ANONYMOUS_INVITE'>('ALL');

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

  const filtered = surveys.filter(survey => {
    if (
      searchQuery &&
      !survey.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !survey.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) return false;
    const closed = isClosed(survey.deadline) || !survey.isActive;
    if (filterStatus === 'ACTIVE' && closed) return false;
    if (filterStatus === 'CLOSED' && !closed) return false;
    if (filterType !== 'ALL' && survey.accessType !== filterType) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500 px-2 sm:px-0">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="heading-1 mb-1">{t('mySurveys.title')}</h1>
          <p className="text-textMuted text-sm">{t('mySurveys.subtitle')}</p>
        </div>
        <Link to="/create" className="btn btn-primary shrink-0 self-start sm:self-center">
          {t('mySurveys.createNew')}
        </Link>
      </div>

      {/* ── Filters & Search ── */}
      <div className="card p-3 sm:p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
          <input
            type="text"
            placeholder={t('home.searchPlaceholder', 'Пошук...')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-field pl-9 w-full"
          />
        </div>
        <div className="flex gap-3 flex-1 sm:flex-none">
          <div className="relative flex-1 sm:w-40">
            <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="input-field pl-9 w-full appearance-none"
            >
              <option value="ALL">Всі статуси</option>
              <option value="ACTIVE">Активні</option>
              <option value="CLOSED">Закриті</option>
            </select>
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="input-field flex-1 sm:w-44 appearance-none"
          >
            <option value="ALL">Всі типи</option>
            <option value="PUBLIC">Публічні</option>
            <option value="PRIVATE">Приватні</option>
            <option value="ANONYMOUS_INVITE">По лінку</option>
          </select>
        </div>
      </div>

      {/* ── Empty state ── */}
      {surveys.length === 0 ? (
        <div className="text-center p-16 card bg-slate-50 dark:bg-slate-800/50 border-dashed">
          <p className="text-textMuted text-lg mb-6">{t('mySurveys.empty')}</p>
          <Link to="/create" className="btn btn-primary text-lg px-8 py-3">
            {t('mySurveys.createFirst')}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center p-12 card bg-slate-50 dark:bg-slate-800/50 border-dashed">
          <p className="text-textMuted">{t('mySurveys.notFoundFiltered')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(survey => {
            const expired = isClosed(survey.deadline);
            const isInactive = !survey.isActive;
            const isClosed_ = expired || isInactive;
            const statusLabel = isInactive
              ? t('mySurveys.statusClosed')
              : expired
                ? t('mySurveys.statusExpired')
                : t('mySurveys.statusActive');

            const typeMeta = TYPE_BADGE[survey.accessType ?? 'PUBLIC'] ?? TYPE_BADGE['PUBLIC'];
            const masterToken = survey.inviteTokens?.[0]?.token;
            const inviteLink = masterToken
              ? `${window.location.origin}/survey/${survey.id}?invite=${masterToken}`
              : null;
            const openHref = survey.accessType === 'ANONYMOUS_INVITE' && masterToken
              ? `/survey/${survey.id}?invite=${masterToken}`
              : `/survey/${survey.id}`;

            return (
              <div
                key={survey.id}
                className={`card overflow-hidden flex flex-col sm:flex-row transition-opacity ${isClosed_ ? 'opacity-80' : ''}`}
              >
                {/* ── Thumbnail ── */}
                <div className="relative sm:w-36 md:w-44 h-36 sm:h-auto shrink-0 bg-slate-100 dark:bg-slate-800">
                  {survey.imageUrl ? (
                    <img
                      src={survey.imageUrl}
                      alt={survey.title}
                      className={`w-full h-full object-cover ${isClosed_ ? 'grayscale-[0.4]' : ''}`}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600" />
                  )}
                  {/* Status badge */}
                  <span
                    className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded tracking-wide shadow-sm ${
                      isClosed_ ? 'bg-slate-700 text-white' : 'bg-green-500 text-white'
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                {/* ── Body ── */}
                <div className="flex flex-col flex-1 p-4 sm:p-5 min-w-0 gap-3">

                  {/* Title row */}
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base sm:text-lg text-primary leading-tight line-clamp-2 break-words">
                        {survey.title}
                      </h3>
                      {survey.description && (
                        <p className="text-textMuted text-xs mt-0.5 line-clamp-1 break-words">{survey.description}</p>
                      )}
                    </div>
                    {/* Type badge */}
                    <span className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${typeMeta.cls}`}>
                      <span>{typeMeta.icon}</span>
                      <span className="hidden sm:inline">{typeMeta.label}</span>
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-textMuted">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      {new Date(survey.createdAt).toLocaleDateString(locale)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      {survey._count.votes} відп. · {survey._count.questions} пит.
                    </span>
                  </div>

                  {/* Invite link block */}
                  {survey.accessType === 'ANONYMOUS_INVITE' && (() => {
                    const activeToken = survey.inviteTokens?.[0];
                    const inviteLink = activeToken ? `${window.location.origin}/survey/${survey.id}?invite=${activeToken.token}` : null;
                    const isExpired = activeToken?.expiresAt ? new Date(activeToken.expiresAt) < new Date() : false;

                    if (!activeToken || isExpired) {
                      return (
                        <div className="mt-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col gap-2">
                          <span className="text-xs font-semibold text-slate-500">{t('mySurveys.linkInactive')}</span>
                          <p className="text-[10px] text-textMuted">{t('mySurveys.generateNewInResults')}</p>
                        </div>
                      );
                    }

                    return (
                      <div className="mt-3 flex flex-col gap-1.5">
                        <button
                          onClick={() => { navigator.clipboard.writeText(inviteLink!); toast.success(t('toast.copied')); }}
                          className="flex items-center gap-2 w-full rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors px-3 py-2 group text-left"
                          title={t('mySurveys.copyInviteHint')}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <div className="flex flex-col text-left">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">{t('createSurvey.copy')}</span>
                            <span className="text-[10px] text-slate-500">{activeToken.expiresAt ? t('results.invites.validUntil', { date: new Date(activeToken.expiresAt).toLocaleDateString(locale) }) : t('mySurveys.indefinite')}</span>
                          </div>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap mt-auto pt-2 border-t border-borderLight">
                    {/* Results — grows to fill space */}
                    <Link
                      to={`/results/${survey.id}`}
                      className="btn btn-secondary flex-1 text-xs py-2 px-2 justify-center gap-1.5 min-w-[80px]"
                    >
                      <BarChart2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('mySurveys.results')}</span>
                    </Link>

                    {/* Open survey */}
                    <Link
                      to={openHref}
                      className="btn btn-secondary text-xs py-2 px-3"
                      title={t('mySurveys.openSurvey')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>

                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(survey.id, survey.isActive)}
                      className={`btn btn-secondary text-xs py-2 px-3 ${!survey.isActive ? '!border-blue-300 !text-blue-600 dark:!text-blue-400' : ''}`}
                      title={survey.isActive ? t('mySurveys.closeSurvey') : t('mySurveys.openSurvey')}
                    >
                      {survey.isActive
                        ? <PowerOff className="w-3.5 h-3.5" />
                        : <Power className="w-3.5 h-3.5" />
                      }
                    </button>

                    {/* Edit */}
                    <button
                      className="btn btn-secondary text-xs py-2 px-3"
                      title={t('mySurveys.editComingSoon')}
                      onClick={() => navigate(`/edit/${survey.id}`)}
                    >
                      <Edit className="w-3.5 h-3.5 text-blue-500" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(survey.id)}
                      className="btn btn-danger text-xs py-2 px-3"
                      title={t('mySurveys.deleteBtn')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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

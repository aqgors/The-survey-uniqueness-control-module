import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { surveyApi } from '@/api/surveyApi';
import toast from 'react-hot-toast';
import { Link2, Copy, PowerOff, ShieldAlert, Check } from 'lucide-react';

interface InviteToken {
  id: string;
  token: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function InviteManagementPanel({ surveyId }: { surveyId: string }) {
  const { t, i18n } = useTranslation();
  const [tokens, setTokens] = useState<InviteToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string>('');
  
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTokens();
  }, [surveyId]);

  const loadTokens = async () => {
    try {
      const data = await surveyApi.getInvites(surveyId);
      setTokens(data);
    } catch {
      toast.error(t('toast.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (inviteExpiresAt && new Date(inviteExpiresAt) <= new Date()) {
      toast.error(t('results.invites.futureDateError'));
      return;
    }
    setGenerating(true);
    try {
      const expiresAt = inviteExpiresAt 
        ? new Date(inviteExpiresAt).toISOString() 
        : undefined;
      const data = await surveyApi.generateNewInvite(surveyId, expiresAt);
      setTokens(data);
      toast.success(t('results.invites.linkCreated'));
    } catch {
      toast.error(t('toast.failedCreate'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await surveyApi.deactivateAllInvites(surveyId);
      setTokens(tokens.map(t => ({ ...t, isActive: false })));
      toast.success(t('results.invites.linkDeactivated'));
    } catch {
      toast.error(t('results.invites.deactivateError'));
    }
  };

  const activeToken = tokens.find(t => t.isActive && (!t.expiresAt || new Date(t.expiresAt) > new Date()));
  const inviteLink = activeToken ? `${window.location.origin}/survey/${surveyId}?invite=${activeToken.token}` : null;
  const locale = i18n.language === 'ua' ? 'uk-UA' : 'en-US';

  if (loading) return null;

  return (
    <div className="card p-6 mt-8">
      <div className="flex items-center gap-3 mb-6 border-b border-borderLight pb-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h3 className="heading-2 !mb-0 text-lg">{t('results.invites.accessControl')}</h3>
          <p className="text-textMuted text-sm">{t('results.invites.inviteOnly')}</p>
        </div>
      </div>

      {!activeToken ? (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-4 font-medium">{t('results.invites.noActiveLink')}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="datetime-local"
              className="input-field h-10 flex-1" 
              min={new Date().toISOString().slice(0, 16)}
              value={inviteExpiresAt} 
              onChange={(e) => setInviteExpiresAt(e.target.value)}
            />
            <button 
              onClick={handleGenerate} 
              disabled={generating} 
              className="btn btn-primary h-10 px-6 sm:w-auto w-full whitespace-nowrap"
            >
              {generating ? t('results.invites.generating') : t('results.invites.createNew')}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-5 border border-emerald-200 dark:border-emerald-800/50">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-2">{t('results.invites.activeLink')}</p>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={inviteLink!} 
                  className="input-field bg-white dark:bg-slate-900 font-mono text-sm border-emerald-200 dark:border-emerald-800 flex-1"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    toast.success(t('toast.copied'));
                  }} 
                  className="btn bg-emerald-600 hover:bg-emerald-700 text-white h-[42px] px-4 shrink-0 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-emerald-200 dark:border-emerald-800/50">
              <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                {activeToken.expiresAt ? t('results.invites.validUntil', { date: new Date(activeToken.expiresAt).toLocaleString(locale) }) : t('results.invites.validIndefinitely')}
              </span>
              <button 
                onClick={handleDeactivate}
                className="btn bg-white dark:bg-slate-800 border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm h-9 px-4"
              >
                <PowerOff className="w-3.5 h-3.5 mr-2" /> {t('results.invites.deactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

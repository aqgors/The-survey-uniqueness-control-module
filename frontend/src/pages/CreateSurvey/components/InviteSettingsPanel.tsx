import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Users, AlertTriangle } from 'lucide-react';

interface InviteSettingsPanelProps {
  initialInvitesCount: number;
  onChange: (count: number) => void;
}

export default function InviteSettingsPanel({ initialInvitesCount, onChange }: InviteSettingsPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden mt-6"
    >
      <div className="card p-6 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Users size={24} />
          </div>
          
          <div className="flex-1">
            <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {t('createSurvey.inviteSettings.title', 'Generate Initial Invite Links')}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              {t('createSurvey.inviteSettings.desc', 'How many anonymous, one-time invite links should we generate immediately after the survey is created? You can always generate more later.')}
            </p>

            <div className="max-w-xs">
              <label className="label-text">{t('createSurvey.inviteSettings.countLabel', 'Number of links')}</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={initialInvitesCount}
                onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                className="input-field"
                placeholder="e.g. 50"
              />
            </div>
            
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
              <AlertTriangle size={16} />
              {t('createSurvey.inviteSettings.warning', 'Note: The main survey link will be deactivated. Users can ONLY participate via these invite links.')}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

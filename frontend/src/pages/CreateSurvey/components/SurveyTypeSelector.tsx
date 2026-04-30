import { motion } from 'framer-motion';
import { Card, CardContent } from '@mui/material';
import { Globe, Lock, UserPlus, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

export type SurveyAccessType = 'PUBLIC' | 'PRIVATE' | 'ANONYMOUS_INVITE';

interface SurveyTypeSelectorProps {
  selectedType: SurveyAccessType | null;
  onSelect: (type: SurveyAccessType) => void;
}

export default function SurveyTypeSelector({ selectedType, onSelect }: SurveyTypeSelectorProps) {
  const { t } = useTranslation();

  const types = [
    {
      id: 'PUBLIC' as SurveyAccessType,
      title: t('createSurvey.types.public.title', 'Public Survey'),
      description: t('createSurvey.types.public.desc', 'Anyone with the link can participate.'),
      icon: Globe,
      color: 'from-blue-500 to-cyan-400',
      shadowColor: 'shadow-blue-500/20',
      advantages: [
        t('createSurvey.types.public.adv1', 'Maximum reach'),
        t('createSurvey.types.public.adv2', 'No login required'),
      ],
      badge: t('createSurvey.types.public.badge', 'Open Access')
    },
    {
      id: 'PRIVATE' as SurveyAccessType,
      title: t('createSurvey.types.private.title', 'Private Survey'),
      description: t('createSurvey.types.private.desc', 'Requires a password to access and vote.'),
      icon: Lock,
      color: 'from-purple-500 to-pink-500',
      shadowColor: 'shadow-purple-500/20',
      advantages: [
        t('createSurvey.types.private.adv1', 'Controlled access'),
        t('createSurvey.types.private.adv2', 'Basic security'),
      ],
      badge: t('createSurvey.types.private.badge', 'Password Protected')
    },
    {
      id: 'ANONYMOUS_INVITE' as SurveyAccessType,
      title: t('createSurvey.types.invite.title', 'Anonymous Invite'),
      description: t('createSurvey.types.invite.desc', 'High security. One-time links for participants.'),
      icon: UserPlus,
      color: 'from-emerald-500 to-teal-400',
      shadowColor: 'shadow-emerald-500/20',
      advantages: [
        t('createSurvey.types.invite.adv1', '1 Link = 1 Response'),
        t('createSurvey.types.invite.adv2', 'Strictly anonymous'),
      ],
      badge: t('createSurvey.types.invite.badge', 'Highest Security')
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mx-auto mt-8">
      {types.map((type, i) => {
        const isSelected = selectedType === type.id;
        const Icon = type.icon;
        
        return (
          <motion.div
            key={type.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(type.id)}
            className="h-full cursor-pointer"
          >
            <Card 
              className={classNames(
                "h-full relative overflow-hidden transition-all duration-300 rounded-2xl",
                "border-2 bg-slate-50 dark:bg-slate-800/50",
                isSelected 
                  ? `border-transparent shadow-xl ${type.shadowColor}` 
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm"
              )}
              sx={{ background: 'transparent' }}
            >
              {isSelected && (
                <div className={classNames("absolute inset-0 opacity-10 bg-gradient-to-br", type.color)} />
              )}
              
              {isSelected && (
                <div className={classNames("absolute top-0 left-0 w-full h-2 bg-gradient-to-r", type.color)} />
              )}

              <CardContent className="p-8 relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className={classNames(
                    "p-4 rounded-xl text-white bg-gradient-to-br",
                    type.color
                  )}>
                    <Icon size={32} />
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    <ShieldCheck size={14} />
                    {type.badge}
                  </div>
                </div>

                <h3 className="text-2xl font-bold mb-3 text-slate-900 dark:text-white">
                  {type.title}
                </h3>
                
                <p className="text-slate-600 dark:text-slate-400 mb-6 flex-grow">
                  {type.description}
                </p>

                <ul className="space-y-3 mb-6">
                  {type.advantages.map((adv, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium">
                      <div className={classNames("w-1.5 h-1.5 rounded-full bg-gradient-to-r", type.color)} />
                      {adv}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <div className={classNames(
                    "w-full py-3 rounded-lg text-center font-bold transition-all",
                    isSelected 
                      ? classNames("text-white bg-gradient-to-r shadow-md", type.color)
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600"
                  )}>
                    {isSelected ? t('createSurvey.types.selected', 'Selected') : t('createSurvey.types.selectBtn', 'Select')}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

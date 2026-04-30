import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Download, FileText, FileSpreadsheet, FileJson, Loader2 } from 'lucide-react'
import { api } from '@/api/axios'

// ── Types ─────────────────────────────────────────────────────────────────────

type ExportFormat = 'csv' | 'json' | 'excel' | 'docx'

interface ExportButtonProps {
  format: ExportFormat
  label: string
  icon: React.ReactNode
  loading: boolean
  onClick: () => void
  color: string
}

interface ExportBlockProps {
  surveyId: string
  surveyTitle?: string
}

// ── Mime types ────────────────────────────────────────────────────────────────

const MIME: Record<ExportFormat, string> = {
  csv:   'text/csv',
  json:  'application/json',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx:  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const EXTENSIONS: Record<ExportFormat, string> = {
  csv:   'csv',
  json:  'json',
  excel: 'xlsx',
  docx:  'docx',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExportButton({ format, label, icon, loading, onClick, color }: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        group relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 
        transition-all duration-200 w-full sm:w-auto
        ${loading
          ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
          : `border-slate-200 dark:border-slate-700 hover:border-${color} 
             bg-white dark:bg-slate-900 hover:bg-${color}/5 dark:hover:bg-${color}/10 
             hover:shadow-md active:scale-95`
        }
      `}
    >
      <div className={`
        w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors
        ${loading ? 'bg-slate-100 dark:bg-slate-800' : `bg-${color}/10 group-hover:bg-${color}/20`}
      `}>
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          : <span className={`text-${color}`}>{icon}</span>
        }
      </div>
      <div className="text-left">
        <p className={`text-sm font-semibold transition-colors ${loading ? 'text-slate-400' : 'text-textMain group-hover:text-primary'}`}>
          {label}
        </p>
        <p className="text-[11px] text-textMuted uppercase tracking-wide font-medium">
          .{EXTENSIONS[format]}
        </p>
      </div>
    </button>
  )
}

// ── Main Export Block ─────────────────────────────────────────────────────────

export default function ExportBlock({ surveyId, surveyTitle = 'survey' }: ExportBlockProps) {
  const { t } = useTranslation()
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null)

  const handleExport = async (format: ExportFormat) => {
    if (loadingFormat) return
    setLoadingFormat(format)
    const toastId = `export-${format}`
    toast.loading(t('export.downloading', { format: format.toUpperCase() }), { id: toastId })

    try {
      const response = await api.get(`/export/survey/${surveyId}/${format}`, {
        responseType: 'blob',
        timeout: 30_000,
      })

      const clean = surveyTitle.replace(/[^a-zа-яёіїєA-ZА-ЯЁІЇЄ0-9\s-]/gi, '').trim().slice(0, 50)
      const date  = new Date().toISOString().slice(0, 10)
      const filename = `${clean}_${date}.${EXTENSIONS[format]}`

      const blob = new Blob([response.data], { type: MIME[format] })
      triggerDownload(blob, filename)
      toast.success(t('export.success', { format: format.toUpperCase() }), { id: toastId })
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 403) {
        toast.error(t('export.forbidden'), { id: toastId })
      } else if (status === 404) {
        toast.error(t('export.notFound'), { id: toastId })
      } else {
        toast.error(t('export.error'), { id: toastId })
      }
    } finally {
      setLoadingFormat(null)
    }
  }

  const buttons: { format: ExportFormat; labelKey: string; icon: React.ReactNode; color: string }[] = [
    {
      format: 'csv',
      labelKey: 'export.csv',
      icon: <FileText className="w-4 h-4" />,
      color: 'green-500',
    },
    {
      format: 'json',
      labelKey: 'export.json',
      icon: <FileJson className="w-4 h-4" />,
      color: 'blue-500',
    },
    {
      format: 'excel',
      labelKey: 'export.excel',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      color: 'emerald-600',
    },
    {
      format: 'docx',
      labelKey: 'export.docx',
      icon: <FileText className="w-4 h-4" />,
      color: 'indigo-500',
    },
  ]

  return (
    <div className="card p-6 md:p-8 mt-8 border-t-4 border-t-accent">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-primary">{t('export.title')}</h3>
          <p className="text-sm text-textMuted">{t('export.subtitle')}</p>
        </div>
      </div>

      {/* Format buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {buttons.map(({ format, labelKey, icon, color }) => (
          <ExportButton
            key={format}
            format={format}
            label={t(labelKey)}
            icon={icon}
            loading={loadingFormat === format}
            onClick={() => handleExport(format)}
            color={color}
          />
        ))}
      </div>

      {/* Info note */}
      <p className="mt-4 text-xs text-textMuted flex items-center gap-1.5">
        <span>🔒</span>
        {t('export.ownerOnly')}
      </p>
    </div>
  )
}

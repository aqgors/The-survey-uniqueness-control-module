import { useState } from 'react';
import {
  Box, Card, Typography, TextField, Button, Grid, MenuItem,
  Select, FormControl, InputLabel, Stack, Divider,
  Alert, CircularProgress, alpha,
} from '@mui/material';
import DownloadIcon      from '@mui/icons-material/Download';
import TableChartIcon    from '@mui/icons-material/TableChart';
import DataObjectIcon    from '@mui/icons-material/DataObject';
import GridOnIcon        from '@mui/icons-material/GridOn';
import BugReportIcon     from '@mui/icons-material/BugReport';
import { adminApi, downloadBlob } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface ExportCardProps {
  title: string;
  desc:  string;
  icon:  React.ReactNode;
  color: string;
  actions: { label: string; onClick: () => void; loading?: boolean }[];
}

function ExportCard({ title, desc, icon, color, actions }: ExportCardProps) {
  return (
    <Card elevation={0} sx={{
      border: 1, borderColor: 'divider', borderRadius: 3, p: 3,
      borderTop: `3px solid ${color}`,
      transition: 'transform 0.2s',
      '&:hover': { transform: 'translateY(-2px)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{desc}</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
        {actions.map(a => (
          <Button key={a.label} variant="outlined" size="small"
            startIcon={a.loading ? <CircularProgress size={14} /> : <DownloadIcon />}
            onClick={a.onClick} disabled={a.loading}>
            {a.label}
          </Button>
        ))}
      </Stack>
    </Card>
  );
}

export default function ExportPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [surveyId,   setSurveyId]   = useState('');
  const [riskLevel,  setRiskLevel]  = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [loading,    setLoading]    = useState<string | null>(null);

  const doExport = async (type: string, fn: () => Promise<any>, filename: string) => {
    if (!surveyId.trim() && !['anomalies-excel'].includes(type)) {
      toast.error(t('admin.exportPage.enterSurveyId'));
      return;
    }
    setLoading(type);
    try {
      const res = await fn();
      downloadBlob(res.data, filename);
      toast.success(t('admin.exportPage.downloaded'));
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? t('admin.exportPage.exportError'));
    } finally {
      setLoading(null);
    }
  };

  const ts = new Date().toISOString().slice(0, 10);

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={800}>{t('admin.exportPage.title')}</Typography>
        <Typography color="text.secondary">{t('admin.exportPage.subtitle')}</Typography>
      </Box>

      {/* Filters */}
      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3, mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('admin.exportPage.filtersTitle')}</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={12} md={5}>
            <TextField
              fullWidth size="small"
              label={t('admin.exportPage.surveyIdLabel')}
              value={surveyId}
              onChange={e => setSurveyId(e.target.value)}
              placeholder="cuid1234..."
            />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('admin.exportPage.riskLevel')}</InputLabel>
              <Select value={riskLevel} label={t('admin.exportPage.riskLevel')}
                onChange={e => setRiskLevel(e.target.value)}>
                <MenuItem value="">{t('admin.exportPage.allLevels')}</MenuItem>
                {['CRITICAL','HIGH','MEDIUM','LOW'].map(r =>
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                )}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={2.5}>
            <TextField fullWidth size="small" label={t('admin.exportPage.dateFrom')} type="date"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={4} md={2.5}>
            <TextField fullWidth size="small" label={t('admin.exportPage.dateTo')} type="date"
              value={dateTo} onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>

        {!surveyId && (
          <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
            {t('admin.exportPage.infoAlert')}
          </Alert>
        )}
      </Card>

      <Divider sx={{ mb: 4 }} />
      <Typography variant="h6" fontWeight={700} gutterBottom>{t('admin.exportPage.formatsTitle')}</Typography>

      <Grid container spacing={3}>
        {user?.role === 'ADMIN' && (
          <>
            <Grid xs={12} md={6}>
              <ExportCard
                title={t('admin.exportPage.csvTitle')} icon={<TableChartIcon />} color="#43E97B"
                desc={t('admin.exportPage.csvDesc')}
                actions={[{
                  label: t('admin.exportPage.downloadCsv'),
                  loading: loading === 'csv',
                  onClick: () => doExport('csv',
                    () => adminApi.exportCSV(surveyId),
                    `survey_${surveyId.slice(0,8)}_${ts}.csv`
                  ),
                }]}
              />
            </Grid>

            <Grid xs={12} md={6}>
              <ExportCard
                title={t('admin.exportPage.jsonTitle')} icon={<DataObjectIcon />} color="#6C63FF"
                desc={t('admin.exportPage.jsonDesc')}
                actions={[{
                  label: t('admin.exportPage.downloadJson'),
                  loading: loading === 'json',
                  onClick: () => doExport('json',
                    () => adminApi.exportJSON(surveyId),
                    `survey_${surveyId.slice(0,8)}_${ts}.json`
                  ),
                }]}
              />
            </Grid>

            <Grid xs={12} md={6}>
              <ExportCard
                title={t('admin.exportPage.excelTitle')} icon={<GridOnIcon />} color="#FF6584"
                desc={t('admin.exportPage.excelDesc')}
                actions={[{
                  label: t('admin.exportPage.downloadExcel'),
                  loading: loading === 'excel',
                  onClick: () => doExport('excel',
                    () => adminApi.exportExcel(surveyId),
                    `survey_${surveyId.slice(0,8)}_${ts}.xlsx`
                  ),
                }]}
              />
            </Grid>
          </>
        )}

        <Grid xs={12} md={6}>
          <ExportCard
            title={t('admin.exportPage.anomaliesTitle')} icon={<BugReportIcon />} color="#F7971E"
            desc={t('admin.exportPage.anomaliesDesc')}
            actions={[{
              label: t('admin.exportPage.downloadAnomalies'),
              loading: loading === 'anomalies-excel',
              onClick: () => doExport('anomalies-excel',
                () => adminApi.exportAnomaliesExcel({
                  surveyId:  surveyId  || undefined,
                  riskLevel: riskLevel || undefined,
                  dateFrom:  dateFrom  || undefined,
                  dateTo:    dateTo    || undefined,
                }),
                `anomalies_${ts}.xlsx`
              ),
            }]}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

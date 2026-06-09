import { useState } from 'react';
import {
  Box, Card, Typography, TextField, Button, Chip, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, IconButton, Tooltip, MenuItem, Select, FormControl,
  InputLabel, InputAdornment, Stack, alpha, Skeleton, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import SearchIcon       from '@mui/icons-material/Search';
import FlagIcon         from '@mui/icons-material/Flag';
import RefreshIcon      from '@mui/icons-material/Refresh';
import RadarIcon        from '@mui/icons-material/Radar';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import { adminApi }     from '../../api/axios';
import { usePaginated, useAnomalyStats } from '../../hooks/useAdmin';
import toast            from 'react-hot-toast';
import { format }       from 'date-fns';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale,
  BarElement, Tooltip as CTooltip, Legend,
} from 'chart.js';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, CTooltip, Legend);

const RISK_COLORS: Record<string, 'default'|'info'|'warning'|'error'> = {
  LOW: 'default', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'error',
};
const FLAG_LABELS: Record<string, string> = {
  BOT_SPEED:          '🤖 Бот-швидкість',
  SUSPICIOUS_BROWSER: '🕵️ Підозрілий браузер',
  SYNCHRONIZED_BURST: '⚡ Синхронна атака',
  MANUAL_FLAG:        '🚩 Вручну',
};

export default function AnomaliesPage() {
  const { t } = useTranslation();
  const { data: stats, loading: statsLoading, refetch: refetchStats } = useAnomalyStats();
  const { data: anomalies, total, page, setPage, loading, setParams, refetch } =
    usePaginated<any>(p => adminApi.getAnomalies(p), { limit: 50 });

  const [surveyId,   setSurveyId]   = useState('');
  const [riskLevel,  setRiskLevel]  = useState('');
  const [flag,       setFlag]       = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [scanning,   setScanning]   = useState<string | null>(null);

  const applyFilters = () =>
    setParams({
      limit: 50,
      surveyId:  surveyId  || undefined,
      riskLevel: riskLevel || undefined,
      flag:      flag      || undefined,
      dateFrom:  dateFrom  || undefined,
      dateTo:    dateTo    || undefined,
    });

  const handleScan = async (sid: string) => {
    if (!sid.trim()) { toast.error(t('admin.anomaliesPage.enterSurveyId')); return; }
    setScanning(sid);
    try {
      const res = await adminApi.scanSurvey(sid);
      toast.success(t('admin.anomaliesPage.scanSuccess', { scanned: res.data.scanned, flagged: res.data.flagged }));
      refetch();
      refetchStats();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.usersPage.error')); }
    finally { setScanning(null); }
  };

  const handleFlag = async (id: string, f: string) => {
    try {
      await adminApi.flagAnomaly(id, f);
      toast.success('Флаг оновлено');
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Помилка'); }
  };

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const doughnutData = stats ? {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [{
      data: [stats.critical, stats.high, stats.medium, stats.low],
      backgroundColor: ['#f44336', '#ff9800', '#2196f3', '#9e9e9e'],
      borderWidth: 0,
    }],
  } : null;

  const barData = stats?.riskByDay ? {
    labels: stats.riskByDay.map((d: any) => d.date.slice(5)),
    datasets: [{
      label: 'Сер. ризик',
      data: stats.riskByDay.map((d: any) => d.avg),
      backgroundColor: 'rgba(255,101,132,0.7)',
      borderRadius: 4,
    }],
  } : null;

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{t('admin.anomaliesPage.title')}</Typography>
          <Typography color="text.secondary">{t('admin.anomaliesPage.subtitle')}</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => { refetch(); refetchStats(); }} variant="outlined">
          {t('admin.anomaliesPage.refresh')}
        </Button>
      </Box>

      {/* Stats Cards */}
      {!statsLoading && stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: t('admin.anomaliesPage.totalVotes'), val: stats.total,    color: '#6C63FF' },
            { label: 'Critical',       val: stats.critical, color: '#f44336' },
            { label: 'High',           val: stats.high,     color: '#ff9800' },
            { label: 'Medium',         val: stats.medium,   color: '#2196f3' },
            { label: 'Low / Clean',    val: stats.low,      color: '#4caf50' },
          ].map(item => (
            <Grid size={{ xs: 6, sm: 4, md: 4 }} key={item.label}>
              <Card elevation={0} sx={{
                border: 1, borderColor: 'divider', borderRadius: 3, p: 2, textAlign: 'center',
                borderTop: `3px solid ${item.color}`,
              }}>
                <Typography variant="h5" sx={{ fontWeight: 800, color: item.color }}>{item.val}</Typography>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Charts */}
      {!statsLoading && stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>{t('admin.anomaliesPage.riskDistribution')}</Typography>
              {doughnutData && (
                <Box sx={{ maxWidth: 220, mx: 'auto' }}>
                  <Doughnut data={doughnutData}
                    options={{ plugins: { legend: { position: 'bottom' } }, cutout: '65%' }} />
                </Box>
              )}
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>{t('admin.anomaliesPage.riskByDay')}</Typography>
              {barData && (
                <Bar data={barData}
                  options={{ responsive: true, plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, max: 100 } } }} />
              )}
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>{t('admin.anomaliesPage.flagTypes')}</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {stats.flagFreq && Object.entries(stats.flagFreq)
                  .sort(([,a],[,b]) => (b as number) - (a as number))
                  .map(([f, cnt]) => (
                    <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{FLAG_LABELS[f] ?? f}</Typography>
                      <Chip label={cnt as number} size="small" color="error" variant="outlined" />
                    </Box>
                  ))}
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Scan panel */}
      <Accordion elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RadarIcon color="primary" fontSize="small" />
            <Typography sx={{ fontWeight: 600 }}>{t('admin.anomaliesPage.scanTitle')}</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack direction="row" spacing={2}>
            <TextField size="small" label={t('admin.anomaliesPage.surveyIdLabel')} value={surveyId}
              onChange={e => setSurveyId(e.target.value)} sx={{ flex: 1 }} />
            <Button variant="contained" startIcon={<RadarIcon />}
              disabled={!!scanning} onClick={() => handleScan(surveyId)}>
              {scanning ? t('admin.anomaliesPage.scanning') : t('admin.anomaliesPage.scan')}
            </Button>
          </Stack>
          {scanning && <LinearProgress sx={{ mt: 2 }} />}
        </AccordionDetails>
      </Accordion>

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" label={t('admin.anomaliesPage.surveyIdLabel')} value={surveyId}
            onChange={e => setSurveyId(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            sx={{ flex: { xs: '1 1 100%', md: '1 1 auto' }, minWidth: { xs: '100%', md: 160 } }} />
          <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' }, minWidth: { xs: '100%', sm: 130 } }}>
            <InputLabel>{t('admin.anomaliesPage.riskLevel')}</InputLabel>
            <Select value={riskLevel} label={t('admin.anomaliesPage.riskLevel')} onChange={e => setRiskLevel(e.target.value)}>
              <MenuItem value="">{t('admin.anomaliesPage.allLevels')}</MenuItem>
              {['CRITICAL','HIGH','MEDIUM','LOW'].map(r =>
                <MenuItem key={r} value={r}>{r}</MenuItem>
              )}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' }, minWidth: { xs: '100%', sm: 180 } }}>
            <InputLabel>{t('admin.anomaliesPage.flag')}</InputLabel>
            <Select value={flag} label={t('admin.anomaliesPage.flag')} onChange={e => setFlag(e.target.value)}>
              <MenuItem value="">{t('admin.anomaliesPage.allFlags')}</MenuItem>
              {Object.entries(FLAG_LABELS).map(([k,v]) =>
                <MenuItem key={k} value={k}>{v}</MenuItem>
              )}
            </Select>
          </FormControl>
          <TextField size="small" label={t('admin.anomaliesPage.dateFrom')} type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' } }} />
          <TextField size="small" label={t('admin.anomaliesPage.dateTo')} type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' } }} />
          <Button variant="contained" onClick={applyFilters} sx={{ px: 3, width: { xs: '100%', md: 'auto' } }}>{t('admin.anomaliesPage.filterBtn')}</Button>
        </Stack>
      </Card>

      {/* Table */}
      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: alpha('#FF6584', 0.06) } }}>
                <TableCell>{t('admin.anomaliesPage.surveyCol')}</TableCell>
                <TableCell>{t('admin.anomaliesPage.userCol')}</TableCell>
                <TableCell>{t('admin.anomaliesPage.riskCol')}</TableCell>
                <TableCell>{t('admin.anomaliesPage.flagsCol')}</TableCell>
                <TableCell>{t('admin.anomaliesPage.ipCol')}</TableCell>
                <TableCell>{t('admin.anomaliesPage.timeCol')}</TableCell>
                <TableCell>{t('admin.anomaliesPage.actionsCol')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              )) : anomalies.map((a: any) => (
                <TableRow key={a.id} hover sx={{
                  '&:last-child td': { border: 0 },
                  bgcolor: a.riskScore >= 80
                    ? alpha('#f44336', 0.06)
                    : a.riskScore >= 50
                    ? alpha('#ff9800', 0.04)
                    : 'inherit',
                }}>
                  <TableCell>
                    <Typography variant="caption" noWrap sx={{ fontWeight: 600, maxWidth: 140, display: 'block' }}>
                      {a.vote?.survey?.title ?? a.surveyId.slice(0, 8)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {a.vote?.user ? `${a.vote.user.name}` : t('admin.anomaliesPage.anon')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip label={`${a.riskScore}%`} size="small" color={RISK_COLORS[a.riskLevel]} />
                      <Typography variant="caption" color="text.secondary">{a.riskLevel}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {a.flags.map((f: string) => (
                        <Chip key={f} label={FLAG_LABELS[f] ?? f} size="small" variant="outlined" color="warning"
                          sx={{ height: 18, fontSize: '0.6rem' }} />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {a.ipSubnet ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(a.submittedAt), 'dd.MM HH:mm')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={t('admin.anomaliesPage.flagManual')}>
                      <IconButton size="small" onClick={() => handleFlag(a.id, 'MANUAL_FLAG')}
                        color={a.flags.includes('MANUAL_FLAG') ? 'error' : 'default'}>
                        <FlagIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={total} page={page - 1} rowsPerPage={50}
          onPageChange={(_, p) => setPage(p + 1)} rowsPerPageOptions={[50]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} з ${count}`}
        />
      </Card>
    </Box>
  );
}

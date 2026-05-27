import { useState } from 'react';
import {
  Box, Card, Typography, TextField, Button, Chip, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl,
  InputLabel, InputAdornment, Stack, alpha, Skeleton, LinearProgress,
} from '@mui/material';
import SearchIcon      from '@mui/icons-material/Search';
import DeleteIcon      from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BarChartIcon    from '@mui/icons-material/BarChart';
import RefreshIcon     from '@mui/icons-material/Refresh';
import { adminApi }    from '../../api/axios';
import { usePaginated } from '../../hooks/useAdmin';
import toast           from 'react-hot-toast';
import { format }      from 'date-fns';
import { Bar }         from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip as CTooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, CTooltip, Legend);

export default function SurveysPage() {
  const { t } = useTranslation();
  const { data: surveys, total, page, setPage, loading, setParams, refetch } =
    usePaginated<any>(p => adminApi.getSurveys(p), { limit: 20 });

  const [search,   setSearch]   = useState('');
  const [activeF,  setActiveF]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const [statsDialog, setStatsDialog] = useState<any>(null);
  const [statsData,   setStatsData]   = useState<any>(null);
  const [statsLoad,   setStatsLoad]   = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<any>(null);

  const applyFilters = () =>
    setParams({
      limit: 20,
      search:   search   || undefined,
      isActive: activeF  === '' ? undefined : activeF === 'true',
      dateFrom: dateFrom || undefined,
      dateTo:   dateTo   || undefined,
    });

  const handleToggle = async (survey: any) => {
    try {
      await adminApi.toggleSurvey(survey.id, !survey.isActive);
      toast.success(survey.isActive ? t('admin.surveysPage.deactivated') : t('admin.surveysPage.activated'));
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.surveysPage.error')); }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await adminApi.duplicateSurvey(id);
      toast.success(t('admin.surveysPage.duplicated'));
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.surveysPage.error')); }
  };

  const handleDelete = async () => {
    try {
      await adminApi.deleteSurvey(deleteDialog.id);
      toast.success(t('admin.surveysPage.deleted'));
      setDeleteDialog(null);
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.surveysPage.error')); }
  };

  const openStats = async (survey: any) => {
    setStatsDialog(survey);
    setStatsLoad(true);
    try {
      const res = await adminApi.getSurveyStats(survey.id);
      setStatsData(res.data);
    } catch { toast.error(t('admin.surveysPage.loadStatsError')); }
    finally { setStatsLoad(false); }
  };

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>{t('admin.surveysPage.title')}</Typography>
          <Typography color="text.secondary">{t('admin.surveysPage.total', { count: total })}</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => refetch()} variant="outlined">{t('admin.surveysPage.refresh')}</Button>
      </Box>

      {/* Filters */}
      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          <TextField
            size="small" placeholder={t('admin.surveysPage.searchPlaceholder')} value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>{t('admin.surveysPage.statusLabel')}</InputLabel>
            <Select value={activeF} label={t('admin.surveysPage.statusLabel')} onChange={e => setActiveF(e.target.value)}>
              <MenuItem value="">{t('admin.surveysPage.allStatuses')}</MenuItem>
              <MenuItem value="true">{t('admin.surveysPage.activeStatus')}</MenuItem>
              <MenuItem value="false">{t('admin.surveysPage.closedStatus')}</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label={t('admin.surveysPage.dateFrom')} type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label={t('admin.surveysPage.dateTo')} type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="contained" onClick={applyFilters}>{t('admin.surveysPage.filterBtn')}</Button>
        </Stack>
      </Card>

      {/* Table */}
      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: alpha('#6C63FF', 0.06) } }}>
                <TableCell>{t('admin.surveysPage.titleCol')}</TableCell>
                <TableCell>{t('admin.surveysPage.statusCol')}</TableCell>
                <TableCell>{t('admin.surveysPage.votesCol')}</TableCell>
                <TableCell>{t('admin.questions')}</TableCell>
                <TableCell>{t('createSurvey.deadlineLabel')}</TableCell>
                <TableCell>{t('admin.surveysPage.createdCol')}</TableCell>
                <TableCell align="right">{t('admin.surveysPage.actionsCol')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              )) : surveys.map(s => (
                <TableRow key={s.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{s.title}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
                      ID: {s.id}
                    </Typography>
                    {s.duplicatedFromId && (
                      <Chip label={t('admin.surveysPage.copy')} size="small" variant="outlined" sx={{ mt: 0.5, height: 16, fontSize: '0.6rem' }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        checked={s.isActive}
                        onChange={() => handleToggle(s)}
                        size="small"
                        color="success"
                      />
                      <Chip
                        label={s.isActive ? t('admin.surveysPage.activeStatus') : t('admin.surveysPage.closedStatus')}
                        size="small"
                        color={s.isActive ? 'success' : 'default'}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>{s._count?.votes ?? 0}</TableCell>
                  <TableCell>{s._count?.questions ?? 0}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color={s.deadline && new Date(s.deadline) < new Date() ? 'error' : 'text.secondary'}>
                      {s.deadline ? format(new Date(s.deadline), 'dd.MM.yyyy') : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(s.createdAt), 'dd.MM.yyyy')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('admin.surveysPage.statsTitle')}>
                      <IconButton size="small" onClick={() => openStats(s)} color="primary">
                        <BarChartIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('admin.surveysPage.duplicate')}>
                      <IconButton size="small" onClick={() => handleDuplicate(s.id)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('admin.surveysPage.deleteSurvey')}>
                      <IconButton size="small" color="error" onClick={() => setDeleteDialog(s)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={total} page={page - 1} rowsPerPage={20}
          onPageChange={(_, p) => setPage(p + 1)} rowsPerPageOptions={[20]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} з ${count}`}
        />
      </Card>

      {/* Stats Dialog */}
      <Dialog open={!!statsDialog} onClose={() => { setStatsDialog(null); setStatsData(null); }}
        maxWidth="md" fullWidth>
        <DialogTitle>{t('admin.surveysPage.statsTitle')} — {statsDialog?.title}</DialogTitle>
        <DialogContent>
          {statsLoad && <LinearProgress sx={{ mb: 2 }} />}
          {statsData && (
            <Box>
              <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
                {[
                  { label: t('admin.dashboard.votes'),       val: statsData.survey.totalVotes },
                  { label: t('admin.questions'),             val: statsData.survey.totalQuestions },
                  { label: 'Унікальних IP',                   val: statsData.fraud.uniqueIps },
                  { label: 'Підозрілих',                      val: statsData.fraud.suspicious },
                  { label: 'Сер. ризик',                      val: `${statsData.fraud.avgRisk}%` },
                ].map(item => (
                  <Card key={item.label} elevation={0}
                    sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 2, py: 1, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>{item.val}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  </Card>
                ))}
              </Stack>
              <Typography variant="subtitle2" gutterBottom>{t('admin.dashboard.votesChart')}</Typography>
              <Bar
                data={{
                  labels: Object.keys(statsData.votesByDay).map(d => d.slice(5)),
                  datasets: [{ label: t('admin.dashboard.votes'), data: Object.values(statsData.votesByDay),
                    backgroundColor: 'rgba(108,99,255,0.6)', borderRadius: 4 }],
                }}
                options={{ responsive: true, plugins: { legend: { display: false } } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setStatsDialog(null); setStatsData(null); }}>{t('common.cancel')}</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.surveysPage.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('admin.surveysPage.deleteConfirm', { title: deleteDialog?.title })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>{t('common.cancel')}</Button>
          <Button onClick={handleDelete} variant="contained" color="error">{t('admin.surveysPage.deleteSurvey')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

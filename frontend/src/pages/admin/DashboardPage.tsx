import { Box, Grid, Card, CardContent, Typography, Chip, Avatar, Skeleton, alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PollIcon        from '@mui/icons-material/Poll';
import PeopleIcon      from '@mui/icons-material/People';
import HowToVoteIcon   from '@mui/icons-material/HowToVote';
import TrendingUpIcon  from '@mui/icons-material/TrendingUp';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useDashboard } from '../../hooks/useAdmin';
import { useTranslation } from 'react-i18next';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}

function StatCard({ title, value, icon, color, sub }: StatCardProps) {
  const theme = useTheme();
  return (
    <Card elevation={0} sx={{
      border: 1, borderColor: 'divider', borderRadius: 3,
      background: `linear-gradient(135deg, ${alpha(color, 0.08)}, ${alpha(color, 0.02)})`,
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 32px ${alpha(color, 0.18)}` },
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
            <Typography variant="h4" fontWeight={800} sx={{ color }}>{value}</Typography>
            {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
          </Box>
          <Avatar sx={{ bgcolor: alpha(color, 0.15), color, width: 52, height: 52 }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, loading } = useDashboard();
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const chartData = {
    labels: data?.votesByDay?.map((d: any) => d.date.slice(5)) ?? [],
    datasets: [{
      label: t('admin.dashboard.votes'),
      data:  data?.votesByDay?.map((d: any) => d.count) ?? [],
      backgroundColor: alpha('#6C63FF', 0.7),
      borderColor:     '#6C63FF',
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title:  { display: false },
    },
    scales: {
      x: { grid: { color: alpha(isDark ? '#fff' : '#000', 0.06) } },
      y: { grid: { color: alpha(isDark ? '#fff' : '#000', 0.06) }, beginAtZero: true },
    },
  };

  if (loading) return (
    <Box>
      <Skeleton variant="text" width={240} height={40} sx={{ mb: 3 }} />
      <Grid container spacing={3}>
        {[1,2,3,4].map(i => <Grid xs={12} sm={6} md={3} key={i}><Skeleton variant="rounded" height={120} /></Grid>)}
      </Grid>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>{t('admin.dashboard.title')}</Typography>
        <Typography color="text.secondary">{t('admin.dashboard.subtitle')}</Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid xs={12} sm={6} md={3}>
          <StatCard title={t('admin.dashboard.totalSurveys')} value={data?.totalSurveys ?? 0}
            icon={<PollIcon />} color="#6C63FF"
            sub={t('admin.dashboard.activeCount', { count: data?.activeSurveys ?? 0 })} />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <StatCard title={t('admin.dashboard.totalUsers')} value={data?.totalUsers ?? 0}
            icon={<PeopleIcon />} color="#FF6584"
            sub={t('admin.dashboard.newThisWeek', { count: data?.newSurveysWeek ?? 0 })} />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <StatCard title={t('admin.dashboard.totalVotes')} value={data?.totalVotes ?? 0}
            icon={<HowToVoteIcon />} color="#43E97B" />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <StatCard title={t('admin.dashboard.newSurveys')} value={data?.newSurveysWeek ?? 0}
            icon={<TrendingUpIcon />} color="#F7971E"
            sub={t('admin.dashboard.last7days')} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Bar chart */}
        <Grid xs={12} md={8}>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
            <Typography variant="h6" gutterBottom>{t('admin.dashboard.votesChart')}</Typography>
            <Bar data={chartData} options={chartOptions as any} />
          </Card>
        </Grid>

        {/* Recent surveys */}
        <Grid xs={12} md={4}>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
            <Typography variant="h6" gutterBottom>{t('admin.dashboard.recentSurveys')}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {(data?.recentSurveys ?? []).map((s: any) => (
                <Box key={s.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{s.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s._count?.votes ?? 0} {t('admin.dashboard.votes')}
                    </Typography>
                  </Box>
                  <Chip
                    label={s.isActive ? t('admin.dashboard.surveyActive') : t('admin.dashboard.surveyClosed')}
                    size="small"
                    color={s.isActive ? 'success' : 'default'}
                    sx={{ ml: 1 }}
                  />
                </Box>
              ))}
              {(data?.recentSurveys ?? []).length === 0 && (
                <Typography color="text.secondary" variant="body2">{t('admin.dashboard.noSurveys')}</Typography>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Avatar, Chip, Tooltip,
  useMediaQuery, Divider, alpha,
} from '@mui/material';
import { useTheme, createTheme, ThemeProvider } from '@mui/material/styles';
import MenuIcon           from '@mui/icons-material/Menu';
import DashboardIcon      from '@mui/icons-material/Dashboard';
import PeopleIcon         from '@mui/icons-material/People';
import PollIcon           from '@mui/icons-material/Poll';
import BugReportIcon      from '@mui/icons-material/BugReport';
import DownloadIcon       from '@mui/icons-material/Download';
import LogoutIcon         from '@mui/icons-material/Logout';
import LightModeIcon      from '@mui/icons-material/LightMode';
import DarkModeIcon       from '@mui/icons-material/DarkMode';
import ShieldIcon         from '@mui/icons-material/Shield';
import ArrowBackIcon      from '@mui/icons-material/ArrowBack';
import SettingsIcon       from '@mui/icons-material/Settings';
import { useAuth }        from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import toast              from 'react-hot-toast';

const DRAWER_WIDTH = 260;

const NAV_ITEMS = [
  { translationKey: 'admin.nav.dashboard', path: '/admin',           icon: <DashboardIcon />,   roles: ['ADMIN'] },
  { translationKey: 'admin.nav.users',     path: '/admin/users',      icon: <PeopleIcon />,      roles: ['ADMIN'] },
  { translationKey: 'admin.nav.surveys',   path: '/admin/surveys',    icon: <PollIcon />,        roles: ['ADMIN'] },
  { translationKey: 'admin.nav.anomalies', path: '/admin/anomalies',  icon: <BugReportIcon />,   roles: ['ADMIN','MODERATOR'] },
  { translationKey: 'admin.nav.export',    path: '/admin/export',     icon: <DownloadIcon />,    roles: ['ADMIN','MODERATOR'] },
  { translationKey: 'admin.nav.profile',   path: '/admin/profile',    icon: <SettingsIcon />,   roles: ['ADMIN','MODERATOR'] },
];

const ROLE_COLORS: Record<string, 'error'|'warning'|'info'> = {
  ADMIN: 'error', MODERATOR: 'warning', USER: 'info',
};

function buildTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      primary:    { main: '#6C63FF' },
      secondary:  { main: '#FF6584' },
      background: {
        default: mode === 'dark' ? '#0F0F1A' : '#F4F6FB',
        paper:   mode === 'dark' ? '#1A1A2E'  : '#FFFFFF',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Roboto", sans-serif',
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
    },
    components: {
      MuiDrawer:   { styleOverrides: { paper: { borderRight: 'none', backgroundImage: 'none' } } },
      MuiCard:     { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton:   { styleOverrides: { root: { textTransform: 'none', borderRadius: 8, fontWeight: 600 } } },
      MuiChip:     { styleOverrides: { root: { borderRadius: 6 } } },
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: 10, mx: 1, '&.Mui-selected': { fontWeight: 700 } },
        },
      },
    },
  });
}

export default function AdminLayout() {
  const { user, logout }   = useAuth();
  const { t }              = useTranslation();
  const navigate           = useNavigate();
  const location           = useLocation();
  const [open, setOpen]    = useState(true);
  const [dark, setDark]    = useState(() => localStorage.getItem('adminTheme') !== 'light');
  const theme              = buildTheme(dark ? 'dark' : 'light');
  const isMobile          = useMediaQuery(theme.breakpoints.down('md'));

  const toggleDark = () => {
    setDark(d => { localStorage.setItem('adminTheme', d ? 'light' : 'dark'); return !d; });
  };

  if (user?.role === 'MODERATOR' && location.pathname === '/admin') {
    return <Navigate to="/admin/anomalies" replace />;
  }

  const handleLogout = () => {
    logout();
    toast.success('Вихід виконано');
    navigate('/login');
  };

  const visibleNav = NAV_ITEMS.filter(item =>
    item.roles.includes(user?.role ?? '')
  );

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ShieldIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1, fontWeight: 800 }}>
            Survey CMS
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('layout.adminPanel')}</Typography>
        </Box>
      </Box>

      <Divider sx={{ mx: 2 }} />

      {/* Navigation */}
      <List sx={{ flex: 1, px: 1.5, pt: 2, gap: 0.5, display: 'flex', flexDirection: 'column' }}>
        {visibleNav.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/admin' && location.pathname.startsWith(item.path));
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                selected={active}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: 2,
                  py: 1.2,
                  bgcolor: active
                    ? alpha(theme.palette.primary.main, dark ? 0.25 : 0.12)
                    : 'transparent',
                  color: active ? 'primary.main' : 'text.primary',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                  transition: 'all 0.2s',
                }}
              >
                <ListItemIcon sx={{ color: active ? 'primary.main' : 'text.secondary', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={t(item.translationKey)}
                  primaryTypographyProps={{ fontWeight: active ? 700 : 400, fontSize: '0.9rem' }}
                />
                {active && (
                  <Box sx={{ width: 4, height: 24, borderRadius: 2, bgcolor: 'primary.main', ml: 1 }} />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ mx: 2 }} />

      {/* User info */}
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: '0.85rem' }}>
            {user?.name?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{user?.name}</Typography>
            <Chip
              label={user?.role}
              size="small"
              color={ROLE_COLORS[user?.role ?? 'USER']}
              sx={{ height: 18, fontSize: '0.65rem', mt: 0.25 }}
            />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('admin.nav.backToSite')}>
            <IconButton size="small" onClick={() => navigate('/')} sx={{ flex: 1 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('admin.nav.profile')}>
            <IconButton size="small" onClick={() => navigate('/admin/profile')} sx={{ flex: 1 }}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={dark ? t('layout.themeLight') : t('layout.themeDark')}>
            <IconButton size="small" onClick={toggleDark} sx={{ flex: 1 }}>
              {dark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('admin.nav.logout')}>
            <IconButton size="small" onClick={handleLogout} color="error" sx={{ flex: 1 }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        {/* Sidebar */}
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? open : true}
          onClose={() => setOpen(false)}
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              bgcolor: 'background.paper',
              boxShadow: dark ? '4px 0 24px rgba(0,0,0,0.4)' : '4px 0 24px rgba(108,99,255,0.08)',
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Main content */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {isMobile && (
            <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', color: 'text.primary', borderBottom: 1, borderColor: 'divider' }}>
              <Toolbar>
                <IconButton onClick={() => setOpen(true)} edge="start">
                  <MenuIcon />
                </IconButton>
                <Typography variant="h6" sx={{ ml: 1, fontWeight: 700 }}>Survey CMS</Typography>
              </Toolbar>
            </AppBar>
          )}
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

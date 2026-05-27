import { useState } from 'react';
import {
  Box, Card, Typography, TextField, MenuItem, Button, Chip, Avatar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Select, FormControl, InputLabel,
  InputAdornment, Stack, alpha, Skeleton,
} from '@mui/material';
import SearchIcon        from '@mui/icons-material/Search';
import BlockIcon         from '@mui/icons-material/Block';
import CheckCircleIcon   from '@mui/icons-material/CheckCircle';
import EditIcon          from '@mui/icons-material/Edit';
import DeleteIcon        from '@mui/icons-material/Delete';

import RefreshIcon       from '@mui/icons-material/Refresh';
import { adminApi }      from '../../api/axios';
import { usePaginated }  from '../../hooks/useAdmin';
import toast             from 'react-hot-toast';
import { format }        from 'date-fns';
import { useTranslation } from 'react-i18next';

const ROLE_COLOR: any = { ADMIN: 'error', MODERATOR: 'warning', USER: 'default' };

export default function UsersPage() {
  const { t } = useTranslation();
  const { data: users, total, page, setPage, loading, setParams, refetch } =
    usePaginated<any>(p => adminApi.getUsers(p), { limit: 20 });

  const [search,   setSearch]   = useState('');
  const [roleF,    setRoleF]    = useState('');
  const [blocked,  setBlocked]  = useState('');

  // Dialogs
  const [roleDialog,     setRoleDialog]     = useState<any>(null);
  const [blockDialog,    setBlockDialog]    = useState<any>(null);
  const [deleteDialog,   setDeleteDialog]   = useState<any>(null);

  const [newRole,        setNewRole]        = useState('');
  const [blockReason,    setBlockReason]    = useState('');


  const applyFilters = () =>
    setParams({
      limit: 20,
      search: search || undefined,
      role:   roleF   || undefined,
      isBlocked: blocked === '' ? undefined : blocked === 'true',
    });

  const handleRoleChange = async () => {
    try {
      await adminApi.changeRole(roleDialog.id, newRole);
      toast.success(t('admin.usersPage.roleChanged'));
      setRoleDialog(null);
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.usersPage.error')); }
  };

  const handleBlock = async () => {
    const shouldBlock = !blockDialog.isBlocked;
    try {
      await adminApi.toggleBlock(blockDialog.id, shouldBlock, blockReason || undefined);
      toast.success(shouldBlock ? t('admin.usersPage.userBlocked') : t('admin.usersPage.userUnblocked'));
      setBlockDialog(null);
      setBlockReason('');
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.usersPage.error')); }
  };

  const handleDelete = async () => {
    try {
      await adminApi.deleteUser(deleteDialog.id);
      toast.success(t('admin.usersPage.userDeleted'));
      setDeleteDialog(null);
      refetch();
    } catch (e: any) { toast.error(e.response?.data?.error ?? t('admin.usersPage.error')); }
  };



  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>{t('admin.usersPage.title')}</Typography>
          <Typography color="text.secondary">{t('admin.usersPage.total', { count: total })}</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => refetch()} variant="outlined">{t('admin.usersPage.refresh')}</Button>
      </Box>

      {/* Filters */}
      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            size="small" placeholder={t('admin.usersPage.searchPlaceholder')} value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ flex: { xs: '1 1 100%', md: '1 1 auto' }, minWidth: { xs: '100%', md: 250 } }}
          />
          <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' }, minWidth: { xs: '100%', sm: 140 } }}>
            <InputLabel>{t('admin.usersPage.roleLabel')}</InputLabel>
            <Select value={roleF} label={t('admin.usersPage.roleLabel')} onChange={e => setRoleF(e.target.value)}>
              <MenuItem value="">{t('admin.usersPage.allRoles')}</MenuItem>
              <MenuItem value="ADMIN">Admin</MenuItem>
              <MenuItem value="MODERATOR">Moderator</MenuItem>
              <MenuItem value="USER">User</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' }, minWidth: { xs: '100%', sm: 150 } }}>
            <InputLabel>{t('admin.usersPage.statusLabel')}</InputLabel>
            <Select value={blocked} label={t('admin.usersPage.statusLabel')} onChange={e => setBlocked(e.target.value)}>
              <MenuItem value="">{t('admin.usersPage.allStatuses')}</MenuItem>
              <MenuItem value="false">{t('admin.usersPage.activeStatus')}</MenuItem>
              <MenuItem value="true">{t('admin.usersPage.blockedStatus')}</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={applyFilters} sx={{ px: 3, width: { xs: '100%', md: 'auto' } }}>{t('admin.usersPage.filterBtn')}</Button>
        </Stack>
      </Card>

      {/* Table */}
      <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: alpha('#6C63FF', 0.06) } }}>
                <TableCell>{t('admin.usersPage.userCol')}</TableCell>
                <TableCell>{t('admin.usersPage.roleLabel')}</TableCell>
                <TableCell>{t('admin.usersPage.statusLabel')}</TableCell>
                <TableCell>{t('admin.usersPage.votesCol')}</TableCell>
                <TableCell>{t('admin.usersPage.lastLogin')}</TableCell>
                <TableCell>{t('admin.usersPage.registered')}</TableCell>
                <TableCell align="right">{t('admin.usersPage.actionsCol')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              )) : users.map(u => (
                <TableRow key={u.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ bgcolor: alpha('#6C63FF', 0.15), color: 'primary.main', width: 36, height: 36, fontSize: '0.85rem' }}>
                        {u.name?.[0]?.toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={u.role} size="small" color={ROLE_COLOR[u.role]} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.isBlocked ? t('admin.usersPage.blockedStatus') : t('admin.usersPage.activeStatus')}
                      size="small"
                      color={u.isBlocked ? 'error' : 'success'}
                      variant={u.isBlocked ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>{u._count?.votes ?? 0}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {u.lastLoginAt ? format(new Date(u.lastLoginAt), 'dd.MM.yyyy HH:mm') : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(u.createdAt), 'dd.MM.yyyy')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('admin.usersPage.changeRole')}>
                      <IconButton size="small" onClick={() => { setRoleDialog(u); setNewRole(u.role); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={u.isBlocked ? t('admin.usersPage.unblock') : t('admin.usersPage.block')}>
                      <IconButton size="small" color={u.isBlocked ? 'success' : 'warning'}
                        onClick={() => setBlockDialog(u)}>
                        {u.isBlocked ? <CheckCircleIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>

                    <Tooltip title={t('admin.usersPage.deleteUser')}>
                      <IconButton size="small" color="error" onClick={() => setDeleteDialog(u)}>
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

      {/* Role Dialog */}
      <Dialog open={!!roleDialog} onClose={() => setRoleDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.usersPage.changeRole')} — {roleDialog?.name}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>{t('admin.usersPage.newRole')}</InputLabel>
            <Select value={newRole} label={t('admin.usersPage.newRole')} onChange={e => setNewRole(e.target.value)}>
              <MenuItem value="USER">User</MenuItem>
              <MenuItem value="MODERATOR">Moderator</MenuItem>
              <MenuItem value="ADMIN">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialog(null)}>{t('admin.usersPage.cancel')}</Button>
          <Button onClick={handleRoleChange} variant="contained">{t('admin.usersPage.save')}</Button>
        </DialogActions>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={!!blockDialog} onClose={() => setBlockDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{blockDialog?.isBlocked ? t('admin.usersPage.unblock') : t('admin.usersPage.block')} — {blockDialog?.name}</DialogTitle>
        <DialogContent>
          {!blockDialog?.isBlocked && (
            <TextField fullWidth label={t('admin.usersPage.reasonLabel')} value={blockReason}
              onChange={e => setBlockReason(e.target.value)} sx={{ mt: 1 }} multiline rows={2} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlockDialog(null)}>{t('admin.usersPage.cancel')}</Button>
          <Button onClick={handleBlock} variant="contained"
            color={blockDialog?.isBlocked ? 'success' : 'error'}>
            {blockDialog?.isBlocked ? t('admin.usersPage.unblock') : t('admin.usersPage.block')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.usersPage.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('admin.usersPage.deleteConfirm', { name: deleteDialog?.name, email: deleteDialog?.email })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>{t('admin.usersPage.cancel')}</Button>
          <Button onClick={handleDelete} variant="contained" color="error">{t('admin.usersPage.deleteUser')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

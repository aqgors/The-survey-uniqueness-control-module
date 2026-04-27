import { useState, useEffect } from 'react';
import { api } from '../../api/axios';
import { UserX, UserCheck, ShieldAlert, ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  isBlocked: boolean;
  createdAt: string;
}

export default function UserManagement() {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser } = useAuth();

  const fetchUsers = () => {
    setIsLoading(true);
    api.get('/admin/users')
      .then(res => setUsers(res.data.users))
      .catch(() => toast.error(t('toast.failedLoad')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleBlock = async (id: string, currentBlocked: boolean) => {
    try {
      await api.patch(`/admin/users/${id}/block`, { isBlocked: !currentBlocked });
      toast.success(currentBlocked ? t('toast.userUnblocked') : t('toast.userBlocked'));
      fetchUsers();
    } catch (err) {
      toast.error(t('toast.failedAction'));
    }
  };

  const toggleRole = async (id: string, currentRole: 'USER' | 'ADMIN') => {
    try {
      const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
      await api.patch(`/admin/users/${id}/role`, { role: newRole });
      toast.success(t('toast.roleChanged', { role: newRole }));
      fetchUsers();
    } catch (err) {
      toast.error(t('toast.failedAction'));
    }
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm(t('toast.confirmDelete'))) return;
    try {
      await api.delete(`/admin/users/${id}`);
      toast.success(t('toast.userDeleted'));
      fetchUsers();
    } catch (err) {
      toast.error(t('toast.failedAction'));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="heading-1">{t('admin.userMgmtTitle')}</h1>
          <p className="text-textMuted">{t('admin.userMgmtDesc')}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-textMuted flex flex-col items-center gap-4">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
            {t('admin.loading')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-borderLight dark:border-slate-700 text-textMuted uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">{t('admin.user')}</th>
                  <th className="px-6 py-4">{t('admin.role')}</th>
                  <th className="px-6 py-4">{t('admin.status')}</th>
                  <th className="px-6 py-4">{t('admin.joined')}</th>
                  <th className="px-6 py-4 text-right">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderLight dark:divide-slate-800">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-textMain">{u.name || t('admin.noName')}</div>
                      <div className="text-textMuted text-xs mt-0.5">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {u.role === 'ADMIN' ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.isBlocked ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <UserX className="w-3.5 h-3.5" /> {t('admin.blocked')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <UserCheck className="w-3.5 h-3.5" /> {t('admin.active')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-textMuted">
                      {new Date(u.createdAt).toLocaleDateString(i18n.language === 'ua' ? 'uk-UA' : 'en-US')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {currentUser?.id !== u.id && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleRole(u.id, u.role)}
                            className="p-1.5 text-slate-400 hover:text-purple-600 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                            title="Toggle Role"
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleBlock(u.id, u.isBlocked)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            title={u.isBlocked ? "Unblock User" : "Block User"}
                          >
                            {u.isBlocked ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

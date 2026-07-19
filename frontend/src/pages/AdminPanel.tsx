import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { 
  Users, FileText, Activity, ShieldCheck, Database, 
  UserX, UserCheck, HardDrive, Clock, Search
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

interface LogItem {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

interface MetricsData {
  total_users: number;
  total_documents: number;
  total_chats: number;
  total_notes: number;
  total_storage_bytes: number;
}

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [usersRes, metricsRes, logsRes] = await Promise.all([
        api.get('/api/admin/users'),
        api.get('/api/admin/metrics'),
        api.get('/api/admin/logs')
      ]);
      setUsers(usersRes.data);
      setMetrics(metricsRes.data);
      setLogs(logsRes.data);
    } catch (e) {
      console.error("Failed to load admin panel data. Administrative permissions required.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    const actionStr = currentStatus ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${actionStr} this user?`)) return;
    try {
      const res = await api.put(`/api/admin/users/${userId}/status`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: res.data.is_active } : u));
    } catch (e) {
      alert("Failed to toggle status");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Filter users based on search
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(userSearch.toLowerCase()) || 
    (u.full_name && u.full_name.toLowerCase().includes(userSearch.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 shimmer-bg rounded-lg"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 shimmer-bg rounded-2xl border border-border"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[450px] shimmer-bg rounded-2xl border border-border"></div>
          <div className="h-[450px] shimmer-bg rounded-2xl border border-border"></div>
        </div>
      </div>
    );
  }

  const metricCards = [
    { name: 'Total Users', value: metrics?.total_users || 0, icon: Users, color: 'text-blue-500' },
    { name: 'System Docs', value: metrics?.total_documents || 0, icon: FileText, color: 'text-purple-500' },
    { name: 'System Chats', value: metrics?.total_chats || 0, icon: Activity, color: 'text-green-500' },
    { name: 'Total Space', value: formatBytes(metrics?.total_storage_bytes || 0), icon: HardDrive, color: 'text-amber-500' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Admin Console</h1>
        <p className="text-sm text-muted-foreground mt-1">Audit logs, system metrics, database sizes, and user controls</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.name} className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center space-x-4">
              <div className={`p-3 rounded-xl bg-secondary/50 ${c.color}`}>
                <Icon size={20} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.name}</span>
                <p className="text-xl font-bold mt-0.5">{c.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Users panel */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-border pb-4 gap-3">
            <h2 className="text-lg font-bold flex items-center space-x-2">
              <ShieldCheck size={18} className="text-primary" />
              <span>Registered Accounts</span>
            </h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
              <input
                type="text"
                placeholder="Filter users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-7 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs focus:outline-none focus:border-primary w-40 sm:w-48"
              />
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-2">User / Email</th>
                  <th className="py-3 px-2">Role</th>
                  <th className="py-3 px-2">Registered</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-accent/10 transition">
                    <td className="py-3 px-2">
                      <p className="font-semibold text-foreground">{u.full_name || 'Standard User'}</p>
                      <p className="text-[10px] text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                        u.is_admin ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {u.is_admin ? 'ADMIN' : 'USER'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        u.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {u.is_active ? 'ACTIVE' : 'BLOCKED'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      {u.is_admin ? (
                        <span className="text-[10px] text-muted-foreground">Admin Protected</span>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(u.id, u.is_active)}
                          className={`p-1.5 rounded-lg border transition ${
                            u.is_active 
                              ? 'border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' 
                              : 'border-green-500/20 text-green-500 hover:bg-green-500 hover:text-white'
                          }`}
                          title={u.is_active ? 'Block User' : 'Activate User'}
                        >
                          {u.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: Audit logs */}
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col justify-between space-y-4">
          <div className="border-b border-border pb-4">
            <h2 className="text-lg font-bold flex items-center space-x-2">
              <Clock size={18} className="text-primary" />
              <span>System Audit Logs</span>
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 max-h-[360px] relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start space-x-3.5 relative">
                <div className="w-7 h-7 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground z-10 flex-shrink-0">
                  <Activity size={10} />
                </div>
                <div className="min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-[8px] font-bold text-primary uppercase">{log.action}</span>
                  <p className="text-[11px] text-foreground leading-snug mt-1.5 font-medium">{log.details}</p>
                  <span className="text-[9px] text-muted-foreground/80 mt-1 block">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminPanel;

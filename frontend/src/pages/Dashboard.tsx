import React, { useEffect, useState } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { WorkspaceItem } from '../components/SidebarLayout';
import api from '../services/api';
import { 
  Files, MessageSquare, GraduationCap, Trophy, HardDrive, 
  Activity, Clock, UploadCloud, ChevronRight, FileText
} from 'lucide-react';

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

interface DocItem {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  ai_status: string;
  created_at: string;
}

interface StatsData {
  total_documents: number;
  recent_uploads: DocItem[];
  ai_conversations_count: number;
  flashcards_count: number;
  quizzes_count: number;
  storage_used_bytes: number;
  activity_timeline: ActivityLog[];
}

const Dashboard: React.FC = () => {
  const { activeWorkspace } = useOutletContext<{ activeWorkspace: WorkspaceItem | null }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/features/dashboard-stats?workspace_id=${activeWorkspace.id}`);
      setStats(res.data);
    } catch (e: any) {
      setError("Failed to load workspace dashboard stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [activeWorkspace]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 shimmer-bg rounded-lg"></div>
          <div className="h-10 w-32 shimmer-bg rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 shimmer-bg rounded-2xl border border-border"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 shimmer-bg rounded-2xl border border-border"></div>
          <div className="h-96 shimmer-bg rounded-2xl border border-border"></div>
        </div>
      </div>
    );
  }

  if (!activeWorkspace) return <div className="text-center p-8">No active workspace loaded.</div>;

  const storageLimit = 500 * 1024 * 1024; // 500MB free tier
  const storagePercentage = stats ? Math.min(100, (stats.storage_used_bytes / storageLimit) * 100) : 0;
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const statCards = [
    { name: 'Total Documents', value: stats?.total_documents || 0, icon: Files, color: 'text-violet-500 bg-violet-500/10' },
    { name: 'AI Conversations', value: stats?.ai_conversations_count || 0, icon: MessageSquare, color: 'text-blue-500 bg-blue-500/10' },
    { name: 'Study Flashcards', value: stats?.flashcards_count || 0, icon: GraduationCap, color: 'text-green-500 bg-green-500/10' },
    { name: 'Quizzes Taken', value: stats?.quizzes_count || 0, icon: Trophy, color: 'text-amber-500 bg-amber-500/10' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Workspace Overview</h1>
          <p className="text-xs text-muted-foreground mt-1">Welcome back. Your AI agents have processed <span className="font-semibold text-foreground">{stats?.total_documents || 0}</span> documents in <span className="text-foreground font-semibold">{activeWorkspace.name}</span>.</p>
        </div>
        <button
          onClick={() => navigate('/workspace')}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-95 transition text-xs shadow-sm self-start md:self-auto"
        >
          <UploadCloud size={16} />
          <span>Upload File</span>
        </button>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.name} className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm flex items-center justify-between transition hover:shadow-md">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{card.name}</span>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main body split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Recent Uploads */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 flex flex-col justify-between space-y-4 shadow-sm">
          <div className="flex justify-between items-center pb-2 border-b border-border">
            <h2 className="text-sm font-bold flex items-center space-x-2 uppercase tracking-wider text-foreground">
              <FileText size={16} className="text-primary" />
              <span>Recent Uploads</span>
            </h2>
            <Link to="/workspace" className="text-xs font-bold text-primary hover:underline flex items-center space-x-1">
              <span>View all files</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="flex-1 space-y-3">
            {!stats?.recent_uploads || stats.recent_uploads.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-3">
                <Files size={36} className="text-muted/40" />
                <p>No documents uploaded yet. Head over to the files page to upload papers.</p>
              </div>
            ) : (
              stats.recent_uploads.map((doc) => (
                <div key={doc.id} className="p-3 rounded-xl border border-border bg-background/40 hover:bg-background transition flex items-center justify-between cursor-pointer" onClick={() => navigate(`/workspace/${activeWorkspace.id}/document/${doc.id}`)}>
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center font-bold text-[9px] uppercase text-primary border border-border">
                      {doc.file_type}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate hover:text-primary transition">{doc.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(doc.file_size)} • Uploaded {new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    doc.ai_status === 'ready' ? 'bg-green-500/10 text-green-700 dark:text-green-500 border border-green-500/20' :
                    doc.ai_status === 'ingesting' ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border border-yellow-500/20 animate-pulse' :
                    doc.ai_status === 'failed' ? 'bg-red-500/10 text-red-700 dark:text-red-500 border border-red-500/20' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    AI {doc.ai_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Storage and Activity */}
        <div className="space-y-6">
          
          {/* Storage tracker */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm flex flex-col justify-between">
            <h2 className="text-sm font-bold flex items-center space-x-2 uppercase tracking-wider text-foreground">
              <HardDrive size={16} className="text-primary" />
              <span>Storage Used</span>
            </h2>
            <div className="flex items-center space-x-5 py-2">
              <div className="relative flex items-center justify-center flex-shrink-0">
                <svg className="w-20 h-20 transform -rotate-90">
                  <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="6" className="text-muted/60" fill="transparent" />
                  <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="6" className="text-primary" fill="transparent"
                          strokeDasharray={2 * Math.PI * 30}
                          strokeDashoffset={2 * Math.PI * 30 * (1 - storagePercentage / 100)} />
                </svg>
                <div className="absolute text-center">
                  <span className="text-xs font-bold text-foreground">{Math.round(storagePercentage)}%</span>
                  <p className="text-[7px] uppercase tracking-widest text-muted-foreground leading-none">Used</p>
                </div>
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-col text-[11px] font-semibold text-foreground">
                  <span className="text-[10px] text-muted-foreground font-medium">Free Tier Usage</span>
                  <span>{formatBytes(stats?.storage_used_bytes || 0)} / {formatBytes(storageLimit)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-500" 
                    style={{ width: `${storagePercentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Logs Timeline */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold flex items-center space-x-2 uppercase tracking-wider text-foreground">
              <Activity size={16} className="text-primary" />
              <span>Activity Timeline</span>
            </h2>
            <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
              {!stats?.activity_timeline || stats.activity_timeline.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground font-normal">
                  No activity logs logged yet.
                </div>
              ) : (
                stats.activity_timeline.map((log) => (
                  <div key={log.id} className="flex items-start space-x-3.5 relative">
                    <div className="w-6.5 h-6.5 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground z-10 flex-shrink-0">
                      <Clock size={10} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold capitalize text-foreground">{log.action.replace('_', ' ')}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{log.details}</p>
                      <span className="text-[8px] text-muted-foreground/80 mt-1 block">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;

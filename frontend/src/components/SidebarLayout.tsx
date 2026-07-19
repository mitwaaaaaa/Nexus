import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { 
  LayoutDashboard, Files, User, ShieldAlert, Sun, Moon, 
  LogOut, BrainCircuit, ChevronDown, Plus, FolderHeart,
  ChevronLeft, ChevronRight
} from 'lucide-react';

interface WorkspaceItem {
  id: string;
  name: string;
}

const SidebarLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceItem | null>(null);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNewWsModal, setShowNewWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsError, setNewWsError] = useState<string | null>(null);
  const [creatingWs, setCreatingWs] = useState(false);

  // Fetch workspaces
  const fetchWorkspaces = async () => {
    try {
      const res = await api.get('/api/auth/me'); // simple refresh check
      const wsRes = await api.get('/api/workspaces');
      setWorkspaces(wsRes.data);
      if (wsRes.data.length > 0) {
        // Retrieve last active workspace or default to first
        const savedWsId = localStorage.getItem('activeWorkspaceId');
        const matched = wsRes.data.find((w: WorkspaceItem) => w.id === savedWsId);
        const active = matched || wsRes.data[0];
        setActiveWorkspace(active);
        localStorage.setItem('activeWorkspaceId', active.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleWorkspaceChange = (ws: WorkspaceItem) => {
    setActiveWorkspace(ws);
    localStorage.setItem('activeWorkspaceId', ws.id);
    setWsDropdownOpen(false);
    // If on workspace page, refresh page to reload resources
    if (location.pathname.startsWith('/workspace')) {
      navigate('/workspace', { replace: true });
    }
  };

  const handleCreateWorkspace = () => {
    setShowNewWsModal(true);
    setWsDropdownOpen(false);
  };

  const handleCreateWorkspaceSubmit = async () => {
    if (!newWsName.trim()) return;
    setCreatingWs(true);
    setNewWsError(null);
    try {
      const res = await api.post('/api/workspaces', { name: newWsName });
      setWorkspaces(prev => [...prev, res.data]);
      handleWorkspaceChange(res.data);
      setShowNewWsModal(false);
      setNewWsName('');
    } catch (e) {
      setNewWsError("Failed to create workspace. Try another name.");
    } finally {
      setCreatingWs(false);
    }
  };

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Files & Workspace', path: '/workspace', icon: Files },
    { name: 'Profile Settings', path: '/profile', icon: User },
  ];

  if (user?.is_admin) {
    menuItems.push({ name: 'Admin Console', path: '/admin', icon: ShieldAlert });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      
      {/* Sidebar Navigation */}
      <aside className={`border-r border-border flex flex-col justify-between glass flex-shrink-0 z-10 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
        <div className={`flex flex-col p-4 overflow-y-auto space-y-6 ${sidebarCollapsed ? 'items-center px-2' : ''}`}>
          
          {/* Logo Brand */}
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between w-full px-2 py-1">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-purple-400 flex items-center justify-center text-white glow-primary flex-shrink-0">
                  <BrainCircuit size={20} />
                </div>
                <div>
                  <h1 className="font-bold tracking-tight text-lg leading-none bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Nexus</h1>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">AI Workspace</span>
                </div>
              </div>
              <button 
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
                title="Collapse Sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4 py-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-purple-400 flex items-center justify-center text-white glow-primary flex-shrink-0">
                <BrainCircuit size={20} />
              </div>
              <button 
                onClick={() => setSidebarCollapsed(false)}
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
                title="Expand Sidebar"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Workspace Dropdown */}
          <div className="relative w-full">
            {!sidebarCollapsed ? (
              <button 
                onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-card border border-border/80 hover:bg-accent/40 transition text-sm font-medium"
              >
                <div className="flex items-center space-x-2 text-left truncate">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block flex-shrink-0"></span>
                  <span className="truncate">{activeWorkspace ? activeWorkspace.name : 'Loading...'}</span>
                </div>
                <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
              </button>
            ) : (
              <button 
                onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-card border border-border/80 hover:bg-accent/40 transition"
                title={activeWorkspace ? `Workspace: ${activeWorkspace.name}` : 'Loading...'}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0"></span>
              </button>
            )}

            {wsDropdownOpen && (
              <div className={`absolute top-full left-0 mt-1.5 p-1 rounded-xl bg-card border border-border shadow-premium z-20 space-y-1 ${sidebarCollapsed ? 'w-48 left-1/2 -translate-x-1/2' : 'right-0'}`}>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleWorkspaceChange(ws)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium truncate transition ${
                      activeWorkspace?.id === ws.id 
                        ? 'bg-primary text-primary-foreground' 
                        : 'hover:bg-accent'
                    }`}
                  >
                    {ws.name}
                  </button>
                ))}
                <div className="border-t border-border my-1"></div>
                <button
                  onClick={handleCreateWorkspace}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium text-primary hover:bg-accent transition"
                >
                  <Plus size={14} />
                  <span>New Workspace</span>
                </button>
              </div>
            )}
          </div>

          {/* Menu Navigation Links */}
          <nav className="flex flex-col space-y-1.5 w-full">
            {!sidebarCollapsed && (
              <span className="px-2 text-[10px] uppercase font-bold tracking-widest text-muted-foreground/75 mb-1.5">Navigation</span>
            )}
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  title={item.name}
                  className={`flex items-center rounded-xl text-sm font-medium transition ${
                    isActive 
                      ? 'bg-primary text-primary-foreground shadow-md' 
                      : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                  } ${sidebarCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'space-x-3 px-3 py-2.5 w-full'}`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Operations */}
        <div className={`p-4 border-t border-border flex flex-col space-y-3.5 bg-card/20 ${sidebarCollapsed ? 'items-center p-2' : ''}`}>
          
          {/* User Widget */}
          <div className={`flex items-center px-2 ${sidebarCollapsed ? 'justify-center px-0' : 'space-x-3'}`}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-400 to-primary flex items-center justify-center font-bold text-white uppercase text-sm flex-shrink-0" title={user?.email}>
              {user?.full_name ? user.full_name.substring(0, 2) : user?.email.substring(0, 2)}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">{user?.full_name || 'Research User'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
          </div>

          {/* Dark Mode & Logout Actions */}
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-xl border border-border hover:bg-accent transition text-muted-foreground hover:text-foreground"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              
              <button
                onClick={logout}
                className="flex items-center space-x-2 px-3 py-2 rounded-xl border border-destructive/20 hover:bg-destructive hover:text-white transition text-xs font-semibold text-destructive"
              >
                <LogOut size={14} />
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2 border-t border-border pt-3 w-full">
              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-xl border border-border hover:bg-accent transition text-muted-foreground hover:text-foreground"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              
              <button
                onClick={logout}
                className="p-2.5 rounded-xl border border-destructive/20 hover:bg-destructive hover:text-white transition text-destructive"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Outlet Container */}
      <main className="flex-1 overflow-y-auto relative p-6 md:p-8 bg-background/50">
        <Outlet context={{ activeWorkspace }} />
      </main>

      {/* Custom Create Workspace Modal */}
      {showNewWsModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card/95 glass p-6 shadow-premium relative animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-foreground mb-1 uppercase tracking-wider">Create New Workspace</h3>
            <p className="text-[10px] text-muted-foreground mb-4 font-normal">Organize your documents and notes in a dedicated space.</p>
            
            <input
              type="text"
              required
              placeholder="e.g. Computer Science, Project Alpha"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition text-xs text-foreground mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateWorkspaceSubmit();
              }}
            />

            {newWsError && (
              <p className="text-[10px] text-destructive mb-3 font-semibold">{newWsError}</p>
            )}

            <div className="flex justify-end space-x-2.5">
              <button
                onClick={() => {
                  setShowNewWsModal(false);
                  setNewWsName('');
                  setNewWsError(null);
                }}
                className="px-3.5 py-1.5 rounded-lg border border-border bg-transparent text-muted-foreground hover:text-foreground text-[11px] font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspaceSubmit}
                disabled={creatingWs || !newWsName.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:bg-primary/95 transition disabled:opacity-40"
              >
                {creatingWs ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SidebarLayout;
export type { WorkspaceItem };

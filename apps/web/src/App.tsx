import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  LayoutDashboard, Video, PlaySquare, Library, Upload, 
  LineChart, Lightbulb, UserCircle, Activity, Sparkles,
  LogOut
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Create from './pages/Create';
import Studio from './pages/Studio';
import LibraryPage from './pages/Library';
import Publish from './pages/Publish';
import Analytics from './pages/Analytics';
import Ideas from './pages/Ideas';
import Accounts from './pages/Accounts';
import SystemStatus from './pages/SystemStatus';
import Login from './pages/Login';

export const API_URL = "http://localhost:4000";

// Auth Context
export const AuthContext = createContext<{
  user: any;
  token: string | null;
  login: (token: string, user: any) => void;
  logout: () => void;
}>({ user: null, token: null, login: () => {}, logout: () => {} });

export function useAuth() { return useContext(AuthContext); }

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [token, setToken] = useState<string | null>(localStorage.getItem('vf_token'));
  const [user, setUser] = useState<any>(null);
  const [activeProject, setActiveProject] = useState<any>(null);

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else logout();
      })
      .catch(() => logout());
    }
  }, [token]);

  const login = (t: string, u: any) => {
    localStorage.setItem('vf_token', t);
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('vf_token');
    setToken(null);
    setUser(null);
  };

  if (!token || !user) {
    return (
      <AuthContext.Provider value={{ user, token, login, logout }}>
        <Login />
      </AuthContext.Provider>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'create', label: 'Create Video', icon: Video },
    { id: 'studio', label: 'Video Studio', icon: PlaySquare },
    { id: 'library', label: 'Content Library', icon: Library },
    { id: 'publish', label: 'Publish Queue', icon: Upload },
    { id: 'analytics', label: 'Analytics', icon: LineChart },
    { id: 'ideas', label: 'AI Ideas', icon: Lightbulb },
  ];

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentTab} />;
      case 'create': return <Create onProjectCreated={(p) => { setActiveProject(p); setCurrentTab('studio'); }} />;
      case 'studio': return <Studio project={activeProject} onProjectChange={setActiveProject} />;
      case 'library': return <LibraryPage onSelectProject={(p) => { setActiveProject(p); setCurrentTab('studio'); }} />;
      case 'publish': return <Publish project={activeProject} />;
      case 'analytics': return <Analytics />;
      case 'ideas': return <Ideas onUseIdea={(idea) => { setCurrentTab('create'); /* Pass idea somehow, handled via global state if needed, or just let Create read a ref. Keep simple for now */ }} />;
      case 'accounts': return <Accounts />;
      case 'system': return <SystemStatus />;
      default: return <Dashboard onNavigate={setCurrentTab} />;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <div className="app-container">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon"><Sparkles size={18} color="#fff" /></div>
            ViralForge AI
          </div>
          
          <div className="nav-section">Main Menu</div>
          {navItems.map(item => (
            <button 
              key={item.id}
              className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
              onClick={() => setCurrentTab(item.id)}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}

          <div className="nav-section">Settings</div>
          <button className={`nav-item ${currentTab === 'accounts' ? 'active' : ''}`} onClick={() => setCurrentTab('accounts')}>
            <UserCircle size={18} /> Social Accounts
          </button>
          <button className={`nav-item ${currentTab === 'system' ? 'active' : ''}`} onClick={() => setCurrentTab('system')}>
            <Activity size={18} /> System Status
          </button>
          
          <div style={{ marginTop: 'auto' }}>
            <button className="nav-item" onClick={logout}>
              <LogOut size={18} /> Logout
            </button>
          </div>
        </aside>

        <main className="main-content">
          <header className="header">
            <div>
              <h1>
                {navItems.find(i => i.id === currentTab)?.label || 
                 (currentTab === 'accounts' ? 'Social Accounts' : 'System Status')}
              </h1>
              <p>AI content engine → video → multi-platform publishing.</p>
            </div>
            <div className="pill">
              AI Credits <b style={{marginLeft: '8px', color: '#fff'}}>{user.creditBalance}</b>
            </div>
          </header>

          {renderContent()}
        </main>
      </div>
    </AuthContext.Provider>
  );
}

import React from 'react';
import { API_URL } from '../App';
import { MonitorPlay, Activity, Link, CheckCircle2 } from 'lucide-react';

export default function Accounts() {
  const platforms = [
    { id: 'YouTube', icon: MonitorPlay, color: '#ef4444' },
    { id: 'TikTok', icon: Activity, color: '#00f2fe' },
    { id: 'Instagram', icon: MonitorPlay, color: '#e1306c' },
    { id: 'Facebook', icon: MonitorPlay, color: '#1877f2' }
  ];

  const handleConnect = async (platform: string) => {
    try {
      const res = await fetch(`${API_URL}/auth/${platform.toLowerCase()}/connect`);
      const data = await res.json();
      alert(data.message || data.error);
    } catch (e: any) {
      alert("Error connecting account: " + e.message);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Connected Social Accounts</h3>
        <p>Connect your creator accounts to enable direct and scheduled publishing. OAuth tokens are encrypted at rest.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {platforms.map(p => (
          <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: '16px', background: 'var(--bg-surface)', display: 'grid', placeItems: 'center', marginBottom: '1rem', border: `1px solid ${p.color}40`, boxShadow: `0 0 20px ${p.color}20` }}>
              <p.icon size={32} color={p.color} />
            </div>
            
            <h4 style={{ fontSize: '1.25rem', color: 'white', marginBottom: '0.5rem' }}>{p.id}</h4>
            
            {/* Hardcoded visual state for demo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }}></span>
              Not Connected
            </div>

            <button 
              className="btn btn-secondary" 
              style={{ width: '100%' }}
              onClick={() => handleConnect(p.id)}
            >
              <Link size={16} /> Connect Account
            </button>
          </div>
        ))}
      </div>
      
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Security & Privacy</h4>
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.875rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>We only request minimum scopes required for video publishing.</li>
          <li>OAuth tokens are encrypted in the database.</li>
          <li>Tokens are never exposed to the frontend browser application.</li>
          <li>You can revoke access at any time from your platform security settings.</li>
        </ul>
      </div>
    </div>
  );
}

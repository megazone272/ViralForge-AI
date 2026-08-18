import React, { useState } from 'react';
import { useAuth, API_URL } from '../App';
import { Lightbulb, Search, Zap, TrendingUp, AlertTriangle } from 'lucide-react';

export default function Ideas({ onUseIdea }: { onUseIdea: (idea: string) => void }) {
  const { token } = useAuth();
  const [niche, setNiche] = useState('');
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API_URL}/api/ideas?niche=${encodeURIComponent(niche)}&count=8`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIdeas(data.ideas || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'var(--success)';
    if (score >= 70) return 'var(--warning)';
    return 'var(--error)';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div className="card" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lightbulb size={20} color="var(--accent-primary)"/> AI Trend & Idea Engine
          </h3>
          <p>Generate highly-optimized short-form video ideas tailored to your niche, scored for viral potential.</p>
          
          <form onSubmit={handleGenerate} style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <div className="input-group" style={{ marginBottom: 0, flex: 1, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="input-field" 
                placeholder="Enter a niche (e.g. Personal Finance, Space Exploration)..." 
                style={{ paddingLeft: '2.5rem' }}
                value={niche}
                onChange={e => setNiche(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading || !niche.trim()}>
              {loading ? <div className="loader"></div> : <><Zap size={18}/> Analyze Trends</>}
            </button>
          </form>
          {error && <div style={{ color: 'var(--error)', marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</div>}
        </div>
      </div>

      {ideas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {ideas.map((item, i) => (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ fontSize: '1.125rem', color: 'white', marginBottom: '1rem', lineHeight: 1.4 }}>
                {item.idea}
              </h4>
              
              <div style={{ marginTop: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={16} color={getScoreColor(item.total)} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Viral Score</span>
                  </div>
                  <strong style={{ fontSize: '1.25rem', color: getScoreColor(item.total) }}>{item.total}/100</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  <span>Curiosity: {item.curiosity}</span>
                  <span>Competition: {item.competition}</span>
                </div>

                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%' }}
                  onClick={() => onUseIdea(item.idea)}
                >
                  Create Video
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {!loading && ideas.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          <AlertTriangle size={48} color="var(--border-strong)" style={{ marginBottom: '1rem' }} />
          <p>Enter a niche above to discover untapped viral opportunities.</p>
        </div>
      )}
    </div>
  );
}

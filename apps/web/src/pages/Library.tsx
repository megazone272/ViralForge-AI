import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { PlaySquare, MoreVertical, Search, Trash2 } from 'lucide-react';

export default function Library({ onSelectProject }: { onSelectProject: (p: any) => void }) {
  const { token } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API_URL + '/api/projects', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(d => { setProjects(d.projects || []); setLoading(false); })
    .catch(() => setLoading(false));
  }, [token]);

  const filtered = projects.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div className="input-group" style={{ marginBottom: 0, width: '300px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search projects..." 
            style={{ paddingLeft: '2.5rem' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="loader" style={{margin: '0 auto'}}></div></div>
      ) : filtered.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Video</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelectProject(p)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="brand-icon" style={{ background: 'var(--bg-surface-hover)', boxShadow: 'none' }}>
                      <PlaySquare size={16} color="var(--accent-primary)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'white' }}>{p.title}</div>
                      <small>{p.platform} • {p.scenes?.length || 0} scenes</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`pill ${p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'error' : 'warning'}`}>
                    {p.status}
                  </span>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={(e) => { e.stopPropagation(); onSelectProject(p); }}>
                    Open Studio
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          <p>No projects found in your library.</p>
        </div>
      )}
    </div>
  );
}

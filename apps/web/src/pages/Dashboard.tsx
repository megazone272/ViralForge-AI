import React, { useEffect, useState } from 'react';
import { useAuth, API_URL } from '../App';
import { TrendingUp, Users, Eye, PlaySquare } from 'lucide-react';

export default function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetch(API_URL + '/api/analytics/summary', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(d => setSummary(d.summary))
    .catch(console.error);
  }, [token]);

  return (
    <div>
      <div className="grid-stats">
        <div className="card stat-card">
          <small><Eye size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/>Total Views</small>
          <div className="value">{summary?.totalViews?.toLocaleString() || '0'}</div>
          <small className="trend positive">↑ 12% this week</small>
        </div>
        <div className="card stat-card">
          <small><PlaySquare size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/>Videos Generated</small>
          <div className="value">{summary?.totalProjects || '0'}</div>
          <small className="trend neutral">{summary?.succeededProjects || 0} successfully rendered</small>
        </div>
        <div className="card stat-card">
          <small><TrendingUp size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/>Avg Retention</small>
          <div className="value">{summary?.avgRetention || '0'}%</div>
          <small className="trend positive">↑ 2.4% this week</small>
        </div>
        <div className="card stat-card">
          <small><Users size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/>Scheduled Publish</small>
          <div className="value">{summary?.scheduledJobs || '0'}</div>
          <small className="trend neutral">Awaiting auto-publish</small>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h3>Recent Content</h3>
          <button className="btn btn-secondary" onClick={() => onNavigate('library')}>View All</button>
        </div>
        
        {summary?.recentProjects?.length > 0 ? (
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Video Title</th>
                <th>Status</th>
                <th>Scenes</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentProjects.map((p: any) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500, color: 'white' }}>{p.title}</td>
                  <td><span className="pill success">Ready</span></td>
                  <td>{p.scenes?.length || 0}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
            <p>No videos generated yet.</p>
            <button className="btn btn-primary" onClick={() => onNavigate('create')}>Create your first video</button>
          </div>
        )}
      </div>
    </div>
  );
}

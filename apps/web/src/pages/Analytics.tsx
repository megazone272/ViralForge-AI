import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { LineChart, BarChart2, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';

export default function Analytics() {
  const { token } = useAuth();
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API_URL + '/api/analytics', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(d => { setSnapshots(d.snapshots || []); setLoading(false); })
    .catch(() => setLoading(false));
  }, [token]);

  // Aggregate totals
  const totals = snapshots.reduce((acc, curr) => ({
    views: acc.views + curr.views,
    likes: acc.likes + curr.likes,
    comments: acc.comments + curr.comments,
    shares: acc.shares + curr.shares,
  }), { views: 0, likes: 0, comments: 0, shares: 0 });

  return (
    <div>
      <div className="grid-stats">
        <div className="card stat-card">
          <small><Eye size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Total Views</small>
          <div className="value">{totals.views.toLocaleString()}</div>
        </div>
        <div className="card stat-card">
          <small><Heart size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Total Likes</small>
          <div className="value">{totals.likes.toLocaleString()}</div>
        </div>
        <div className="card stat-card">
          <small><MessageCircle size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Comments</small>
          <div className="value">{totals.comments.toLocaleString()}</div>
        </div>
        <div className="card stat-card">
          <small><Share2 size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Shares</small>
          <div className="value">{totals.shares.toLocaleString()}</div>
        </div>
      </div>

      <div className="card">
        <h3>Platform Performance Log</h3>
        <p className="text-muted">Analytics are recorded securely from platform webhooks.</p>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}><div className="loader" style={{margin:'0 auto'}}></div></div>
        ) : snapshots.length > 0 ? (
          <table style={{ marginTop: '1.5rem' }}>
            <thead>
              <tr>
                <th>Video</th>
                <th>Platform</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Retention</th>
                <th>Captured At</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500, color: 'white' }}>{s.project?.title || 'Unknown Video'}</td>
                  <td><span className="pill">{s.platform}</span></td>
                  <td>{s.views.toLocaleString()}</td>
                  <td>{s.likes.toLocaleString()}</td>
                  <td>{s.retention ? `${s.retention}%` : 'N/A'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(s.capturedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
            <BarChart2 size={48} color="var(--border-strong)" style={{ marginBottom: '1rem' }} />
            <p>No analytics data available yet. Publish videos to start collecting data.</p>
          </div>
        )}
      </div>
    </div>
  );
}

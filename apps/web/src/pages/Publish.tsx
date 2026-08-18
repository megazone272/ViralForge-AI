import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { Upload, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Publish({ project }: { project: any }) {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const platforms = ['YouTube', 'TikTok', 'Instagram', 'Facebook'];

  useEffect(() => {
    if (project?.id) {
      fetch(`${API_URL}/api/publish?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(d => setJobs(d.jobs || []))
      .catch(console.error);
    }
  }, [project?.id, token]);

  const handlePublish = async () => {
    if (!project) return setError('No project selected');
    if (selectedPlatforms.length === 0) return setError('Select at least one platform');
    
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId: project.id,
          platforms: selectedPlatforms,
          scheduledAt: scheduleTime ? new Date(scheduleTime).toISOString() : null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh jobs
      const jRes = await fetch(`${API_URL}/api/publish?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const jData = await jRes.json();
      setJobs(jData.jobs || []);
      setSelectedPlatforms([]);
      setScheduleTime('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  if (!project) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Upload size={48} color="var(--border-strong)" style={{ marginBottom: '1rem' }} />
        <h3 style={{ color: 'var(--text-muted)' }}>Select a Video to Publish</h3>
        <p>Open a video in the Content Library to prepare it for publishing.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      <div className="card">
        <h3>Publish Video</h3>
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontWeight: 600, color: 'white' }}>{project.title}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{project.status === 'SUCCEEDED' ? 'Ready to publish' : 'Video not ready'}</div>
        </div>

        {error && <div className="pill error" style={{ width: '100%', marginBottom: '1rem' }}>{error}</div>}

        <div className="input-group">
          <label className="input-label">Select Platforms</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {platforms.map(p => (
              <button 
                key={p} 
                className={`btn ${selectedPlatforms.includes(p) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => togglePlatform(p)}
                style={{ padding: '0.5rem 1rem' }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Schedule Time (Optional)</label>
          <input 
            type="datetime-local" 
            className="input-field" 
            value={scheduleTime}
            onChange={e => setScheduleTime(e.target.value)}
          />
          <small>Leave empty to publish immediately.</small>
        </div>

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', marginTop: '1rem' }} 
          onClick={handlePublish}
          disabled={loading || project.status !== 'SUCCEEDED'}
        >
          {loading ? <div className="loader"></div> : <><Upload size={18}/> Submit to Queue</>}
        </button>
      </div>

      <div className="card">
        <h3>Publishing History & Queue</h3>
        {jobs.length === 0 ? (
          <p className="text-muted">No publishing jobs for this video yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {jobs.map(job => (
              <div key={job.id} style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'white' }}>{job.platform}</span>
                  <span className={`pill ${job.status === 'PUBLISHED' ? 'success' : job.status === 'FAILED' ? 'error' : 'warning'}`}>
                    {job.status}
                  </span>
                </div>
                {job.scheduledAt && <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}><Calendar size={12} style={{display:'inline', marginRight: 4}}/> Scheduled: {new Date(job.scheduledAt).toLocaleString()}</div>}
                {job.error && <div style={{ fontSize: '0.875rem', color: 'var(--error)', marginTop: '0.5rem' }}><AlertCircle size={12} style={{display:'inline', marginRight: 4}}/> {job.error}</div>}
                {job.remoteId && <div style={{ fontSize: '0.875rem', color: 'var(--success)', marginTop: '0.5rem' }}><CheckCircle2 size={12} style={{display:'inline', marginRight: 4}}/> Published ID: {job.remoteId}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

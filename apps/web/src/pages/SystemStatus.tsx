import React, { useState, useEffect } from 'react';
import { API_URL } from '../App';
import { Server, Cpu, Database, CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';

export default function SystemStatus() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = (force = false) => {
    setLoading(true);
    fetch(`${API_URL}/api/system/status${force ? '/refresh' : ''}`)
      .then(r => r.json())
      .then(d => { setStatus(d.status); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getStatusIcon = (isOk: boolean, warnIfFalse = false) => {
    if (isOk) return <CheckCircle size={20} color="var(--success)" />;
    if (warnIfFalse) return <AlertTriangle size={20} color="var(--warning)" />;
    return <XCircle size={20} color="var(--error)" />;
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3>System Health Diagnostics</h3>
          <p style={{ margin: 0 }}>Automated environment capability detection</p>
        </div>
        <button className="btn btn-secondary" onClick={() => fetchStatus(true)} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !status ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="loader" style={{margin:'0 auto'}}></div></div>
      ) : status ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
          
          {/* Core Services */}
          <div className="card">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'white' }}>
              <Server size={18} color="var(--accent-primary)" /> Core Services
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>Node.js Runtime</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{status.nodeVersion || 'Unknown'}</div>
                </div>
                {getStatusIcon(status.node)}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>PostgreSQL Database</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Connected & Active</div>
                </div>
                {getStatusIcon(status.database)}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>Local Storage</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{status.storageDir}</div>
                </div>
                {getStatusIcon(status.storageWritable)}
              </div>
            </div>
          </div>

          {/* AI / Rendering Engines */}
          <div className="card">
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'white' }}>
              <Cpu size={18} color="var(--accent-primary)" /> AI & Rendering Engines
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>HuggingFace Provider</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{status.huggingface ? 'API Token Configured' : 'Missing HF_TOKEN'}</div>
                </div>
                {getStatusIcon(status.huggingface, true)}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>FFmpeg Renderer</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{status.ffmpegPath || 'Binary not found'}</div>
                </div>
                {getStatusIcon(status.ffmpeg)}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>Piper TTS Engine</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Models: {status.piperModels?.length || 0}</div>
                </div>
                {getStatusIcon(status.piper)}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white' }}>Whisper Subtitles (Python)</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{status.pythonVersion || 'Python unavailable'}</div>
                </div>
                {getStatusIcon(status.whisper, true)}
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="card" style={{ color: 'var(--error)' }}>Failed to load system status. Is the API running?</div>
      )}
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

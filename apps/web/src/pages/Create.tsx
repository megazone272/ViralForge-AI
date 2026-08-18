import React, { useState } from 'react';
import { useAuth, API_URL } from '../App';
import { Sparkles, Clock, MonitorPlay, Activity } from 'lucide-react';

export default function Create({ onProjectCreated }: { onProjectCreated: (p: any) => void }) {
  const { token, user } = useAuth();
  const [prompt, setPrompt] = useState('7 surprising facts about the human brain');
  const [language, setLanguage] = useState('English');
  const [duration, setDuration] = useState('45');
  const [style, setStyle] = useState('Viral Documentary');
  const [platform, setPlatform] = useState('YouTube');
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a video idea');
      return;
    }
    
    setLoading(true);
    setError('');
    setStatus('Initializing AI agents (Scripting, Vision, Voice)...');

    try {
      const res = await fetch(API_URL + '/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt,
          language,
          durationSec: parseInt(duration),
          style,
          platform
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to queue generation');

      setStatus('Pipeline queued successfully!');
      
      // Let user read the success message briefly
      setTimeout(() => {
        onProjectCreated(data.project);
      }, 1500);
      
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const platforms = [
    { id: 'YouTube', icon: MonitorPlay },
    { id: 'TikTok', icon: Activity },
    { id: 'Instagram', icon: MonitorPlay },
    { id: 'Facebook', icon: MonitorPlay }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '1.5rem' }}>
      <div className="card">
        <h3>Video Configuration</h3>
        
        {error && <div className="pill error" style={{ width: '100%', marginBottom: '1rem' }}>{error}</div>}
        
        <div className="input-group">
          <label className="input-label">Video Idea / Topic</label>
          <textarea 
            className="input-field" 
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="E.g., What would happen if the Earth stopped spinning?"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Style</label>
            <select className="input-field" value={style} onChange={e => setStyle(e.target.value)}>
              <option>Viral Documentary</option>
              <option>Faceless Story</option>
              <option>News Explainer</option>
              <option>Educational Fast-paced</option>
            </select>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Language</label>
            <select className="input-field" value={language} onChange={e => setLanguage(e.target.value)}>
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
            </select>
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Target Duration</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['15', '30', '45', '60'].map(d => (
              <button 
                key={d}
                type="button"
                className={`btn ${duration === d ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDuration(d)}
                style={{ flex: 1, padding: '0.5rem' }}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Primary Platform Target</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {platforms.map(p => (
              <button
                key={p.id}
                type="button"
                className={`btn ${platform === p.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPlatform(p.id)}
                style={{ padding: '0.5rem 1rem' }}
              >
                <p.icon size={16} /> {p.id}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--text-muted)' }}>
            Cost: <b>10 Credits</b> (Balance: {user.creditBalance})
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? <div className="loader"></div> : <><Sparkles size={18}/> Generate Complete Video</>}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Live Pipeline</h3>
        <p>Generation runs completely autonomously through our orchestrated agents.</p>
        
        {status && (
          <div className="pill success" style={{ marginBottom: '1.5rem', width: '100%', justifyContent: 'center' }}>
            {status}
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          {[
            'AI Script & Hook Generation',
            'Scene & Timing Planning',
            'Visual Generation (HuggingFace/DALL-E)',
            'Voice Narration (Piper TTS)',
            'Audio Mixing & Subtitles (Whisper)',
            'Video Render (FFmpeg H.264)',
            'Metadata & Platform Optimization'
          ].map((step, i) => (
            <div key={i} className={`pipeline-step ${loading ? 'step-active' : ''}`}>
              <div className="step-number">{i + 1}</div>
              <div style={{ color: loading ? 'white' : 'var(--text-secondary)' }}>{step}</div>
              <div className="step-status" style={{ color: loading ? 'var(--accent-primary)' : 'var(--border-strong)' }}>
                {loading ? 'Queued' : 'Waiting'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { Play, RotateCcw, Image as ImageIcon, Volume2, Save, Download } from 'lucide-react';

export default function Studio({ project, onProjectChange }: { project: any, onProjectChange: (p: any) => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<any>(project);
  const [loadingScene, setLoadingScene] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    fetch(API_URL + `/api/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(d => { setData(d.project); onProjectChange(d.project); })
    .catch(console.error);
  }, [project?.id, token]);

  useEffect(() => {
    if (!jobId || !data?.id) return;
    const interval = setInterval(() => {
      fetch(`${API_URL}/api/projects/${data.id}/job/${jobId}`)
      .then(r => r.json())
      .then(res => {
        if (res.job.state === 'READY') {
          setRendering(false);
          setJobId(null);
          // Reload project
          fetch(API_URL + `/api/projects/${data.id}`, { headers: { Authorization: `Bearer ${token}` }})
          .then(r => r.json())
          .then(d => { setData(d.project); onProjectChange(d.project); });
        } else if (res.job.state === 'FAILED') {
          setRendering(false);
          setJobId(null);
          alert('Render failed: ' + res.job.error);
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, data?.id, token]);

  const handleRegenerateScene = async (sceneId: string, type: 'image' | 'audio' | 'all') => {
    setLoadingScene(sceneId + type);
    try {
      const res = await fetch(`${API_URL}/api/projects/${data.id}/scenes/${sceneId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type })
      });
      if (res.ok) {
        const json = await res.json();
        setData((prev: any) => ({
          ...prev,
          scenes: prev.scenes.map((s: any) => s.id === sceneId ? json.scene : s)
        }));
      }
    } finally {
      setLoadingScene(null);
    }
  };

  const handleUpdateNarration = async (sceneId: string, narration: string) => {
    await fetch(`${API_URL}/api/projects/${data.id}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ narration })
    });
  };

  const handleRerender = async () => {
    setRendering(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${data.id}/render`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok) {
        setJobId(json.jobId);
      } else {
        alert(json.error);
        setRendering(false);
      }
    } catch {
      setRendering(false);
    }
  };

  if (!data) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <Play size={48} color="var(--border-strong)" style={{ marginBottom: '1rem' }} />
        <h3 style={{ color: 'var(--text-muted)' }}>No Project Selected</h3>
        <p>Go to the Content Library or Create a new video to open the Studio.</p>
      </div>
    );
  }

  const isGenerating = data.status === 'QUEUED' || data.status === 'RUNNING' || rendering;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }}>
      <div>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3>{data.title}</h3>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>{data.platform} • {data.durationSec}s • {data.style}</p>
            </div>
            <span className={`pill ${data.status === 'SUCCEEDED' ? 'success' : data.status === 'FAILED' ? 'error' : 'warning'}`}>
              {isGenerating ? 'Rendering...' : data.status}
            </span>
          </div>
          
          <div className="video-player">
            {isGenerating ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="loader" style={{ margin: '0 auto 1rem' }}></div>
                <p>Pipeline is currently running...</p>
                <small>This typically takes 2-4 minutes depending on generation settings.</small>
              </div>
            ) : data.videoPath ? (
              <video 
                src={`${API_URL}/media/${data.id}/final/video.mp4?t=${Date.now()}`} 
                controls 
                autoPlay 
                loop
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>Video generation failed or not started.</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleRerender} disabled={isGenerating}>
              {isGenerating ? 'Rendering...' : <><RotateCcw size={18}/> Re-render Final Video</>}
            </button>
            <a 
              href={`${API_URL}/media/${data.id}/final/video.mp4`} 
              download 
              className="btn btn-secondary"
              target="_blank"
            >
              <Download size={18}/> Download
            </a>
          </div>
        </div>
      </div>

      <div>
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem' }}>Scene Editor</h3>
          
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {data.scenes?.map((scene: any) => (
              <div key={scene.id} className="scene-card">
                <div style={{ position: 'relative' }}>
                  {scene.imagePath ? (
                    <img 
                      src={`${API_URL}/media/${data.id}/scenes/scene-${String(scene.order).padStart(3, '0')}/image.jpg?t=${Date.now()}`} 
                      className="scene-img" 
                      alt={`Scene ${scene.order}`} 
                    />
                  ) : (
                    <div className="scene-img" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
                      <ImageIcon size={24} />
                    </div>
                  )}
                  {loadingScene === scene.id + 'image' && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-sm)' }}>
                      <div className="loader" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                    </div>
                  )}
                </div>
                
                <div className="scene-content">
                  <div className="scene-header">
                    <span style={{ fontWeight: 600, color: 'white', fontSize: '0.875rem' }}>Scene {scene.order}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>~{scene.durationSec}s</span>
                  </div>
                  
                  <textarea 
                    className="input-field" 
                    style={{ minHeight: '60px', padding: '0.5rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}
                    defaultValue={scene.narration}
                    onBlur={(e) => handleUpdateNarration(scene.id, e.target.value)}
                  />
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => handleRegenerateScene(scene.id, 'image')}
                      disabled={!!loadingScene}
                    >
                      <ImageIcon size={12}/> Re-roll Visual
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => handleRegenerateScene(scene.id, 'audio')}
                      disabled={!!loadingScene}
                    >
                      {loadingScene === scene.id + 'audio' ? <div className="loader" style={{width: 12, height: 12, borderWidth: 2}}></div> : <Volume2 size={12}/>} Re-roll Voice
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {(!data.scenes || data.scenes.length === 0) && (
              <p className="text-muted">No scenes generated for this project yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

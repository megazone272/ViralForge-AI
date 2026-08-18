import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useAuth, API_URL } from '../App';

export default function Login() {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('demo@viralforge.local');
  const [password, setPassword] = useState('demo1234');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(isRegister && { name }) })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', backgroundColor: 'var(--bg-base)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <div className="brand-icon"><Sparkles size={20} color="#fff" /></div>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>ViralForge AI</h1>
        </div>
        
        <h2 style={{ textAlign: 'center', fontSize: '1.25rem', marginBottom: '1.5rem' }}>
          {isRegister ? 'Create your account' : 'Sign in to continue'}
        </h2>

        {error && <div className="pill error" style={{ width: '100%', marginBottom: '1rem', justifyContent: 'center' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="input-group">
              <label className="input-label">Name</label>
              <input 
                type="text" 
                className="input-field" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
            </div>
          )}
          <div className="input-group">
            <label className="input-label">Email</label>
            <input 
              type="email" 
              className="input-field" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label className="input-label">Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }} disabled={loading}>
            {loading ? <div className="loader"></div> : (isRegister ? 'Create Account' : 'Sign In')}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <p style={{ textAlign: 'center', margin: 0, fontSize: '0.875rem' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(!isRegister); }}>
            {isRegister ? 'Sign in' : 'Create one'}
          </a>
        </p>
      </div>
    </div>
  );
}

import React, { useState } from 'react'
import { Lock, Mail, Loader2 } from 'lucide-react'
import { supabase } from './supabase'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onLogin(data.user)
    }
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        scopes: 'https://www.googleapis.com/auth/drive.file'
      }
    });
    if (error) alert(error.message);
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
      <div className="glass" style={{ width: '100%', maxWidth: '400px', padding: '40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock className="text-accent" size={28} color="var(--accent-color)" />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Welcome Back</h1>
          <p style={{ color: 'var(--text-dim)', marginTop: '8px' }}>Security is our priority.</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <Mail style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} size={18} />
            <input 
              type="email" 
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass"
              style={{ width: '100%', padding: '12px 12px 12px 42px', border: '1px solid var(--glass-border)', outline: 'none', color: 'white' }}
              required
            />
          </div>
          
          <div style={{ position: 'relative' }}>
            <Lock style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} size={18} />
            <input 
              type="password" 
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass"
              style={{ width: '100%', padding: '12px 12px 12px 42px', border: '1px solid var(--glass-border)', outline: 'none', color: 'white' }}
              required
            />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center' }}>{error}</p>}

          <button type="submit" className="glow-btn" disabled={loading} style={{ marginTop: '8px', opacity: loading ? 0.7 : 1 }}>
            {loading ? <Loader2 className="animate-spin" size={20} style={{ margin: '0 auto' }} /> : 'Access Vault'}
          </button>
        </form>

        <div style={{ margin: '10px 0', textAlign: 'center', opacity: 0.5 }}>───── OR ─────</div>

        <button onClick={handleGoogleLogin} className="glow-btn" style={{ background: '#4285F4', color: 'white', border: 'none', padding: '12px' }}>
           Continue with Google Drive
        </button>
      </div>
    </div>
  )
}

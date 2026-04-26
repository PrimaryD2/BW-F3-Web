import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as apiLogin } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const toast      = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) { setError('Both fields are required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin({ username, password });
      login(res.data.token, res.data.user);
      if (res.data.user.force_password_change) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>✈</div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--accent)' }}>F3 Production</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Station F3 Management System</div>
        </div>

        <div className="card" style={{ borderRadius: '14px', padding: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px' }}>Sign in to your account</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
                color: 'var(--danger)', fontSize: '13px',
              }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', marginTop: '20px' }}>
          Sessions expire after 8 hours of inactivity.
        </p>
      </div>
    </div>
  );
}

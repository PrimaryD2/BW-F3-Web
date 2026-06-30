import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalLogin, PORTAL_TOKEN, PORTAL_CUSTOMER } from '../api/portal';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await portalLogin({ email: email.trim(), password });
      localStorage.setItem(PORTAL_TOKEN, res.data.token);
      localStorage.setItem(PORTAL_CUSTOMER, JSON.stringify(res.data.customer));
      navigate(res.data.must_change_password ? '/portal/change-password' : '/portal');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary, #0b0d12)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--bg-secondary, #14171f)', borderRadius: 16, padding: '36px 32px', border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.3px' }}>Blackwing</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Customer Portal</div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </label>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'var(--text-muted)' }}>
          Access provided by Blackwing Sweden AB.<br />Contact us if you need login details.
        </div>
      </div>
    </div>
  );
}

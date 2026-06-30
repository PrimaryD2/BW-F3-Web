import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalChangePassword, portalGetMe, PORTAL_TOKEN } from '../api/portal';

export default function PortalChangePassword() {
  const navigate = useNavigate();
  const [forced, setForced] = useState(false);
  const [current, setCurrent] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(PORTAL_TOKEN)) { navigate('/portal/login'); return; }
    portalGetMe().then(r => setForced(!!r.data.portal_must_change_password)).catch(() => {});
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (pw1.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (pw1 !== pw2) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      await portalChangePassword({ current_password: current || undefined, new_password: pw1 });
      navigate('/portal');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary, #0b0d12)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-secondary, #14171f)', borderRadius: 16, padding: '32px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>Set Your Password</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          {forced ? 'Please choose your own password to continue.' : 'Update your portal password.'}
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!forced && (
            <label className="form-group" style={{ margin: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Current password</span>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} />
            </label>
          )}
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>New password</span>
            <input type="password" value={pw1} onChange={e => setPw1(e.target.value)} required autoFocus />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Confirm new password</span>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} required />
          </label>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Password'}</button>
        </form>
      </div>
    </div>
  );
}

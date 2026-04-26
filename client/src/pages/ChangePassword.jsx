import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ChangePassword() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast    = useToast();
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (next.length < 6) { setError('New password must be at least 6 characters'); return; }
    if (next !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      await changePassword({
        current_password: user?.force_password_change ? undefined : current,
        new_password: next,
      });
      updateUser({ force_password_change: false });
      toast.success('Password changed successfully!');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔑</div>
          <div style={{ fontSize: '22px', fontWeight: '800' }}>Change Password</div>
          {user?.force_password_change && (
            <div style={{ color: 'var(--warning)', fontSize: '13px', marginTop: '6px' }}>
              You must set a new password before continuing.
            </div>
          )}
        </div>
        <div className="card" style={{ borderRadius: '14px', padding: '32px' }}>
          <form onSubmit={handleSubmit}>
            {!user?.force_password_change && (
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Current password" autoFocus />
              </div>
            )}
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="At least 6 characters" autoFocus={!!user?.force_password_change} />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" />
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '14px' }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: '10px' }}
            onClick={() => { logout(); navigate('/login'); }}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

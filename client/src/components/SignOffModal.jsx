import React, { useState } from 'react';
import { signOffTask } from '../api';
import { useToast } from '../context/ToastContext';

export default function SignOffModal({ task, signatureType, onClose, onSuccess }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await signOffTask(task.id, { password, signature_type: signatureType });
      toast.success(signatureType === 'primary' ? 'Primary sign-off recorded.' : 'Double sign-off recorded. Task complete!');
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Sign-off failed');
    } finally {
      setLoading(false);
    }
  }

  const isPrimary = signatureType === 'primary';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {isPrimary ? '✅ Primary Sign-off' : '✅✅ Double Sign-off'}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
          {isPrimary
            ? 'You are signing off as the primary worker on this task. Enter your password to confirm.'
            : 'You are providing the verification double sign-off. This confirms peer review. Enter your password to confirm.'
          }
        </p>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px', marginBottom: '20px', fontSize: '13px' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Task</div>
          <div style={{ fontWeight: '600' }}>{task.title}</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Your Password</label>
            <input
              type="password"
              placeholder="Enter your password to confirm sign-off"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-success" disabled={loading}>
              {loading ? 'Signing…' : `Confirm ${isPrimary ? 'Primary' : 'Double'} Sign-off`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

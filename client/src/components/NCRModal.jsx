import React, { useState } from 'react';
import { createNcr } from '../api';
import { useToast } from '../context/ToastContext';

export default function NCRModal({ airplaneId, stationId, taskInstanceId = null, onClose, onSuccess }) {
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) { setError('Description is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await createNcr({
        airplane_id: airplaneId,
        station_id: stationId,
        task_instance_id: taskInstanceId,
        description: description.trim(),
        severity,
      });
      toast.success('NCR filed successfully.');
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create NCR');
      setLoading(false);
    }
  }

  const SEV_INFO = {
    low:    { label: 'Low',    color: 'var(--success)', desc: 'Minor issue, does not block progress.' },
    medium: { label: 'Medium', color: 'var(--warning)', desc: 'Moderate issue, logged but does not block sign-off.' },
    high:   { label: 'High',   color: 'var(--danger)',  desc: 'Critical issue — blocks sign-off until resolved by supervisor.' },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-title">⚠ File Nonconformity Report</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
          Report a quality or process deviation. All NCRs are logged and tracked for resolution.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Severity *</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {Object.entries(SEV_INFO).map(([val, info]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSeverity(val)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid',
                    borderColor: severity === val ? info.color : 'var(--border)',
                    background: severity === val ? `${info.color}18` : 'var(--bg-secondary)',
                    color: severity === val ? info.color : 'var(--text-secondary)',
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontSize: '13px',
                  }}
                >
                  {info.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: SEV_INFO[severity].color, marginTop: '8px' }}>
              {SEV_INFO[severity].desc}
            </p>
          </div>
          <div className="form-group">
            <label>Description *</label>
            <textarea
              placeholder="Describe the nonconformity in detail — what was found, where, and potential impact…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              style={{ resize: 'vertical' }}
              autoFocus
            />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={loading}>
              {loading ? 'Filing…' : 'File NCR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

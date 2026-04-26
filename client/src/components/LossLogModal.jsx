import React, { useState } from 'react';
import { logLoss } from '../api';
import { useToast } from '../context/ToastContext';

const LOSS_REASONS = [
  { value: 'walked_to_warehouse', label: 'Walked to Warehouse' },
  { value: 'fix_issue',          label: 'Fix Issue' },
  { value: 'missing_tools',      label: 'Missing Tools' },
  { value: 'waiting_for_material', label: 'Waiting for Material' },
  { value: 'machine_downtime',   label: 'Machine Downtime' },
  { value: 'other',              label: 'Other' },
];

export default function LossLogModal({ taskId, taskTitle, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [skipped, setSkipped] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason) { setError('Please select a reason'); return; }
    if (!duration || isNaN(duration) || parseFloat(duration) <= 0) { setError('Enter a valid duration in minutes'); return; }
    setLoading(true);
    setError('');
    try {
      await logLoss({ task_instance_id: taskId, reason, duration_minutes: parseFloat(duration), notes: notes || undefined });
      toast.success('Loss logged.');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log loss');
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⏱ Did anything slow you down?</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
          If any time was lost due to non-productive reasons, log it here for tracking. This helps identify factory bottlenecks.
        </p>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Task: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{taskTitle}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Loss Reason *</label>
            <select value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">Select a reason…</option>
              {LOSS_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Duration Lost (minutes) *</label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 15"
              value={duration}
              onChange={e => setDuration(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea
              placeholder="Any additional details…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onDone} disabled={loading}>
              Nothing to log
            </button>
            <button type="submit" className="btn btn-warning" disabled={loading}>
              {loading ? 'Logging…' : 'Log Loss'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

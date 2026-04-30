import React, { useState } from 'react';
import { createNcr } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const SEV_INFO = {
  low:    { label: 'Low',    color: 'var(--success)', desc: 'Minor deviation — logged for traceability.' },
  medium: { label: 'Medium', color: 'var(--warning)', desc: 'Moderate issue — logged and tracked for review.' },
  high:   { label: 'High',   color: 'var(--danger)',  desc: 'Critical deviation — requires supervisor action.' },
};

export default function NCRModal({ airplaneId, airplaneSerial, stationId, taskInstanceId = null, onClose, onSuccess }) {
  const { user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    full_name:            user?.name || '',
    part_assembly_number: '',
    drawing_number:       '',
    severity:             'medium',
    description:          '',
    is_safety_concern:    false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const setF = (patch) => setForm(f => ({ ...f, ...patch }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim())   { setError('Full name is required'); return; }
    if (!form.description.trim()) { setError('Description is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await createNcr({
        airplane_id:          airplaneId,
        station_id:           stationId,
        task_instance_id:     taskInstanceId,
        full_name:            form.full_name.trim(),
        part_assembly_number: form.part_assembly_number.trim() || null,
        drawing_number:       form.drawing_number.trim() || null,
        is_safety_concern:    form.is_safety_concern,
        description:          form.description.trim(),
        severity:             form.severity,
      });
      toast.success('NCR filed successfully.');
      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create NCR');
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="modal-title">⚠ File Nonconformity Report</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6, fontSize: 13 }}>
          All NCRs are logged regardless of severity and tracked until resolved.
        </p>

        <form onSubmit={handleSubmit}>

          {/* Row 1: Full name + Aircraft (read-only) */}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label>Full Name *</label>
              <input
                value={form.full_name}
                onChange={e => setF({ full_name: e.target.value })}
                placeholder="Your full name"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Airplane Number</label>
              <input
                value={airplaneSerial || `#${airplaneId}`}
                readOnly
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'default' }}
              />
            </div>
          </div>

          {/* Row 2: Part/Assembly No + Drawing No */}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label>Part / Assembly Number</label>
              <input
                value={form.part_assembly_number}
                onChange={e => setF({ part_assembly_number: e.target.value })}
                placeholder="e.g. P/N 12345-A"
              />
            </div>
            <div className="form-group">
              <label>Drawing Number</label>
              <input
                value={form.drawing_number}
                onChange={e => setF({ drawing_number: e.target.value })}
                placeholder="e.g. DWG-310-A Rev.2"
              />
            </div>
          </div>

          {/* Severity */}
          <div className="form-group">
            <label>Severity *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {Object.entries(SEV_INFO).map(([val, info]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setF({ severity: val })}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8, border: '2px solid',
                    borderColor: form.severity === val ? info.color : 'var(--border)',
                    background: form.severity === val ? `${info.color}18` : 'var(--bg-secondary)',
                    color: form.severity === val ? info.color : 'var(--text-secondary)',
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontSize: 13,
                  }}
                >
                  {info.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: SEV_INFO[form.severity].color, marginTop: 8 }}>
              {SEV_INFO[form.severity].desc}
            </p>
          </div>

          {/* Description */}
          <div className="form-group">
            <label>Description *</label>
            <textarea
              placeholder="Describe the nonconformity — what was found, where, and potential impact…"
              value={form.description}
              onChange={e => setF({ description: e.target.value })}
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Safety concern checkbox */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
              padding: '12px 14px', borderRadius: 8,
              border: form.is_safety_concern ? '2px solid var(--danger)' : '1px solid var(--border)',
              background: form.is_safety_concern ? 'rgba(239,68,68,0.06)' : 'var(--bg-secondary)',
              transition: 'all 0.15s',
            }}>
              <input
                type="checkbox"
                checked={form.is_safety_concern}
                onChange={e => setF({ is_safety_concern: e.target.checked })}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: 'var(--danger)' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: form.is_safety_concern ? 'var(--danger)' : 'var(--text-primary)' }}>
                  I suspect this is a safety issue
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                  Check this if the nonconformity may affect airworthiness or personnel safety. It will be flagged for immediate supervisor attention.
                </div>
              </div>
            </label>
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              type="submit"
              className={`btn ${form.is_safety_concern ? 'btn-danger' : 'btn-primary'}`}
              disabled={loading}
            >
              {loading ? 'Filing…' : (form.is_safety_concern ? '⚠ File Safety NCR' : 'File NCR')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

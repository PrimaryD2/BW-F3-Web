import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNcr, updateNcr } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const SEV_BADGE  = { low: 'badge-success', medium: 'badge-warning', high: 'badge-danger' };
const STAT_BADGE = { open: 'badge-danger', under_review: 'badge-warning', resolved: 'badge-success' };

export default function NCRDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSupervisor } = useAuth();
  const toast = useToast();
  const [ncr, setNcr]           = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({ status: '', resolution_notes: '' });
  const [saving, setSaving]     = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const res = await getNcr(id);
      setNcr(res.data);
      setForm({ status: res.data.status, resolution_notes: res.data.resolution_notes || '' });
    } catch (err) {
      toast.error('Failed to load NCR');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateNcr(id, form);
      setNcr(res.data);
      setEditing(false);
      toast.success('NCR updated.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 28, color: 'var(--text-secondary)' }}>Loading…</div>;
  if (!ncr) return <div style={{ padding: 28, color: 'var(--danger)' }}>NCR not found.</div>;

  const pdfUrl = `/api/pdf/ncr/${id}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button onClick={() => navigate('/ncr')} className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>← Back to NCR List</button>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            NCR #{ncr.id}
            <span className={`badge ${SEV_BADGE[ncr.severity]}`}>{ncr.severity}</span>
            <span className={`badge ${STAT_BADGE[ncr.status]}`}>{ncr.status.replace(/_/g, ' ')}</span>
          </div>
          <div className="page-subtitle">
            {ncr.serial_number} · {ncr.station_name} · Reported by {ncr.reporter_name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">↓ PDF</a>
          {isSupervisor && ncr.status !== 'resolved' && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>Update Status</button>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <Row label="Aircraft"   value={`${ncr.serial_number} (${ncr.model})`} />
              <Row label="Station"    value={ncr.station_name} />
              <Row label="Reported by" value={ncr.reporter_name} />
              <Row label="Created"    value={new Date(ncr.created_at).toLocaleString()} />
              {ncr.resolved_at && <Row label="Resolved" value={new Date(ncr.resolved_at).toLocaleString()} />}
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Description</div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13 }}>{ncr.description}</p>
          </div>

          {ncr.resolution_notes && (
            <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
              <div className="card-title" style={{ marginBottom: 12, color: 'var(--success)' }}>Resolution Notes</div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13 }}>{ncr.resolution_notes}</p>
            </div>
          )}
        </div>

        {/* Approval history */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Audit Trail</div>
          {!ncr.approvals || ncr.approvals.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No actions recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Created entry */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>{new Date(ncr.created_at).toLocaleString()}</div>
                <div style={{ fontWeight: 600 }}>NCR filed by {ncr.reporter_name}</div>
              </div>
              {ncr.approvals.map(a => (
                <div key={a.id} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>{new Date(a.approved_at).toLocaleString()}</div>
                  <div style={{ fontWeight: 600 }}>{a.approver_name}: {a.action}</div>
                  {a.notes && <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{a.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Update NCR Status</div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="open">Open</option>
                  <option value="under_review">Under Review</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="form-group">
                <label>Resolution Notes</label>
                <textarea
                  value={form.resolution_notes}
                  onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))}
                  rows={4}
                  placeholder="Describe the resolution or action taken…"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Update'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 100 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

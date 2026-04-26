import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAirplanes, createAirplane } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STATUS_BADGE = {
  draft:       'badge-ghost',
  in_progress: 'badge-info',
  qc_review:   'badge-warning',
  completed:   'badge-success',
};

export default function AirplaneList() {
  const navigate = useNavigate();
  const { isSupervisor } = useAuth();
  const toast = useToast();
  const [airplanes, setAirplanes]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [filter, setFilter]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [form, setForm]             = useState({ serial_number: '', model: '', status: 'draft' });
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await getAirplanes({});
      setAirplanes(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.serial_number || !form.model) { setFormError('Serial number and model are required'); return; }
    setSaving(true); setFormError('');
    try {
      await createAirplane(form);
      toast.success(`Airplane ${form.serial_number} created.`);
      setShowModal(false);
      setForm({ serial_number: '', model: '', status: 'draft' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create airplane');
      setSaving(false);
    }
  }

  const filtered = airplanes.filter(a =>
    (!statusFilter || a.status === statusFilter) &&
    (!filter || a.serial_number.toLowerCase().includes(filter.toLowerCase()) || a.model.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Airplane Projects</div>
          <div className="page-subtitle">{airplanes.length} total project{airplanes.length !== 1 ? 's' : ''}</div>
        </div>
        {isSupervisor && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Airplane</button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          style={{ flex: '1', minWidth: 200, maxWidth: 340 }}
          placeholder="Search serial number or model…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <select style={{ width: 180 }} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="qc_review">QC Review</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: 20 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32 }}>✈</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
            {filter || statusFilter ? 'No matching airplanes found.' : 'No airplane projects yet. Create one to get started.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serial Number</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} onClick={() => navigate(`/airplanes/${a.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{a.serial_number}</td>
                    <td>{a.model}</td>
                    <td><span className={`badge ${STATUS_BADGE[a.status] || 'badge-ghost'}`}>{a.status.replace(/_/g, ' ')}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(a.created_at).toLocaleDateString()}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Airplane Project</div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Serial Number *</label>
                <input
                  placeholder="e.g. F3-2024-001"
                  value={form.serial_number}
                  onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Model *</label>
                <input
                  placeholder="e.g. Orca Two-Seat"
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Initial Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>
              {formError && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{formError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Airplane'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

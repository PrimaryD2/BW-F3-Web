import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAirplane, getAirplaneProgress, updateAirplane } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STATUS_OPTIONS = ['draft', 'in_progress', 'qc_review', 'completed'];
const STATUS_BADGE = {
  draft: 'badge-ghost', in_progress: 'badge-info', qc_review: 'badge-warning', completed: 'badge-success',
};

function StationCard({ stationData, airplaneId, navigate }) {
  const { station, percent, total, completed, status, has_blocking_ncr } = stationData;
  const color = status === 'complete' ? 'var(--success)' : status === 'blocked' ? 'var(--danger)' : status === 'in_progress' ? 'var(--accent)' : 'var(--text-muted)';
  return (
    <div
      className="card"
      onClick={() => navigate(`/airplanes/${airplaneId}/station/${station.id}`)}
      style={{ cursor: 'pointer', transition: 'border-color 0.2s, transform 0.1s', borderLeft: `4px solid ${color}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{station.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{total} task{total !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color }}>{percent}%</div>
      </div>
      <div className="progress-bar" style={{ marginBottom: 8 }}>
        <div className={`progress-fill ${status === 'complete' ? 'green' : status === 'blocked' ? 'red' : 'blue'}`} style={{ width: `${percent}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{completed}/{total} complete</span>
        {has_blocking_ncr && <span className="badge badge-danger" style={{ fontSize: 10 }}>BLOCKED</span>}
        {!has_blocking_ncr && status === 'complete' && <span className="badge badge-success" style={{ fontSize: 10 }}>DONE</span>}
        {!has_blocking_ncr && status === 'in_progress' && <span className="badge badge-info" style={{ fontSize: 10 }}>IN PROGRESS</span>}
      </div>
    </div>
  );
}

export default function AirplaneDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSupervisor } = useAuth();
  const toast = useToast();
  const [airplane, setAirplane] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving]     = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [planeRes, progRes] = await Promise.all([getAirplane(id), getAirplaneProgress(id)]);
      setAirplane(planeRes.data);
      setProgress(progRes.data);
      setEditForm({ serial_number: planeRes.data.serial_number, model: planeRes.data.model, status: planeRes.data.status });
    } catch (err) {
      toast.error('Failed to load airplane data');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateAirplane(id, editForm);
      setAirplane(res.data);
      setEditing(false);
      toast.success('Airplane updated.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 28, color: 'var(--text-secondary)' }}>Loading…</div>;
  if (!airplane) return <div style={{ padding: 28, color: 'var(--danger)' }}>Airplane not found.</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button onClick={() => navigate('/airplanes')} className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>← Back to Airplanes</button>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {airplane.serial_number}
            <span className={`badge ${STATUS_BADGE[airplane.status] || 'badge-ghost'}`}>{airplane.status.replace(/_/g, ' ')}</span>
          </div>
          <div className="page-subtitle">{airplane.model} · Created {new Date(airplane.created_at).toLocaleDateString()}</div>
        </div>
        {isSupervisor && (
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>✏ Edit</button>
        )}
      </div>

      {/* Overall progress */}
      {progress && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>Overall Progress</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: progress.percent === 100 ? 'var(--success)' : 'var(--accent)' }}>{progress.percent}%</span>
          </div>
          <div className="progress-bar" style={{ height: 12 }}>
            <div className={`progress-fill ${progress.percent === 100 ? 'green' : 'blue'}`} style={{ width: `${progress.percent}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>
            <span>{progress.completed} of {progress.total} tasks double-signed</span>
            {airplane.completed_at && <span>Completed {new Date(airplane.completed_at).toLocaleDateString()}</span>}
          </div>
        </div>
      )}

      {/* Station cards */}
      <div style={{ marginBottom: 8, fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Stations — click to open task sheet
      </div>
      <div className="grid-3">
        {(progress?.stations || []).map(s => (
          <StationCard key={s.station.id} stationData={s} airplaneId={id} navigate={navigate} />
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit Airplane</div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Serial Number</label>
                <input value={editForm.serial_number} onChange={e => setEditForm(f => ({ ...f, serial_number: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Model</label>
                <input value={editForm.model} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

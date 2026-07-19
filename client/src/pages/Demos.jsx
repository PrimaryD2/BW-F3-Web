import React, { useEffect, useMemo, useState } from 'react';
import { getDemos, createDemo, updateDemo, deleteDemo, getFleetList } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fmtDate as fmtDateBase } from '../utils/formatDate';

// One date format app-wide ("20 APR 2026") — see utils/formatDate.
const fmtDate = (d) => fmtDateBase(d, '–');
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(String(dateStr).slice(0, 10) + 'T00:00:00'); t.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
}
function spanDays(a, b) {
  const s = new Date(String(a).slice(0, 10) + 'T00:00:00');
  const e = new Date(String(b || a).slice(0, 10) + 'T00:00:00');
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

const EMPTY = { title: '', aircraft: '', location: '', start_date: '', end_date: '', notes: '' };
const today = () => new Date().toISOString().slice(0, 10);

export default function Demos() {
  const { isAdmin, isSupervisor } = useAuth();
  const canEdit = isAdmin || isSupervisor;
  const toast = useToast();

  const [demos, setDemos] = useState([]);
  const [aircraftList, setAircraftList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try {
      const [dRes, fRes] = await Promise.allSettled([getDemos(), getFleetList()]);
      if (dRes.status === 'fulfilled') setDemos(dRes.value.data || []);
      else toast.error('Failed to load demos');
      if (fRes.status === 'fulfilled') setAircraftList(fRes.value.data || []);
    } finally { setLoading(false); }
  }

  const aircraftLabel = (a) => `BW-${a.bw_serial}${a.registration ? ` · ${a.registration}` : ''}`;

  function openNew() { setEditId(null); setForm({ ...EMPTY, start_date: today(), end_date: today() }); setShowForm(true); }
  function openEdit(d) {
    setEditId(d.id);
    setForm({
      title: d.title || '', aircraft: d.aircraft || '', location: d.location || '',
      start_date: String(d.start_date).slice(0, 10), end_date: String(d.end_date).slice(0, 10),
      notes: d.notes || '',
    });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('A title is required'); return; }
    if (!form.start_date || !form.end_date) { toast.error('Start and end dates are required'); return; }
    if (form.end_date < form.start_date) { toast.error('End date cannot be before the start date'); return; }
    setSaving(true);
    try {
      if (editId) { await updateDemo(editId, form); toast.success('Demo updated'); }
      else { await createDemo(form); toast.success('Demo scheduled'); }
      setShowForm(false);
      await load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleDelete(d) {
    if (!window.confirm(`Delete "${d.title}"?`)) return;
    try { await deleteDemo(d.id); toast.success('Deleted'); setDemos(prev => prev.filter(x => x.id !== d.id)); }
    catch { toast.error('Failed to delete'); }
  }

  const { upcoming, past } = useMemo(() => {
    const up = [], pa = [];
    for (const d of demos) {
      (daysUntil(d.end_date) >= 0 ? up : pa).push(d);
    }
    up.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    pa.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    return { upcoming: up, past: pa };
  }, [demos]);

  function Row({ d, dim }) {
    const du = daysUntil(d.start_date);
    const active = daysUntil(d.start_date) <= 0 && daysUntil(d.end_date) >= 0;
    return (
      <div className="card" style={{ padding: '12px 16px', opacity: dim ? 0.7 : 1 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 120, flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDate(d.start_date)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ {fmtDate(d.end_date)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{spanDays(d.start_date, d.end_date)} day{spanDays(d.start_date, d.end_date) === 1 ? '' : 's'}</div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 600 }}>
              {d.title}
              {active && <span className="badge badge-warning" style={{ fontSize: 9, marginLeft: 8 }}>AWAY NOW</span>}
              {!active && du >= 0 && du <= 14 && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>{du === 0 ? 'today' : `in ${du}d`}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {[d.aircraft, d.location].filter(Boolean).join(' · ') || '—'}
            </div>
            {d.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.notes}</div>}
          </div>
          {canEdit && (
            <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>Edit</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(d)}>Delete</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Demos &amp; Away Schedule</div>
          <div className="page-subtitle">When our aircraft are booked out for demos, shows, or loans — also shown on the dashboard calendar</div>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={openNew}>+ Schedule</button>}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      ) : demos.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛩</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nothing scheduled</div>
          <p style={{ fontSize: 13 }}>{canEdit ? 'Use “+ Schedule” to book a demo or away period.' : 'No demos are currently scheduled.'}</p>
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 10px' }}>Upcoming &amp; current ({upcoming.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {upcoming.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>None scheduled.</div>
              : upcoming.map(d => <Row key={d.id} d={d} />)}
          </div>
          {past.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 10px', color: 'var(--text-secondary)' }}>Past ({past.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {past.map(d => <Row key={d.id} d={d} dim />)}
              </div>
            </>
          )}
        </>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editId ? 'Edit Schedule' : 'Schedule a Demo / Away Period'}</div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Title / Reason *</label>
                <input autoFocus placeholder="e.g. Demo tour — Aero Friedrichshafen" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Aircraft</label>
                  <select value={form.aircraft} onChange={e => setForm(f => ({ ...f, aircraft: e.target.value }))}>
                    <option value="">— Select aircraft —</option>
                    {aircraftList.map(a => {
                      const label = aircraftLabel(a);
                      return <option key={a.id} value={label}>{label}</option>;
                    })}
                    {/* Preserve a custom value that isn't in the fleet list */}
                    {form.aircraft && !aircraftList.some(a => aircraftLabel(a) === form.aircraft) && (
                      <option value={form.aircraft}>{form.aircraft}</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input placeholder="e.g. Friedrichshafen" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>From *</label>
                  <input type="date" max="9999-12-31" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>To *</label>
                  <input type="date" min={form.start_date || undefined} max="9999-12-31" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={3} placeholder="Anything worth noting…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editId ? 'Save' : 'Schedule')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

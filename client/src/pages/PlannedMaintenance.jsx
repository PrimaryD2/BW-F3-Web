import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteFleetPlannedMaintenance,
  getFleetServiceTemplates,
  getFleetPlannedMaintenance,
  signOffFleetPlannedMaintenance,
  updateFleetPlannedMaintenance,
  signOffMaintenanceItem,
  uploadMaintenanceItemPhoto,
  deleteMaintenanceItemPhoto,
  getUsers,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function LabeledField({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── Single work item row ─────────────────────────────────────────────────────
function ItemRow({ item, users, currentUser, isSupervisor, onSignoff, onPhotoUpload, onPhotoDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    completed_date: new Date().toISOString().slice(0, 10),
    signed_by: currentUser?.name || '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const isSigned = Boolean(item.signed_off);

  async function handleSave() {
    if (!form.completed_date) return;
    setSaving(true);
    try {
      await onSignoff(item.id, form);
      setShowForm(false);
    } catch { /* error shown by parent */ }
    setSaving(false);
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await onPhotoUpload(item.id, fd);
    } catch { /* error shown by parent */ }
    setUploading(false);
    e.target.value = '';
  }

  return (
    <div style={{
      borderRadius: 8,
      border: '1px solid var(--border)',
      background: isSigned ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
      overflow: 'hidden',
    }}>
      {/* ── Item header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px' }}>
        {/* Status dot */}
        <span style={{ fontSize: 16, lineHeight: '22px', flexShrink: 0 }}>
          {isSigned ? '✅' : <span style={{ fontSize: 18, color: 'var(--text-muted)', lineHeight: '22px' }}>○</span>}
        </span>

        {/* Title + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: isSigned ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: isSigned ? 'line-through' : 'none' }}>
            {item.title || item.template_title || '—'}
          </div>
          {item.description && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.description}</div>
          )}
          {/* Signed-off info */}
          {isSigned && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
              Signed off by <strong>{item.signed_off_by}</strong> on {fmtDate(item.completed_date)}
              {item.notes && <> — {item.notes}</>}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {isSupervisor && !isSigned && (
          <button
            className="btn btn-primary btn-sm"
            style={{ fontSize: 11, flexShrink: 0 }}
            onClick={() => setShowForm(s => !s)}
          >
            {showForm ? 'Cancel' : 'Sign Off Item'}
          </button>
        )}

        {/* Photo add button */}
        <div style={{ flexShrink: 0 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Add photo"
          >
            {uploading ? '⏳' : '📷'} Photo
          </button>
        </div>
      </div>

      {/* ── Inline sign-off form ── */}
      {showForm && !isSigned && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-tertiary, #111)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
            <LabeledField label="Date Completed *">
              <input
                type="date"
                value={form.completed_date}
                onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Done By">
              <select value={form.signed_by} onChange={e => setForm(f => ({ ...f, signed_by: e.target.value }))}>
                <option value="">— Select employee —</option>
                {users.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </LabeledField>
          </div>
          <LabeledField label="Notes — What Was Done">
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Describe what was done for this item…"
              style={{ resize: 'vertical' }}
            />
          </LabeledField>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.completed_date}>
              {saving ? 'Saving…' : 'Confirm Sign-off'}
            </button>
          </div>
        </div>
      )}

      {/* ── Photos ── */}
      {item.photos && item.photos.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {item.photos.map(photo => (
            <div key={photo.id} style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={`/uploads/fleet/${photo.filename}`}
                alt={photo.caption || 'Work photo'}
                style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => window.open(`/uploads/fleet/${photo.filename}`, '_blank')}
                title={photo.caption || photo.uploaded_by_name || 'Click to open full size'}
              />
              {isSupervisor && (
                <button
                  onClick={() => onPhotoDelete(item.id, photo.id)}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    background: '#ef444488', border: 'none', borderRadius: '50%',
                    width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, lineHeight: 1, padding: 0,
                  }}
                  title="Delete photo"
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function emptySignoffForm(item) {
  return {
    completed_date: new Date().toISOString().slice(0, 10),
    labor_hours: '',
    additional_work: '',
    signoff_notes: item?.planned_comments || '',
  };
}

function emptyEditForm(item) {
  return {
    planned_arrival_date: item?.planned_arrival_date
      ? String(item.planned_arrival_date).slice(0, 10)
      : (item?.planned_date ? String(item.planned_date).slice(0, 10) : ''),
    assigned_technician_id: item?.assigned_technician_id ? String(item.assigned_technician_id) : '',
    planned_comments: item?.planned_comments || '',
    items: item?.items?.length
      ? item.items.map(i => ({
          id: i.id,
          template_id: i.template_id ? String(i.template_id) : '',
          title: i.title || '',
          description: i.description || '',
        }))
      : [{ template_id: '', title: '', description: '' }],
  };
}

const EMPTY_PM_ITEM = { template_id: '', title: '', description: '' };

// ═══════════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════════
export default function PlannedMaintenance() {
  const navigate = useNavigate();
  const { isSupervisor, user } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSignoffId, setOpenSignoffId] = useState(null);
  const [openEditId, setOpenEditId] = useState(null);
  const [signoffForm, setSignoffForm] = useState(emptySignoffForm());
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [itemsRes, templatesRes, usersRes] = await Promise.all([
        getFleetPlannedMaintenance(),
        getFleetServiceTemplates(),
        getUsers(),
      ]);
      setItems(itemsRes.data || []);
      setTemplates(templatesRes.data || []);
      setUsers(usersRes.data || []);
    } catch {
      toast.error('Failed to load planned maintenance');
    } finally {
      setLoading(false);
    }
  }

  const plannedItems = useMemo(() => items.filter(i => i.status === 'planned'), [items]);
  const completedItems = useMemo(() => items.filter(i => i.status === 'completed'), [items]);

  // ── Item-level sign-off ───────────────────────────────────────────────────
  async function handleItemSignoff(itemId, form) {
    try {
      const res = await signOffMaintenanceItem(itemId, form);
      setItems(prev => prev.map(pm => ({
        ...pm,
        items: (pm.items || []).map(it => it.id === itemId ? { ...res.data, photos: it.photos || [] } : it),
      })));
      toast.success('Item signed off');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign off item');
      throw err;
    }
  }

  async function handleItemPhotoUpload(itemId, formData) {
    try {
      const res = await uploadMaintenanceItemPhoto(itemId, formData);
      setItems(prev => prev.map(pm => ({
        ...pm,
        items: (pm.items || []).map(it => it.id === itemId ? { ...it, photos: [...(it.photos || []), res.data] } : it),
      })));
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload photo');
      throw err;
    }
  }

  async function handleItemPhotoDelete(itemId, photoId) {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await deleteMaintenanceItemPhoto(itemId, photoId);
      setItems(prev => prev.map(pm => ({
        ...pm,
        items: (pm.items || []).map(it => it.id === itemId ? { ...it, photos: (it.photos || []).filter(p => p.id !== photoId) } : it),
      })));
      toast.success('Photo deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete photo');
    }
  }

  // ── Whole PM sign-off ─────────────────────────────────────────────────────
  function openSignoff(pm) {
    setOpenEditId(null);
    setOpenSignoffId(pm.id);
    setSignoffForm(emptySignoffForm(pm));
  }

  function openEdit(pm) {
    setOpenSignoffId(null);
    setOpenEditId(pm.id);
    setEditForm(emptyEditForm(pm));
  }

  async function handleSignoff(pm) {
    if (!signoffForm.completed_date) { toast.error('Completed date is required'); return; }
    setSaving(true);
    try {
      const res = await signOffFleetPlannedMaintenance(pm.id, { ...signoffForm, signed_by: user?.name || '' });
      setItems(prev => prev.map(e => e.id === pm.id ? res.data : e));
      setOpenSignoffId(null);
      toast.success('Maintenance signed off and logged');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign off maintenance');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(pm) {
    if (!editForm.planned_arrival_date) { toast.error('Planned date of arrival is required'); return; }
    if (!editForm.items || !editForm.items.length) { toast.error('At least one work item is required'); return; }
    for (const it of editForm.items) {
      if (!it.template_id && !it.title.trim()) { toast.error('Each work item needs a service template or a title'); return; }
    }
    setSaving(true);
    try {
      const payload = {
        planned_arrival_date: editForm.planned_arrival_date,
        assigned_technician_id: editForm.assigned_technician_id || null,
        planned_comments: editForm.planned_comments || null,
        items: editForm.items.map(i => ({ id: i.id || null, template_id: i.template_id || null, title: i.title || '', description: i.description || null })),
      };
      const res = await updateFleetPlannedMaintenance(pm.id, payload);
      setItems(prev => prev.map(e => e.id === pm.id ? res.data : e));
      setOpenEditId(null);
      toast.success('Planned maintenance updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update planned maintenance');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pm) {
    if (!window.confirm('Delete this planned maintenance?')) return;
    setSaving(true);
    try {
      await deleteFleetPlannedMaintenance(pm.id);
      setItems(prev => prev.filter(e => e.id !== pm.id));
      if (openEditId === pm.id) setOpenEditId(null);
      if (openSignoffId === pm.id) setOpenSignoffId(null);
      toast.success('Planned maintenance deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete planned maintenance');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Planned Maintenance</div>
          <div className="page-subtitle">
            {plannedItems.length} open item{plannedItems.length === 1 ? '' : 's'} · sign off individual work items as they are completed
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        <>
          {/* ── Open Planned Maintenance ─────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Open Planned Maintenance</span>
            </div>
            {plannedItems.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No planned maintenance scheduled.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {plannedItems.map(pm => {
                  const isSigning = openSignoffId === pm.id;
                  const isEditing = openEditId === pm.id;
                  const pmItems = pm.items || [];
                  const allItemsSigned = pmItems.length > 0 && pmItems.every(i => i.signed_off);
                  const signedCount = pmItems.filter(i => i.signed_off).length;

                  return (
                    <div key={pm.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-secondary)' }}>

                      {/* ── Card header ── */}
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                          {/* Aircraft */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 15 }}>{pm.bw_serial}</span>
                            {pm.registration && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{pm.registration}</span>}
                            {pmItems.length > 0 && (
                              <span style={{
                                padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                                background: allItemsSigned ? '#22c55e22' : '#3b82f622',
                                color: allItemsSigned ? '#22c55e' : '#3b82f6',
                                border: `1px solid ${allItemsSigned ? '#22c55e44' : '#3b82f644'}`,
                              }}>
                                {signedCount}/{pmItems.length} signed
                              </span>
                            )}
                          </div>
                          {/* Date + technician */}
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Arrival: <strong>{fmtDate(pm.planned_arrival_date || pm.planned_date)}</strong>
                            {pm.assigned_technician_name && <> · Technician: <strong>{pm.assigned_technician_name}</strong></>}
                          </div>
                          {/* Customer link */}
                          {pm.customer_name && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                              Customer:{' '}
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 12, padding: '0 4px', display: 'inline' }}
                                onClick={() => navigate(`/customers/${pm.customer_id}`)}
                              >
                                {pm.customer_name} →
                              </button>
                            </div>
                          )}
                          {pm.planned_comments && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{pm.planned_comments}</div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => navigate(`/fleet/${pm.aircraft_id}`)}>
                            View Aircraft
                          </button>
                          {isSupervisor && (
                            <>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => isEditing ? setOpenEditId(null) : openEdit(pm)}>
                                {isEditing ? 'Close Edit' : 'Edit'}
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(pm)} disabled={saving}>
                                Remove
                              </button>
                              {/* "Mark Complete" shows when all items are signed OR there are no items */}
                              {(allItemsSigned || pmItems.length === 0) && (
                                <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => isSigning ? setOpenSignoffId(null) : openSignoff(pm)}>
                                  {isSigning ? 'Close' : allItemsSigned ? '✅ Mark Complete' : 'Sign Off'}
                                </button>
                              )}
                              {/* "Sign Off" button when no items at all */}
                              {pmItems.length > 0 && !allItemsSigned && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: 12 }}
                                  onClick={() => isSigning ? setOpenSignoffId(null) : openSignoff(pm)}
                                >
                                  {isSigning ? 'Close' : 'Force Sign Off'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* ── Work items list (per-item sign-off) ── */}
                      {pmItems.length > 0 && (
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 2 }}>
                            Work Items
                          </div>
                          {pmItems.map(item => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              users={users}
                              currentUser={user}
                              isSupervisor={isSupervisor}
                              onSignoff={handleItemSignoff}
                              onPhotoUpload={handleItemPhotoUpload}
                              onPhotoDelete={handleItemPhotoDelete}
                            />
                          ))}
                        </div>
                      )}

                      {/* ── All items signed banner ── */}
                      {allItemsSigned && !isSigning && (
                        <div style={{
                          margin: '0 16px 14px',
                          padding: '10px 14px', borderRadius: 8,
                          background: '#22c55e18', border: '1px solid #22c55e44',
                          fontSize: 13, color: '#22c55e', fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        }}>
                          <span>✅ All {pmItems.length} items signed off — ready to mark complete</span>
                          {isSupervisor && (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => openSignoff(pm)}>
                              Mark Complete
                            </button>
                          )}
                        </div>
                      )}

                      {/* ── Full PM sign-off form ── */}
                      {isSigning && (
                        <div style={{ margin: '0 16px 16px', padding: '16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary, #111)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                            {allItemsSigned ? 'Complete & Log Maintenance' : 'Sign Off Maintenance'}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                            <LabeledField label="Completed Date *">
                              <input
                                type="date"
                                value={signoffForm.completed_date}
                                onChange={e => setSignoffForm(f => ({ ...f, completed_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Total Hours">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={signoffForm.labor_hours}
                                onChange={e => setSignoffForm(f => ({ ...f, labor_hours: e.target.value }))}
                                placeholder="0.0"
                              />
                            </LabeledField>
                          </div>

                          <LabeledField label="Sign-off Notes" style={{ marginBottom: 10 }}>
                            <textarea
                              rows={3}
                              value={signoffForm.signoff_notes}
                              onChange={e => setSignoffForm(f => ({ ...f, signoff_notes: e.target.value }))}
                              placeholder="Summary of what was completed"
                            />
                          </LabeledField>

                          <LabeledField label="Additional Work Done" style={{ marginBottom: 12 }}>
                            <textarea
                              rows={2}
                              value={signoffForm.additional_work}
                              onChange={e => setSignoffForm(f => ({ ...f, additional_work: e.target.value }))}
                              placeholder="Anything done beyond the original plan"
                            />
                          </LabeledField>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSignoff(pm)}>
                              {saving ? 'Saving…' : 'Confirm & Log to Aircraft'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Edit form ── */}
                      {isEditing && (
                        <div style={{ margin: '0 16px 16px', padding: '16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary, #111)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Edit Planned Maintenance</div>

                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                            <LabeledField label="Planned Date of Arrival *" style={{ flex: '1 1 180px' }}>
                              <input
                                type="date"
                                value={editForm.planned_arrival_date}
                                onChange={e => setEditForm(f => ({ ...f, planned_arrival_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Assigned Technician" style={{ flex: '1 1 180px' }}>
                              <select
                                value={editForm.assigned_technician_id}
                                onChange={e => setEditForm(f => ({ ...f, assigned_technician_id: e.target.value }))}
                              >
                                <option value="">— Unassigned —</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                            </LabeledField>
                          </div>

                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>Work Items</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                            {(editForm.items || []).map((it, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 160px' }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Service Template</span>
                                      <select
                                        value={it.template_id}
                                        onChange={e => setEditForm(f => {
                                          const its = [...f.items];
                                          const tmpl = templates.find(t => String(t.id) === e.target.value);
                                          its[idx] = { ...its[idx], template_id: e.target.value, title: tmpl ? `${tmpl.category} – ${tmpl.title}` : its[idx].title };
                                          return { ...f, items: its };
                                        })}
                                      >
                                        <option value="">— Custom task —</option>
                                        {templates.map(t => <option key={t.id} value={t.id}>{t.category} – {t.title}</option>)}
                                      </select>
                                    </div>
                                    <div style={{ flex: '1 1 160px' }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Title {!it.template_id && <span style={{ color: 'var(--danger)' }}>*</span>}
                                      </span>
                                      <input
                                        value={it.title}
                                        onChange={e => setEditForm(f => { const its = [...f.items]; its[idx] = { ...its[idx], title: e.target.value }; return { ...f, items: its }; })}
                                        placeholder={it.template_id ? 'Optional override' : 'Describe the work'}
                                      />
                                    </div>
                                  </div>
                                  <input
                                    value={it.description}
                                    onChange={e => setEditForm(f => { const its = [...f.items]; its[idx] = { ...its[idx], description: e.target.value }; return { ...f, items: its }; })}
                                    placeholder="Additional notes (optional)"
                                    style={{ fontSize: 13 }}
                                  />
                                </div>
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, padding: '2px 4px', flexShrink: 0 }}
                                  onClick={() => setEditForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                                >×</button>
                              </div>
                            ))}
                          </div>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 13, marginBottom: 12 }}
                            onClick={() => setEditForm(f => ({ ...f, items: [...(f.items || []), { ...EMPTY_PM_ITEM }] }))}
                          >+ Add Work Item</button>

                          <LabeledField label="Overall Comments" style={{ marginBottom: 12 }}>
                            <textarea
                              rows={3}
                              value={editForm.planned_comments}
                              onChange={e => setEditForm(f => ({ ...f, planned_comments: e.target.value }))}
                            />
                          </LabeledField>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSaveEdit(pm)}>
                              {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Completed Maintenance ─────────────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Completed Maintenance</span>
            </div>
            {completedItems.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No maintenance has been signed off yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Aircraft</th>
                      <th>Work Done</th>
                      <th>Customer</th>
                      <th>Planned Arrival</th>
                      <th>Completed</th>
                      <th>Hours</th>
                      <th>Signed Off By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedItems.map(pm => (
                      <tr key={pm.id} onClick={() => navigate(`/fleet/${pm.aircraft_id}`)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 700 }}>
                          {pm.bw_serial}
                          {pm.registration && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pm.registration}</div>}
                        </td>
                        <td>
                          {pm.items && pm.items.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                              {pm.items.map(it => (
                                <li key={it.id}>{it.title || it.template_title || '—'}</li>
                              ))}
                            </ul>
                          ) : (
                            <span>{pm.template_title || '—'}</span>
                          )}
                          {pm.additional_work && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Extra: {pm.additional_work}</div>
                          )}
                        </td>
                        <td>
                          {pm.customer_name ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 12, padding: '0 4px' }}
                              onClick={e => { e.stopPropagation(); navigate(`/customers/${pm.customer_id}`); }}
                            >
                              {pm.customer_name}
                            </button>
                          ) : '–'}
                        </td>
                        <td>{fmtDate(pm.planned_arrival_date || pm.planned_date)}</td>
                        <td>{fmtDate(pm.completed_date)}</td>
                        <td>{pm.labor_hours != null ? `${Number(pm.labor_hours).toFixed(1)} h` : '–'}</td>
                        <td>{pm.signed_off_by || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

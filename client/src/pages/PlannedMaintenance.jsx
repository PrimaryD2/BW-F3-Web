import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteFleetPlannedMaintenance,
  getFleetServiceTemplates,
  getFleetPlannedMaintenance,
  signOffFleetPlannedMaintenance,
  updateFleetPlannedMaintenance,
  editCompletedFleetPlannedMaintenance,
  unlockFleetPlannedMaintenance,
  signOffMaintenanceItem,
  uploadMaintenanceItemPhoto,
  deleteMaintenanceItemPhoto,
  getActiveUsers,
  getCustomers,
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

// ─── Interval warning helper ──────────────────────────────────────────────────
function intervalWarning(templateId, templates, aircraftTsn) {
  if (!templateId || aircraftTsn == null) return null;
  const tmpl = templates.find(t => String(t.id) === String(templateId));
  if (!tmpl || !tmpl.interval_hours) return null;
  const interval = Number(tmpl.interval_hours);
  const tsn = Number(aircraftTsn);
  if (!isFinite(interval) || !isFinite(tsn)) return null;

  if (tmpl.is_one_time) {
    const delta = tsn - interval;
    if (delta > 15)  return { type: 'overdue', msg: `⚠ Aircraft at ${tsn.toFixed(1)} h TSN — this one-time ${interval}h service is ${delta.toFixed(1)} h overdue` };
    if (delta < -15) return { type: 'early',   msg: `ℹ Aircraft at ${tsn.toFixed(1)} h TSN — this ${interval}h service is not due for another ${(-delta).toFixed(1)} h` };
    return null;
  }
  // Recurring: if TSN hasn't reached first interval yet, not overdue
  if (tsn < interval) return null;
  // Next due = floor(tsn/interval)*interval, but minimum is the interval itself
  const lastDue   = Math.max(interval, Math.floor(tsn / interval) * interval);
  const overdueby = tsn - lastDue;
  if (overdueby > 10) {
    return { type: 'overdue', msg: `⚠ Aircraft at ${tsn.toFixed(1)} h TSN — ${interval}h service was due at ${lastDue}h (${overdueby.toFixed(1)} h overdue)` };
  }
  return null;
}

// ─── Single work item row ─────────────────────────────────────────────────────
function ItemRow({ item, users, currentUser, isSupervisor, aircraftTsn, templates, onSignoff, onPhotoUpload, onPhotoDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    completed_date: new Date().toISOString().slice(0, 10),
    signed_by: '',
    notes: '',
    labor_hours: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const isSigned = Boolean(item.signed_off);
  const warn = showForm ? intervalWarning(item.template_id, templates, aircraftTsn) : null;

  async function handleSave() {
    if (!form.completed_date) return;
    if (!form.signed_by) {
      // Can't use toast here, handled via disabled button — just guard
      return;
    }
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
      border: `1px solid ${isSigned ? 'var(--border)' : 'var(--border)'}`,
      background: 'var(--bg-secondary)',
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
            {item.work_category === 'warranty' && (
              <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', fontWeight: 700, verticalAlign: 'middle', textDecoration: 'none' }}>WARRANTY</span>
            )}
          </div>
          {/* Template category / service type label */}
          {item.template_title && item.title && item.title !== item.template_title && (
            <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>
              Template: {item.template_title}
            </div>
          )}
          {/* What needs to be done (description) */}
          {item.description && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, padding: '4px 8px', background: 'rgba(99,102,241,0.07)', borderRadius: 4, borderLeft: '2px solid var(--accent)' }}>
              <strong>Instructions:</strong> {item.description}
            </div>
          )}
          {/* Signed-off info */}
          {isSigned && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              ✅ Done by <strong>{item.signed_off_by}</strong> on {fmtDate(item.completed_date)}
              {item.labor_hours != null && <span> · {Number(item.labor_hours).toFixed(1)} h</span>}
              {item.notes && (
                <div style={{ marginTop: 2, fontStyle: 'italic', color: 'var(--text-muted)' }}>Notes: {item.notes}</div>
              )}
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
        {/* Edit an already signed-off item — change who did it / what was done */}
        {isSupervisor && isSigned && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, flexShrink: 0 }}
            onClick={() => {
              if (!showForm) {
                setForm({
                  completed_date: item.completed_date ? String(item.completed_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
                  signed_by: item.signed_off_by || '',
                  notes: item.notes || '',
                  labor_hours: item.labor_hours != null ? String(item.labor_hours) : '',
                });
              }
              setShowForm(s => !s);
            }}
          >
            {showForm ? 'Cancel' : '✎ Edit'}
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

      {/* ── Inline sign-off / edit form ── */}
      {showForm && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-tertiary, #111)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Interval warning */}
          {warn && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: warn.type === 'overdue' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.1)',
              border: `1px solid ${warn.type === 'overdue' ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.3)'}`,
              fontSize: 12, color: warn.type === 'overdue' ? 'var(--danger)' : 'var(--text-secondary)',
            }}>
              {warn.msg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <LabeledField label="Date Completed *">
              <input
                type="date"
                value={form.completed_date}
                onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Labor Hours">
              <input
                type="number" min="0" step="0.1"
                value={form.labor_hours}
                onChange={e => setForm(f => ({ ...f, labor_hours: e.target.value }))}
                placeholder="0.0"
              />
            </LabeledField>
          </div>
          {/* Done By — one or more people */}
          <LabeledField label="Done By * (select everyone who worked on it)">
            {(() => {
              const selected = new Set((form.signed_by || '').split(',').map(s => s.trim()).filter(Boolean));
              const toggle = (name) => {
                const s = new Set(selected);
                s.has(name) ? s.delete(name) : s.add(name);
                setForm(f => ({ ...f, signed_by: [...s].join(', ') }));
              };
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {users.map(u => {
                    const on = selected.has(u.name);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle(u.name)}
                        style={{
                          fontSize: 12, padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          background: on ? 'var(--accent)' : 'transparent',
                          color: on ? '#fff' : 'var(--text-secondary)', fontWeight: on ? 700 : 400,
                        }}
                      >
                        {on ? '✓ ' : ''}{u.name}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {!form.signed_by && (
              <span style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>Select at least one person</span>
            )}
          </LabeledField>
          <LabeledField label="Notes — What Was Done">
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Describe exactly what was done for this item…"
              style={{ resize: 'vertical' }}
            />
          </LabeledField>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !form.completed_date || !form.signed_by}
            >
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
    signed_by: '',
  };
}

function emptyEditForm(item) {
  return {
    planned_arrival_date: item?.planned_arrival_date
      ? String(item.planned_arrival_date).slice(0, 10)
      : (item?.planned_date ? String(item.planned_date).slice(0, 10) : ''),
    planned_departure_date: item?.planned_departure_date ? String(item.planned_departure_date).slice(0, 10) : '',
    assigned_technicians: item?.assigned_technicians || (item?.assigned_technician_name || ''),
    customer_id: item?.customer_id ? String(item.customer_id) : '',
    planned_comments: item?.planned_comments || '',
    work_order_number: item?.work_order_number || '',
    items: item?.items?.length
      ? item.items.map(i => ({
          id: i.id,
          template_id: i.template_id ? String(i.template_id) : '',
          title: i.title || '',
          description: i.description || '',
          work_category: i.work_category || 'normal',
          signed_off: i.signed_off,
        }))
      : [{ template_id: '', title: '', description: '', work_category: 'normal' }],
  };
}

function emptyCompletedEditForm(item) {
  return {
    completed_date: item?.completed_date ? String(item.completed_date).slice(0, 10) : '',
    labor_hours: item?.labor_hours != null ? String(item.labor_hours) : '',
    signoff_notes: item?.signoff_notes || '',
    additional_work: item?.additional_work || '',
    signed_off_by: item?.signed_off_by || '',
    work_order_number: item?.work_order_number || '',
  };
}

const EMPTY_PM_ITEM = { template_id: '', title: '', description: '', work_category: 'normal' };

// ═══════════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════════
export default function PlannedMaintenance() {
  const navigate = useNavigate();
  const { isSupervisor, isAdmin, user } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSignoffId, setOpenSignoffId] = useState(null);
  const [openEditId, setOpenEditId] = useState(null);
  const [signoffForm, setSignoffForm] = useState(emptySignoffForm());
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [saving, setSaving] = useState(false);

  // Admin: edit completed records
  const [editingCompletedId, setEditingCompletedId] = useState(null);
  const [completedEditForm, setCompletedEditForm] = useState(emptyCompletedEditForm());
  // Completed section is collapsed by default so the page loads fast
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Use Promise.allSettled so a failed users call doesn't block PM data from loading
      const [itemsRes, templatesRes, usersRes, custRes] = await Promise.allSettled([
        getFleetPlannedMaintenance(),
        getFleetServiceTemplates(),
        getActiveUsers(),
        getCustomers(),
      ]);

      if (itemsRes.status === 'fulfilled') setItems(itemsRes.value.data || []);
      else toast.error('Failed to load maintenance records');

      if (templatesRes.status === 'fulfilled') setTemplates(templatesRes.value.data || []);

      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);

      if (custRes.status === 'fulfilled') setCustomers(custRes.value.data || []);
    } catch {
      toast.error('Failed to load planned maintenance');
    } finally {
      setLoading(false);
    }
  }

  const plannedItems  = useMemo(() => items.filter(i => i.status === 'planned'),   [items]);
  const completedItems = useMemo(() => items.filter(i => i.status === 'completed'), [items]);

  // Completed maintenance grouped by aircraft, so the list stays collapsed and fast:
  // each aircraft's visits are only rendered when that aircraft is expanded.
  const completedByAircraft = useMemo(() => {
    const groups = new Map();
    for (const pm of completedItems) {
      if (!groups.has(pm.aircraft_id)) {
        groups.set(pm.aircraft_id, { aircraft_id: pm.aircraft_id, bw_serial: pm.bw_serial, registration: pm.registration, jobs: [] });
      }
      groups.get(pm.aircraft_id).jobs.push(pm);
    }
    return [...groups.values()].sort((a, b) => String(a.bw_serial || '').localeCompare(String(b.bw_serial || ''), undefined, { numeric: true }));
  }, [completedItems]);
  const [expandedCompleted, setExpandedCompleted] = useState(() => new Set());
  const toggleCompletedAircraft = (id) => setExpandedCompleted(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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
    if (!signoffForm.signed_by) { toast.error('Select who is authorizing this maintenance'); return; }

    // Note: the final authorizer may be one of the people who did the work — this is allowed.

    setSaving(true);
    try {
      const res = await signOffFleetPlannedMaintenance(pm.id, signoffForm);
      setItems(prev => prev.map(e => e.id === pm.id ? res.data : e));
      setOpenSignoffId(null);
      toast.success('Maintenance authorized and logged');
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
        planned_departure_date: editForm.planned_departure_date || null,
        assigned_technicians: editForm.assigned_technicians || null,
        customer_id: editForm.customer_id || null,
        planned_comments: editForm.planned_comments || null,
        work_order_number: editForm.work_order_number || null,
        items: editForm.items.map(i => ({ id: i.id || null, template_id: i.template_id || null, title: i.title || '', description: i.description || null, work_category: i.work_category || 'normal' })),
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
    const isCompleted = pm.status === 'completed';
    if (!window.confirm(
      isCompleted
        ? `Delete completed maintenance record for ${pm.bw_serial}? This cannot be undone.`
        : 'Delete this planned maintenance?'
    )) return;
    setSaving(true);
    try {
      await deleteFleetPlannedMaintenance(pm.id);
      setItems(prev => prev.filter(e => e.id !== pm.id));
      if (openEditId === pm.id) setOpenEditId(null);
      if (openSignoffId === pm.id) setOpenSignoffId(null);
      if (editingCompletedId === pm.id) setEditingCompletedId(null);
      toast.success(isCompleted ? 'Completed record deleted' : 'Planned maintenance deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  }

  // ── Print / PDF report for a completed maintenance record ─────────────────

  function printReport(pm) {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Pop-up blocked — please allow pop-ups for this site and try again'); return; }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }

    const pmItems = pm.items || [];
    const catBadge = (cat) => cat === 'warranty'
      ? '<span style="font-size:9px;font-weight:700;color:#2563eb;border:1px solid #2563eb55;border-radius:8px;padding:1px 6px;">WARRANTY</span>'
      : '<span style="font-size:9px;font-weight:700;color:#777;border:1px solid #ccc;border-radius:8px;padding:1px 6px;">Billable</span>';
    let rows;
    let totalItemHours = 0;
    if (pmItems.length > 0) {
      rows = pmItems.map((it, idx) => {
        if (it.labor_hours != null) totalItemHours += Number(it.labor_hours);
        return `
        <tr>
          <td style="width:24px;text-align:center;color:#999;font-size:10px">${idx + 1}</td>
          <td>
            <strong>${esc(it.title || it.template_title || '—')}</strong>
            ${it.description ? `<div style="font-size:10px;color:#777;margin-top:3px">${esc(it.description)}</div>` : ''}
          </td>
          <td style="width:120px">${esc(it.signed_off_by || '—')}</td>
          <td style="width:80px;white-space:nowrap">${it.completed_date ? fmtDate(it.completed_date) : '—'}</td>
          <td style="width:52px;text-align:right;white-space:nowrap">${it.labor_hours != null ? Number(it.labor_hours).toFixed(1) : '—'}</td>
          <td style="width:78px;text-align:center">${catBadge(it.work_category)}</td>
          <td>${esc(it.notes || '—')}</td>
        </tr>
      `;
      }).join('');
    } else if (pm.template_title || pm.signoff_notes || pm.planned_comments) {
      // Fallback for older records that predate the per-item tracking feature
      rows = `
        <tr>
          <td style="width:24px;text-align:center;color:#999;font-size:10px">1</td>
          <td><strong>${esc(pm.template_title || pm.planned_comments || 'Maintenance completed')}</strong>
            ${pm.signoff_notes ? `<div style="font-size:10px;color:#777;margin-top:3px">${esc(pm.signoff_notes)}</div>` : ''}
          </td>
          <td style="width:120px">${esc(pm.signed_off_by || '—')}</td>
          <td style="width:80px;white-space:nowrap">${pm.completed_date ? fmtDate(pm.completed_date) : '—'}</td>
          <td style="width:52px;text-align:right">—</td>
          <td style="width:78px;text-align:center">—</td>
          <td>—</td>
        </tr>
      `;
    } else {
      rows = '';
    }
    // Total labor: prefer summed item hours, fall back to the overall labor_hours field
    const totalLabor = totalItemHours > 0 ? totalItemHours : (pm.labor_hours != null ? Number(pm.labor_hours) : null);
    const woNumber = pm.work_order_number || `#${pm.id}`;

    const plannedDate   = fmtDate(pm.planned_arrival_date || pm.planned_date);
    const completedDate = fmtDate(pm.completed_date);
    const now = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const origin = window.location.origin;

    // Build photos section — group by item, only items that have photos
    const itemsWithPhotos = (pm.items || []).filter(it => it.photos && it.photos.length > 0);
    const photosSection = itemsWithPhotos.length > 0 ? `
<h2>Work Photos</h2>
${itemsWithPhotos.map(it => `
  <div class="photo-group">
    <div class="photo-group-title">${esc(it.title || it.template_title || 'Item')}</div>
    <div class="photo-grid">
      ${it.photos.map(p => `<img src="${origin}/uploads/fleet/${p.filename}" alt="${esc(p.caption || '')}">`).join('')}
    </div>
  </div>
`).join('')}
` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Work Order ${esc(woNumber)} — ${esc(pm.bw_serial)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; padding: 18mm 20mm 15mm; }
  /* ── Toolbar (screen only) ── */
  .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #1a1a1a; color: #fff; padding: 10px 16px;
             display: flex; gap: 10px; align-items: center; justify-content: flex-end; z-index: 99; }
  .toolbar button { font-size: 13px; padding: 7px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .toolbar .b-print { background: #3b82f6; color: #fff; }
  .toolbar .b-close { background: #444; color: #fff; }
  body.has-toolbar { padding-top: 64px; }
  /* ── Brand logo (first row) ── */
  .brand-row { margin-bottom: 14px; }
  /* Logo art is white on transparent — invert renders it solid black for print */
  .brand-row img { height: 34px; width: auto; filter: invert(1); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { .toolbar { display: none !important; } body.has-toolbar { padding-top: 8mm; } }
  h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #555;
       margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  /* ── Document header ── */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start;
                margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; }
  .doc-title h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
  .doc-title .sub { font-size: 10px; color: #777; margin-top: 3px; }
  .doc-ref { text-align: right; font-size: 11px; color: #555; line-height: 1.7; }
  .doc-ref strong { font-size: 13px; color: #1a1a1a; }
  /* ── Info grid ── */
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #ddd; margin-bottom: 4px; }
  .info-cell { padding: 7px 10px; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; }
  .info-cell:nth-child(3n) { border-right: none; }
  .info-cell:nth-last-child(-n+3) { border-bottom: none; }
  .info-cell label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #999; display: block; margin-bottom: 2px; }
  .info-cell .val { font-size: 12px; font-weight: 600; }
  /* ── Work table ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  thead th { background: #f2f2f2; padding: 6px 8px; text-align: left;
             font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
             color: #666; border: 1px solid #ddd; }
  tbody td { padding: 7px 8px; border: 1px solid #e5e5e5; vertical-align: top; font-size: 11px; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  /* ── Extra / notes boxes ── */
  .extra-box { background: #f9f9f9; border-left: 3px solid #bbb; padding: 8px 12px;
               margin-bottom: 14px; font-size: 11px; white-space: pre-wrap; }
  .notes-box { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 3px;
               padding: 9px 12px; font-size: 11px; white-space: pre-wrap; margin-top: 10px; }
  .notes-box label { font-size: 9px; font-weight: 700; text-transform: uppercase;
                     letter-spacing: 0.06em; color: #999; display: block; margin-bottom: 5px; }
  /* ── Sign-off grid ── */
  .signoff-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #ddd; margin-bottom: 14px; }
  .signoff-cell { padding: 8px 10px; border-right: 1px solid #ddd; }
  .signoff-cell:last-child { border-right: none; }
  .signoff-cell label { font-size: 9px; font-weight: 700; text-transform: uppercase;
                        letter-spacing: 0.06em; color: #999; display: block; margin-bottom: 2px; }
  .signoff-cell .val { font-size: 12px; font-weight: 600; }
  /* ── Photos grid ── */
  .photo-group { margin-bottom: 14px; }
  .photo-group-title { font-size: 10px; font-weight: 700; color: #555; margin-bottom: 6px; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .photo-grid img { width: 180px; height: 140px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; page-break-inside: avoid; }
  /* ── Signature lines ── */
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 38px; }
  .sig-line { margin-top: 50px; border-top: 1px solid #333; padding-top: 5px; font-size: 10px; color: #666; }
  /* ── Footer ── */
  .footer { margin-top: 28px; border-top: 1px solid #ddd; padding-top: 7px;
            font-size: 9px; color: #bbb; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 8mm 12mm 8mm; }
    @page { margin: 8mm; size: A4; }
  }
</style>
</head>
<body class="has-toolbar">

<div class="toolbar">
  <span style="margin-right:auto;font-size:12px;color:#bbb">Work Order ${esc(woNumber)} · BW-${esc(pm.bw_serial)}</span>
  <button class="b-print" onclick="window.print()">🖨 Print / Save as PDF</button>
  <button class="b-close" onclick="window.close()">Close</button>
</div>

<div class="brand-row">
  <img src="${origin}/blackwing-logo.png" alt="Blackwing Sweden AB" />
</div>

<div class="doc-header">
  <div class="doc-title">
    <h1>Maintenance Work Order</h1>
    <div class="sub">Service Record</div>
  </div>
  <div class="doc-ref">
    <strong>BW-${esc(pm.bw_serial)}</strong>${pm.registration ? ' · ' + esc(pm.registration) : ''}<br>
    Work Order ${esc(woNumber)}<br>
    Completed: ${completedDate}
  </div>
</div>

<h2>Aircraft</h2>
<div class="info-grid">
  <div class="info-cell"><label>BW Serial</label><div class="val">${esc(pm.bw_serial)}</div></div>
  <div class="info-cell"><label>Registration</label><div class="val">${esc(pm.registration || '—')}</div></div>
  <div class="info-cell"><label>Model</label><div class="val">${esc(pm.model || '—')}</div></div>
  <div class="info-cell"><label>Customer</label><div class="val">${esc(pm.customer_name || '—')}</div></div>
  <div class="info-cell"><label>Planned / Arrival</label><div class="val">${plannedDate}</div></div>
  <div class="info-cell"><label>Completed Date</label><div class="val">${completedDate}</div></div>
</div>

<h2>Work Performed</h2>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Task</th>
      <th>Done By</th>
      <th>Date</th>
      <th style="text-align:right">Hours</th>
      <th style="text-align:center">Billing</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="7" style="text-align:center;color:#999;font-style:italic;padding:14px">No individual work items recorded for this entry</td></tr>'}
    ${totalLabor != null ? `<tr><td colspan="4" style="text-align:right;font-weight:700;border-top:2px solid #ccc">Total Labor</td><td style="text-align:right;font-weight:700;border-top:2px solid #ccc">${totalLabor.toFixed(1)}</td><td colspan="2" style="border-top:2px solid #ccc"></td></tr>` : ''}
  </tbody>
</table>

${pm.additional_work ? `
<h2>Additional Work</h2>
<div class="extra-box">${esc(pm.additional_work)}</div>
` : ''}

${photosSection}

<h2>Sign-off &amp; Authorization</h2>
<div class="signoff-grid">
  <div class="signoff-cell"><label>Labor Hours</label><div class="val">${pm.labor_hours != null ? Number(pm.labor_hours).toFixed(1) + ' h' : '—'}</div></div>
  <div class="signoff-cell"><label>Authorized By</label><div class="val">${esc(pm.signed_off_by || '—')}</div></div>
  <div class="signoff-cell"><label>Sign-off Date</label><div class="val">${completedDate}</div></div>
</div>

${pm.signoff_notes ? `
<div class="notes-box">
  <label>Sign-off Notes</label>
  ${esc(pm.signoff_notes)}
</div>
` : ''}

<div class="sig-row">
  <div><div class="sig-line">Technician Signature &amp; Date</div></div>
  <div><div class="sig-line">Authorized Signature &amp; Date</div></div>
</div>

<div class="footer">
  <span>Blackwing Aircraft Management System</span>
  <span>BW-${esc(pm.bw_serial)} · Work Order ${esc(woNumber)} · ${now}</span>
</div>
</body>
</html>`;

    w.document.write(html);
    w.document.close();
  }

  // ── Admin: edit completed maintenance ─────────────────────────────────────
  function openEditCompleted(pm) {
    setEditingCompletedId(pm.id);
    setCompletedEditForm(emptyCompletedEditForm(pm));
  }

  async function handleSaveEditCompleted(pm) {
    if (!completedEditForm.completed_date) { toast.error('Completed date is required'); return; }
    setSaving(true);
    try {
      const res = await editCompletedFleetPlannedMaintenance(pm.id, completedEditForm);
      setItems(prev => prev.map(e => e.id === pm.id ? res.data : e));
      setEditingCompletedId(null);
      toast.success('Record updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update record');
    } finally {
      setSaving(false);
    }
  }

  // ── Admin: unlock a completed record back to "planned" for full editing ────
  async function handleUnlock(pm) {
    if (!window.confirm(
      `Unlock the completed maintenance for ${pm.bw_serial}?\n\nIt will move back to "Open Planned Maintenance" so you can change work items and what was done. All existing sign-offs, notes and photos are kept.`
    )) return;
    setSaving(true);
    try {
      const res = await unlockFleetPlannedMaintenance(pm.id);
      setItems(prev => prev.map(e => e.id === pm.id ? res.data : e));
      if (editingCompletedId === pm.id) setEditingCompletedId(null);
      toast.success('Maintenance unlocked — now editable under Open Planned Maintenance');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unlock');
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
            {plannedItems.length} open item{plannedItems.length === 1 ? '' : 's'} · sign off individual work items, then authorize the whole maintenance
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
                            {pm.aircraft_tsn != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                {Number(pm.aircraft_tsn).toFixed(1)} h TSN
                              </span>
                            )}
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
                            {pm.planned_departure_date && <> · Leave: <strong>{fmtDate(pm.planned_departure_date)}</strong></>}
                            {(pm.assigned_technicians || pm.assigned_technician_name) && <> · Technician: <strong>{pm.assigned_technicians || pm.assigned_technician_name}</strong></>}
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
                                  {isSigning ? 'Close' : allItemsSigned ? '✅ Authorize & Complete' : 'Sign Off'}
                                </button>
                              )}
                              {/* Force sign-off when items exist but not all signed */}
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
                              aircraftTsn={pm.aircraft_tsn}
                              templates={templates}
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
                          <span>✅ All {pmItems.length} items signed off — ready for authorization</span>
                          {isSupervisor && (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => openSignoff(pm)}>
                              Authorize & Complete
                            </button>
                          )}
                        </div>
                      )}

                      {/* ── Full PM sign-off / authorization form ── */}
                      {isSigning && (
                        <div style={{ margin: '0 16px 16px', padding: '16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary, #111)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                            {allItemsSigned ? 'Authorize & Log Maintenance' : 'Sign Off Maintenance'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                            Confirm the completion details and who is authorizing this maintenance.
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                            <LabeledField label="Completed Date *">
                              <input
                                type="date"
                                value={signoffForm.completed_date}
                                onChange={e => setSignoffForm(f => ({ ...f, completed_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Labor Hours">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={signoffForm.labor_hours}
                                onChange={e => setSignoffForm(f => ({ ...f, labor_hours: e.target.value }))}
                                placeholder="0.0"
                              />
                            </LabeledField>
                            <LabeledField label="Authorized By *">
                              <select
                                value={signoffForm.signed_by}
                                onChange={e => setSignoffForm(f => ({ ...f, signed_by: e.target.value }))}
                                style={{ borderColor: !signoffForm.signed_by ? 'var(--danger)' : undefined }}
                              >
                                <option value="">— Select authorizer —</option>
                                {users.map(u => (
                                  <option key={u.id} value={u.name}>{u.name}</option>
                                ))}
                              </select>
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
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={saving || !signoffForm.signed_by}
                              onClick={() => handleSignoff(pm)}
                            >
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
                                max="9999-12-31"
                                onChange={e => setEditForm(f => ({ ...f, planned_arrival_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Expected Leave / Done Date" style={{ flex: '1 1 180px' }}>
                              <input
                                type="date"
                                value={editForm.planned_departure_date || ''}
                                min={editForm.planned_arrival_date || undefined}
                                max="9999-12-31"
                                onChange={e => setEditForm(f => ({ ...f, planned_departure_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Work Order Number" style={{ flex: '1 1 180px' }}>
                              <input
                                value={editForm.work_order_number}
                                onChange={e => setEditForm(f => ({ ...f, work_order_number: e.target.value }))}
                                placeholder="e.g. WO-2026-014"
                              />
                            </LabeledField>
                            <LabeledField label="Customer" style={{ flex: '1 1 180px' }}>
                              <select
                                value={editForm.customer_id}
                                onChange={e => setEditForm(f => ({ ...f, customer_id: e.target.value }))}
                              >
                                <option value="">— None —</option>
                                {customers.map(c => (
                                  <option key={c.id} value={c.id}>{c.full_name}{c.company_name ? ` (${c.company_name})` : ''}</option>
                                ))}
                              </select>
                            </LabeledField>
                          </div>
                          <LabeledField label="Assigned Technician(s)" style={{ marginBottom: 12 }}>
                            {(() => {
                              const selected = new Set((editForm.assigned_technicians || '').split(',').map(s => s.trim()).filter(Boolean));
                              const toggle = (name) => {
                                const s = new Set(selected);
                                s.has(name) ? s.delete(name) : s.add(name);
                                setEditForm(f => ({ ...f, assigned_technicians: [...s].join(', ') }));
                              };
                              return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {users.map(u => {
                                    const on = selected.has(u.name);
                                    return (
                                      <button key={u.id} type="button" onClick={() => toggle(u.name)}
                                        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                          background: on ? 'var(--accent)' : 'transparent',
                                          color: on ? '#fff' : 'var(--text-secondary)', fontWeight: on ? 700 : 400 }}
                                      >{on ? '✓ ' : ''}{u.name}</button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </LabeledField>

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
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <input
                                      value={it.description}
                                      onChange={e => setEditForm(f => { const its = [...f.items]; its[idx] = { ...its[idx], description: e.target.value }; return { ...f, items: its }; })}
                                      placeholder="Instructions / what needs to be done (optional)"
                                      style={{ fontSize: 13, flex: '1 1 200px' }}
                                    />
                                    <div style={{ flex: '0 0 150px' }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Billing</span>
                                      <select
                                        value={it.work_category || 'normal'}
                                        onChange={e => setEditForm(f => { const its = [...f.items]; its[idx] = { ...its[idx], work_category: e.target.value }; return { ...f, items: its }; })}
                                      >
                                        <option value="normal">Normal (billable)</option>
                                        <option value="warranty">Warranty (no charge)</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--border)' : 'var(--text-secondary)', fontSize: 14, padding: '0 4px' }}
                                    disabled={idx === 0}
                                    onClick={() => setEditForm(f => { const its = [...f.items]; [its[idx-1], its[idx]] = [its[idx], its[idx-1]]; return { ...f, items: its }; })}
                                    title="Move up"
                                  >▲</button>
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: idx === (editForm.items.length - 1) ? 'default' : 'pointer', color: idx === (editForm.items.length - 1) ? 'var(--border)' : 'var(--text-secondary)', fontSize: 14, padding: '0 4px' }}
                                    disabled={idx === (editForm.items.length - 1)}
                                    onClick={() => setEditForm(f => { const its = [...f.items]; [its[idx+1], its[idx]] = [its[idx], its[idx+1]]; return { ...f, items: its }; })}
                                    title="Move down"
                                  >▼</button>
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, padding: '2px 4px' }}
                                    onClick={() => setEditForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                                    title="Remove item"
                                  >×</button>
                                </div>
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
            <div
              className="card-header"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => setShowCompleted(s => !s)}
            >
              <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 16, display: 'inline-block' }}>{showCompleted ? '▼' : '▶'}</span>
              <span className="card-title">Completed Maintenance</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                ({completedItems.length})
              </span>
              {!showCompleted && completedItems.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)' }}>Show</span>
              )}
            </div>
            {!showCompleted ? null : completedItems.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No maintenance has been signed off yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {completedByAircraft.map(group => {
                  const acOpen = expandedCompleted.has(group.aircraft_id);
                  return (
                  <div key={group.aircraft_id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleCompletedAircraft(group.aircraft_id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: 'var(--bg-secondary)' }}
                    >
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 14, display: 'inline-block' }}>{acOpen ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{group.bw_serial}</span>
                      {group.registration && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.registration}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{group.jobs.length} visit{group.jobs.length === 1 ? '' : 's'}</span>
                    </div>
                    {acOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderTop: '1px solid var(--border)' }}>
                        {group.jobs.map(pm => {
                  const isEditingThis = editingCompletedId === pm.id;
                  return (
                    <div key={pm.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {/* Row */}
                      <div
                        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', padding: '12px 14px', cursor: 'pointer' }}
                        onClick={() => navigate(`/fleet/${pm.aircraft_id}?tab=Maintenance`)}
                      >
                        {/* Aircraft */}
                        <div style={{ minWidth: 110, flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{pm.bw_serial}</div>
                          {pm.registration && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pm.registration}</div>}
                        </div>

                        {/* Work done */}
                        <div style={{ flex: 2, minWidth: 180 }}>
                          {pm.items && pm.items.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {pm.items.map(it => (
                                <div key={it.id} style={{ fontSize: 13 }}>
                                  <span style={{ fontWeight: 500 }}>{it.title || it.template_title || '—'}</span>
                                  {it.signed_off_by && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                                      (done by {it.signed_off_by})
                                    </span>
                                  )}
                                  {it.notes && (
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, fontStyle: 'italic' }}>
                                      {it.notes}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 13 }}>{pm.template_title || '—'}</span>
                          )}
                          {pm.signoff_notes && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{pm.signoff_notes}</div>
                          )}
                          {pm.additional_work && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Extra: {pm.additional_work}</div>
                          )}
                          {/* Photos for completed records */}
                          {(pm.items || []).some(it => it.photos && it.photos.length > 0) && (
                            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {(pm.items || []).flatMap(it => (it.photos || []).map(p => ({ ...p, itemTitle: it.title || it.template_title }))).map(photo => (
                                <img
                                  key={photo.id}
                                  src={`/uploads/fleet/${photo.filename}`}
                                  alt={photo.itemTitle || 'Work photo'}
                                  title={photo.itemTitle || photo.caption || 'Click to open'}
                                  style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                                  onClick={e => { e.stopPropagation(); window.open(`/uploads/fleet/${photo.filename}`, '_blank'); }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Customer */}
                        <div style={{ minWidth: 100, flexShrink: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {pm.customer_name ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 12, padding: '0 4px' }}
                              onClick={e => { e.stopPropagation(); navigate(`/customers/${pm.customer_id}`); }}
                            >
                              {pm.customer_name}
                            </button>
                          ) : '–'}
                        </div>

                        {/* Dates + signer */}
                        <div style={{ minWidth: 160, flexShrink: 0, fontSize: 12 }}>
                          {pm.work_order_number && (
                            <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 2 }}>
                              WO {pm.work_order_number}
                            </div>
                          )}
                          <div style={{ color: 'var(--text-secondary)' }}>
                            Planned: {fmtDate(pm.planned_arrival_date || pm.planned_date)}
                          </div>
                          <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                            Completed: <strong>{fmtDate(pm.completed_date)}</strong>
                          </div>
                          {pm.labor_hours != null && (
                            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                              {Number(pm.labor_hours).toFixed(1)} h labor
                            </div>
                          )}
                          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                            Authorized: {pm.signed_off_by || '–'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ flexShrink: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11 }}
                            title="Print / Save as PDF"
                            onClick={() => printReport(pm)}
                          >
                            🖨 Print
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11 }}
                                onClick={() => isEditingThis ? setEditingCompletedId(null) : openEditCompleted(pm)}
                              >
                                {isEditingThis ? 'Cancel' : 'Edit'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11, color: 'var(--accent)' }}
                                onClick={() => handleUnlock(pm)}
                                disabled={saving}
                                title="Move back to Planned so work items and sign-offs can be changed"
                              >
                                🔓 Unlock
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11, color: 'var(--danger)' }}
                                onClick={() => handleDelete(pm)}
                                disabled={saving}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Admin edit form for completed record */}
                      {isEditingThis && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg-tertiary, #111)' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Edit Completed Record</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
                            <LabeledField label="Completed Date *">
                              <input
                                type="date"
                                value={completedEditForm.completed_date}
                                onChange={e => setCompletedEditForm(f => ({ ...f, completed_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Labor Hours">
                              <input
                                type="number" step="0.1" min="0"
                                value={completedEditForm.labor_hours}
                                onChange={e => setCompletedEditForm(f => ({ ...f, labor_hours: e.target.value }))}
                                placeholder="0.0"
                              />
                            </LabeledField>
                            <LabeledField label="Authorized By">
                              <select
                                value={completedEditForm.signed_off_by}
                                onChange={e => setCompletedEditForm(f => ({ ...f, signed_off_by: e.target.value }))}
                              >
                                <option value="">— Select person —</option>
                                {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                              </select>
                            </LabeledField>
                            <LabeledField label="Work Order Number">
                              <input
                                value={completedEditForm.work_order_number}
                                onChange={e => setCompletedEditForm(f => ({ ...f, work_order_number: e.target.value }))}
                                placeholder="e.g. WO-2026-014"
                              />
                            </LabeledField>
                          </div>
                          <LabeledField label="Sign-off Notes" style={{ marginBottom: 10 }}>
                            <textarea
                              rows={2}
                              value={completedEditForm.signoff_notes}
                              onChange={e => setCompletedEditForm(f => ({ ...f, signoff_notes: e.target.value }))}
                            />
                          </LabeledField>
                          <LabeledField label="Additional Work" style={{ marginBottom: 12 }}>
                            <textarea
                              rows={2}
                              value={completedEditForm.additional_work}
                              onChange={e => setCompletedEditForm(f => ({ ...f, additional_work: e.target.value }))}
                            />
                          </LabeledField>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingCompletedId(null)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSaveEditCompleted(pm)}>
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
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

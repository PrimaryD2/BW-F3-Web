import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteFleetPlannedMaintenance,
  getFleetServiceTemplates,
  getFleetPlannedMaintenance,
  signOffFleetPlannedMaintenance,
  updateFleetPlannedMaintenance,
  editCompletedFleetPlannedMaintenance,
  signOffMaintenanceItem,
  uploadMaintenanceItemPhoto,
  deleteMaintenanceItemPhoto,
  getActiveUsers,
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
            <LabeledField label="Date Completed *">
              <input
                type="date"
                value={form.completed_date}
                onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Done By *">
              <select
                value={form.signed_by}
                onChange={e => setForm(f => ({ ...f, signed_by: e.target.value }))}
                style={{ borderColor: !form.signed_by ? 'var(--danger)' : undefined }}
              >
                <option value="">— Select employee —</option>
                {users.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
              {!form.signed_by && (
                <span style={{ fontSize: 10, color: 'var(--danger)', marginTop: -4 }}>Required</span>
              )}
            </LabeledField>
          </div>
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

function emptyCompletedEditForm(item) {
  return {
    completed_date: item?.completed_date ? String(item.completed_date).slice(0, 10) : '',
    labor_hours: item?.labor_hours != null ? String(item.labor_hours) : '',
    signoff_notes: item?.signoff_notes || '',
    additional_work: item?.additional_work || '',
    signed_off_by: item?.signed_off_by || '',
  };
}

const EMPTY_PM_ITEM = { template_id: '', title: '', description: '' };

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
  const [loading, setLoading] = useState(true);
  const [openSignoffId, setOpenSignoffId] = useState(null);
  const [openEditId, setOpenEditId] = useState(null);
  const [signoffForm, setSignoffForm] = useState(emptySignoffForm());
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [saving, setSaving] = useState(false);

  // Admin: edit completed records
  const [editingCompletedId, setEditingCompletedId] = useState(null);
  const [completedEditForm, setCompletedEditForm] = useState(emptyCompletedEditForm());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Use Promise.allSettled so a failed users call doesn't block PM data from loading
      const [itemsRes, templatesRes, usersRes] = await Promise.allSettled([
        getFleetPlannedMaintenance(),
        getFleetServiceTemplates(),
        getActiveUsers(),
      ]);

      if (itemsRes.status === 'fulfilled') setItems(itemsRes.value.data || []);
      else toast.error('Failed to load maintenance records');

      if (templatesRes.status === 'fulfilled') setTemplates(templatesRes.value.data || []);

      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);
    } catch {
      toast.error('Failed to load planned maintenance');
    } finally {
      setLoading(false);
    }
  }

  const plannedItems  = useMemo(() => items.filter(i => i.status === 'planned'),   [items]);
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
    if (!signoffForm.signed_by) { toast.error('Select who is authorizing this maintenance'); return; }

    // Double sign-off check: authorizer must not be the same person who signed off any work item
    const itemSigners = new Set((pm.items || []).map(it => it.signed_off_by).filter(Boolean));
    if (itemSigners.has(signoffForm.signed_by)) {
      toast.error(`${signoffForm.signed_by} already signed off work items — a different person must authorize the maintenance`);
      return;
    }

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
  // Blackwing BW mark — embedded as base64 so it works without any server/file access
  const BW_LOGO_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAAD2e2DtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAE7mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDIgNzkuYjdjNjRjYywgMjAyNC8wNy8xNi0wNzo1OTo0MCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI2LjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNC0xMC0zMFQyMDoyMTo0MiswMTowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjQtMTAtMzBUMjA6MjI6MTkrMDE6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjQtMTAtMzBUMjA6MjI6MTkrMDE6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIxIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjc2MjgyNTkyLTdkZjktNmE0Ny1hMzM1LWY1YzE4ZjMyYWExYyIgeG1wTU06RG9jdW1lbnRJRD0i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';

  function printReport(pm) {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Pop-up blocked — please allow pop-ups for this site and try again'); return; }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }

    const pmItems = pm.items || [];
    let rows;
    if (pmItems.length > 0) {
      rows = pmItems.map((it, idx) => `
        <tr>
          <td style="width:24px;text-align:center;color:#999;font-size:10px">${idx + 1}</td>
          <td>
            <strong>${esc(it.title || it.template_title || '—')}</strong>
            ${it.description ? `<div style="font-size:10px;color:#777;margin-top:3px">${esc(it.description)}</div>` : ''}
          </td>
          <td style="width:130px">${esc(it.signed_off_by || '—')}</td>
          <td style="width:90px;white-space:nowrap">${it.completed_date ? fmtDate(it.completed_date) : '—'}</td>
          <td>${esc(it.notes || '—')}</td>
        </tr>
      `).join('');
    } else if (pm.template_title || pm.signoff_notes || pm.planned_comments) {
      // Fallback for older records that predate the per-item tracking feature
      rows = `
        <tr>
          <td style="width:24px;text-align:center;color:#999;font-size:10px">1</td>
          <td><strong>${esc(pm.template_title || pm.planned_comments || 'Maintenance completed')}</strong>
            ${pm.signoff_notes ? `<div style="font-size:10px;color:#777;margin-top:3px">${esc(pm.signoff_notes)}</div>` : ''}
          </td>
          <td style="width:130px">${esc(pm.signed_off_by || '—')}</td>
          <td style="width:90px;white-space:nowrap">${pm.completed_date ? fmtDate(pm.completed_date) : '—'}</td>
          <td>—</td>
        </tr>
      `;
    } else {
      rows = '';
    }

    const plannedDate   = fmtDate(pm.planned_arrival_date || pm.planned_date);
    const completedDate = fmtDate(pm.completed_date);
    const now = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Work Order #${pm.id} — ${esc(pm.bw_serial)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; padding: 18mm 20mm 15mm; }
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
<body>

<div class="doc-header">
  <div class="doc-title" style="display:flex;align-items:center;gap:14px;">
    <img src="${BW_LOGO_B64}" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;" alt="BW">
    <div>
      <h1 style="margin:0;">Maintenance Work Order</h1>
      <div class="sub">Blackwing Aircraft · Service Record</div>
    </div>
  </div>
  <div class="doc-ref">
    <strong>BW-${esc(pm.bw_serial)}</strong>${pm.registration ? ' · ' + esc(pm.registration) : ''}<br>
    Work Order #${pm.id}<br>
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
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="5" style="text-align:center;color:#999;font-style:italic;padding:14px">No individual work items recorded for this entry</td></tr>'}
  </tbody>
</table>

${pm.additional_work ? `
<h2>Additional Work</h2>
<div class="extra-box">${esc(pm.additional_work)}</div>
` : ''}

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
  <span>BW-${esc(pm.bw_serial)} · Work Order #${pm.id} · ${now}</span>
</div>

<script>window.onload = function() { window.print(); };<\/script>
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
                  const itemSigners = new Set(pmItems.map(it => it.signed_off_by).filter(Boolean));

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
                            The authorizing person must be different from whoever signed off individual work items.
                          </div>

                          {/* Double-sign warning: list who signed items */}
                          {itemSigners.size > 0 && (
                            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.25)', fontSize: 12 }}>
                              Work items signed by: <strong>{[...itemSigners].join(', ')}</strong>
                              {' '}— the authorizer below must be a different person.
                            </div>
                          )}

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
                                style={{ borderColor: !signoffForm.signed_by ? 'var(--danger)' : (itemSigners.has(signoffForm.signed_by) ? '#f59e0b' : undefined) }}
                              >
                                <option value="">— Select authorizer —</option>
                                {users.map(u => {
                                  const isItemSigner = itemSigners.has(u.name);
                                  return (
                                    <option key={u.id} value={u.name} disabled={isItemSigner}>
                                      {u.name}{isItemSigner ? ' (signed work items)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              {signoffForm.signed_by && itemSigners.has(signoffForm.signed_by) && (
                                <span style={{ fontSize: 10, color: '#f59e0b', marginTop: -4 }}>
                                  This person signed work items — must be a different person
                                </span>
                              )}
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
                              disabled={saving || !signoffForm.signed_by || itemSigners.has(signoffForm.signed_by)}
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
                                    placeholder="Instructions / what needs to be done (optional)"
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {completedItems.map(pm => {
                  const isEditingThis = editingCompletedId === pm.id;
                  return (
                    <div key={pm.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {/* Row */}
                      <div
                        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', padding: '12px 14px', cursor: 'pointer' }}
                        onClick={() => navigate(`/fleet/${pm.aircraft_id}`)}
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
        </>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteFleetPlannedMaintenance,
  getFleetServiceTemplates,
  getFleetPlannedMaintenance,
  signOffFleetPlannedMaintenance,
  updateFleetPlannedMaintenance,
  getUsers,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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

function LabeledField({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

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

  useEffect(() => {
    load();
  }, []);

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

  const plannedItems = useMemo(() => items.filter(item => item.status === 'planned'), [items]);
  const completedItems = useMemo(() => items.filter(item => item.status === 'completed'), [items]);

  function openSignoff(item) {
    setOpenEditId(null);
    setOpenSignoffId(item.id);
    setSignoffForm(emptySignoffForm(item));
  }

  function openEdit(item) {
    setOpenSignoffId(null);
    setOpenEditId(item.id);
    setEditForm(emptyEditForm(item));
  }

  async function handleSignoff(item) {
    if (!signoffForm.completed_date) {
      toast.error('Completed date is required');
      return;
    }

    setSaving(true);
    try {
      const res = await signOffFleetPlannedMaintenance(item.id, {
        ...signoffForm,
        signed_by: user?.name || '',
      });
      setItems(prev => prev.map(entry => entry.id === item.id ? res.data : entry));
      setOpenSignoffId(null);
      toast.success('Maintenance signed off');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign off maintenance');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(item) {
    if (!editForm.planned_arrival_date) {
      toast.error('Planned date of arrival is required');
      return;
    }
    const hasItems = editForm.items && editForm.items.length > 0;
    if (!hasItems) {
      toast.error('At least one work item is required');
      return;
    }
    for (const it of editForm.items) {
      if (!it.template_id && !it.title.trim()) {
        toast.error('Each work item needs a service template or a title');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        planned_arrival_date: editForm.planned_arrival_date,
        assigned_technician_id: editForm.assigned_technician_id || null,
        planned_comments: editForm.planned_comments || null,
        items: editForm.items.map(i => ({
          id: i.id || null,
          template_id: i.template_id || null,
          title: i.title || '',
          description: i.description || null,
        })),
      };
      const res = await updateFleetPlannedMaintenance(item.id, payload);
      setItems(prev => prev.map(entry => entry.id === item.id ? res.data : entry));
      setOpenEditId(null);
      toast.success('Planned maintenance updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update planned maintenance');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm('Delete this planned maintenance item?')) return;
    setSaving(true);
    try {
      await deleteFleetPlannedMaintenance(item.id);
      setItems(prev => prev.filter(entry => entry.id !== item.id));
      if (openEditId === item.id) setOpenEditId(null);
      if (openSignoffId === item.id) setOpenSignoffId(null);
      toast.success('Planned maintenance deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete planned maintenance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Planned Maintenance</div>
          <div className="page-subtitle">{plannedItems.length} open item{plannedItems.length === 1 ? '' : 's'} ready to track and sign off</div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Open Planned Maintenance</span>
            </div>
            {plannedItems.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No planned maintenance has been scheduled yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {plannedItems.map(pm => {
                  const isSigning = openSignoffId === pm.id;
                  const isEditing = openEditId === pm.id;
                  const pmItems = pm.items || [];

                  return (
                    <div key={pm.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg-secondary)' }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                          {/* Aircraft header */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontWeight: 800 }}>{pm.bw_serial}</span>
                            {pm.registration && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{pm.registration}</span>}
                            <span className="badge badge-info" style={{ fontSize: 10 }}>
                              {pmItems.length > 0 ? `${pmItems.length} item${pmItems.length !== 1 ? 's' : ''}` : (pm.category || 'General')}
                            </span>
                          </div>

                          {/* Date + technician */}
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            Arrival: <strong>{fmtDate(pm.planned_arrival_date || pm.planned_date)}</strong>
                            {pm.assigned_technician_name && (
                              <> · <span>Technician: {pm.assigned_technician_name}</span></>
                            )}
                          </div>

                          {/* Work items list */}
                          {pmItems.length > 0 ? (
                            <ul style={{ margin: '0 0 6px 18px', padding: 0, fontSize: 13 }}>
                              {pmItems.map(it => (
                                <li key={it.id} style={{ marginBottom: 3 }}>
                                  <span style={{ fontWeight: 600 }}>{it.title || it.template_title || '—'}</span>
                                  {it.description && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> — {it.description}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : pm.template_title ? (
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{pm.template_title}</div>
                          ) : null}

                          {pm.planned_comments && (
                            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                              {pm.planned_comments}
                            </div>
                          )}
                        </div>

                        {isSupervisor && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => isEditing ? setOpenEditId(null) : openEdit(pm)}>
                              {isEditing ? 'Close Edit' : 'Edit'}
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(pm)} disabled={saving}>
                              Remove
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={() => isSigning ? setOpenSignoffId(null) : openSignoff(pm)}>
                              {isSigning ? 'Close' : 'Sign Off'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── Edit form ────────────────────────────────────────── */}
                      {isEditing && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                            <LabeledField label="Planned Date of Arrival *">
                              <input
                                type="date"
                                value={editForm.planned_arrival_date}
                                onChange={e => setEditForm(f => ({ ...f, planned_arrival_date: e.target.value }))}
                                style={{ flex: '1 1 180px' }}
                              />
                            </LabeledField>
                            <LabeledField label="Assigned Technician">
                              <select
                                value={editForm.assigned_technician_id}
                                onChange={e => setEditForm(f => ({ ...f, assigned_technician_id: e.target.value }))}
                                style={{ flex: '1 1 180px' }}
                              >
                                <option value="">— Unassigned —</option>
                                {users.map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </LabeledField>
                          </div>

                          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                            Work Items
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                            {(editForm.items || []).map((it, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-hover)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 180px' }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Service Template</span>
                                      <select
                                        value={it.template_id}
                                        onChange={e => setEditForm(f => {
                                          const its = [...f.items];
                                          const tmpl = templates.find(t => String(t.id) === e.target.value);
                                          its[idx] = { ...its[idx], template_id: e.target.value, title: tmpl ? `${tmpl.category} - ${tmpl.title}` : its[idx].title };
                                          return { ...f, items: its };
                                        })}
                                      >
                                        <option value="">— Custom task —</option>
                                        {templates.map(t => (
                                          <option key={t.id} value={t.id}>{t.category} - {t.title}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div style={{ flex: '1 1 180px' }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Title {!it.template_id && <span style={{ color: 'var(--danger)' }}>*</span>}
                                      </span>
                                      <input
                                        value={it.title}
                                        onChange={e => setEditForm(f => {
                                          const its = [...f.items];
                                          its[idx] = { ...its[idx], title: e.target.value };
                                          return { ...f, items: its };
                                        })}
                                        placeholder={it.template_id ? 'Optional override' : 'Describe the work'}
                                      />
                                    </div>
                                  </div>
                                  <input
                                    value={it.description}
                                    onChange={e => setEditForm(f => {
                                      const its = [...f.items];
                                      its[idx] = { ...its[idx], description: e.target.value };
                                      return { ...f, items: its };
                                    })}
                                    placeholder="Additional notes (optional)"
                                    style={{ fontSize: 13 }}
                                  />
                                </div>
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, padding: '2px 4px', flexShrink: 0 }}
                                  onClick={() => setEditForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                                  title="Remove item"
                                >×</button>
                              </div>
                            ))}
                          </div>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 13, marginBottom: 14 }}
                            onClick={() => setEditForm(f => ({ ...f, items: [...(f.items || []), { ...EMPTY_PM_ITEM }] }))}
                          >
                            + Add Work Item
                          </button>

                          <LabeledField label="Overall Comments">
                            <textarea
                              rows={3}
                              value={editForm.planned_comments}
                              onChange={e => setEditForm(f => ({ ...f, planned_comments: e.target.value }))}
                            />
                          </LabeledField>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSaveEdit(pm)}>
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Sign-off form ────────────────────────────────────── */}
                      {isSigning && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                          {/* Show items checklist summary */}
                          {pmItems.length > 0 && (
                            <div style={{ marginBottom: 14, background: 'var(--bg-hover)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                                Work to be Signed Off
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                                {pmItems.map(it => (
                                  <li key={it.id} style={{ marginBottom: 3 }}>
                                    {it.title || it.template_title || '—'}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                            <LabeledField label="Completed Date *">
                              <input
                                type="date"
                                value={signoffForm.completed_date}
                                onChange={e => setSignoffForm(f => ({ ...f, completed_date: e.target.value }))}
                              />
                            </LabeledField>
                            <LabeledField label="Hours It Took">
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

                          <LabeledField label="Sign-off Notes">
                            <textarea
                              rows={3}
                              style={{ marginTop: 14 }}
                              value={signoffForm.signoff_notes}
                              onChange={e => setSignoffForm(f => ({ ...f, signoff_notes: e.target.value }))}
                              placeholder="What was completed?"
                            />
                          </LabeledField>

                          <LabeledField label="Additional Work Done">
                            <textarea
                              rows={3}
                              style={{ marginTop: 14 }}
                              value={signoffForm.additional_work}
                              onChange={e => setSignoffForm(f => ({ ...f, additional_work: e.target.value }))}
                              placeholder="Anything done beyond the original plan"
                            />
                          </LabeledField>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/fleet/${pm.aircraft_id}`)}>
                              Open Aircraft
                            </button>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSignoff(pm)}>
                              {saving ? 'Saving...' : 'Confirm Sign-off'}
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

          <div className="card">
            <div className="card-header">
              <span className="card-title">Signed-off Maintenance</span>
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
                            <div>{pm.template_title || '—'}</div>
                          )}
                          {pm.additional_work && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Extra: {pm.additional_work}</div>
                          )}
                        </td>
                        <td>{fmtDate(pm.planned_arrival_date || pm.planned_date)}</td>
                        <td>{fmtDate(pm.completed_date)}</td>
                        <td>{pm.labor_hours != null ? `${Number(pm.labor_hours).toFixed(1)} h` : '-'}</td>
                        <td>{pm.signed_off_by || '-'}</td>
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

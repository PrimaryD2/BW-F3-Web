import React, { useEffect, useState } from 'react';
import {
  getUsers, createUser, updateUser,
  getTaskTemplates, getStations, createTemplate, updateTemplate,
  getAuditLog,
  getFleetModelsAdmin, createFleetModel, updateFleetModel, deleteFleetModel,
  getFleetBulletins, getFleetBulletin, createFleetBulletin, updateFleetBulletin, deleteFleetBulletin,
  getFleetBulletinAircraft, resolveFleetBulletinAircraft,
  getFleetConfigOptions, createFleetConfigOption, updateFleetConfigOption, deleteFleetConfigOption,
  getFleetServiceTemplates, createFleetServiceTemplate, updateFleetServiceTemplate, deleteFleetServiceTemplate,
  getFleetEventTypes, createFleetEventType, updateFleetEventType, deleteFleetEventType,
  getComponentTypes, createComponentType, updateComponentType, deleteComponentType,
} from '../api';
import { useToast } from '../context/ToastContext';

const ROLE_BADGE = { admin: 'badge-danger', supervisor: 'badge-warning', worker: 'badge-success' };
const TABS = ['Users', 'Models', 'Bulletins', 'Configuration Config', 'Service Templates', 'Event Types', 'Component Types'];
const FORM_TABS = ['Setup', 'Documentation', 'Materials'];

const CONFIG_CATEGORIES = ['Engine', 'Propeller', 'Avionics', 'Interior', 'Paint'];

export default function AdminPanel() {
  const [tab, setTab] = useState(0);
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin Panel</div>
          <div className="page-subtitle">Manage users, configuration options, and service templates</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              background: 'none', border: 'none', padding: '10px 20px', cursor: 'pointer',
              color: tab === i ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === i ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === i ? 700 : 500, fontSize: 14, marginBottom: -1,
            }}
          >{t}</button>
        ))}
      </div>

      {tab === 0 && <UsersTab />}
      {tab === 1 && <ModelsTab />}
      {tab === 2 && <BulletinsTab />}
      {tab === 3 && <FleetConfigTab />}
      {tab === 4 && <ServiceTemplatesSection />}
      {tab === 5 && <EventTypesSection />}
      {tab === 6 && <ComponentTypesSection />}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const toast = useToast();
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]         = useState({ name: '', username: '', password: '', role: 'worker' });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const r = await getUsers(); setUsers(r.data); }
    finally { setLoading(false); }
  }

  function openCreate() { setForm({ name: '', username: '', password: '', role: 'worker' }); setError(''); setCreate(true); }
  function openEdit(u)  { setForm({ name: u.name, role: u.role, active: u.active, password: '' }); setError(''); setEditUser(u); }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name || !form.username || !form.password) { setError('All fields required'); return; }
    setSaving(true); setError('');
    try {
      await createUser(form);
      toast.success('User created.');
      setCreate(false); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally { setSaving(false); }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { name: form.name, role: form.role, active: form.active };
      if (form.password) payload.password = form.password;
      await updateUser(editUser.id, payload);
      toast.success('User updated.');
      setEditUser(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openCreate}>+ New User</button>
      </div>
      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.username}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role]}`}>{u.role}</span></td>
                    <td><span className={`badge ${u.active ? 'badge-success' : 'badge-ghost'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create New User</div>
            <form onSubmit={handleCreate}>
              <div className="form-row form-row-2">
                <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
                <div className="form-group"><label>Username *</label><input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label>Password *</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="worker">Worker</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>User will be required to change password on first login.</p>
              {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit User — {editUser.username}</div>
            <form onSubmit={handleUpdate}>
              <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="worker">Worker</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.active ? '1' : '0'} onChange={e => setForm(f => ({ ...f, active: e.target.value === '1' }))}>
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Reset Password (leave blank to keep)</label><input type="password" placeholder="New password…" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
              {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Template Form Modal ───────────────────────────────────────────────────────
// Defined OUTSIDE TemplatesTab so React never sees a new component type on
// re-render (which would unmount/remount the form and lose focus every keystroke).
function TemplateFormModal({
  editTpl, showCreate, stations,
  form, setForm,
  formTab, setFormTab,
  saving, error,
  onSubmit, onClose,
}) {
  if (!showCreate && !editTpl) return null;

  const F    = form;
  const setF = (patch) => setForm(f => typeof patch === 'function' ? patch(f) : { ...f, ...patch });

  function addKit()          { setF(f => ({ ...f, kits_required: [...f.kits_required, { kit_number: '', description: '' }] })); }
  function removeKit(i)      { setF(f => ({ ...f, kits_required: f.kits_required.filter((_, j) => j !== i) })); }
  function setKit(i, fld, v) { setF(f => { const k = [...f.kits_required]; k[i] = { ...k[i], [fld]: v }; return { ...f, kits_required: k }; }); }
  function addImg()          { setF(f => ({ ...f, image_urls: [...f.image_urls, ''] })); }
  function removeImg(i)      { setF(f => ({ ...f, image_urls: f.image_urls.filter((_, j) => j !== i) })); }
  function setImg(i, v)      { setF(f => { const u = [...f.image_urls]; u[i] = v; return { ...f, image_urls: u }; }); }

  const avgMin    = editTpl?.avg_actual_minutes ?? null;
  const compCount = editTpl?.completed_count    ?? 0;
  const showAvgHint = avgMin != null && avgMin > 0 && F.estimated_minutes === 0;

  const matBadge = F.kits_required.length + F.image_urls.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw' }} onClick={e => e.stopPropagation()}>
        {/* Modal title */}
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {editTpl ? 'Edit Template' : 'New Task Template'}
          {editTpl?.op_number && (
            <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--accent)', fontWeight: 400 }}>
              {editTpl.op_number}
            </span>
          )}
          {editTpl?.completed_count > 0 && (
            <span className="badge badge-ghost" style={{ fontSize: 10, fontWeight: 400 }}>
              {editTpl.completed_count} completion{editTpl.completed_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Form tab bar */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          {FORM_TABS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setFormTab(i)}
              style={{
                background: 'none', border: 'none', padding: '8px 18px',
                cursor: 'pointer', fontSize: 13, fontWeight: formTab === i ? 700 : 500,
                color: formTab === i ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: formTab === i ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {label}
              {i === 2 && matBadge > 0 && (
                <span style={{
                  background: 'var(--accent)', color: '#fff', borderRadius: 9,
                  fontSize: 10, fontWeight: 700, padding: '0 5px', lineHeight: '16px',
                }}>{matBadge}</span>
              )}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ minHeight: 300, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>

            {/* ── Tab 0: Setup ───────────────────────────────────────────────── */}
            {formTab === 0 && (
              <div>
                {/* Station — create only */}
                {!editTpl && (
                  <div className="form-group">
                    <label>Station *</label>
                    <select value={F.station_id} onChange={e => setF({ station_id: e.target.value })}>
                      <option value="">Select station…</option>
                      {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label>Op Number</label>
                    <input
                      placeholder="e.g. 310.010"
                      value={F.op_number}
                      onChange={e => setF({ op_number: e.target.value })}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                      .000 = section header, .010/.020… = tasks within.
                    </span>
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={F.is_section_header}
                        onChange={e => setF({ is_section_header: e.target.checked })}
                        style={{ width: 15, height: 15 }}
                      />
                      Section header
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Must be fully done before next section starts.
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label>Title *</label>
                  <input
                    value={F.title}
                    onChange={e => setF({ title: e.target.value })}
                    autoFocus
                    placeholder={F.is_section_header ? 'e.g. Kit Preparation' : 'e.g. Verify Kit Contents'}
                  />
                </div>

                {!F.is_section_header && (
                  <div className="form-group">
                    <label>Description / What to do</label>
                    <textarea
                      value={F.description}
                      onChange={e => setF({ description: e.target.value })}
                      rows={2}
                      placeholder="Brief overview of what this task involves…"
                    />
                  </div>
                )}

                <div className="form-row form-row-2">
                  {!F.is_section_header && (
                    <div className="form-group">
                      <label>Estimated Minutes</label>
                      <input
                        type="number" min="0"
                        value={F.estimated_minutes}
                        onChange={e => setF({ estimated_minutes: parseInt(e.target.value) || 0 })}
                      />
                      {showAvgHint && (
                        <div style={{
                          marginTop: 6, padding: '6px 10px', borderRadius: 6,
                          background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        }}>
                          <span style={{ fontSize: 11, color: 'var(--accent)' }}>
                            📊 Avg from {compCount} completion{compCount !== 1 ? 's' : ''}: <strong>{avgMin} min</strong>
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11, padding: '2px 8px', color: 'var(--accent)' }}
                            onClick={() => setF({ estimated_minutes: avgMin })}
                          >Use this</button>
                        </div>
                      )}
                      {F.estimated_minutes === 0 && !showAvgHint && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                          Leave at 0 if unknown — will auto-suggest once used.
                        </span>
                      )}
                    </div>
                  )}
                  <div className="form-group">
                    <label>Order Index</label>
                    <input
                      type="number" min="0"
                      value={F.order_index}
                      onChange={e => setF({ order_index: parseInt(e.target.value) || 0 })}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                      Lower = appears first within the same op number.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab 1: Documentation ───────────────────────────────────────── */}
            {formTab === 1 && (
              <div>
                {F.is_section_header ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                    Documentation fields are not applicable for section headers.
                  </p>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Drawing / IPC Reference Number</label>
                      <input
                        placeholder="e.g. DWG-310-A Rev.2"
                        value={F.drawing_reference}
                        onChange={e => setF({ drawing_reference: e.target.value })}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                        Shown on the task card so workers can look up the drawing.
                      </span>
                    </div>
                    <div className="form-group">
                      <label>Instructions</label>
                      <textarea
                        placeholder="Step-by-step instructions, torque values, safety notes…"
                        value={F.instructions}
                        onChange={e => setF({ instructions: e.target.value })}
                        rows={5}
                      />
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)' }}>Reference Images</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={addImg}>+ Add Image URL</button>
                      </div>
                      {F.image_urls.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No images added yet.</p>
                      ) : (
                        F.image_urls.map((url, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                            <input
                              style={{ flex: 1 }}
                              placeholder="https://example.com/image.jpg"
                              value={url}
                              onChange={e => setImg(i, e.target.value)}
                            />
                            {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Preview ↗</a>}
                            <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, color: 'var(--danger)' }} onClick={() => removeImg(i)}>✕</button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Tab 2: Materials ───────────────────────────────────────────── */}
            {formTab === 2 && (
              <div>
                {F.is_section_header ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                    Materials fields are not applicable for section headers.
                  </p>
                ) : (
                  <>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)' }}>Kits Required</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Listed on the task card so workers know what to gather.</span>
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={addKit}>+ Add Kit</button>
                      </div>
                      {F.kits_required.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No kits specified.</p>
                      ) : (
                        F.kits_required.map((kit, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center',
                            padding: '8px 10px', background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)', borderRadius: 6,
                          }}>
                            <input style={{ width: 120, flexShrink: 0 }} placeholder="Kit #" value={kit.kit_number} onChange={e => setKit(i, 'kit_number', e.target.value)} />
                            <input style={{ flex: 1 }} placeholder="Description (e.g. Wing bolt kit)" value={kit.description} onChange={e => setKit(i, 'description', e.target.value)} />
                            <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, color: 'var(--danger)' }} onClick={() => removeKit(i)}>✕</button>
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                        padding: '12px 14px', borderRadius: 8,
                        border: F.requires_serial_number ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: F.requires_serial_number ? 'rgba(79,142,247,0.06)' : 'var(--bg-secondary)',
                        transition: 'all 0.15s',
                      }}>
                        <input
                          type="checkbox"
                          checked={F.requires_serial_number}
                          onChange={e => setF({ requires_serial_number: e.target.checked })}
                          style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Require installed part serial number</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            Workers must enter the part serial number before primary sign-off is accepted. Recorded permanently on the task record.
                          </div>
                        </div>
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : (editTpl ? 'Save Changes' : 'Create Template')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Templates Tab ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  station_id: '', title: '', description: '', estimated_minutes: 0, order_index: 0,
  op_number: '', is_section_header: false,
  kits_required: [], drawing_reference: '', instructions: '',
  requires_serial_number: false, image_urls: [],
};

function TemplatesTab() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [stations, setStations]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterStation, setFilt]  = useState('');
  const [showCreate, setCreate]   = useState(false);
  const [editTpl, setEditTpl]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formTab, setFormTab]     = useState(0);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([getTaskTemplates(), getStations()]).then(([tRes, sRes]) => {
      setTemplates(tRes.data);
      setStations(sRes.data);
    }).finally(() => setLoading(false));
  }, []);

  function openCreate() { setForm({ ...EMPTY_FORM }); setFormTab(0); setError(''); setCreate(true); }

  function openEdit(t) {
    setForm({
      title: t.title, description: t.description || '',
      estimated_minutes: t.estimated_minutes, order_index: t.order_index,
      op_number: t.op_number || '',
      is_section_header: Boolean(t.is_section_header),
      kits_required: Array.isArray(t.kits_required) ? t.kits_required : [],
      drawing_reference: t.drawing_reference || '',
      instructions: t.instructions || '',
      requires_serial_number: Boolean(t.requires_serial_number),
      image_urls: Array.isArray(t.image_urls) ? t.image_urls : [],
    });
    setFormTab(0); setError(''); setEditTpl(t);
  }

  function closeModal() { setCreate(false); setEditTpl(null); }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.station_id || !form.title) { setError('Station and title are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await createTemplate(form);
      setTemplates(prev => [...prev, res.data]);
      toast.success('Template created.'); closeModal();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally { setSaving(false); }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!form.title) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const res = await updateTemplate(editTpl.id, form);
      setTemplates(prev => prev.map(t => t.id === editTpl.id ? res.data : t));
      toast.success('Template updated.'); closeModal();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally { setSaving(false); }
  }

  async function toggleActive(tpl) {
    try {
      const res = await updateTemplate(tpl.id, { active: !tpl.active });
      setTemplates(prev => prev.map(t => t.id === tpl.id ? res.data : t));
      toast.info(res.data.active ? 'Template activated.' : 'Template deactivated.');
    } catch { toast.error('Failed to update template'); }
  }

  const filtered = templates.filter(t => !filterStation || String(t.station_id) === filterStation);
  const byStation = {};
  for (const t of filtered) {
    const key = t.station_name || `Station ${t.station_id}`;
    if (!byStation[key]) byStation[key] = [];
    byStation[key].push(t);
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <select style={{ width: 200 }} value={filterStation} onChange={e => setFilt(e.target.value)}>
          <option value="">All Stations</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={openCreate}>+ New Template</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
        ⚠ Template changes only apply to <strong>newly created</strong> airplane projects. Existing task instances are not affected.
      </p>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
        Object.entries(byStation).map(([stationName, tpls]) => (
          <div key={stationName} style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              marginBottom: 8, padding: '0 2px',
            }}>✈ {stationName}</div>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Op #</th>
                      <th>Title</th>
                      <th style={{ width: 80 }}>Est. / Avg</th>
                      <th style={{ width: 100 }}>Attributes</th>
                      <th style={{ width: 80 }}>Status</th>
                      <th style={{ width: 130 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tpls.map(t => (
                      t.is_section_header ? (
                        <tr key={t.id} style={{ background: 'rgba(79,142,247,0.07)' }}>
                          <td>{t.op_number && <code style={{ fontSize: 11, color: 'var(--accent)' }}>{t.op_number}</code>}</td>
                          <td colSpan={3}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>▸ {t.title}</span>
                            <span className="badge" style={{ marginLeft: 10, fontSize: 9, background: 'rgba(79,142,247,0.15)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>SECTION</span>
                          </td>
                          <td><span className={`badge ${t.active ? 'badge-success' : 'badge-ghost'}`} style={{ fontSize: 10 }}>{t.active ? 'Active' : 'Off'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>Edit</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(t)}>{t.active ? 'Off' : 'On'}</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={t.id} style={{ opacity: t.active ? 1 : 0.45 }}>
                          <td>
                            {t.op_number
                              ? <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.op_number}</code>
                              : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{t.id}</span>}
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            {t.title}
                            {t.drawing_reference && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>[{t.drawing_reference}]</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {t.estimated_minutes === 0
                                ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                                : `${t.estimated_minutes}m`}
                            </span>
                            {t.avg_actual_minutes != null && t.avg_actual_minutes > 0 && (
                              <span title={`Avg from ${t.completed_count} completion${t.completed_count !== 1 ? 's' : ''}`}
                                style={{ display: 'block', fontSize: 10, color: 'var(--accent)', marginTop: 1 }}>
                                ≈{t.avg_actual_minutes}m avg
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {t.requires_serial_number && <span className="badge badge-warning" style={{ fontSize: 9 }}>S/N REQ</span>}
                              {Array.isArray(t.kits_required) && t.kits_required.length > 0 && (
                                <span className="badge badge-ghost" style={{ fontSize: 9 }}>{t.kits_required.length} kit{t.kits_required.length !== 1 ? 's' : ''}</span>
                              )}
                              {Array.isArray(t.image_urls) && t.image_urls.length > 0 && (
                                <span className="badge badge-ghost" style={{ fontSize: 9 }}>{t.image_urls.length} img{t.image_urls.length !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </td>
                          <td><span className={`badge ${t.active ? 'badge-success' : 'badge-ghost'}`} style={{ fontSize: 10 }}>{t.active ? 'Active' : 'Inactive'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>Edit</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(t)}>{t.active ? 'Deactivate' : 'Activate'}</button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Template form modal — rendered outside the list so it's always a stable component */}
      <TemplateFormModal
        editTpl={editTpl}
        showCreate={showCreate}
        stations={stations}
        form={form}
        setForm={setForm}
        formTab={formTab}
        setFormTab={setFormTab}
        saving={saving}
        error={error}
        onSubmit={editTpl ? handleUpdate : handleCreate}
        onClose={closeModal}
      />
    </div>
  );
}

// ─── Fleet Config Tab ─────────────────────────────────────────────────────────
function FleetConfigTab() {
  const toast = useToast();
  const [options, setOptions]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editId,  setEditId]    = useState(null);   // option id being edited
  const [editForm, setEditForm] = useState({});
  const [addForm,  setAddForm]  = useState({ category: '', custom_category: '', label: '', sort_order: 0, is_standard: false, price: '', show_in_configurator: true });
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { loadOptions(); }, []);

  async function loadOptions() {
    setLoading(true);
    try { const r = await getFleetConfigOptions(); setOptions(r.data); }
    finally { setLoading(false); }
  }

  // Group by category
  const grouped = options.reduce((acc, o) => {
    if (!acc[o.category]) acc[o.category] = [];
    acc[o.category].push(o);
    return acc;
  }, {});

  async function handleAdd(e) {
    e.preventDefault();
    const cat = addForm.category === '__custom__' ? addForm.custom_category.trim() : addForm.category;
    if (!cat || !addForm.label.trim()) { toast.error('Category and label are required'); return; }
    setSaving(true);
    try {
      const r = await createFleetConfigOption({ category: cat, label: addForm.label.trim(), sort_order: addForm.sort_order, is_standard: addForm.is_standard, price: addForm.price !== '' ? Number(addForm.price) : null, show_in_configurator: addForm.show_in_configurator });
      setOptions(o => [...o, r.data].sort((a,b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
      setAddForm({ category: '', custom_category: '', label: '', sort_order: 0, is_standard: false, price: '', show_in_configurator: true });
      toast.success('Option added');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add');
    } finally { setSaving(false); }
  }

  function startEdit(o) {
    setEditId(o.id);
    setEditForm({ category: o.category, label: o.label, sort_order: o.sort_order, is_standard: !!o.is_standard, price: o.price != null ? String(o.price) : '', show_in_configurator: o.show_in_configurator !== false });
  }

  async function handleUpdate(oid) {
    setSaving(true);
    try {
      const r = await updateFleetConfigOption(oid, { ...editForm, price: editForm.price !== '' ? Number(editForm.price) : null });
      setOptions(o => o.map(x => x.id === oid ? r.data : x));
      setEditId(null);
      toast.success('Option updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  }

  async function handleDelete(oid) {
    if (!window.confirm('Delete this option? Aircraft that have it selected will lose it.')) return;
    try {
      await deleteFleetConfigOption(oid);
      setOptions(o => o.filter(x => x.id !== oid));
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  }

  const knownCategories = [...new Set(options.map(o => o.category))].sort();
  const allCategories   = [...new Set([...CONFIG_CATEGORIES, ...knownCategories])].sort();

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Manage the predefined configuration options that appear as checkboxes on each aircraft's Configuration tab.
      </p>

      {/* Add new option */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Add Configuration Option</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 14 }}>
          Mark <strong>Standard</strong> to pre-select &amp; lock it in the configurator. Uncheck <strong>Visible in Configurator</strong> to hide retired or internal options. Add a price to enable quote totals.
        </p>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '0 0 160px', margin: 0 }}>
              <label>Category</label>
              <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">— Select —</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">+ Custom category…</option>
              </select>
            </div>
            {addForm.category === '__custom__' && (
              <div className="form-group" style={{ flex: '0 0 140px', margin: 0 }}>
                <label>Custom Category</label>
                <input value={addForm.custom_category} onChange={e => setAddForm(f => ({ ...f, custom_category: e.target.value }))} placeholder="e.g. Fuel System" />
              </div>
            )}
            <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
              <label>Option Label</label>
              <input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Rotax 912 ULS 100hp" />
            </div>
            <div className="form-group" style={{ flex: '0 0 100px', margin: 0 }}>
              <label>Price (€)</label>
              <input type="number" min="0" step="100" value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group" style={{ flex: '0 0 70px', margin: 0 }}>
              <label>Order</label>
              <input type="number" value={addForm.sort_order} onChange={e => setAddForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto', margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={addForm.is_standard} onChange={e => setAddForm(f => ({ ...f, is_standard: e.target.checked }))} />
                Standard
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={addForm.show_in_configurator} onChange={e => setAddForm(f => ({ ...f, show_in_configurator: e.target.checked }))} />
                ✈ Visible in Configurator
              </label>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ marginTop: 2 }}>
                {saving ? 'Adding…' : '+ Add'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Grouped option list */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No configuration options yet. Add some above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cat, opts]) => (
            <div key={cat} className="card" style={{ padding: 0 }}>
              <div style={{ padding: '10px 16px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
                {cat}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th style={{ width: 100 }}>Price</th>
                      <th style={{ width: 80 }}>Standard</th>
                      <th style={{ width: 110 }}>Configurator</th>
                      <th style={{ width: 60 }}>Order</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {opts.map(o => {
                      const isHidden = o.show_in_configurator === false || o.show_in_configurator === 0;
                      return (
                      <tr key={o.id} style={{ background: o.is_standard ? 'rgba(34,197,94,0.04)' : isHidden ? 'rgba(148,163,184,0.05)' : undefined, opacity: isHidden ? 0.65 : 1 }}>
                        <td>
                          {editId === o.id ? (
                            <input autoFocus value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} style={{ fontSize: 13 }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13 }}>{o.label}</span>
                              {o.is_standard && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: '#22c55e22', color: '#22c55e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Standard</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          {editId === o.id ? (
                            <input type="number" min="0" step="100" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} style={{ fontSize: 13, width: 90 }} placeholder="0" />
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: o.price != null ? 600 : 400, color: o.price != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {o.price != null ? `€${Number(o.price).toLocaleString()}` : '—'}
                            </span>
                          )}
                        </td>
                        <td>
                          {editId === o.id ? (
                            <input type="checkbox" checked={editForm.is_standard} onChange={e => setEditForm(f => ({ ...f, is_standard: e.target.checked }))} />
                          ) : (
                            <span>{o.is_standard ? '✅' : ''}</span>
                          )}
                        </td>
                        <td>
                          {editId === o.id ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                              <input type="checkbox" checked={editForm.show_in_configurator !== false} onChange={e => setEditForm(f => ({ ...f, show_in_configurator: e.target.checked }))} />
                              Visible
                            </label>
                          ) : (
                            isHidden
                              ? <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#94a3b822', color: '#94a3b8', border: '1px solid #94a3b844', fontWeight: 600 }}>Hidden</span>
                              : <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', fontWeight: 600 }}>✈ Visible</span>
                          )}
                        </td>
                        <td>
                          {editId === o.id ? (
                            <input type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: Number(e.target.value) }))} style={{ fontSize: 13, width: 55 }} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sort_order}</span>
                          )}
                        </td>
                        <td>
                          {editId === o.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(o.id)} disabled={saving}>✓</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(o)}>✎</button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(o.id)}>✕</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Event Types Section ──────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { value: 'badge-ghost',   label: 'Grey' },
  { value: 'badge-info',    label: 'Blue' },
  { value: 'badge-success', label: 'Green' },
  { value: 'badge-warning', label: 'Yellow' },
  { value: 'badge-danger',  label: 'Red' },
];

const EMPTY_ET = { label: '', color: 'badge-ghost', sort_order: 0 };

function EventTypesSection() {
  const toast = useToast();
  const [types, setTypes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState(EMPTY_ET);
  const [editId, setEditId]   = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving]   = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const r = await getFleetEventTypes(); setTypes(r.data); }
    finally { setLoading(false); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.label.trim()) { toast.error('Label is required'); return; }
    setSaving(true);
    try {
      const r = await createFleetEventType(addForm);
      setTypes(t => [...t, r.data]);
      setAddForm(EMPTY_ET);
      toast.success('Event type added');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleUpdate(tid) {
    setSaving(true);
    try {
      const r = await updateFleetEventType(tid, editForm);
      setTypes(t => t.map(x => x.id === tid ? r.data : x));
      setEditId(null);
      toast.success('Updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(tid) {
    if (!window.confirm('Delete this event type?')) return;
    try {
      await deleteFleetEventType(tid);
      setTypes(t => t.filter(x => x.id !== tid));
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Event Types</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Define the types that appear in the event type dropdown on each aircraft's Events tab.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Add Event Type</div>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Label *</label>
              <input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Annual Inspection" />
            </div>
            <div className="form-group" style={{ flex: '0 0 130px' }}>
              <label>Color</label>
              <select value={addForm.color} onChange={e => setAddForm(f => ({ ...f, color: e.target.value }))}>
                {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 80px' }}>
              <label>Order</label>
              <input type="number" value={addForm.sort_order} onChange={e => setAddForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : '+ Add'}</button>
            </div>
          </div>
        </form>
      </div>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : types.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No event types yet. Add some above.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Label</th><th style={{ width: 100 }}>Color</th><th style={{ width: 70 }}>Order</th><th style={{ width: 100 }}></th></tr>
              </thead>
              <tbody>
                {types.map(t => (
                  <tr key={t.id}>
                    <td>
                      {editId === t.id
                        ? <input autoFocus value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} style={{ fontSize: 13 }} />
                        : <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${t.color}`} style={{ fontSize: 10 }}>{t.label}</span>
                          </span>}
                    </td>
                    <td>
                      {editId === t.id
                        ? <select value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} style={{ fontSize: 12 }}>
                            {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{COLOR_OPTIONS.find(c => c.value === t.color)?.label || t.color}</span>}
                    </td>
                    <td>
                      {editId === t.id
                        ? <input type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: Number(e.target.value) }))} style={{ fontSize: 13, width: 60 }} />
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.sort_order}</span>}
                    </td>
                    <td>
                      {editId === t.id
                        ? <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(t.id)} disabled={saving}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>✕</button>
                          </div>
                        : <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(t.id); setEditForm({ label: t.label, color: t.color, sort_order: t.sort_order }); }}>✎</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(t.id)}>✕</button>
                          </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_MODEL_FORM = { name: '', code: '', active: true, show_in_configurator: false, base_price: '' };

function ModelsTab() {
  const toast = useToast();
  const [models, setModels] = useState([]);
  const [form, setForm] = useState(EMPTY_MODEL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await getFleetModelsAdmin();
      setModels(res.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateFleetModel(editingId, form);
        toast.success('Model updated');
      } else {
        await createFleetModel(form);
        toast.success('Model added');
      }
      setForm(EMPTY_MODEL_FORM);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save model');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(model) {
    setEditingId(model.id);
    setForm({
      name: model.name || '',
      code: model.code || '',
      active: !!model.active,
      show_in_configurator: !!model.show_in_configurator,
      base_price: model.base_price != null ? String(model.base_price) : '',
    });
  }

  async function removeModel(id) {
    if (!window.confirm('Delete this model?')) return;
    try {
      await deleteFleetModel(id);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete model');
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Aircraft Models</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Models marked <strong>Visible in Configurator</strong> appear in the customer buying process. Set a base price for automatic quote totals.
      </p>
      <form onSubmit={onSubmit} style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 140px', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Model Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Blackwing 635RG" required />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Code</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Optional short code" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Base Price (€)</label>
            <input type="number" min="0" step="100" value={form.base_price} onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))} placeholder="e.g. 95000" />
          </div>
          <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>&nbsp;</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', height: 38 }}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update' : 'Add Model'}</button>
              {editingId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setForm(EMPTY_MODEL_FORM); }}>Cancel</button>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            <span>Active</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.show_in_configurator} onChange={e => setForm(f => ({ ...f, show_in_configurator: e.target.checked }))} />
            <span style={{ fontWeight: 600 }}>✈ Visible in Configurator</span>
          </label>
        </div>
      </form>

      {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Code</th><th>Base Price</th><th>Configurator</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {models.map(model => (
                <tr key={model.id}>
                  <td style={{ fontWeight: 600 }}>{model.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{model.code || '—'}</td>
                  <td style={{ fontSize: 13 }}>
                    {model.base_price != null ? `€${Number(model.base_price).toLocaleString()}` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td>
                    {model.show_in_configurator
                      ? <span className="badge badge-success" style={{ fontSize: 10 }}>✈ Visible</span>
                      : <span className="badge badge-ghost" style={{ fontSize: 10 }}>Hidden</span>}
                  </td>
                  <td><span className={`badge ${model.active ? 'badge-success' : 'badge-ghost'}`}>{model.active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(model)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeModel(model.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PermissionsTab() {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [definitions, setDefinitions] = useState([]);
  const [permissionMap, setPermissionMap] = useState({});
  const [savingRole, setSavingRole] = useState('');

  async function load() {
    try {
      const res = await getRolePermissions();
      setRoles(res.data.roles || []);
      setDefinitions(res.data.definitions || []);
      setPermissionMap(res.data.permissions || {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load permissions');
    }
  }

  useEffect(() => { load(); }, []);

  const categories = Array.from(new Set(definitions.map(item => item.category)));

  async function saveRole(role) {
    setSavingRole(role);
    try {
      const enabled = Object.entries(permissionMap[role] || {}).filter(([, allowed]) => allowed).map(([key]) => key);
      await updateRolePermissions(role, enabled);
      toast.success(`${role} permissions updated`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save permissions');
    } finally {
      setSavingRole('');
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 16 }}>Role Permissions</div>
      <div style={{ display: 'grid', gap: 16 }}>
        {roles.map(role => (
          <div key={role} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{role}</div>
              <button className="btn btn-primary btn-sm" onClick={() => saveRole(role)} disabled={savingRole === role}>
                {savingRole === role ? 'Saving…' : 'Save'}
              </button>
            </div>
            {categories.map(category => (
              <div key={`${role}-${category}`} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>{category}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  {definitions.filter(item => item.category === category).map(item => (
                    <label key={`${role}-${item.key}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={!!permissionMap?.[role]?.[item.key]}
                        onChange={e => setPermissionMap(prev => ({
                          ...prev,
                          [role]: { ...(prev[role] || {}), [item.key]: e.target.checked },
                        }))}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Service Bulletin metadata ────────────────────────────────────────────────

const BULLETIN_CATEGORIES = [
  {
    value: 'mandatory',
    label: 'Mandatory',
    badge: 'badge-danger',
    description: 'Unsafe condition exists. Compliance is required.',
  },
  {
    value: 'obligatory',
    label: 'Obligatory',
    badge: 'badge-warning',
    description: 'No unsafe condition, but compliance with the measures is required.',
  },
  {
    value: 'recommended',
    label: 'Recommended',
    badge: 'badge-info',
    description: 'No unsafe condition, but implementing the measures is advisable.',
  },
  {
    value: 'optional',
    label: 'Optional',
    badge: 'badge-ghost',
    description: 'No unsafe condition; improves the affected part.',
  },
];

const EMPTY_BULLETIN_FORM = {
  title: '',
  reason: '',
  category: 'optional',
  what_to_do: '',
  affected_option_ids: [],
  serial_criteria: [],
};

function bulletinCategoryMeta(value) {
  return BULLETIN_CATEGORIES.find(c => c.value === value) || BULLETIN_CATEGORIES[3];
}

function BulletinsTab() {
  const toast = useToast();
  const [bulletins,    setBulletins]    = useState([]);
  const [configOptions, setConfigOptions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [form,         setForm]         = useState(EMPTY_BULLETIN_FORM);
  const [editingId,    setEditingId]    = useState(null);   // bulletin id being edited
  const [saving,       setSaving]       = useState(false);
  const [showForm,     setShowForm]     = useState(false);

  // "View affected aircraft" drawer
  const [selected,        setSelected]       = useState(null);     // bulletin object
  const [affected,        setAffected]       = useState([]);
  const [resolveForm,     setResolveForm]    = useState({});       // { [aircraft_id]: {...} }
  const [users,           setUsers]          = useState([]);
  const [componentTypes,  setComponentTypes] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [bRes, oRes, uRes, ctRes] = await Promise.all([
        getFleetBulletins(), getFleetConfigOptions(), getUsers(), getComponentTypes(),
      ]);
      setBulletins(bRes.data || []);
      setConfigOptions(oRes.data || []);
      setUsers(uRes.data || []);
      setComponentTypes(ctRes.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load bulletins');
    } finally { setLoading(false); }
  }

  // Group config options by category for the multi-select
  const optionsByCategory = configOptions.reduce((acc, o) => {
    if (!acc[o.category]) acc[o.category] = [];
    acc[o.category].push(o);
    return acc;
  }, {});

  function openCreate() {
    setForm(EMPTY_BULLETIN_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  async function openEdit(bulletin) {
    try {
      const res = await getFleetBulletin(bulletin.id);
      const data = res.data;
      setForm({
        title:               data.title || '',
        reason:              data.reason || '',
        category:            data.category || 'optional',
        what_to_do:          data.what_to_do || '',
        affected_option_ids: data.affected_option_ids || [],
        serial_criteria:     (data.serial_criteria || []).map(c => ({
          ...c,
          _mode: c.exact_serial ? 'exact' : 'range',
        })),
      });
      setEditingId(bulletin.id);
      setShowForm(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load bulletin');
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_BULLETIN_FORM);
  }

  function toggleOption(optId) {
    setForm(f => {
      const set = new Set(f.affected_option_ids);
      if (set.has(optId)) set.delete(optId); else set.add(optId);
      return { ...f, affected_option_ids: [...set] };
    });
  }

  function addCriteria() {
    setForm(f => ({
      ...f,
      serial_criteria: [...f.serial_criteria, { component_type: '', component_name: '', serial_from: '', serial_to: '', exact_serial: '', _mode: 'range' }],
    }));
  }

  function removeCriteria(i) {
    setForm(f => ({ ...f, serial_criteria: f.serial_criteria.filter((_, j) => j !== i) }));
  }

  function updateCriteria(i, field, value) {
    setForm(f => {
      const arr = [...f.serial_criteria];
      arr[i] = { ...arr[i], [field]: value };
      return { ...f, serial_criteria: arr };
    });
  }

  async function save(e) {
    if (e?.preventDefault) e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      // Strip UI-only _mode field before sending to server
      const payload = {
        ...form,
        serial_criteria: form.serial_criteria.map(({ _mode, ...rest }) => rest),
      };
      if (editingId) {
        await updateFleetBulletin(editingId, payload);
        toast.success('Bulletin updated');
      } else {
        const res = await createFleetBulletin(payload);
        toast.success(`Bulletin created — ${res.data.matched_aircraft_count || 0} aircraft affected`);
      }
      closeForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save bulletin');
    } finally { setSaving(false); }
  }

  async function toggleStatus(bulletin) {
    try {
      await updateFleetBulletin(bulletin.id, { status: bulletin.status === 'open' ? 'closed' : 'open' });
      toast.success(`Bulletin ${bulletin.status === 'open' ? 'closed' : 'reopened'}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  }

  async function remove(bulletin) {
    if (!window.confirm(`Delete bulletin "${bulletin.title}"? This also clears all aircraft sign-offs for it.`)) return;
    try {
      await deleteFleetBulletin(bulletin.id);
      toast.success('Bulletin deleted');
      if (selected?.id === bulletin.id) setSelected(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  }

  async function openAffected(bulletin) {
    setSelected(bulletin);
    try {
      const res = await getFleetBulletinAircraft(bulletin.id);
      setAffected(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load affected aircraft');
    }
  }

  async function resolveAircraft(row) {
    const data = resolveForm[row.aircraft_id] || {};
    if (!data.resolution_notes?.trim()) {
      toast.error('Resolution notes are required before signing off');
      return;
    }
    if (!data.signed_off_by) {
      toast.error('Please select who is signing off');
      return;
    }
    try {
      await resolveFleetBulletinAircraft(selected.id, row.aircraft_id, data);
      toast.success('Aircraft signed off');
      openAffected(selected);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign off aircraft');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {bulletins.length} bulletin{bulletins.length === 1 ? '' : 's'}.
          Affected aircraft are determined by the configuration options each aircraft has selected.
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={openCreate}>+ New Bulletin</button>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 14 }}>
            {editingId ? 'Edit Bulletin' : 'Create Bulletin'}
          </div>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 12 }}>
              <div className="form-group">
                <label>Title *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. SB-2025-12 Rotax fuel-pump replacement"
                />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {BULLETIN_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  {bulletinCategoryMeta(form.category).description}
                </span>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Reason</label>
              <textarea
                rows={3}
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Why this bulletin was issued — e.g. observed wear pattern, regulatory directive…"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>What to do</label>
              <textarea
                rows={4}
                value={form.what_to_do}
                onChange={e => setForm(f => ({ ...f, what_to_do: e.target.value }))}
                placeholder="Step-by-step instructions for compliance"
              />
            </div>

            {/* Affected configuration options */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Affected Configuration Options</label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                Pick the engine / propeller / avionics / component options this bulletin applies to.
                Any aircraft that has at least one of these in its configuration will be marked as affected.
              </p>

              {configOptions.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                  No configuration options defined. Add some in <strong>Configuration Config</strong> first.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {Object.entries(optionsByCategory).sort(([a],[b]) => a.localeCompare(b)).map(([cat, opts]) => (
                    <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {cat}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {opts.map(o => (
                          <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={form.affected_option_ids.includes(o.id)}
                              onChange={() => toggleOption(o.id)}
                              style={{ width: 14, height: 14, flexShrink: 0 }}
                            />
                            <span>{o.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {form.affected_option_ids.length === 0 && form.serial_criteria.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8, marginBottom: 0 }}>
                  ⚠ With no options selected and no serial criteria, no aircraft will be marked as affected.
                </p>
              )}
            </div>

            {/* Serial Number Criteria */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Serial Number Criteria</span>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Target specific component serial numbers — e.g. engine 915 iS serials 10050–10250.
                    Matched independently of configuration options above.
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addCriteria} style={{ flexShrink: 0, marginLeft: 16 }}>+ Add</button>
              </div>

              {form.serial_criteria.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                  No serial criteria added. Use this if the bulletin targets specific serial number ranges or individual serials.
                </p>
              ) : (
                form.serial_criteria.map((c, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8, background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Component Type *</label>
                        <select
                          value={c.component_type}
                          onChange={e => updateCriteria(i, 'component_type', e.target.value)}
                        >
                          <option value="">— Select type —</option>
                          {componentTypes.map(ct => (
                            <option key={ct.id} value={ct.name}>{ct.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Model / Name</label>
                        <input
                          value={c.component_name || ''}
                          onChange={e => updateCriteria(i, 'component_name', e.target.value)}
                          placeholder="e.g. Rotax 915 iS"
                        />
                      </div>
                      <div className="form-group" style={{ flex: '0 0 110px', margin: 0 }}>
                        <label style={{ fontSize: 11 }}>Match type</label>
                        <select
                          value={c._mode || 'range'}
                          onChange={e => updateCriteria(i, '_mode', e.target.value)}
                        >
                          <option value="range">Range</option>
                          <option value="exact">Exact serial</option>
                        </select>
                      </div>
                      {(c._mode || 'range') === 'range' ? (
                        <>
                          <div className="form-group" style={{ flex: '0 0 100px', margin: 0 }}>
                            <label style={{ fontSize: 11 }}>Serial From</label>
                            <input
                              value={c.serial_from || ''}
                              onChange={e => updateCriteria(i, 'serial_from', e.target.value)}
                              placeholder="10050"
                            />
                          </div>
                          <div className="form-group" style={{ flex: '0 0 100px', margin: 0 }}>
                            <label style={{ fontSize: 11 }}>Serial To</label>
                            <input
                              value={c.serial_to || ''}
                              onChange={e => updateCriteria(i, 'serial_to', e.target.value)}
                              placeholder="10250"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
                          <label style={{ fontSize: 11 }}>Exact Serial</label>
                          <input
                            value={c.exact_serial || ''}
                            onChange={e => updateCriteria(i, 'exact_serial', e.target.value)}
                            placeholder="10500"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)', flexShrink: 0, alignSelf: 'flex-end' }}
                        onClick={() => removeCriteria(i)}
                      >✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : (editingId ? '💾 Save Changes' : '+ Create Bulletin')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulletins list */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
          All Bulletins
        </div>
        {loading ? (
          <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>
        ) : bulletins.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            No bulletins yet. Click <strong>+ New Bulletin</strong> to create one.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th style={{ width: 130 }}>Category</th>
                  <th>Affected Options</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 100 }}>Aircraft</th>
                  <th style={{ width: 200 }}></th>
                </tr>
              </thead>
              <tbody>
                {bulletins.map(b => {
                  const meta = bulletinCategoryMeta(b.category);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.title}</div>
                        {b.reason && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.reason}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${meta.badge}`} style={{ fontSize: 10 }}>{meta.label}</span>
                      </td>
                      <td>
                        {(b.affected_options || []).length === 0 ? (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {b.serial_prefix
                              ? `Legacy: serial prefix "${b.serial_prefix}"`
                              : 'No options linked'}
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {b.affected_options.slice(0, 4).map(o => (
                              <span key={o.id} className="badge badge-ghost" style={{ fontSize: 10 }} title={`${o.category} — ${o.label}`}>
                                {o.label}
                              </span>
                            ))}
                            {b.affected_options.length > 4 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{b.affected_options.length - 4}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${b.status === 'open' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 10 }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {b.open_aircraft_count}/{b.total_aircraft_count}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openAffected(b)}>View</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(b)}>
                            {b.status === 'open' ? 'Close' : 'Reopen'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(b)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Affected aircraft drawer */}
      {selected && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{selected.title} — Affected Aircraft</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {affected.length} aircraft. Sign off each one as the work is completed.
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button>
          </div>

          {affected.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
              No aircraft currently have a configuration that matches this bulletin.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Aircraft</th><th>Status</th><th>Resolution</th></tr>
                </thead>
                <tbody>
                  {affected.map(row => (
                    <tr key={`${row.aircraft_id}-${row.serial_id || 'none'}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.bw_serial}</div>
                        {row.registration && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.registration}</div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${row.status === 'open' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 10 }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ minWidth: 320 }}>
                        {row.status === 'resolved' ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              {row.resolution_notes || 'Signed off'}
                            </div>
                            {row.signed_off_by && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                                by {row.signed_off_by}
                                {row.labor_hours != null && ` · ${row.labor_hours} h`}
                                {row.resolved_at && ` · ${new Date(row.resolved_at).toLocaleDateString()}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <input
                              placeholder="Resolution notes"
                              value={resolveForm[row.aircraft_id]?.resolution_notes || ''}
                              onChange={e => setResolveForm(prev => ({ ...prev, [row.aircraft_id]: { ...(prev[row.aircraft_id] || {}), resolution_notes: e.target.value } }))}
                            />
                            <input
                              placeholder="Extra work completed (optional)"
                              value={resolveForm[row.aircraft_id]?.resolved_extra_work || ''}
                              onChange={e => setResolveForm(prev => ({ ...prev, [row.aircraft_id]: { ...(prev[row.aircraft_id] || {}), resolved_extra_work: e.target.value } }))}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                placeholder="TSN Hours"
                                type="number"
                                step="0.1"
                                min="0"
                                value={resolveForm[row.aircraft_id]?.labor_hours || ''}
                                onChange={e => setResolveForm(prev => ({ ...prev, [row.aircraft_id]: { ...(prev[row.aircraft_id] || {}), labor_hours: e.target.value } }))}
                                style={{ width: 100 }}
                              />
                              <select
                                value={resolveForm[row.aircraft_id]?.signed_off_by || ''}
                                onChange={e => setResolveForm(prev => ({ ...prev, [row.aircraft_id]: { ...(prev[row.aircraft_id] || {}), signed_off_by: e.target.value } }))}
                                style={{ flex: 1 }}
                              >
                                <option value="">— Signed off by —</option>
                                {users.map(u => (
                                  <option key={u.id} value={u.name}>{u.name}</option>
                                ))}
                              </select>
                              <button className="btn btn-primary btn-sm" onClick={() => resolveAircraft(row)}>Sign Off</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SVC_CATEGORIES = ['Engine', 'Airframe'];
const EMPTY_SVC = { category: 'Engine', title: '', interval_hours: '', interval_months: '', description: '', sort_order: 0, is_one_time: false };

function ServiceTemplatesSection() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loadingT,  setLoadingT]  = useState(true);
  const [editSvcId, setEditSvcId] = useState(null);
  const [editSvc,   setEditSvc]   = useState({});
  const [addSvc,    setAddSvc]    = useState(EMPTY_SVC);
  const [savingS,   setSavingS]   = useState(false);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    setLoadingT(true);
    try { const r = await getFleetServiceTemplates(); setTemplates(r.data); }
    finally { setLoadingT(false); }
  }

  async function handleAddSvc(e) {
    e.preventDefault();
    if (!addSvc.title.trim()) { toast.error('Title is required'); return; }
    setSavingS(true);
    try {
      const r = await createFleetServiceTemplate({
        ...addSvc,
        interval_hours:  addSvc.interval_hours  ? Number(addSvc.interval_hours)  : null,
        interval_months: addSvc.interval_months ? Number(addSvc.interval_months) : null,
      });
      setTemplates(t => [...t, r.data]);
      setAddSvc(EMPTY_SVC);
      toast.success('Template added');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSavingS(false); }
  }

  async function handleUpdateSvc(tid) {
    setSavingS(true);
    try {
      const r = await updateFleetServiceTemplate(tid, {
        ...editSvc,
        interval_hours:  editSvc.interval_hours  ? Number(editSvc.interval_hours)  : null,
        interval_months: editSvc.interval_months ? Number(editSvc.interval_months) : null,
      });
      setTemplates(t => t.map(x => x.id === tid ? r.data : x));
      setEditSvcId(null);
      toast.success('Updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSavingS(false); }
  }

  async function handleDeleteSvc(tid) {
    if (!window.confirm('Remove this service template? Existing completion records are kept.')) return;
    try {
      await deleteFleetServiceTemplate(tid);
      setTemplates(t => t.filter(x => x.id !== tid));
      toast.success('Removed');
    } catch { toast.error('Delete failed'); }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Define recurring maintenance tasks for engine and airframe. These appear as a checklist on each aircraft's Maintenance tab.
      </p>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Add Service Template</div>
        <form onSubmit={handleAddSvc}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '0 0 140px' }}>
              <label>Category</label>
              <select value={addSvc.category} onChange={e => setAddSvc(s => ({ ...s, category: e.target.value }))}>
                {SVC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Title *</label>
              <input value={addSvc.title} onChange={e => setAddSvc(s => ({ ...s, title: e.target.value }))} placeholder="e.g. 50h Engine Oil Change" />
            </div>
            <div className="form-group" style={{ flex: '0 0 100px' }}>
              <label>Every (hours)</label>
              <input type="number" min="0" value={addSvc.interval_hours} onChange={e => setAddSvc(s => ({ ...s, interval_hours: e.target.value }))} placeholder="100" />
            </div>
            <div className="form-group" style={{ flex: '0 0 100px' }}>
              <label>Every (months)</label>
              <input type="number" min="0" value={addSvc.interval_months} onChange={e => setAddSvc(s => ({ ...s, interval_months: e.target.value }))} placeholder="12" />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <button type="submit" className="btn btn-primary" disabled={savingS}>{savingS ? '…' : '+ Add'}</button>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Description / Notes</label>
            <input value={addSvc.description} onChange={e => setAddSvc(s => ({ ...s, description: e.target.value }))} placeholder="Optional procedure notes" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!addSvc.is_one_time}
                onChange={e => setAddSvc(s => ({ ...s, is_one_time: e.target.checked }))}
                style={{ width: 15, height: 15 }}
              />
              <span style={{ fontWeight: 500, fontSize: 13 }}>One-time milestone</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                — fires once at TSN within ±10h of the interval (e.g. 25h, 200h, 600h). Supersedes the recurring 100h check when active.
              </span>
            </label>
          </div>
        </form>
      </div>

      {/* Template list */}
      {loadingT ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : templates.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No service templates yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Title</th>
                  <th style={{ width: 90 }}>Interval h</th>
                  <th style={{ width: 90 }}>Interval mo</th>
                  <th style={{ width: 90 }}>One-time</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {editSvcId === t.id
                        ? <select value={editSvc.category} onChange={e => setEditSvc(s => ({ ...s, category: e.target.value }))} style={{ fontSize: 12 }}>
                            {SVC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        : t.category}
                    </td>
                    <td>
                      {editSvcId === t.id
                        ? <input autoFocus value={editSvc.title} onChange={e => setEditSvc(s => ({ ...s, title: e.target.value }))} style={{ fontSize: 13 }} />
                        : <span style={{ fontSize: 13 }}>{t.title}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editSvcId === t.id
                        ? <input type="number" value={editSvc.interval_hours} onChange={e => setEditSvc(s => ({ ...s, interval_hours: e.target.value }))} style={{ fontSize: 13, width: 70 }} />
                        : <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{t.interval_hours ?? '—'}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editSvcId === t.id
                        ? <input type="number" value={editSvc.interval_months} onChange={e => setEditSvc(s => ({ ...s, interval_months: e.target.value }))} style={{ fontSize: 13, width: 70 }} />
                        : <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{t.interval_months ?? '—'}</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {editSvcId === t.id
                        ? <input
                            type="checkbox"
                            checked={!!editSvc.is_one_time}
                            onChange={e => setEditSvc(s => ({ ...s, is_one_time: e.target.checked }))}
                            style={{ width: 16, height: 16 }}
                          />
                        : (t.is_one_time
                            ? <span className="badge badge-info" style={{ fontSize: 10 }}>once</span>
                            : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>)}
                    </td>
                    <td>
                      {editSvcId === t.id
                        ? <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdateSvc(t.id)} disabled={savingS}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditSvcId(null)}>✕</button>
                          </div>
                        : <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditSvcId(t.id); setEditSvc({ category: t.category, title: t.title, interval_hours: t.interval_hours ?? '', interval_months: t.interval_months ?? '', description: t.description ?? '', is_one_time: !!t.is_one_time }); }}>✎</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteSvc(t.id)}>✕</button>
                          </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component Types Section ──────────────────────────────────────────────────
const EMPTY_CT = { name: '', sort_order: 0 };

function ComponentTypesSection() {
  const toast = useToast();
  const [types,    setTypes]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [addForm,  setAddForm]  = useState(EMPTY_CT);
  const [editId,   setEditId]   = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const r = await getComponentTypes(); setTypes(r.data || []); }
    finally { setLoading(false); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const r = await createComponentType(addForm);
      setTypes(t => [...t, r.data]);
      setAddForm(EMPTY_CT);
      toast.success('Component type added');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleUpdate(tid) {
    setSaving(true);
    try {
      const r = await updateComponentType(tid, editForm);
      setTypes(t => t.map(x => x.id === tid ? r.data : x));
      setEditId(null);
      toast.success('Updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(tid) {
    if (!window.confirm('Delete this component type? This does not remove existing serial numbers that use it.')) return;
    try {
      await deleteComponentType(tid);
      setTypes(t => t.filter(x => x.id !== tid));
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Component Types</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Define the types that appear in the <strong>Type</strong> dropdown when registering component serial numbers on an aircraft.
        Used for filtering the Components page and targeting bulletins by serial range.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Add Component Type</div>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
              <label>Name *</label>
              <input
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Engine, Parachute, ELT, Avionics"
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 80px', margin: 0 }}>
              <label>Order</label>
              <input
                type="number"
                value={addForm.sort_order}
                onChange={e => setAddForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto', margin: 0 }}>
              <label>&nbsp;</label>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '…' : '+ Add'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : types.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
          No component types yet. Add some above.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 70 }}>Order</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {types.map(t => (
                  <tr key={t.id}>
                    <td>
                      {editId === t.id
                        ? <input autoFocus value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 13 }} />
                        : <span style={{ fontWeight: 500 }}>{t.name}</span>}
                    </td>
                    <td>
                      {editId === t.id
                        ? <input type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: Number(e.target.value) }))} style={{ fontSize: 13, width: 60 }} />
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.sort_order}</span>}
                    </td>
                    <td>
                      {editId === t.id
                        ? <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(t.id)} disabled={saving}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>✕</button>
                          </div>
                        : <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(t.id); setEditForm({ name: t.name, sort_order: t.sort_order }); }}>✎</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(t.id)}>✕</button>
                          </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────
function AuditTab() {
  const [log, setLog]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from_date: '', to_date: '', type: '' });

  useEffect(() => { load(); }, []);

  async function load(f = filters) {
    setLoading(true);
    try {
      const p = {};
      if (f.from_date) p.from_date = f.from_date;
      if (f.to_date)   p.to_date   = f.to_date;
      if (f.type)      p.type      = f.type;
      const res = await getAuditLog(p);
      setLog(res.data);
    } finally { setLoading(false); }
  }

  function setF(key, val) {
    const next = { ...filters, [key]: val };
    setFilters(next);
    load(next);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 180px' }}>
          <label>Type</label>
          <select value={filters.type} onChange={e => setF('type', e.target.value)}>
            <option value="">All Events</option>
            <option value="signoff">Sign-offs</option>
            <option value="ncr_action">NCR Actions</option>
          </select>
        </div>
        <div style={{ flex: '0 0 160px' }}><label>From</label><input type="date" value={filters.from_date} onChange={e => setF('from_date', e.target.value)} /></div>
        <div style={{ flex: '0 0 160px' }}><label>To</label><input type="date" value={filters.to_date} onChange={e => setF('to_date', e.target.value)} /></div>
      </div>
      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Time</th><th>Type</th><th>Actor</th><th>Subject</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {log.slice(0, 200).map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(e.timestamp).toLocaleString()}</td>
                    <td><span className={`badge ${e.type === 'signoff' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 10 }}>{e.type.replace(/_/g,' ')}</span></td>
                    <td style={{ fontSize: 13 }}>{e.actor} <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>@{e.username}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.subject}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

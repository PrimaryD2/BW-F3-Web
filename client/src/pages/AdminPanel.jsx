import React, { useEffect, useState } from 'react';
import {
  getUsers, createUser, updateUser,
  getTaskTemplates, getStations, createTemplate, updateTemplate,
  getAuditLog,
  getFleetConfigOptions, createFleetConfigOption, updateFleetConfigOption, deleteFleetConfigOption,
  getFleetServiceTemplates, createFleetServiceTemplate, updateFleetServiceTemplate, deleteFleetServiceTemplate,
} from '../api';
import { useToast } from '../context/ToastContext';

const ROLE_BADGE = { admin: 'badge-danger', supervisor: 'badge-warning', worker: 'badge-success' };
const TABS = ['Users', 'Task Templates', 'Fleet Config', 'Audit Log'];
const FORM_TABS = ['Setup', 'Documentation', 'Materials'];

const CONFIG_CATEGORIES = ['Engine', 'Propeller', 'Avionics', 'Interior', 'Paint'];

export default function AdminPanel() {
  const [tab, setTab] = useState(0);
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin Panel</div>
          <div className="page-subtitle">Manage users, task templates, and view audit history</div>
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
      {tab === 1 && <TemplatesTab />}
      {tab === 2 && <FleetConfigTab />}
      {tab === 3 && <AuditTab />}
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
  const [addForm,  setAddForm]  = useState({ category: '', custom_category: '', label: '', sort_order: 0 });
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
      const r = await createFleetConfigOption({ category: cat, label: addForm.label.trim(), sort_order: addForm.sort_order });
      setOptions(o => [...o, r.data].sort((a,b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
      setAddForm({ category: '', custom_category: '', label: '', sort_order: 0 });
      toast.success('Option added');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add');
    } finally { setSaving(false); }
  }

  function startEdit(o) {
    setEditId(o.id);
    setEditForm({ category: o.category, label: o.label, sort_order: o.sort_order });
  }

  async function handleUpdate(oid) {
    setSaving(true);
    try {
      const r = await updateFleetConfigOption(oid, editForm);
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
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Add Configuration Option</div>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '0 0 180px' }}>
              <label>Category</label>
              <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">— Select —</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">+ Custom category…</option>
              </select>
            </div>
            {addForm.category === '__custom__' && (
              <div className="form-group" style={{ flex: '0 0 160px' }}>
                <label>Custom Category</label>
                <input
                  value={addForm.custom_category}
                  onChange={e => setAddForm(f => ({ ...f, custom_category: e.target.value }))}
                  placeholder="e.g. Fuel System"
                />
              </div>
            )}
            <div className="form-group" style={{ flex: '1 1 200px' }}>
              <label>Option Label</label>
              <input
                value={addForm.label}
                onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Rotax 912 ULS 100hp"
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 90px' }}>
              <label>Order</label>
              <input
                type="number"
                value={addForm.sort_order}
                onChange={e => setAddForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto' }}>
              <label>&nbsp;</label>
              <button type="submit" className="btn btn-primary" disabled={saving}>
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
                      <th style={{ width: 70 }}>Order</th>
                      <th style={{ width: 100 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {opts.map(o => (
                      <tr key={o.id}>
                        <td>
                          {editId === o.id ? (
                            <input
                              autoFocus
                              value={editForm.label}
                              onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                              style={{ fontSize: 13 }}
                            />
                          ) : (
                            <span style={{ fontSize: 13 }}>{o.label}</span>
                          )}
                        </td>
                        <td>
                          {editId === o.id ? (
                            <input
                              type="number"
                              value={editForm.sort_order}
                              onChange={e => setEditForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                              style={{ fontSize: 13, width: 60 }}
                            />
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Service Templates ─────────────────────────────────────────────────── */}
      <ServiceTemplatesSection />
    </div>
  );
}

const SVC_CATEGORIES = ['Engine', 'Airframe'];
const EMPTY_SVC = { category: 'Engine', title: '', interval_hours: '', interval_months: '', description: '', sort_order: 0 };

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
    <div style={{ marginTop: 32 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Service Templates</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Description / Notes</label>
            <input value={addSvc.description} onChange={e => setAddSvc(s => ({ ...s, description: e.target.value }))} placeholder="Optional procedure notes" />
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
                    <td>
                      {editSvcId === t.id
                        ? <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdateSvc(t.id)} disabled={savingS}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditSvcId(null)}>✕</button>
                          </div>
                        : <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditSvcId(t.id); setEditSvc({ category: t.category, title: t.title, interval_hours: t.interval_hours ?? '', interval_months: t.interval_months ?? '', description: t.description ?? '' }); }}>✎</button>
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

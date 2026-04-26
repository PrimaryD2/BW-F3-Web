import React, { useEffect, useState } from 'react';
import { getUsers, createUser, updateUser, getTaskTemplates, getStations, createTemplate, updateTemplate, getAuditLog } from '../api';
import { useToast } from '../context/ToastContext';

const ROLE_BADGE = { admin: 'badge-danger', supervisor: 'badge-warning', worker: 'badge-success' };

const TABS = ['Users', 'Task Templates', 'Audit Log'];

export default function AdminPanel() {
  const [tab, setTab]           = useState(0);
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
      {tab === 2 && <AuditTab />}
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
      setSaving(false);
    }
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
      setSaving(false);
    }
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
                    <td>
                      <span className={`badge ${u.active ? 'badge-success' : 'badge-ghost'}`}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
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

      {/* Edit modal */}
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

// ─── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [stations, setStations]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterStation, setFilt]  = useState('');
  const [showCreate, setCreate]   = useState(false);
  const [editTpl, setEditTpl]     = useState(null);
  const [form, setForm]           = useState({ station_id: '', title: '', description: '', estimated_minutes: 60, order_index: 0 });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([getTaskTemplates(), getStations()]).then(([tRes, sRes]) => {
      setTemplates(tRes.data); setStations(sRes.data);
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.station_id || !form.title) { setError('Station and title required'); return; }
    setSaving(true); setError('');
    try {
      const res = await createTemplate(form);
      setTemplates(prev => [...prev, res.data]);
      toast.success('Template created.'); setCreate(false);
    } catch (err) { setError(err.response?.data?.error || 'Failed'); setSaving(false); }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await updateTemplate(editTpl.id, form);
      setTemplates(prev => prev.map(t => t.id === editTpl.id ? res.data : t));
      toast.success('Template updated.'); setEditTpl(null);
    } catch (err) { setError(err.response?.data?.error || 'Failed'); setSaving(false); }
  }

  async function toggleActive(tpl) {
    try {
      const res = await updateTemplate(tpl.id, { active: !tpl.active });
      setTemplates(prev => prev.map(t => t.id === tpl.id ? res.data : t));
      toast.info(res.data.active ? 'Template activated.' : 'Template deactivated.');
    } catch { toast.error('Failed to update template'); }
  }

  const filtered = templates.filter(t => !filterStation || String(t.station_id) === filterStation);

  const TemplateForm = ({ onSubmit }) => (
    <form onSubmit={onSubmit}>
      {!editTpl && (
        <div className="form-group">
          <label>Station *</label>
          <select value={form.station_id} onChange={e => setForm(f => ({ ...f, station_id: e.target.value }))}>
            <option value="">Select station…</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="form-group"><label>Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus /></div>
      <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
      <div className="form-row form-row-2">
        <div className="form-group"><label>Estimated Minutes</label><input type="number" min="1" value={form.estimated_minutes} onChange={e => setForm(f => ({ ...f, estimated_minutes: parseInt(e.target.value) }))} /></div>
        <div className="form-group"><label>Order Index</label><input type="number" min="0" value={form.order_index} onChange={e => setForm(f => ({ ...f, order_index: parseInt(e.target.value) }))} /></div>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={() => { setCreate(false); setEditTpl(null); }}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editTpl ? 'Save Changes' : 'Create Template')}</button>
      </div>
    </form>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <select style={{ width: 200 }} value={filterStation} onChange={e => setFilt(e.target.value)}>
          <option value="">All Stations</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => { setForm({ station_id: '', title: '', description: '', estimated_minutes: 60, order_index: 0 }); setError(''); setCreate(true); }}>
          + New Template
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        ⚠ Template changes only apply to newly created airplane projects.
      </p>
      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Station</th><th>Title</th><th>Est. (min)</th><th>Order</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}>
                    <td style={{ color: 'var(--text-muted)' }}>{t.id}</td>
                    <td style={{ color: 'var(--accent)' }}>{t.station_name}</td>
                    <td style={{ fontWeight: 500 }}>{t.title}</td>
                    <td>{t.estimated_minutes}</td>
                    <td>{t.order_index}</td>
                    <td><span className={`badge ${t.active ? 'badge-success' : 'badge-ghost'}`}>{t.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ title: t.title, description: t.description || '', estimated_minutes: t.estimated_minutes, order_index: t.order_index }); setError(''); setEditTpl(t); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(t)}>{t.active ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showCreate && <div className="modal-overlay" onClick={() => setCreate(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-title">New Task Template</div><TemplateForm onSubmit={handleCreate} /></div></div>}
      {editTpl  && <div className="modal-overlay" onClick={() => setEditTpl(null)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-title">Edit Template</div><TemplateForm onSubmit={handleUpdate} /></div></div>}
    </div>
  );
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────
function AuditTab() {
  const [log, setLog]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState({ from_date: '', to_date: '', type: '' });

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

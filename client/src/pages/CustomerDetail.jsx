import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCustomer, updateCustomer, archiveCustomer,
  getCustomerLogs, createCustomerLog, updateCustomerLog, deleteCustomerLog,
  getUsers,
} from '../api/index';
import { useAuth } from '../context/AuthContext';

// ─── Label / colour maps ─────────────────────────────────────────────────────
const STATUS_LABELS = {
  new: 'New', contacted: 'Contacted', waiting_reply: 'Waiting for Reply',
  active_discussion: 'Active Discussion', quote_sent: 'Quote Sent',
  test_flight_planned: 'Test Flight Planned', problem_support: 'Problem / Support',
  closed_won: 'Closed – Won', closed_lost: 'Closed – Lost', future_prospect: 'Future Prospect',
};
const STATUS_COLORS = {
  new: '#6366f1', contacted: '#3b82f6', waiting_reply: '#f59e0b',
  active_discussion: '#22c55e', quote_sent: '#10b981', test_flight_planned: '#06b6d4',
  problem_support: '#ef4444', closed_won: '#22c55e', closed_lost: '#94a3b8',
  future_prospect: '#8b5cf6',
};
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const PRIORITY_COLORS = { low: '#94a3b8', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

const CONTACT_TYPE_LABELS = {
  email: 'Email', phone_call: 'Phone Call', whatsapp: 'WhatsApp', sms: 'SMS',
  instagram: 'Instagram', facebook: 'Facebook', meeting: 'Meeting',
  event: 'Event', internal_note: 'Internal Note', other: 'Other',
};
const CONTACT_TYPE_ICONS = {
  email: '✉️', phone_call: '📞', whatsapp: '💬', sms: '📱',
  instagram: '📷', facebook: '👤', meeting: '🤝', event: '📅',
  internal_note: '📝', other: '💡',
};

const CATEGORY_LABELS = {
  sales: 'Sales', support: 'Support', service: 'Service', problem: 'Problem',
  delivery: 'Delivery', warranty: 'Warranty', general_question: 'General Question', other: 'Other',
};
const ENTRY_STATUS_LABELS = {
  open: 'Open', waiting_customer: 'Waiting for Customer',
  waiting_blackwing: 'Waiting for Blackwing', solved: 'Solved', closed: 'Closed',
};
const ENTRY_STATUS_COLORS = {
  open: '#3b82f6', waiting_customer: '#f59e0b', waiting_blackwing: '#8b5cf6',
  solved: '#22c55e', closed: '#94a3b8',
};

const SOURCE_LABELS = {
  website: 'Website', email: 'Email', phone: 'Phone', instagram: 'Instagram',
  facebook: 'Facebook', aero: 'AERO', dealer: 'Dealer',
  existing_customer: 'Existing Customer', referral: 'Referral', other: 'Other',
};
const TYPE_LABELS = {
  new_buyer: 'New Buyer', existing_owner: 'Existing Owner', dealer: 'Dealer',
  service_customer: 'Service Customer', other: 'Other',
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function localDatetimeValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</span>;
}

// ─── Empty log form state ─────────────────────────────────────────────────────
function emptyLog() {
  const now = localDatetimeValue(new Date());
  return {
    date_time: now,
    contact_type: 'phone_call',
    category: 'sales',
    title: '',
    detailed_notes: '',
    customer_question: '',
    blackwing_answer: '',
    follow_up_needed: false,
    follow_up_date: '',
    follow_up_responsible: '',
    entry_status: 'open',
  };
}

// ─── Empty customer form state ────────────────────────────────────────────────
function emptyCustomer() {
  return {
    full_name: '', company_name: '', country: '', city: '',
    email: '', phone: '', preferred_language: '',
    source: 'other', interested_aircraft: '',
    customer_type: 'new_buyer', status: 'new', priority: 'medium',
    assigned_employee_id: '', general_notes: '',
  };
}

// ─── Log entry card ───────────────────────────────────────────────────────────
function LogCard({ log, onEdit, onDelete, isAdmin }) {
  const statusColor = ENTRY_STATUS_COLORS[log.entry_status] || '#94a3b8';
  const isOverdue = log.follow_up_needed && log.follow_up_date &&
    new Date(log.follow_up_date) < new Date() &&
    !['solved','closed'].includes(log.entry_status);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${statusColor}`,
      borderRadius: 10, padding: '14px 16px',
      background: 'var(--bg-secondary)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{CONTACT_TYPE_ICONS[log.contact_type] || '💡'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3 }}>{log.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {formatDateTime(log.date_time)} · {CONTACT_TYPE_LABELS[log.contact_type] || log.contact_type} · {CATEGORY_LABELS[log.category] || log.category}
            {log.employee_name && ` · by ${log.employee_name}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: statusColor + '22', color: statusColor,
            border: `1px solid ${statusColor}44`,
          }}>
            {ENTRY_STATUS_LABELS[log.entry_status] || log.entry_status}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onEdit(log)}>Edit</button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11, color: '#ef4444' }} onClick={() => onDelete(log.id)}>Delete</button>
          )}
        </div>
      </div>

      {/* Body */}
      {log.detailed_notes && (
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{log.detailed_notes}</div>
      )}
      {(log.customer_question || log.blackwing_answer) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
          {log.customer_question && (
            <div style={{ background: 'var(--bg-tertiary, #111)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Customer Question / Problem</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{log.customer_question}</div>
            </div>
          )}
          {log.blackwing_answer && (
            <div style={{ background: 'var(--bg-tertiary, #111)', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Blackwing Answer / Action</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{log.blackwing_answer}</div>
            </div>
          )}
        </div>
      )}
      {log.follow_up_needed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: isOverdue ? '#ef444422' : '#f59e0b11',
          border: `1px solid ${isOverdue ? '#ef444444' : '#f59e0b44'}`,
          borderRadius: 6, padding: '5px 10px', fontSize: 12, marginTop: 4,
        }}>
          <span style={{ fontSize: 14 }}>{isOverdue ? '🔴' : '🕐'}</span>
          <span style={{ color: isOverdue ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
            Follow-up: {formatDate(log.follow_up_date)}
            {isOverdue && ' (OVERDUE)'}
          </span>
          {log.follow_up_responsible && <span style={{ color: 'var(--text-muted)' }}>→ {log.follow_up_responsible}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Log form modal ───────────────────────────────────────────────────────────
function LogForm({ initial, users, onSave, onCancel }) {
  const [form, setForm] = useState(initial || emptyLog());
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 14,
        width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto',
        padding: 28,
      }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 20 }}>
          {initial?.id ? 'Edit Log Entry' : 'Add Log Entry'}
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Date & Time</SectionLabel>
              <input type="datetime-local" value={form.date_time} onChange={e => set('date_time', e.target.value)} required />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Contact Type</SectionLabel>
              <select value={form.contact_type} onChange={e => set('contact_type', e.target.value)}>
                {Object.entries(CONTACT_TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Category</SectionLabel>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                {Object.entries(CATEGORY_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Entry Status</SectionLabel>
              <select value={form.entry_status} onChange={e => set('entry_status', e.target.value)}>
                {Object.entries(ENTRY_STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="form-group" style={{ margin: 0 }}>
            <SectionLabel>Title *</SectionLabel>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Short summary of this interaction" />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <SectionLabel>Detailed Notes</SectionLabel>
            <textarea rows={3} value={form.detailed_notes} onChange={e => set('detailed_notes', e.target.value)} placeholder="Full notes about the conversation…" style={{ resize: 'vertical' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Customer Question / Problem</SectionLabel>
              <textarea rows={2} value={form.customer_question} onChange={e => set('customer_question', e.target.value)} placeholder="What did the customer ask or report?" style={{ resize: 'vertical' }} />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Blackwing Answer / Action</SectionLabel>
              <textarea rows={2} value={form.blackwing_answer} onChange={e => set('blackwing_answer', e.target.value)} placeholder="How did we respond or what did we do?" style={{ resize: 'vertical' }} />
            </label>
          </div>

          {/* Follow-up */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: form.follow_up_needed ? 12 : 0 }}>
              <input type="checkbox" checked={form.follow_up_needed} onChange={e => set('follow_up_needed', e.target.checked)} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Follow-up needed</span>
            </label>
            {form.follow_up_needed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <SectionLabel>Follow-up Date</SectionLabel>
                  <input type="date" value={form.follow_up_date} onChange={e => set('follow_up_date', e.target.value)} />
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <SectionLabel>Responsible Person</SectionLabel>
                  <input type="text" value={form.follow_up_responsible} onChange={e => set('follow_up_responsible', e.target.value)} placeholder="Employee name or team" />
                </label>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial?.id ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Customer edit form modal ─────────────────────────────────────────────────
function CustomerForm({ initial, users, onSave, onCancel }) {
  const [form, setForm] = useState({ ...emptyCustomer(), ...initial });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 14,
        width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto',
        padding: 28,
      }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 20 }}>
          {initial?.id ? 'Edit Customer' : 'New Customer'}
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Full Name *</SectionLabel>
              <input type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)} required placeholder="John Smith" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Company Name</SectionLabel>
              <input type="text" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Acme Aviation GmbH" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Country</SectionLabel>
              <input type="text" value={form.country} onChange={e => set('country', e.target.value)} placeholder="Germany" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>City</SectionLabel>
              <input type="text" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Munich" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Email</SectionLabel>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Phone</SectionLabel>
              <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+49 89 12345678" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Preferred Language</SectionLabel>
              <input type="text" value={form.preferred_language} onChange={e => set('preferred_language', e.target.value)} placeholder="English, German…" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Interested Aircraft / Model</SectionLabel>
              <input type="text" value={form.interested_aircraft} onChange={e => set('interested_aircraft', e.target.value)} placeholder="Blackwing 635RG" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Source</SectionLabel>
              <select value={form.source} onChange={e => set('source', e.target.value)}>
                {Object.entries(SOURCE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Customer Type</SectionLabel>
              <select value={form.customer_type} onChange={e => set('customer_type', e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Status</SectionLabel>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Priority</SectionLabel>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <SectionLabel>Assigned Employee</SectionLabel>
              <select value={form.assigned_employee_id} onChange={e => set('assigned_employee_id', e.target.value)}>
                <option value="">— Unassigned —</option>
                {users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <label className="form-group" style={{ margin: 0 }}>
            <SectionLabel>General Notes</SectionLabel>
            <textarea rows={3} value={form.general_notes} onChange={e => set('general_notes', e.target.value)} placeholder="Any general information about this customer…" style={{ resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial?.id ? 'Save Changes' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const isNew = id === 'new';

  const [customer, setCustomer] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [logOrder, setLogOrder] = useState('desc');

  // Modals
  const [showCustomerForm, setShowCustomerForm] = useState(isNew);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingLog, setEditingLog] = useState(null);

  const loadCustomer = useCallback(async () => {
    if (isNew) return;
    const [cRes, lRes] = await Promise.all([
      getCustomer(id),
      getCustomerLogs(id, { order: logOrder }),
    ]);
    setCustomer(cRes.data);
    setLogs(lRes.data || []);
  }, [id, isNew, logOrder]);

  useEffect(() => {
    Promise.all([
      isNew ? Promise.resolve(null) : loadCustomer(),
      getUsers(),
    ]).then(([_, uRes]) => {
      setUsers(uRes?.data || []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isNew && !loading) {
      getCustomerLogs(id, { order: logOrder }).then(r => setLogs(r.data || []));
    }
  }, [logOrder]);

  async function handleCreateCustomer(form) {
    const res = await createCustomer(form);
    navigate(`/customers/${res.data.id}`, { replace: true });
  }

  async function handleUpdateCustomer(form) {
    await updateCustomer(id, form);
    setShowCustomerForm(false);
    await loadCustomer();
  }

  async function handleArchive() {
    if (!window.confirm(`Archive ${customer.full_name}? They won't be deleted, just hidden from the list.`)) return;
    await archiveCustomer(id);
    navigate('/customers');
  }

  async function handleSaveLog(form) {
    if (editingLog?.id) {
      await updateCustomerLog(id, editingLog.id, form);
    } else {
      await createCustomerLog(id, form);
    }
    setShowLogForm(false);
    setEditingLog(null);
    await loadCustomer();
  }

  async function handleDeleteLog(logId) {
    if (!window.confirm('Delete this log entry?')) return;
    await deleteCustomerLog(id, logId);
    await loadCustomer();
  }

  function openEditLog(log) {
    setEditingLog({
      ...log,
      date_time: localDatetimeValue(log.date_time),
      follow_up_date: log.follow_up_date ? log.follow_up_date.slice(0, 10) : '',
      follow_up_needed: Boolean(log.follow_up_needed),
    });
    setShowLogForm(true);
  }

  if (loading) return <div className="page"><div style={{ color: 'var(--text-secondary)' }}>Loading…</div></div>;

  // New customer flow — show form immediately
  if (isNew) {
    return (
      <div className="page">
        <CustomerForm
          users={users}
          onSave={handleCreateCustomer}
          onCancel={() => navigate('/customers')}
        />
      </div>
    );
  }

  if (!customer) return <div className="page"><div style={{ color: 'var(--text-secondary)' }}>Customer not found.</div></div>;

  const statusColor = STATUS_COLORS[customer.status] || '#94a3b8';
  const priorityColor = PRIORITY_COLORS[customer.priority] || '#94a3b8';

  const overdueFollowups = logs.filter(l =>
    l.follow_up_needed && l.follow_up_date &&
    new Date(l.follow_up_date) < new Date() &&
    !['solved','closed'].includes(l.entry_status)
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/customers')} style={{ flexShrink: 0 }}>← Back</button>
          <div style={{ minWidth: 0 }}>
            <div className="page-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer.full_name}
              {customer.company_name && <span style={{ fontWeight: 400, fontSize: 16, color: 'var(--text-secondary)', marginLeft: 8 }}>{customer.company_name}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              {/* Status badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: statusColor + '22', color: statusColor,
                border: `1px solid ${statusColor}44`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                {STATUS_LABELS[customer.status] || customer.status}
              </span>
              {/* Priority badge */}
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                background: priorityColor + '22', color: priorityColor,
              }}>
                {PRIORITY_LABELS[customer.priority] || customer.priority}
              </span>
              {overdueFollowups.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>
                  {overdueFollowups.length} overdue follow-up{overdueFollowups.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomerForm(true)}>Edit Customer</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditingLog(null); setShowLogForm(true); }}>+ Add Log Entry</button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={handleArchive}>Archive</button>
          )}
        </div>
      </div>

      {/* Info cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Contact info */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Contact</div>
          {customer.email && <InfoRow icon="✉️" value={customer.email} href={`mailto:${customer.email}`} />}
          {customer.phone && <InfoRow icon="📞" value={customer.phone} href={`tel:${customer.phone}`} />}
          {customer.country && <InfoRow icon="📍" value={[customer.city, customer.country].filter(Boolean).join(', ')} />}
          {customer.preferred_language && <InfoRow icon="🌐" value={customer.preferred_language} />}
        </div>

        {/* Customer details */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Details</div>
          {customer.customer_type && <InfoRow label="Type" value={TYPE_LABELS[customer.customer_type] || customer.customer_type} />}
          {customer.source && <InfoRow label="Source" value={SOURCE_LABELS[customer.source] || customer.source} />}
          {customer.interested_aircraft && <InfoRow label="Interested in" value={customer.interested_aircraft} />}
          {customer.assigned_employee_name && <InfoRow label="Assigned to" value={customer.assigned_employee_name} />}
        </div>

        {/* Activity */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Activity</div>
          <InfoRow label="Last contact" value={customer.last_contact_date ? new Date(customer.last_contact_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
          <InfoRow label="Next follow-up" value={customer.next_followup_date ? new Date(customer.next_followup_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            valueStyle={{ color: customer.next_followup_date && new Date(customer.next_followup_date + 'T00:00:00') < new Date() ? '#ef4444' : undefined }}
          />
          <InfoRow label="Total logs" value={String(logs.length)} />
          <InfoRow label="Customer since" value={customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
        </div>
      </div>

      {/* General notes */}
      {customer.general_notes && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>General Notes</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{customer.general_notes}</div>
        </div>
      )}

      {/* Communication log */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Communication Log <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-secondary)' }}>({logs.length} entries)</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sort:</span>
          <button
            className={`btn btn-sm ${logOrder === 'desc' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLogOrder('desc')}
          >Newest first</button>
          <button
            className={`btn btn-sm ${logOrder === 'asc' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLogOrder('asc')}
          >Oldest first</button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
          No log entries yet.{' '}
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline' }} onClick={() => { setEditingLog(null); setShowLogForm(true); }}>Add the first entry</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {logs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              onEdit={openEditLog}
              onDelete={handleDeleteLog}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCustomerForm && (
        <CustomerForm
          initial={customer}
          users={users}
          onSave={handleUpdateCustomer}
          onCancel={() => setShowCustomerForm(false)}
        />
      )}
      {showLogForm && (
        <LogForm
          initial={editingLog}
          users={users}
          onSave={handleSaveLog}
          onCancel={() => { setShowLogForm(false); setEditingLog(null); }}
        />
      )}
    </div>
  );
}

// ─── Small helper component ───────────────────────────────────────────────────
function InfoRow({ icon, label, value, href, valueStyle }) {
  const content = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5, fontSize: 13 }}>
      {icon && <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{icon}</span>}
      {label && <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 80 }}>{label}:</span>}
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, ...valueStyle }}>{value}</span>
    </div>
  );
  if (href) return <a href={href} style={{ textDecoration: 'none' }}>{content}</a>;
  return content;
}

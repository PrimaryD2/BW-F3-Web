import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCustomer, createCustomer, updateCustomer, archiveCustomer,
  getCustomerLogs, createCustomerLog, updateCustomerLog, deleteCustomerLog,
  getActiveUsers, getFleetModels,
  getCustomerBookings, createCustomerBooking,
  getCustomerQuotes, createCustomerQuote, updateCustomerQuote, deleteCustomerQuote, sendCustomerQuoteEmail,
  getFleetList, getFleetServiceTemplates, getFleetConfigOptions,
} from '../api/index';
import { useAuth } from '../context/AuthContext';

// ─── Label / colour maps ─────────────────────────────────────────────────────
const STATUS_LABELS = {
  none: 'No Active Discussion',
  new: 'New', contacted: 'Contacted', waiting_reply: 'Waiting for Reply',
  active_discussion: 'Active Discussion', quote_sent: 'Quote Sent',
  test_flight_planned: 'Test Flight Planned', problem_support: 'Problem / Support',
  closed_won: 'Closed – Won', closed_lost: 'Closed – Lost', future_prospect: 'Future Prospect',
};
const STATUS_COLORS = {
  none: '#94a3b8',
  new: '#6366f1', contacted: '#3b82f6', waiting_reply: '#f59e0b',
  active_discussion: '#22c55e', quote_sent: '#10b981', test_flight_planned: '#06b6d4',
  problem_support: '#ef4444', closed_won: '#22c55e', closed_lost: '#94a3b8',
  future_prospect: '#8b5cf6',
};
const PRIORITY_LABELS = { none: 'No Priority', low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const PRIORITY_COLORS = { none: '#94a3b8', low: '#94a3b8', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

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

// ─── Utilities ────────────────────────────────────────────────────────────────
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
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
/** Spread a DB row into a form, converting all nulls → '' so controlled inputs stay controlled */
function dbToForm(base, row) {
  if (!row) return base;
  const merged = { ...base, ...row };
  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, v === null || v === undefined ? '' : v])
  );
}

function FieldLabel({ children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </span>
  );
}

// ─── Aircraft model selector (dropdown + optional free-text fallback) ─────────
function AircraftSelect({ value, onChange, models }) {
  const knownNames = models.map(m => m.name);
  // If value exists but isn't in the models list → it's a custom/legacy value
  const startsCustom = value !== '' && !knownNames.includes(value);
  const [showCustom, setShowCustom] = useState(startsCustom);

  function handleSelectChange(e) {
    if (e.target.value === '_custom') {
      setShowCustom(true);
      onChange('');
    } else {
      setShowCustom(false);
      onChange(e.target.value);
    }
  }

  const selectValue = showCustom ? '_custom' : (value || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select value={selectValue} onChange={handleSelectChange}>
        <option value="">— None selected —</option>
        {models.map(m => (
          <option key={m.id} value={m.name}>{m.name}</option>
        ))}
        <option value="_custom">Other / Custom…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Type model name…"
          autoFocus
        />
      )}
    </div>
  );
}

// ─── Empty form states ────────────────────────────────────────────────────────
function baseCustomer() {
  return {
    full_name: '', company_name: '', country: '', city: '',
    email: '', phone: '', preferred_language: '',
    source: 'other', interested_aircraft: '',
    customer_type: 'new_buyer', status: 'new', priority: 'medium',
    assigned_employee_id: '', general_notes: '',
  };
}
function baseLog() {
  return {
    date_time: localDatetimeValue(new Date()),
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

// ═══════════════════════════════════════════════════════════════════════════════
// Log entry card (read-only display)
// ═══════════════════════════════════════════════════════════════════════════════
function LogCard({ log, onEdit, onDelete, onResolveFollowup, isAdmin }) {
  const statusColor = ENTRY_STATUS_COLORS[log.entry_status] || '#94a3b8';
  const isOverdue = log.follow_up_needed && log.follow_up_date &&
    new Date(log.follow_up_date) < new Date() &&
    !['solved', 'closed'].includes(log.entry_status);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${statusColor}`,
      borderRadius: 10, padding: '14px 16px',
      background: 'var(--bg-secondary)',
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{CONTACT_TYPE_ICONS[log.contact_type] || '💡'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3 }}>{log.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {formatDateTime(log.date_time)}
            {' · '}{CONTACT_TYPE_LABELS[log.contact_type] || log.contact_type}
            {' · '}{CATEGORY_LABELS[log.category] || log.category}
            {log.employee_name && ` · by ${log.employee_name}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: statusColor + '22', color: statusColor,
            border: `1px solid ${statusColor}44`,
          }}>
            {ENTRY_STATUS_LABELS[log.entry_status] || log.entry_status}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => onEdit(log)}>Edit</button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" style={{ padding: '3px 10px', fontSize: 11, color: '#ef4444' }} onClick={() => onDelete(log.id)}>Delete</button>
          )}
        </div>
      </div>

      {/* ── Detailed notes ── */}
      {log.detailed_notes && (
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {log.detailed_notes}
        </div>
      )}

      {/* ── Q&A boxes ── */}
      {(log.customer_question || log.blackwing_answer) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {log.customer_question && (
            <div style={{ background: 'var(--bg-tertiary, #111)', borderRadius: 7, padding: '10px 12px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Customer Question / Problem</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{log.customer_question}</div>
            </div>
          )}
          {log.blackwing_answer && (
            <div style={{ background: 'var(--bg-tertiary, #111)', borderRadius: 7, padding: '10px 12px', borderLeft: '3px solid #22c55e' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Blackwing Answer / Action</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{log.blackwing_answer}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Follow-up strip ── */}
      {!!log.follow_up_needed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: isOverdue ? '#ef444420' : '#f59e0b18',
          border: `1px solid ${isOverdue ? '#ef444440' : '#f59e0b40'}`,
          borderRadius: 6, padding: '6px 12px', marginTop: 4,
        }}>
          <span style={{ fontSize: 14 }}>{isOverdue ? '🔴' : '🕐'}</span>
          <span style={{ color: isOverdue ? '#ef4444' : '#f59e0b', fontWeight: 600, fontSize: 12 }}>
            Follow-up: {formatDate(log.follow_up_date)}{isOverdue ? ' — OVERDUE' : ''}
          </span>
          {log.follow_up_responsible && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→ {log.follow_up_responsible}</span>
          )}
          {onResolveFollowup && (
            <button
              className="btn btn-sm"
              style={{ marginLeft: 'auto', fontSize: 11, background: '#22c55e', color: '#fff', border: 'none', padding: '3px 10px' }}
              onClick={() => onResolveFollowup(log)}
            >
              ✓ Mark follow-up done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Log form modal — Add / Edit log entry
// ═══════════════════════════════════════════════════════════════════════════════
function LogForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => dbToForm(baseLog(), initial));
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 14,
        width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto',
        padding: '28px 32px',
      }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 22 }}>
          {initial?.id ? 'Edit Log Entry' : 'Add Log Entry'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── Row 1: Date / Contact type / Category / Status ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1.2fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Date &amp; Time</FieldLabel>
              <input type="datetime-local" value={form.date_time} onChange={e => set('date_time', e.target.value)} required />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Contact Type</FieldLabel>
              <select value={form.contact_type} onChange={e => set('contact_type', e.target.value)}>
                {Object.entries(CONTACT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Category</FieldLabel>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Entry Status</FieldLabel>
              <select value={form.entry_status} onChange={e => set('entry_status', e.target.value)}>
                {Object.entries(ENTRY_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          {/* ── Row 2: Title (full width) ── */}
          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Title *</FieldLabel>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              required
              placeholder="Short summary of this interaction"
            />
          </label>

          {/* ── Row 3: Detailed notes (full width) ── */}
          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Detailed Notes</FieldLabel>
            <textarea
              rows={4}
              value={form.detailed_notes}
              onChange={e => set('detailed_notes', e.target.value)}
              placeholder="Full notes about the conversation, what was discussed, decisions made…"
              style={{ resize: 'vertical' }}
            />
          </label>

          {/* ── Row 4: Customer question (full width, yellow accent) ── */}
          <div className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Customer Question / Problem</FieldLabel>
            <textarea
              rows={4}
              value={form.customer_question}
              onChange={e => set('customer_question', e.target.value)}
              placeholder="What did the customer ask, request, or report as a problem?"
              style={{
                resize: 'vertical',
                borderColor: form.customer_question ? '#f59e0b88' : undefined,
                marginTop: 4,
              }}
            />
          </div>

          {/* ── Row 5: Blackwing answer (full width, green accent) ── */}
          <div className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Blackwing Answer / Action Taken</FieldLabel>
            <textarea
              rows={4}
              value={form.blackwing_answer}
              onChange={e => set('blackwing_answer', e.target.value)}
              placeholder="How did we respond? What action did we take or promise?"
              style={{
                resize: 'vertical',
                borderColor: form.blackwing_answer ? '#22c55e88' : undefined,
                marginTop: 4,
              }}
            />
          </div>

          {/* ── Row 6: Follow-up section ── */}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Checkbox row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id="followup-check"
                type="checkbox"
                checked={Boolean(form.follow_up_needed)}
                onChange={e => set('follow_up_needed', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <label htmlFor="followup-check" style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                Follow-up needed
              </label>
            </div>

            {/* Follow-up date + responsible — only shown when checked */}
            {form.follow_up_needed && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <FieldLabel>Follow-up Date</FieldLabel>
                  <input
                    type="date"
                    value={form.follow_up_date}
                    onChange={e => set('follow_up_date', e.target.value)}
                  />
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <FieldLabel>Responsible Person</FieldLabel>
                  <input
                    type="text"
                    value={form.follow_up_responsible}
                    onChange={e => set('follow_up_responsible', e.target.value)}
                    placeholder="Employee name or team"
                  />
                </label>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
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

// ═══════════════════════════════════════════════════════════════════════════════
// Customer form modal — Add / Edit customer
// ═══════════════════════════════════════════════════════════════════════════════
function CustomerForm({ initial, users, models, onSave, onCancel }) {
  // dbToForm converts null → '' so controlled inputs never get null values
  const [form, setForm] = useState(() => dbToForm(baseCustomer(), initial));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(form);
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 14,
        width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto',
        padding: '28px 32px',
      }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 22 }}>
          {initial?.id ? 'Edit Customer' : 'New Customer'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Name + Company */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Full Name *</FieldLabel>
              <input type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)} required placeholder="John Smith" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Company Name</FieldLabel>
              <input type="text" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Acme Aviation GmbH" />
            </label>
          </div>

          {/* Country + City */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Country</FieldLabel>
              <input type="text" value={form.country} onChange={e => set('country', e.target.value)} placeholder="Germany" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>City</FieldLabel>
              <input type="text" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Munich" />
            </label>
          </div>

          {/* Email + Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Email</FieldLabel>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Phone</FieldLabel>
              <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+49 89 12345678" />
            </label>
          </div>

          {/* Language + Interested aircraft */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Preferred Language</FieldLabel>
              <input type="text" value={form.preferred_language} onChange={e => set('preferred_language', e.target.value)} placeholder="English, German…" />
            </label>
            <div className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Aircraft / Model</FieldLabel>
              <AircraftSelect
                value={form.interested_aircraft}
                onChange={v => set('interested_aircraft', v)}
                models={models}
              />
            </div>
          </div>

          {/* Source + Customer type + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Source</FieldLabel>
              <select value={form.source} onChange={e => set('source', e.target.value)}>
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Customer Type</FieldLabel>
              <select value={form.customer_type} onChange={e => set('customer_type', e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Status</FieldLabel>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          {/* Priority + Assigned employee */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Priority</FieldLabel>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Assigned Employee</FieldLabel>
              <select
                value={String(form.assigned_employee_id ?? '')}
                onChange={e => set('assigned_employee_id', e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {users.map(u => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* General notes */}
          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>General Notes</FieldLabel>
            <textarea
              rows={3}
              value={form.general_notes}
              onChange={e => set('general_notes', e.target.value)}
              placeholder="Any general information about this customer…"
              style={{ resize: 'vertical' }}
            />
          </label>

          {/* Error message */}
          {saveError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ef444420', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13 }}>
              ⚠ {saveError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
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

// ─── Aircraft configurator constants ─────────────────────────────────────────
const CAT_STYLES = {
  Engine:    { color: '#f97316', bg: '#f9731615', icon: '🔧' },
  Propeller: { color: '#3b82f6', bg: '#3b82f615', icon: '⚙' },
  Avionics:  { color: '#8b5cf6', bg: '#8b5cf615', icon: '📡' },
  Interior:  { color: '#22c55e', bg: '#22c55e15', icon: '💺' },
  Paint:     { color: '#ec4899', bg: '#ec489915', icon: '🎨' },
};
function getCatStyle(cat) {
  return CAT_STYLES[cat] || { color: '#94a3b8', bg: '#94a3b815', icon: '✦' };
}
const QUOTE_STATUSES = {
  draft:       { label: 'Draft',               color: '#94a3b8' },
  sent:        { label: 'Sent to Customer',     color: '#3b82f6' },
  negotiating: { label: 'Negotiating',          color: '#f59e0b' },
  accepted:    { label: '✅ Accepted',          color: '#22c55e' },
  declined:    { label: 'Declined',             color: '#ef4444' },
  expired:     { label: 'Expired',              color: '#6b7280' },
};

const STEP_LABELS = ['Choose Model', 'Configure Options', 'Review & Save'];

// ═══════════════════════════════════════════════════════════════════════════════
// Aircraft Configurator Modal — 3-step buying process wizard
// ═══════════════════════════════════════════════════════════════════════════════
function ConfiguratorModal({ initial, models, configOptions, onSave, onCancel }) {
  // Only show models that are visible in configurator
  const visibleModels = useMemo(() =>
    models.filter(m => m.show_in_configurator),
  [models]);

  // Only show options that are visible in configurator
  const visibleOptions = useMemo(() =>
    configOptions.filter(o => o.show_in_configurator !== false && o.show_in_configurator !== 0),
  [configOptions]);

  // Locked options: always included, cannot be deselected
  const lockedOptionIds = useMemo(() =>
    new Set(visibleOptions.filter(o => o.is_locked).map(o => Number(o.id))),
  [visibleOptions]);
  // Standard options: pre-selected by default but the buyer CAN change them
  const standardOptionIds = useMemo(() =>
    new Set(visibleOptions.filter(o => o.is_standard).map(o => Number(o.id))),
  [visibleOptions]);

  const grouped = useMemo(() =>
    visibleOptions.reduce((acc, o) => {
      if (!acc[o.category]) acc[o.category] = [];
      acc[o.category].push(o);
      return acc;
    }, {}),
  [visibleOptions]);

  const [step, setStep] = useState(1);
  const [selectedModelId, setSelectedModelId] = useState(
    initial?.model_id ? Number(initial.model_id) : null
  );

  // Pre-select standard + locked for new quotes. When editing, keep what was saved
  // but always force-include locked options (they can never be off).
  const [selectedOptions, setSelectedOptions] = useState(() => {
    const visible = configOptions.filter(o => o.show_in_configurator !== false && o.show_in_configurator !== 0);
    const lockedIds = visible.filter(o => o.is_locked).map(o => Number(o.id));
    const stdIds    = visible.filter(o => o.is_standard).map(o => Number(o.id));
    if (!initial?.options?.length) return new Set([...lockedIds, ...stdIds]);
    const savedIds = initial.options.filter(o => o.option_id).map(o => Number(o.option_id));
    return new Set([...lockedIds, ...savedIds]);
  });

  const [form, setForm] = useState({
    title:   initial?.title   || '',
    status:  initial?.status  || 'draft',
    notes:   initial?.notes   || '',
    vatRate: initial?.vat_rate != null ? String(Number(initial.vat_rate)) : '20',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Support editing a quote whose model is no longer "visible in configurator"
  const selectedModel = visibleModels.find(m => m.id === selectedModelId)
    || (selectedModelId ? models.find(m => Number(m.id) === selectedModelId) : null);

  const selectedOptionsList = visibleOptions.filter(o => selectedOptions.has(Number(o.id)));
  const selectedByCategory = useMemo(() =>
    selectedOptionsList.reduce((acc, o) => {
      if (!acc[o.category]) acc[o.category] = [];
      acc[o.category].push(o);
      return acc;
    }, {}),
  [selectedOptionsList]);

  // ── Pricing ────────────────────────────────────────────────────────────────
  const basePrice = selectedModel?.base_price != null ? Number(selectedModel.base_price) : null;
  const optionsTotal = selectedOptionsList.reduce((s, o) => s + (o.price != null ? Number(o.price) : 0), 0);
  const subtotal = (basePrice ?? 0) + optionsTotal;
  const vatPct = Math.max(0, parseFloat(form.vatRate) || 0);
  const vatAmount = subtotal * (vatPct / 100);
  const totalWithVat = subtotal + vatAmount;
  const hasPricing = basePrice != null || selectedOptionsList.some(o => o.price != null);
  const fmtEur = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Weight & payload ─────────────────────────────────────────────────────────
  const emptyWeightBase = selectedModel?.empty_weight_kg != null ? Number(selectedModel.empty_weight_kg) : null;
  const mtom = selectedModel?.mtom_kg != null ? Number(selectedModel.mtom_kg) : null;
  const additionalWeight = selectedOptionsList.reduce((s, o) => s + (o.weight_kg != null ? Number(o.weight_kg) : 0), 0);
  const estEmptyWeight = emptyWeightBase != null ? emptyWeightBase + additionalWeight : null;
  const remainingPayload = (mtom != null && estEmptyWeight != null) ? mtom - estEmptyWeight : null;
  const payloadPct = (mtom && estEmptyWeight != null) ? Math.min(100, Math.max(0, (estEmptyWeight / mtom) * 100)) : null;
  const modelSpecs = (() => {
    const s = selectedModel?.specs;
    if (Array.isArray(s)) return s;
    if (!s) return [];
    try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
  })();
  const fmtKg = (n) => `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`;

  function toggleOption(id) {
    const nid = Number(id);
    if (lockedOptionIds.has(nid)) return; // locked — cannot be changed
    setSelectedOptions(prev => {
      const s = new Set(prev);
      s.has(nid) ? s.delete(nid) : s.add(nid);
      return s;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        model_id:   selectedModelId,
        model_name: selectedModel?.name || '',
        title:      form.title || null,
        status:     form.status,
        notes:      form.notes || null,
        vat_rate:   parseFloat(form.vatRate) || 20,
        options:    selectedOptionsList.map(o => ({
          option_id:       o.id,
          option_label:    o.label,
          option_category: o.category,
          option_price:    o.price != null ? Number(o.price) : null,
        })),
      }, initial?.id);
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Step indicator ──────────────────────────────────────────────────────────
  function StepBar() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
        {[1, 2, 3].map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: step >= s ? '#3b82f6' : 'var(--bg-hover, #1e2027)',
                  border: `2px solid ${step >= s ? '#3b82f6' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: step >= s ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.2s', flexShrink: 0,
                  cursor: s < step ? 'pointer' : 'default',
                }}
                onClick={() => s < step && setStep(s)}
              >
                {step > s ? '✓' : s}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: step === s ? '#3b82f6' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                {STEP_LABELS[s - 1]}
              </span>
            </div>
            {i < 2 && (
              <div style={{ height: 2, width: 80, background: step > s ? '#3b82f6' : 'var(--border)', margin: '0 4px', marginBottom: 20, flexShrink: 0, transition: 'background 0.2s' }} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  // ── Step 1: Choose Model ────────────────────────────────────────────────────
  function Step1() {
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Choose Aircraft Model</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 22 }}>
          Select the base model this customer is interested in.
        </div>
        {visibleModels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>
            No models are marked as <strong>Visible in Configurator</strong>. Enable models under <strong>Admin → Models</strong>.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
            {visibleModels.map(m => {
              const sel = m.id === selectedModelId;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  style={{
                    border: `2px solid ${sel ? '#3b82f6' : 'var(--border)'}`,
                    borderRadius: 12, padding: '22px 16px 18px',
                    cursor: 'pointer', position: 'relative', textAlign: 'center',
                    background: sel ? '#3b82f618' : 'var(--bg-secondary)',
                    transition: 'all 0.15s',
                    boxShadow: sel ? '0 0 0 3px #3b82f622' : 'none',
                  }}
                >
                  {sel && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#3b82f6', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 900,
                    }}>✓</div>
                  )}
                  <div style={{ fontSize: 32, marginBottom: 10, lineHeight: 1 }}>✈</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>{m.name}</div>
                  {m.code && (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 20,
                      background: sel ? '#3b82f622' : 'var(--bg-tertiary, #111)',
                      color: sel ? '#3b82f6' : 'var(--text-muted)',
                      border: `1px solid ${sel ? '#3b82f644' : 'var(--border)'}`,
                      fontWeight: 700, letterSpacing: '0.06em',
                    }}>
                      {m.code}
                    </span>
                  )}
                  {m.description && (
                    <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)', textAlign: 'left' }}>
                      {m.description.length > 120 ? m.description.slice(0, 120) + '…' : m.description}
                    </div>
                  )}
                  {m.base_price != null && (
                    <div style={{ marginTop: 10, fontWeight: 700, fontSize: 14, color: sel ? '#3b82f6' : 'var(--text-secondary)' }}>
                      from €{Number(m.base_price).toLocaleString('de-DE')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selected model detail panel */}
        {selectedModel && selectedModel.description && (
          <div style={{
            marginTop: 20, padding: '16px 18px', borderRadius: 12,
            background: '#3b82f60d', border: '1px solid #3b82f633',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>✈</span>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{selectedModel.name}</span>
              {selectedModel.base_price != null && (
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#3b82f6' }}>from €{Number(selectedModel.base_price).toLocaleString('de-DE')}</span>
              )}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {selectedModel.description}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: Configure Options ────────────────────────────────────────────────
  function Step2() {
    if (visibleOptions.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>
          No configuration options defined yet. Add options in <strong>Admin → Configuration Config</strong>.
        </div>
      );
    }

    const categoryOrder = ['Engine', 'Propeller', 'Avionics', 'Interior', 'Paint'];
    const sortedCategories = [
      ...categoryOrder.filter(c => grouped[c]),
      ...Object.keys(grouped).filter(c => !categoryOrder.includes(c)).sort(),
    ];

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Configure Your Aircraft</div>
          {selectedModel && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— {selectedModel.name}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          🔒 = always included &nbsp;|&nbsp; <span style={{ color: '#22c55e', fontWeight: 600 }}>Standard</span> = pre-selected (you can change it) &nbsp;|&nbsp; tap any option to add or remove
        </div>

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Categories */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {sortedCategories.map(cat => {
              const opts = grouped[cat] || [];
              const { color, bg, icon } = getCatStyle(cat);
              const catSelCount = opts.filter(o => selectedOptions.has(Number(o.id))).length;
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 15 }}>{icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color }}>{cat}</span>
                    <div style={{ flex: 1, height: 1, background: `${color}40` }} />
                    {catSelCount > 0 && (
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                        {catSelCount} selected
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8 }}>
                    {opts.map(opt => {
                      const isLocked = lockedOptionIds.has(Number(opt.id));
                      const isStd = standardOptionIds.has(Number(opt.id));
                      const sel = selectedOptions.has(Number(opt.id));
                      return (
                        <div
                          key={opt.id}
                          onClick={() => !isLocked && toggleOption(Number(opt.id))}
                          style={{
                            border: `1.5px solid ${sel ? color : 'var(--border)'}`,
                            borderRadius: 8, padding: '10px 12px',
                            cursor: isLocked ? 'default' : 'pointer',
                            background: sel ? bg : 'var(--bg-secondary)',
                            transition: 'all 0.12s',
                            display: 'flex', flexDirection: 'column', gap: 5,
                            boxShadow: sel ? `0 0 0 2px ${color}22` : 'none',
                            opacity: isLocked ? 0.95 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {/* Checkbox / lock icon */}
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                              border: `2px solid ${sel ? color : 'var(--border)'}`,
                              background: sel ? color : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.12s', fontSize: 9,
                            }}>
                              {isLocked ? '🔒' : sel ? <span style={{ color: '#fff', fontWeight: 900, lineHeight: 1 }}>✓</span> : null}
                            </div>
                            <span style={{
                              fontSize: 12.5, lineHeight: 1.35, flex: 1,
                              fontWeight: sel ? 700 : 400,
                              color: sel ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}>
                              {opt.label}
                              {(isLocked || isStd) && (
                                <span style={{
                                  marginLeft: 5, fontSize: 9, padding: '1px 6px', borderRadius: 10,
                                  background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44',
                                  fontWeight: 700, verticalAlign: 'middle', whiteSpace: 'nowrap',
                                }}>{isLocked ? 'Included' : 'Standard'}</span>
                              )}
                            </span>
                          </div>
                          {(opt.price != null || opt.weight_kg != null) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 24 }}>
                              {opt.price != null
                                ? <span style={{ fontSize: 11, fontWeight: 700, color: sel ? color : 'var(--text-muted)' }}>{Number(opt.price) === 0 ? 'Included' : `+€${Number(opt.price).toLocaleString('de-DE')}`}</span>
                                : <span />}
                              {opt.weight_kg != null && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {Number(opt.weight_kg) === 0 ? '±0 kg' : `${Number(opt.weight_kg) > 0 ? '+' : ''}${Number(opt.weight_kg)} kg`}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Your configuration — weight, payload & price */}
          <div style={{
            width: 240, flexShrink: 0,
            border: '1px solid var(--border)', borderRadius: 12,
            padding: '16px', background: 'var(--bg-tertiary, #111)',
            position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#3b82f6', marginBottom: 2 }}>Your configuration</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {selectedOptionsList.filter(o => !lockedOptionIds.has(Number(o.id))).length} option(s) selected (plus standard)
              </div>
            </div>

            {/* Weight & payload */}
            {estEmptyWeight != null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <span>Standard empty weight</span><span>{fmtKg(emptyWeightBase)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <span>Additional options</span><span>+ {fmtKg(additionalWeight)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                  <span>Estimated empty weight</span><span style={{ color: '#3b82f6' }}>{fmtKg(estEmptyWeight)}</span>
                </div>
                {mtom != null && (
                  <>
                    <div style={{ height: 8, borderRadius: 5, background: 'var(--bg-secondary)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ height: '100%', width: `${payloadPct}%`, background: remainingPayload < 0 ? '#ef4444' : '#3b82f6' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                      <span>empty weight</span><span>MTOM {fmtKg(mtom)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: remainingPayload < 0 ? '#ef4444' : 'var(--text-secondary)', marginTop: 6 }}>
                      {remainingPayload < 0
                        ? `⚠ Over MTOM by ${fmtKg(-remainingPayload)}`
                        : `Remaining payload approx. ${fmtKg(remainingPayload)} (pilot, co-pilot, luggage, fuel). Approximate values.`}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Price */}
            {hasPricing && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Price</div>
                {basePrice != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: 6 }}>Base ({selectedModel?.name})</span>
                    <span style={{ fontWeight: 600 }}>€{Number(basePrice).toLocaleString('de-DE')}</span>
                  </div>
                )}
                {optionsTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                    <span>Options</span><span style={{ fontWeight: 600 }}>+€{optionsTotal.toLocaleString('de-DE')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                  <span>Ex-VAT</span><span>€{fmtEur(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>VAT ({vatPct}%)</span><span>€{fmtEur(vatAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: '#3b82f6', borderTop: '1px solid #3b82f640', paddingTop: 6 }}>
                  <span>Inc-VAT</span><span>€{fmtEur(totalWithVat)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Specifications */}
        {modelSpecs.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>{selectedModel?.name} — Specifications</div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {modelSpecs.map((sp, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 14px', fontSize: 13,
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: i % 2 ? 'var(--bg-secondary)' : 'transparent' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{sp.label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{sp.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step 3: Review & Save ────────────────────────────────────────────────────
  function Step3() {
    return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Review & Save</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Check the full configuration, set a title and notes, then save.
        </div>

        {/* Configuration summary */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 14, background: 'var(--bg-tertiary, #111)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: selectedOptionsList.length > 0 ? 16 : 0 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>✈</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                {selectedModel?.name || <span style={{ color: '#ef4444' }}>No model selected</span>}
              </div>
              {selectedModel?.code && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{selectedModel.code}</span>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              {selectedOptions.size} option{selectedOptions.size !== 1 ? 's' : ''}
            </div>
          </div>
          {selectedOptionsList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(selectedByCategory).map(([cat, opts]) => {
                const { color, icon } = getCatStyle(cat);
                return (
                  <div key={cat} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{cat}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {opts.map(o => (
                          <span key={o.id} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                            {o.label}
                            {o.price != null && Number(o.price) > 0 && (
                              <span style={{ opacity: 0.7, marginLeft: 5 }}>+€{Number(o.price).toLocaleString('de-DE')}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No optional extras selected — base model only.{' '}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, display: 'inline', padding: '0 4px' }} onClick={() => setStep(2)}>
                Add options →
              </button>
            </div>
          )}
        </div>

        {/* Pricing breakdown */}
        {hasPricing && (
          <div style={{ border: '1px solid #3b82f640', borderRadius: 12, padding: '14px 18px', marginBottom: 14, background: '#3b82f608' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pricing Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 20px', alignItems: 'baseline' }}>
              {basePrice != null && (
                <><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Base model ({selectedModel?.name})</span>
                <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>€{fmtEur(basePrice)}</span></>
              )}
              {selectedOptionsList.filter(o => o.price != null && Number(o.price) > 0).map(o => (
                <React.Fragment key={o.id}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+ {o.label}</span>
                  <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--text-muted)' }}>€{fmtEur(Number(o.price))}</span>
                </React.Fragment>
              ))}
              <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', margin: '6px 0 3px' }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Subtotal (ex-VAT)</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>€{fmtEur(subtotal)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>VAT ({vatPct}%)</span>
              <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)' }}>€{fmtEur(vatAmount)}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>Total inc-VAT</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6', textAlign: 'right' }}>€{fmtEur(totalWithVat)}</span>
            </div>
          </div>
        )}

        {/* Title / Status / VAT rate row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 110px', gap: 12, marginBottom: 14 }}>
          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Quote Title (optional)</FieldLabel>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Full IFR spec, Training config…"
            />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Status</FieldLabel>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {Object.entries(QUOTE_STATUSES).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>VAT Rate (%)</FieldLabel>
            <input
              type="number"
              value={form.vatRate}
              onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))}
              min="0" max="100" step="0.01"
              placeholder="20"
            />
          </label>
        </div>

        <label className="form-group" style={{ margin: 0 }}>
          <FieldLabel>Notes</FieldLabel>
          <textarea
            rows={3}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Any notes about this configuration or the discussion with the customer…"
            style={{ resize: 'vertical' }}
          />
        </label>

        {saveError && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#ef444420', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13 }}>
            ⚠ {saveError}
          </div>
        )}
      </div>
    );
  }

  // ── Modal shell ──────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 16,
        width: '100%', maxWidth: 940, maxHeight: '94vh', overflowY: 'auto',
        padding: '28px 32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {initial?.id ? 'Edit Configuration' : '✈ New Aircraft Configuration'}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 18, padding: '2px 8px', lineHeight: 1 }} onClick={onCancel}>×</button>
        </div>

        {StepBar()}

        <div style={{ minHeight: 320 }}>
          {step === 1 && Step1()}
          {step === 2 && Step2()}
          {step === 3 && Step3()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {hasPricing && step === 2 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Ex-VAT: <strong style={{ color: 'var(--text-primary)' }}>€{fmtEur(subtotal)}</strong>
              </span>
            )}
            {step < 3 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && !selectedModelId}
              >
                {step === 1 && !selectedModelId ? 'Select a model first' : 'Next →'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !selectedModelId}
              >
                {saving ? 'Saving…' : initial?.id ? '💾 Save Changes' : '💾 Save Configuration'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Send Quote Email Modal
// ═══════════════════════════════════════════════════════════════════════════════
function SendEmailModal({ quote, customer, onSend, onCancel }) {
  const [toEmail, setToEmail] = useState(customer?.email || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!toEmail.trim()) { setError('Enter a recipient email address.'); return; }
    setSending(true);
    setError('');
    try {
      await onSend(quote.id, { to_email: toEmail.trim(), personal_message: message.trim() || null });
      setSent(true);
    } catch (err) {
      if (err.response?.status === 503) {
        setError('Email is not configured on the server. An administrator must set BREVO_API_KEY in the server environment (docker-compose) and restart. See the deployment notes.');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to send email.');
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, width: '100%', maxWidth: 440, padding: '36px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Email Sent!</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            The configuration proposal has been sent to <strong>{toEmail}</strong>.
          </div>
          <button className="btn btn-primary" onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, width: '100%', maxWidth: 540, padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>📧 Send Quote by Email</div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 18, padding: '2px 8px', lineHeight: 1 }} onClick={onCancel}>×</button>
        </div>

        {/* Quote summary */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, background: 'var(--bg-tertiary, #111)', fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>✈ {quote.model_name || '—'}{quote.title ? ` — ${quote.title}` : ''}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {(quote.options || []).length} option{(quote.options || []).length !== 1 ? 's' : ''} selected
            {quote.vat_rate != null && <> · VAT {Number(quote.vat_rate)}%</>}
          </div>
        </div>

        <label className="form-group" style={{ margin: '0 0 14px' }}>
          <FieldLabel>Recipient Email *</FieldLabel>
          <input
            type="email"
            value={toEmail}
            onChange={e => setToEmail(e.target.value)}
            placeholder="customer@example.com"
            autoFocus
          />
        </label>

        <label className="form-group" style={{ margin: '0 0 14px' }}>
          <FieldLabel>Personal Message (optional)</FieldLabel>
          <textarea
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Add a personal note that will appear at the top of the email…"
            style={{ resize: 'vertical' }}
          />
        </label>

        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#ef444420', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSend} disabled={sending || !toEmail.trim()}>
            {sending ? 'Sending…' : '📧 Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Book Service modal
// ═══════════════════════════════════════════════════════════════════════════════
const EMPTY_ITEM = { template_id: '', title: '', description: '' };

function BookServiceModal({ customerId, onSave, onCancel }) {
  const [fleetList, setFleetList] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({
    aircraft_id: '',
    planned_arrival_date: '',
    assigned_technician_id: '',
    planned_comments: '',
    items: [{ ...EMPTY_ITEM }],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    Promise.all([getFleetList(), getFleetServiceTemplates()]).then(([fRes, tRes]) => {
      setFleetList((fRes.data || []).filter(a => a.build_status !== 'written_off'));
      setTemplates(tRes.data || []);
    });
  }, []);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function updateItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items];
      if (key === 'template_id') {
        const tmpl = templates.find(t => String(t.id) === val);
        items[idx] = { ...items[idx], template_id: val, title: tmpl ? `${tmpl.category} – ${tmpl.title}` : items[idx].title };
      } else {
        items[idx] = { ...items[idx], [key]: val };
      }
      return { ...f, items };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.aircraft_id) return setSaveError('Select an aircraft.');
    if (!form.planned_arrival_date) return setSaveError('Set a planned date.');
    if (!form.items.length || form.items.every(i => !i.title.trim() && !i.template_id)) return setSaveError('Add at least one work item.');
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        ...form,
        items: form.items.filter(i => i.title.trim() || i.template_id),
      });
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '92vh', overflowY: 'auto', padding: '28px 32px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 20 }}>Book Service / Maintenance</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Aircraft *</FieldLabel>
              <select value={form.aircraft_id} onChange={e => set('aircraft_id', e.target.value)} required>
                <option value="">— Select aircraft —</option>
                {fleetList.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.bw_serial}{a.registration ? ` (${a.registration})` : ''}{a.model ? ` – ${a.model}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Planned Arrival Date *</FieldLabel>
              <input type="date" value={form.planned_arrival_date} onChange={e => set('planned_arrival_date', e.target.value)} required />
            </label>
          </div>

          <label className="form-group" style={{ margin: 0 }}>
            <FieldLabel>Comments / Reason</FieldLabel>
            <textarea rows={2} value={form.planned_comments} onChange={e => set('planned_comments', e.target.value)} placeholder="Why is this service being booked? What did the customer report?" style={{ resize: 'vertical' }} />
          </label>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Work Items *</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-tertiary, #111)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Service Template</span>
                        <select value={item.template_id} onChange={e => updateItem(idx, 'template_id', e.target.value)}>
                          <option value="">— Custom task —</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.category} – {t.title}</option>)}
                        </select>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Title</span>
                        <input value={item.title} onChange={e => updateItem(idx, 'title', e.target.value)} placeholder="Describe the work" />
                      </div>
                    </div>
                    <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Additional notes (optional)" style={{ fontSize: 13 }} />
                  </div>
                  <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 20, padding: '2px 6px', flexShrink: 0 }} onClick={() => set('items', form.items.filter((_, i) => i !== idx))}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, marginTop: 8 }} onClick={() => set('items', [...form.items, { ...EMPTY_ITEM }])}>+ Add Work Item</button>
          </div>

          {saveError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ef444420', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13 }}>⚠ {saveError}</div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Booking…' : 'Book Service'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════════════════
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isNew = id === 'new';

  const [customer, setCustomer] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [logOrder, setLogOrder] = useState('desc');

  const [showCustomerForm, setShowCustomerForm] = useState(isNew);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [showBookService, setShowBookService] = useState(false);
  // Resolve-follow-up modal
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveOutcome, setResolveOutcome] = useState('');
  const [resolveSaving, setResolveSaving] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [configOptions, setConfigOptions] = useState([]);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [sendEmailQuote, setSendEmailQuote] = useState(null);

  const loadCustomer = useCallback(async () => {
    if (isNew) return;
    const [cRes, lRes, bRes, qRes] = await Promise.all([
      getCustomer(id),
      getCustomerLogs(id, { order: logOrder }),
      getCustomerBookings(id),
      getCustomerQuotes(id),
    ]);
    setCustomer(cRes.data);
    setLogs(lRes.data || []);
    setBookings(bRes.data || []);
    setQuotes(qRes.data || []);
  }, [id, isNew, logOrder]);

  useEffect(() => {
    if (!isNew) setLoading(true);
    Promise.allSettled([
      isNew ? Promise.resolve(null) : loadCustomer(),
      getActiveUsers(),
      getFleetModels(),
      getFleetConfigOptions(),
    ]).then(([, uRes, mRes, coRes]) => {
      if (uRes.status === 'fulfilled')  setUsers(uRes.value?.data || []);
      if (mRes.status === 'fulfilled')  setModels(mRes.value?.data || []);
      if (coRes.status === 'fulfilled') setConfigOptions(coRes.value?.data || []);
    }).finally(() => setLoading(false));
  }, [id]); // re-run when id changes (e.g. after creating a new customer)

  useEffect(() => {
    if (!isNew && !loading) {
      getCustomerLogs(id, { order: logOrder }).then(r => setLogs(r.data || []));
    }
  }, [logOrder]);

  async function handleCreateCustomer(form) {
    const res = await createCustomer(form);
    setShowCustomerForm(false);
    navigate(`/customers/${res.data.id}`, { replace: true });
  }

  async function handleUpdateCustomer(form) {
    await updateCustomer(id, form);
    setShowCustomerForm(false);
    await loadCustomer();
  }

  async function handleSaveQuote(payload, quoteId) {
    if (quoteId) {
      await updateCustomerQuote(id, quoteId, payload);
    } else {
      await createCustomerQuote(id, payload);
    }
    setShowConfigurator(false);
    setEditingQuote(null);
    await loadCustomer();
  }

  async function handleDeleteQuote(quoteId) {
    if (!window.confirm('Delete this configuration?')) return;
    await deleteCustomerQuote(id, quoteId);
    await loadCustomer();
  }

  function openConfigurator(quote = null) {
    setEditingQuote(quote);
    setShowConfigurator(true);
  }

  function openSendEmail(quote) {
    setSendEmailQuote(quote);
    setShowSendEmail(true);
  }

  async function handleSendEmail(quoteId, payload) {
    await sendCustomerQuoteEmail(id, quoteId, payload);
  }

  async function handleCreateBooking(form) {
    await createCustomerBooking(id, form);
    setShowBookService(false);
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

  async function confirmResolveFollowup() {
    if (!resolveTarget) return;
    setResolveSaving(true);
    try {
      await doResolveFollowup(resolveTarget, resolveOutcome.trim());
      setResolveTarget(null);
      setResolveOutcome('');
    } finally {
      setResolveSaving(false);
    }
  }

  // Resolve a follow-up: record an outcome, clear the follow-up flag and close the entry
  // so it drops off the overdue/followup notifications.
  async function doResolveFollowup(log, outcome) {
    const payload = {
      date_time: localDatetimeValue(log.date_time),
      contact_type: log.contact_type,
      category: log.category,
      title: log.title,
      detailed_notes: outcome
        ? `${log.detailed_notes ? log.detailed_notes + '\n\n' : ''}✅ Follow-up outcome (${formatDate(new Date())}): ${outcome}`
        : log.detailed_notes,
      customer_question: log.customer_question,
      blackwing_answer: log.blackwing_answer,
      follow_up_needed: false,
      follow_up_date: log.follow_up_date ? String(log.follow_up_date).slice(0, 10) : null,
      follow_up_responsible: log.follow_up_responsible,
      entry_status: 'solved',
    };
    await updateCustomerLog(id, log.id, payload);
    await loadCustomer();
  }

  function openEditLog(log) {
    setEditingLog({
      ...log,
      date_time: localDatetimeValue(log.date_time),
      follow_up_date: log.follow_up_date ? String(log.follow_up_date).slice(0, 10) : '',
      follow_up_needed: Boolean(log.follow_up_needed),
    });
    setShowLogForm(true);
  }

  if (loading) return <div className="page"><div style={{ color: 'var(--text-secondary)' }}>Loading…</div></div>;

  // ── New customer: show form directly (no modal) ──
  if (isNew) {
    return (
      <div className="page">
        <CustomerForm
          users={users}
          models={models}
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
    !['solved', 'closed'].includes(l.entry_status)
  );

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/customers')} style={{ flexShrink: 0 }}>← Back</button>
          <div style={{ minWidth: 0 }}>
            <div className="page-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer.full_name}
              {customer.company_name && (
                <span style={{ fontWeight: 400, fontSize: 16, color: 'var(--text-secondary)', marginLeft: 8 }}>
                  {customer.company_name}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}44`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                {STATUS_LABELS[customer.status] || customer.status}
              </span>
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
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBookService(true)}>📅 Book Service</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditingLog(null); setShowLogForm(true); }}>+ Add Log Entry</button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={handleArchive}>Archive</button>
          )}
        </div>
      </div>

      {/* ── Info cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Contact</div>
          {customer.email && <InfoRow icon="✉️" value={customer.email} href={`mailto:${customer.email}`} />}
          {customer.phone && <InfoRow icon="📞" value={customer.phone} href={`tel:${customer.phone}`} />}
          {customer.country && <InfoRow icon="📍" value={[customer.city, customer.country].filter(Boolean).join(', ')} />}
          {customer.preferred_language && <InfoRow icon="🌐" value={customer.preferred_language} />}
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Details</div>
          {customer.customer_type && <InfoRow label="Type" value={TYPE_LABELS[customer.customer_type] || customer.customer_type} />}
          {customer.source && <InfoRow label="Source" value={SOURCE_LABELS[customer.source] || customer.source} />}
          {customer.interested_aircraft && <InfoRow label="Interested in" value={customer.interested_aircraft} />}
          {customer.assigned_employee_name && <InfoRow label="Assigned to" value={customer.assigned_employee_name} />}
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Activity</div>
          <InfoRow label="Last contact" value={customer.last_contact_date ? new Date(customer.last_contact_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
          <InfoRow
            label="Next follow-up"
            value={customer.next_followup_date ? new Date(customer.next_followup_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            valueStyle={{ color: customer.next_followup_date && new Date(customer.next_followup_date + 'T00:00:00') < new Date() ? '#ef4444' : undefined }}
          />
          <InfoRow label="Total logs" value={String(logs.length)} />
          <InfoRow label="Customer since" value={customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
        </div>
      </div>

      {/* ── General notes ── */}
      {customer.general_notes && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>General Notes</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{customer.general_notes}</div>
        </div>
      )}

      {/* ── Buying Process / Aircraft Configurations ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: quotes.length > 0 ? 16 : 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              ✈ Buying Process
              {quotes.length > 0 && (
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {quotes.length} configuration{quotes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {quotes.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                Spec an aircraft together with the customer — choose a model and select options.
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => openConfigurator(null)}>+ New Configuration</button>
        </div>

        {quotes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {quotes.map(q => {
              const qs = QUOTE_STATUSES[q.status] || { label: q.status, color: '#94a3b8' };
              const optByCategory = (q.options || []).reduce((acc, o) => {
                if (!acc[o.option_category]) acc[o.option_category] = [];
                acc[o.option_category].push(o);
                return acc;
              }, {});
              return (
                <div key={q.id} style={{
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${qs.color}`,
                  borderRadius: 10, padding: '14px 16px',
                  background: 'var(--bg-tertiary, #111)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    {/* Model name + title */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>✈ {q.model_name || '—'}</span>
                        {q.title && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>— {q.title}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: q.options?.length ? 10 : 0 }}>
                        {formatDate(q.created_at)}{q.created_by_name ? ` · by ${q.created_by_name}` : ''}
                        {' · '}{(q.options || []).length} option{(q.options || []).length !== 1 ? 's' : ''}
                      </div>

                      {/* Options as colored badges by category */}
                      {q.options && q.options.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {Object.entries(optByCategory).map(([cat, opts]) => {
                            const { color, icon } = getCatStyle(cat);
                            return (
                              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, flexShrink: 0 }}>{icon}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{cat}:</span>
                                {opts.map(o => (
                                  <span key={o.id} style={{
                                    fontSize: 11, padding: '2px 8px', borderRadius: 20,
                                    background: `${color}22`, color,
                                    border: `1px solid ${color}44`, fontWeight: 600,
                                  }}>
                                    {o.option_label}
                                  </span>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.notes && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          {q.notes}
                        </div>
                      )}
                    </div>

                    {/* Status badge + actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      <span style={{
                        padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: `${qs.color}22`, color: qs.color,
                        border: `1px solid ${qs.color}44`,
                        whiteSpace: 'nowrap',
                      }}>
                        {qs.label}
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openConfigurator(q)}>Edit</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, color: '#3b82f6', border: '1px solid #3b82f640' }}
                          onClick={() => openSendEmail(q)}
                        >
                          📧 Send Email
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: '#ef4444' }} onClick={() => handleDeleteQuote(q.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Booked Services ── */}
      {bookings.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Booked Services ({bookings.length})
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowBookService(true)}>+ Book Another</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bookings.map(b => {
              const allSigned = b.items && b.items.length > 0 && b.items.every(i => i.signed_off);
              const statusColor = b.status === 'completed' ? '#22c55e' : allSigned ? '#f59e0b' : '#3b82f6';
              const statusLabel = b.status === 'completed' ? 'Completed' : allSigned ? 'All Items Signed' : 'Planned';
              return (
                <div key={b.id} style={{
                  border: '1px solid var(--border)', borderLeft: `3px solid ${statusColor}`,
                  borderRadius: 8, padding: '10px 14px',
                  background: 'var(--bg-tertiary, #111)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {b.bw_serial}{b.registration ? ` (${b.registration})` : ''}
                        {b.model && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>{b.model}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Planned arrival: <strong>{b.planned_arrival_date ? new Date(b.planned_arrival_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</strong>
                        {b.assigned_technician_name && <> · Technician: {b.assigned_technician_name}</>}
                      </div>
                      {b.planned_comments && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{b.planned_comments}</div>
                      )}
                      {b.items && b.items.length > 0 && (
                        <ul style={{ margin: '6px 0 0 14px', padding: 0, fontSize: 12 }}>
                          {b.items.map(it => (
                            <li key={it.id} style={{ marginBottom: 2, color: it.signed_off ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                              {it.signed_off ? '✅' : '○'} {it.title || it.template_title || '—'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: statusColor + '22', color: statusColor, textTransform: 'uppercase',
                      }}>{statusLabel}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11 }}
                        onClick={() => window.location.assign(`/fleet/${b.aircraft_id}`)}
                      >View Aircraft →</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Communication log header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>
          Communication Log{' '}
          <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-secondary)' }}>({logs.length} entries)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sort:</span>
          <button className={`btn btn-sm ${logOrder === 'desc' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLogOrder('desc')}>Newest first</button>
          <button className={`btn btn-sm ${logOrder === 'asc' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLogOrder('asc')}>Oldest first</button>
        </div>
      </div>

      {/* ── Log entries ── */}
      {logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
          No log entries yet.{' '}
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline' }} onClick={() => { setEditingLog(null); setShowLogForm(true); }}>
            Add the first entry
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {logs.map(log => (
            <LogCard key={log.id} log={log} onEdit={openEditLog} onDelete={handleDeleteLog} onResolveFollowup={(l) => { setResolveTarget(l); setResolveOutcome(''); }} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showCustomerForm && (
        <CustomerForm
          initial={customer}
          users={users}
          models={models}
          onSave={handleUpdateCustomer}
          onCancel={() => setShowCustomerForm(false)}
        />
      )}
      {showLogForm && (
        <LogForm
          initial={editingLog}
          onSave={handleSaveLog}
          onCancel={() => { setShowLogForm(false); setEditingLog(null); }}
        />
      )}
      {showBookService && (
        <BookServiceModal
          customerId={id}
          onSave={handleCreateBooking}
          onCancel={() => setShowBookService(false)}
        />
      )}
      {showConfigurator && (
        <ConfiguratorModal
          initial={editingQuote}
          models={models}
          configOptions={configOptions}
          onSave={handleSaveQuote}
          onCancel={() => { setShowConfigurator(false); setEditingQuote(null); }}
        />
      )}
      {showSendEmail && sendEmailQuote && (
        <SendEmailModal
          quote={sendEmailQuote}
          customer={customer}
          onSend={handleSendEmail}
          onCancel={() => { setShowSendEmail(false); setSendEmailQuote(null); }}
        />
      )}

      {/* ── Resolve follow-up modal ── */}
      {resolveTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !resolveSaving && setResolveTarget(null)}
        >
          <div
            style={{ background: 'var(--bg-secondary)', borderRadius: 14, width: '100%', maxWidth: 460, padding: '26px 28px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#22c55e22', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>✓</span>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Complete Follow-up</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Marking <strong>“{resolveTarget.title}”</strong> as done. Add what happened (optional) — it's saved to the log and the reminder is cleared.
            </div>
            <label className="form-group" style={{ margin: 0 }}>
              <FieldLabel>Outcome</FieldLabel>
              <textarea
                rows={4}
                autoFocus
                value={resolveOutcome}
                onChange={e => setResolveOutcome(e.target.value)}
                placeholder='e.g. "Called customer back — quote accepted, moving to contract."'
                style={{ resize: 'vertical' }}
              />
            </label>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button className="btn btn-ghost" disabled={resolveSaving} onClick={() => setResolveTarget(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: '#22c55e', borderColor: '#22c55e' }}
                disabled={resolveSaving}
                onClick={confirmResolveFollowup}
              >
                {resolveSaving ? 'Saving…' : '✓ Mark Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InfoRow helper ───────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, href, valueStyle }) {
  const content = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5, fontSize: 13 }}>
      {icon && <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{icon}</span>}
      {label && <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 84 }}>{label}:</span>}
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, ...valueStyle }}>{value}</span>
    </div>
  );
  if (href) return <a href={href} style={{ textDecoration: 'none' }}>{content}</a>;
  return content;
}

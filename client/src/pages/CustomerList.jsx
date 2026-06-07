import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCustomers, getCustomerFollowups, getActiveUsers } from '../api/index';

// ─── Label maps ──────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  waiting_reply: 'Waiting for Reply',
  active_discussion: 'Active Discussion',
  quote_sent: 'Quote Sent',
  test_flight_planned: 'Test Flight Planned',
  problem_support: 'Problem / Support',
  closed_won: 'Closed – Won',
  closed_lost: 'Closed – Lost',
  future_prospect: 'Future Prospect',
};

const STATUS_COLORS = {
  new: '#6366f1',
  contacted: '#3b82f6',
  waiting_reply: '#f59e0b',
  active_discussion: '#22c55e',
  quote_sent: '#10b981',
  test_flight_planned: '#06b6d4',
  problem_support: '#ef4444',
  closed_won: '#22c55e',
  closed_lost: '#94a3b8',
  future_prospect: '#8b5cf6',
};

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const PRIORITY_COLORS = { low: '#94a3b8', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

const CONTACT_TYPE_LABELS = {
  email: 'Email', phone_call: 'Phone', whatsapp: 'WhatsApp', sms: 'SMS',
  instagram: 'Instagram', facebook: 'Facebook', meeting: 'Meeting',
  event: 'Event', internal_note: 'Internal Note', other: 'Other',
};

function StatusBadge({ status }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: (STATUS_COLORS[status] || '#94a3b8') + '22',
      color: STATUS_COLORS[status] || '#94a3b8',
      border: `1px solid ${(STATUS_COLORS[status] || '#94a3b8')}44`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[status] || '#94a3b8', display: 'inline-block' }} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const color = PRIORITY_COLORS[priority] || '#94a3b8';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', background: color + '22', color,
    }}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  const [showFollowups, setShowFollowups] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      getCustomers(),
      getCustomerFollowups(),
      getActiveUsers(),
    ]).then(([cRes, fRes, uRes]) => {
      if (cRes.status === 'fulfilled') setCustomers(cRes.value.data || []);
      if (fRes.status === 'fulfilled') setFollowups(fRes.value.data || []);
      if (uRes.status === 'fulfilled') setUsers(uRes.value.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return customers.filter((c) => {
      if (s && !(
        c.full_name?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s) ||
        c.company_name?.toLowerCase().includes(s) ||
        c.country?.toLowerCase().includes(s)
      )) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterPriority !== 'all' && c.priority !== filterPriority) return false;
      if (filterAssigned !== 'all' && String(c.assigned_employee_id) !== filterAssigned) return false;
      return true;
    });
  }, [customers, search, filterStatus, filterPriority, filterAssigned]);

  const overdueCount = followups.filter(f => f.urgency === 'overdue').length;
  const todayCount = followups.filter(f => f.urgency === 'today').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-subtitle">{filtered.length} customers{overdueCount > 0 && <span style={{ color: '#ef4444', marginLeft: 10 }}>· {overdueCount} overdue follow-up{overdueCount !== 1 ? 's' : ''}</span>}{todayCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· {todayCount} due today</span>}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {followups.length > 0 && (
            <button
              className={`btn ${showFollowups ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setShowFollowups(!showFollowups)}
            >
              Follow-ups ({followups.length})
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/customers/new')}>
            + New Customer
          </button>
        </div>
      </div>

      {/* Follow-up panel */}
      {showFollowups && followups.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
            Pending Follow-ups
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {followups.map((f) => {
              const urgencyColor = f.urgency === 'overdue' ? '#ef4444' : f.urgency === 'today' ? '#f59e0b' : '#22c55e';
              return (
                <div
                  key={f.log_id}
                  onClick={() => navigate(`/customers/${f.customer_id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    background: urgencyColor + '11',
                    border: `1px solid ${urgencyColor}33`,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: urgencyColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {f.full_name} {f.company_name ? `(${f.company_name})` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: urgencyColor, fontWeight: 600, flexShrink: 0 }}>
                    {f.urgency === 'overdue' ? 'OVERDUE' : f.urgency === 'today' ? 'TODAY' : formatDate(f.follow_up_date)}
                  </div>
                  {f.follow_up_responsible && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>→ {f.follow_up_responsible}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Search</span>
            <input
              type="text"
              placeholder="Name, email, company, country…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priority</span>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigned To</span>
            <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)}>
              <option value="all">All Employees</option>
              {users.filter(u => u.active).map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
          {customers.length === 0 ? 'No customers yet. Add your first customer.' : 'No customers match these filters.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary, #111)' }}>
                {['Name / Company', 'Country', 'Status', 'Priority', 'Assigned', 'Last Contact', 'Next Follow-up', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{c.full_name}</div>
                    {c.company_name && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{c.company_name}</div>}
                    {c.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.email}</div>}
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {c.country || '—'}
                    {c.city && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.city}</div>}
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                    <PriorityBadge priority={c.priority} />
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {c.assigned_employee_name || '—'}
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDate(c.last_contact_date)}
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {c.next_followup_date ? (
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: new Date(c.next_followup_date) < new Date() ? '#ef4444'
                          : new Date(c.next_followup_date).toDateString() === new Date().toDateString() ? '#f59e0b'
                          : 'var(--text-secondary)',
                      }}>
                        {formatDate(c.next_followup_date)}
                      </span>
                    ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
                    {c.overdue_followups > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#ef4444' }}>OVERDUE</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                    {c.log_count > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.log_count} log{c.log_count !== 1 ? 's' : ''}</span>
                    )}
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

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDashboardStats,
  getFleetList,
  getFleetUpcomingServices,
  getFleetPlannedMaintenance,
  getMaintenanceRequests,
} from '../api';

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '–';
  return new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + (String(dateStr).length === 10 ? 'T00:00:00' : ''));
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Alert card ───────────────────────────────────────────────────────────────
function AlertCard({ title, icon, accent, children, count }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${accent}`, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, background: accent, color: '#fff', borderRadius: 12, padding: '1px 9px' }}>{count}</span>
      </div>
      <div style={{ padding: '8px 16px 12px' }}>{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats]       = useState(null);
  const [fleet, setFleet]       = useState([]);
  const [services, setServices] = useState([]);
  const [planned, setPlanned]   = useState([]);
  const [portalReqs, setPortalReqs] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  useEffect(() => {
    (async () => {
      const [sRes, fRes, svcRes, pmRes, mrRes] = await Promise.allSettled([
        getDashboardStats(),
        getFleetList(),
        getFleetUpcomingServices(),
        getFleetPlannedMaintenance(),
        getMaintenanceRequests(),
      ]);
      if (sRes.status === 'fulfilled')   setStats(sRes.value.data);
      if (fRes.status === 'fulfilled')   setFleet(fRes.value.data || []);
      if (svcRes.status === 'fulfilled') setServices(svcRes.value.data || []);
      if (pmRes.status === 'fulfilled')  setPlanned(pmRes.value.data || []);
      if (mrRes.status === 'fulfilled')  setPortalReqs(mrRes.value.data || []);
      setLoading(false);
    })();
  }, []);

  // ── Derived alert lists ──
  const airworthinessAlerts = useMemo(() => {
    return fleet
      .map(a => ({ ...a, _days: daysUntil(a.airworthiness_expiry) }))
      .filter(a => a._days != null && a._days <= 60)
      .sort((a, b) => a._days - b._days);
  }, [fleet]);

  const serviceAlerts = useMemo(() => {
    return services
      .filter(s => s.overdue || (s.days_until != null && s.days_until <= 30) || (s.hours_until != null && s.hours_until <= 20))
      .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) || ((a.days_until ?? 999) - (b.days_until ?? 999)));
  }, [services]);

  const bulletinAlerts = useMemo(() => {
    return fleet.filter(a => Number(a.open_bulletin_count) > 0).sort((a, b) => b.open_bulletin_count - a.open_bulletin_count);
  }, [fleet]);

  const newRequests = useMemo(() => portalReqs.filter(r => r.status === 'new'), [portalReqs]);

  const hasAlerts = airworthinessAlerts.length > 0 || serviceAlerts.length > 0 || bulletinAlerts.length > 0 || newRequests.length > 0;

  // ── Upcoming planned maintenance (next 30 days) ──
  const upcomingPlanned = useMemo(() => {
    return planned
      .filter(p => p.status === 'planned')
      .map(p => ({ ...p, _days: daysUntil(p.planned_arrival_date || p.planned_date) }))
      .filter(p => p._days != null && p._days >= 0 && p._days <= 30)
      .sort((a, b) => a._days - b._days);
  }, [planned]);

  // ── Calendar entries keyed by yyyy-mm-dd ──
  const calEntries = useMemo(() => {
    const map = {};
    for (const p of planned) {
      const dateStr = p.planned_arrival_date || p.planned_date;
      if (!dateStr) continue;
      const key = String(dateStr).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [planned]);

  const countries = stats?.aircraft_by_country || [];

  if (loading) {
    return <div className="page"><div style={{ color: 'var(--text-secondary)' }}>Loading dashboard…</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Fleet Dashboard</div>
          <div className="page-subtitle">Production, service status, alerts, and maintenance schedule</div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Aircraft Produced" value={stats?.total_aircraft_produced ?? 0} />
        <StatCard label="Delivered Aircraft" value={stats?.delivered_aircraft ?? 0} />
        <StatCard label="Active / In Service" value={stats?.active_in_service_aircraft ?? 0} />
        <StatCard label="Countries Represented" value={countries.length} />
      </div>

      {/* ── Alerts ── */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Needs Attention</div>
      {!hasAlerts ? (
        <div className="card" style={{ borderLeft: '4px solid #22c55e', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontWeight: 600 }}>All aircraft are up to date — no expiring certificates, overdue services, or open bulletins.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
          {/* New portal maintenance requests */}
          {newRequests.length > 0 && (
            <AlertCard title="New Portal Requests" icon="📩" accent="#6366f1" count={newRequests.length}>
              {newRequests.slice(0, 8).map(r => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/customers/${r.customer_id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)' }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{r.customer_name}</strong>{r.bw_serial ? ` · BW-${r.bw_serial}` : ''}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</span>
                </div>
              ))}
              {newRequests.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>+ {newRequests.length - 8} more</div>}
            </AlertCard>
          )}

          {/* Airworthiness */}
          {airworthinessAlerts.length > 0 && (
            <AlertCard title="Airworthiness Expiring" icon="🔴" accent="#ef4444" count={airworthinessAlerts.length}>
              {airworthinessAlerts.slice(0, 8).map(a => (
                <div
                  key={a.id}
                  onClick={() => navigate(`/fleet/${a.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)' }}
                >
                  <span><strong>BW-{a.bw_serial}</strong>{a.registration ? ` · ${a.registration}` : ''}</span>
                  <span style={{ color: a._days < 0 ? 'var(--danger)' : a._days <= 14 ? '#f59e0b' : 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {a._days < 0 ? `${Math.abs(a._days)}d overdue` : `${a._days}d`}
                  </span>
                </div>
              ))}
              {airworthinessAlerts.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>+ {airworthinessAlerts.length - 8} more</div>}
            </AlertCard>
          )}

          {/* Services */}
          {serviceAlerts.length > 0 && (
            <AlertCard title="Services Due" icon="🟠" accent="#f59e0b" count={serviceAlerts.length}>
              {serviceAlerts.slice(0, 8).map((s, i) => (
                <div
                  key={`${s.aircraft_id}-${s.template_id}-${i}`}
                  onClick={() => navigate(`/fleet/${s.aircraft_id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)' }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>BW-{s.bw_serial}</strong> · {s.title}
                  </span>
                  <span style={{ color: s.overdue ? 'var(--danger)' : '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {s.overdue ? 'Overdue' : s.days_until != null ? `${s.days_until}d` : s.hours_until != null ? `${Number(s.hours_until).toFixed(0)}h` : ''}
                  </span>
                </div>
              ))}
              {serviceAlerts.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>+ {serviceAlerts.length - 8} more</div>}
            </AlertCard>
          )}

          {/* Bulletins */}
          {bulletinAlerts.length > 0 && (
            <AlertCard title="Open Service Bulletins" icon="🟡" accent="#eab308" count={bulletinAlerts.reduce((sum, a) => sum + Number(a.open_bulletin_count), 0)}>
              {bulletinAlerts.slice(0, 8).map(a => (
                <div
                  key={a.id}
                  onClick={() => navigate(`/fleet/${a.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', cursor: 'pointer', fontSize: 13, borderTop: '1px solid var(--border)' }}
                >
                  <span><strong>BW-{a.bw_serial}</strong>{a.registration ? ` · ${a.registration}` : ''}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{a.open_bulletin_count} open</span>
                </div>
              ))}
              {bulletinAlerts.length > 8 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>+ {bulletinAlerts.length - 8} more</div>}
            </AlertCard>
          )}
        </div>
      )}

      {/* ── Upcoming planned maintenance ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Upcoming Maintenance — Next 30 Days</div>
        {upcomingPlanned.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No maintenance scheduled in the next 30 days.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Arrival</th>
                  <th style={{ width: 140 }}>Aircraft</th>
                  <th>Work</th>
                  <th style={{ width: 150 }}>Technician</th>
                  <th style={{ width: 150 }}>Customer</th>
                </tr>
              </thead>
              <tbody>
                {upcomingPlanned.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/fleet/${p.aircraft_id}`)}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(p.planned_arrival_date || p.planned_date)}
                      <div style={{ fontSize: 11, color: p._days <= 3 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {p._days === 0 ? 'Today' : p._days === 1 ? 'Tomorrow' : `in ${p._days} days`}
                      </div>
                    </td>
                    <td><strong>BW-{p.bw_serial}</strong>{p.registration ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.registration}</div> : null}</td>
                    <td style={{ fontSize: 13 }}>
                      {p.items && p.items.length > 0
                        ? `${p.items.length} item${p.items.length !== 1 ? 's' : ''}${p.template_title ? ` · ${p.template_title}` : ''}`
                        : (p.template_title || p.planned_comments || '—')}
                    </td>
                    <td style={{ fontSize: 13 }}>{p.assigned_technicians || p.assigned_technician_name || '–'}</td>
                    <td style={{ fontSize: 13 }}>{p.customer_name || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Calendar ── */}
      <MaintenanceCalendar
        month={calMonth}
        entries={calEntries}
        onPrev={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
        onNext={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        onToday={() => { const d = new Date(); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
        onChip={(aircraftId) => navigate(`/fleet/${aircraftId}`)}
      />

      {/* ── Aircraft by country ── */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Aircraft by Country</div>
        {countries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No aircraft country data yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Country</th><th>Aircraft</th></tr>
              </thead>
              <tbody>
                {countries.map((row) => (
                  <tr key={row.country}><td>{row.country}</td><td>{row.aircraft_count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Monthly calendar ─────────────────────────────────────────────────────────
function MaintenanceCalendar({ month, entries, onPrev, onNext, onToday, onChip }) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Build a grid starting on Monday
  const firstDay = new Date(year, mon, 1);
  // JS: 0=Sun..6=Sat → convert to Mon=0..Sun=6
  let startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function keyFor(day) {
    return `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Maintenance Calendar</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={onPrev}>‹</button>
          <span style={{ fontWeight: 600, minWidth: 150, textAlign: 'center' }}>{MONTH_NAMES[mon]} {year}</span>
          <button className="btn btn-ghost btn-sm" onClick={onNext}>›</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={onToday}>Today</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)' }} /> Planned</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Completed</span>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (day == null) return <div key={i} style={{ minHeight: 78 }} />;
          const key = keyFor(day);
          const dayEntries = entries[key] || [];
          const isToday = key === todayStr;
          return (
            <div
              key={i}
              style={{
                minHeight: 78, border: '1px solid var(--border)', borderRadius: 6, padding: 4,
                background: isToday ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)',
                outline: isToday ? '2px solid var(--accent)' : 'none',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'right', padding: '0 2px' }}>{day}</div>
              {dayEntries.slice(0, 3).map(e => (
                <div
                  key={e.id}
                  onClick={() => onChip(e.aircraft_id)}
                  title={`BW-${e.bw_serial}${e.template_title ? ` · ${e.template_title}` : ''}${e.assigned_technician_name ? ` · ${e.assigned_technician_name}` : ''}`}
                  style={{
                    fontSize: 10, fontWeight: 600, color: '#fff', borderRadius: 3, padding: '2px 4px',
                    background: e.status === 'completed' ? '#22c55e' : 'var(--accent)',
                    cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  BW-{e.bw_serial}
                </div>
              ))}
              {dayEntries.length > 3 && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '0 2px' }}>+{dayEntries.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

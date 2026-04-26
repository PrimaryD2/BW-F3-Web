import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getAirplanes, getAirplaneProgress, getDashboardStats, getStations } from '../api';
import { useAuth } from '../context/AuthContext';

const LOSS_LABELS = {
  walked_to_warehouse: 'Walked to Warehouse',
  fix_issue: 'Fix Issue',
  missing_tools: 'Missing Tools',
  waiting_for_material: 'Waiting for Material',
  machine_downtime: 'Machine Downtime',
  other: 'Other',
};

function StatCard({ label, value, sub, color = 'var(--accent)' }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: '28px', fontWeight: '800', color }}>{value}</div>
      <div style={{ fontWeight: '600', marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{sub}</div>}
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    idle: { color: 'var(--text-muted)', label: 'Idle' },
    in_progress: { color: 'var(--accent)', label: 'In Progress' },
    blocked: { color: 'var(--danger)', label: 'Blocked (NCR)' },
    complete: { color: 'var(--success)', label: 'Complete' },
  };
  const info = map[status] || map.idle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, display: 'inline-block' }} />
      <span style={{ fontSize: '12px', color: info.color }}>{info.label}</span>
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [airplanes, setAirplanes]   = useState([]);
  const [progresses, setProgresses] = useState({});
  const [stats, setStats]           = useState(null);
  const [stations, setStations]     = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      getAirplanes({ status: 'in_progress' }),
      getDashboardStats(),
      getStations(),
    ]).then(([planesRes, statsRes, stationsRes]) => {
      const planes = planesRes.data.slice(0, 8);
      setAirplanes(planes);
      setStats(statsRes.data);
      setStations(stationsRes.data);
      // Load progress for each active plane
      Promise.all(planes.map(p => getAirplaneProgress(p.id).then(r => ({ id: p.id, data: r.data }))))
        .then(results => {
          const map = {};
          results.forEach(r => { map[r.id] = r.data; });
          setProgresses(map);
        });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 28, color: 'var(--text-secondary)' }}>Loading dashboard…</div>;

  const openNcrs = stats?.open_ncrs || [];
  const weekLoss = stats?.week_loss || [];
  const lossChartData = weekLoss.map(l => ({
    name: LOSS_LABELS[l.reason] || l.reason,
    minutes: Math.round(parseFloat(l.total_minutes)),
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Welcome back, {user?.name} — {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard label="Active Airplanes" value={stats?.active_airplanes ?? airplanes.length} color="var(--accent)" />
        <StatCard
          label="Today's Time Logged"
          value={`${Math.round(stats?.today_minutes || 0)} min`}
          sub={`${Math.floor((stats?.today_minutes || 0) / 60)}h ${Math.round((stats?.today_minutes || 0) % 60)}m`}
          color="var(--success)"
        />
        <StatCard
          label="Open NCRs"
          value={stats?.open_ncr_count ?? openNcrs.length}
          color={openNcrs.some(n => n.severity === 'high') ? 'var(--danger)' : 'var(--warning)'}
        />
        <StatCard
          label="Loss Time Today"
          value={`${Math.round(stats?.today_loss_minutes || 0)} min`}
          color="var(--warning)"
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Active airplane projects */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Airplane Projects</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/airplanes')}>View All</button>
          </div>
          {airplanes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No active projects</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {airplanes.map(plane => {
                const prog = progresses[plane.id];
                const pct = prog?.percent ?? 0;
                return (
                  <div
                    key={plane.id}
                    onClick={() => navigate(`/airplanes/${plane.id}`)}
                    style={{ cursor: 'pointer', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{plane.serial_number}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{plane.model}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--accent)' }}>{pct}%</div>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${pct === 100 ? 'green' : pct > 60 ? 'blue' : 'yellow'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {prog && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {prog.stations.map(s => (
                          <button
                            key={s.station.id}
                            onClick={ev => { ev.stopPropagation(); navigate(`/airplanes/${plane.id}/station/${s.station.id}`); }}
                            title={`${s.station.name}: ${s.percent}%`}
                            style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid',
                              borderColor: s.status === 'complete' ? 'var(--success)' : s.status === 'blocked' ? 'var(--danger)' : s.status === 'in_progress' ? 'var(--accent)' : 'var(--border)',
                              background: 'transparent',
                              color: s.status === 'complete' ? 'var(--success)' : s.status === 'blocked' ? 'var(--danger)' : s.status === 'in_progress' ? 'var(--accent)' : 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            {s.station.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Loss reasons */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Top Loss Reasons This Week</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/statistics')}>Details</button>
          </div>
          {lossChartData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No loss data this week</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={lossChartData} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--text-primary)' }} formatter={(v) => [`${v} min`, 'Lost Time']} />
                <Bar dataKey="minutes" fill="var(--warning)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Open NCRs */}
      {openNcrs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚠ Open Nonconformity Reports</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/ncr')}>View All NCRs</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NCR #</th><th>Aircraft</th><th>Station</th><th>Severity</th><th>Description</th><th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {openNcrs.map(n => (
                  <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/ncr/${n.id}`)}>
                    <td style={{ fontWeight: 700 }}>#{n.id}</td>
                    <td>{n.serial_number}</td>
                    <td>{n.station_name}</td>
                    <td>
                      <span className={`badge badge-${n.severity === 'high' ? 'danger' : n.severity === 'medium' ? 'warning' : 'success'}`}>
                        {n.severity}
                      </span>
                    </td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {n.description}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(n.created_at).toLocaleDateString()}
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

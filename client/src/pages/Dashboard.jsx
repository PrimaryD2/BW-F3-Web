import React, { useEffect, useState } from 'react';
import { getDashboardStats } from '../api';

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="page"><div style={{ color: 'var(--text-secondary)' }}>Loading dashboard…</div></div>;
  }

  const countries = stats?.aircraft_by_country || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Fleet Dashboard</div>
          <div className="page-subtitle">Production, delivery, service status, and fleet footprint</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard label="Total Aircraft Produced" value={stats?.total_aircraft_produced ?? 0} />
        <StatCard label="Delivered Aircraft" value={stats?.delivered_aircraft ?? 0} />
        <StatCard label="Active / In Service" value={stats?.active_in_service_aircraft ?? 0} />
        <StatCard label="Countries Represented" value={countries.length} />
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Aircraft by Country</div>
        {countries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No aircraft country data yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Aircraft</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((row) => (
                  <tr key={row.country}>
                    <td>{row.country}</td>
                    <td>{row.aircraft_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

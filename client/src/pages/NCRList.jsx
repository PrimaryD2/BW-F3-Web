import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNcrs, getStations } from '../api';

const SEV_BADGE  = { low: 'badge-success', medium: 'badge-warning', high: 'badge-danger' };
const STAT_BADGE = { open: 'badge-danger', under_review: 'badge-warning', resolved: 'badge-success' };

export default function NCRList() {
  const navigate = useNavigate();
  const [ncrs, setNcrs]         = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState({ status: '', severity: '', station_id: '', serial_number: '', from_date: '', to_date: '' });

  useEffect(() => {
    getStations().then(r => setStations(r.data));
    load();
  }, []);

  async function load(f = filters) {
    setLoading(true);
    try {
      const params = {};
      Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await getNcrs(params);
      setNcrs(res.data);
    } finally {
      setLoading(false);
    }
  }

  function setFilter(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(next);
  }

  function clearFilters() {
    const empty = { status: '', severity: '', station_id: '', serial_number: '', from_date: '', to_date: '' };
    setFilters(empty);
    load(empty);
  }

  const hasFilters = Object.values(filters).some(v => v);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Nonconformity Reports</div>
          <div className="page-subtitle">{ncrs.length} report{ncrs.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label>Status</label>
            <select value={filters.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label>Severity</label>
            <select value={filters.severity} onChange={e => setFilter('severity', e.target.value)}>
              <option value="">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label>Station</label>
            <select value={filters.station_id} onChange={e => setFilter('station_id', e.target.value)}>
              <option value="">All Stations</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label>Serial Number</label>
            <input placeholder="Search…" value={filters.serial_number} onChange={e => setFilter('serial_number', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label>From Date</label>
            <input type="date" value={filters.from_date} onChange={e => setFilter('from_date', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label>To Date</label>
            <input type="date" value={filters.to_date} onChange={e => setFilter('to_date', e.target.value)} />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ alignSelf: 'flex-end' }}>✕ Clear</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: 20 }}>Loading…</div>
      ) : ncrs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>No NCRs found for these filters.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Aircraft</th>
                  <th>Station</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Reporter</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {ncrs.map(n => (
                  <tr key={n.id} onClick={() => navigate(`/ncr/${n.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>#{n.id}</td>
                    <td style={{ fontWeight: 600 }}>{n.serial_number}</td>
                    <td>{n.station_name}</td>
                    <td><span className={`badge ${SEV_BADGE[n.severity]}`}>{n.severity}</span></td>
                    <td><span className={`badge ${STAT_BADGE[n.status]}`}>{n.status.replace(/_/g, ' ')}</span></td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {n.description}
                    </td>
                    <td style={{ fontSize: 12 }}>{n.reporter_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleDateString()}</td>
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

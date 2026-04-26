import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { getTimePerTask, getNcrFrequency, getLossBreakdown, getThroughput, getStations, exportCsv } from '../api';

const COLORS = ['#4f8ef7','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#fb923c','#a78bfa'];

const LOSS_LABELS = {
  walked_to_warehouse: 'Warehouse', fix_issue: 'Fix Issue', missing_tools: 'Tools',
  waiting_for_material: 'Material', machine_downtime: 'Downtime', other: 'Other',
};

const TABS = ['Time per Task', 'NCR Frequency', 'Loss Breakdown', 'Throughput'];

function FilterBar({ filters, setF, stations }) {
  return (
    <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label>Station</label>
          <select value={filters.station_id} onChange={e => setF(f => ({ ...f, station_id: e.target.value }))}>
            <option value="">All Stations</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label>From Date</label>
          <input type="date" value={filters.from_date} onChange={e => setF(f => ({ ...f, from_date: e.target.value }))} />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label>To Date</label>
          <input type="date" value={filters.to_date} onChange={e => setF(f => ({ ...f, to_date: e.target.value }))} />
        </div>
      </div>
    </div>
  );
}

export default function Statistics() {
  const [activeTab, setActiveTab] = useState(0);
  const [stations, setStations]   = useState([]);
  const [filters, setFilters]     = useState({ station_id: '', from_date: '', to_date: '' });
  const [data, setData]           = useState({});
  const [loading, setLoading]     = useState(false);

  useEffect(() => { getStations().then(r => setStations(r.data)); }, []);
  useEffect(() => { load(); }, [activeTab, filters]);

  async function load() {
    setLoading(true);
    const p = {};
    if (filters.station_id) p.station_id = filters.station_id;
    if (filters.from_date)  p.from_date  = filters.from_date;
    if (filters.to_date)    p.to_date    = filters.to_date;
    try {
      if (activeTab === 0) {
        const r = await getTimePerTask(p);
        setData({ timePerTask: r.data });
      } else if (activeTab === 1) {
        const r = await getNcrFrequency(p);
        setData({ ncr: r.data });
      } else if (activeTab === 2) {
        const r = await getLossBreakdown(p);
        setData({ loss: r.data });
      } else {
        const r = await getThroughput(p);
        setData({ throughput: r.data });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    const typeMap = { 0: 'time', 1: 'ncr', 2: 'loss', 3: '' };
    const type = typeMap[activeTab];
    if (!type) return;
    const p = { type, ...filters };
    window.open(exportCsv(p), '_blank');
  }

  const tooltipStyle = {
    contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 },
    labelStyle: { color: 'var(--text-primary)' },
  };
  const axisStyle = { fill: 'var(--text-muted)', fontSize: 11 };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Statistics</div>
          <div className="page-subtitle">Production analytics and performance metrics</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>↓ Export CSV</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setActiveTab(i)}
            style={{
              background: 'none', border: 'none', padding: '10px 20px', cursor: 'pointer',
              color: activeTab === i ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === i ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: activeTab === i ? 700 : 500, fontSize: 14, marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >{t}</button>
        ))}
      </div>

      <FilterBar filters={filters} setF={setFilters} stations={stations} />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
      ) : (
        <>
          {/* ─── Time per Task ─────────────────────────────────────────────── */}
          {activeTab === 0 && (() => {
            const rows = data.timePerTask || [];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 16 }}>Actual vs. Estimated Time per Task</div>
                  {rows.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No data available.</p> : (
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={rows} margin={{ top: 0, right: 20, left: 0, bottom: 80 }}>
                        <XAxis dataKey="task_title" tick={{ ...axisStyle }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={axisStyle} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }} />
                        <Tooltip {...tooltipStyle} formatter={(v, name) => [`${Math.round(v)} min`, name]} />
                        <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
                        <Bar dataKey="estimated_minutes" name="Estimated" fill="var(--border)" radius={[3,3,0,0]} />
                        <Bar dataKey="actual_minutes" name="Actual" radius={[3,3,0,0]}>
                          {rows.map((r, i) => (
                            <Cell key={i} fill={parseFloat(r.actual_minutes) > parseFloat(r.estimated_minutes) * 1.1 ? 'var(--danger)' : 'var(--success)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Table */}
                {rows.length > 0 && (
                  <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Station</th><th>Task</th><th>Estimated (min)</th><th>Actual (min)</th><th>Δ</th><th>Aircraft</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const diff = Math.round(parseFloat(r.actual_minutes) - parseFloat(r.estimated_minutes));
                            return (
                              <tr key={i}>
                                <td style={{ color: 'var(--accent)' }}>{r.station_name}</td>
                                <td>{r.task_title}</td>
                                <td>{Math.round(r.estimated_minutes)}</td>
                                <td>{Math.round(parseFloat(r.actual_minutes))}</td>
                                <td style={{ color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                                  {diff > 0 ? '+' : ''}{diff}
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>{r.airplane_count}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ─── NCR Frequency ─────────────────────────────────────────────── */}
          {activeTab === 1 && (() => {
            const byStation = data.ncr?.byStation || [];
            const overTime  = data.ncr?.overTime  || [];

            // Pivot byStation for grouped bar
            const stationMap = {};
            byStation.forEach(r => {
              if (!stationMap[r.station_name]) stationMap[r.station_name] = { station: r.station_name };
              stationMap[r.station_name][r.severity] = parseInt(r.count);
            });
            const stationChartData = Object.values(stationMap);

            // Pivot over-time line data
            const timeMap = {};
            overTime.forEach(r => {
              if (!timeMap[r.week]) timeMap[r.week] = { week: r.week };
              timeMap[r.week][r.severity] = parseInt(r.count);
            });
            const timeChartData = Object.values(timeMap).sort((a, b) => a.week.localeCompare(b.week));

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 16 }}>NCRs by Station & Severity</div>
                    {stationChartData.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No data.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={stationChartData}>
                          <XAxis dataKey="station" tick={axisStyle} />
                          <YAxis tick={axisStyle} />
                          <Tooltip {...tooltipStyle} />
                          <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
                          <Bar dataKey="high"   name="High"   fill="var(--danger)"  stackId="a" />
                          <Bar dataKey="medium" name="Medium" fill="var(--warning)" stackId="a" />
                          <Bar dataKey="low"    name="Low"    fill="var(--success)" stackId="a" radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 16 }}>NCRs Over Time (Weekly)</div>
                    {timeChartData.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No data.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={timeChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="week" tick={axisStyle} />
                          <YAxis tick={axisStyle} />
                          <Tooltip {...tooltipStyle} />
                          <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
                          <Line type="monotone" dataKey="high"   name="High"   stroke="var(--danger)"  strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="medium" name="Medium" stroke="var(--warning)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="low"    name="Low"    stroke="var(--success)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── Loss Breakdown ────────────────────────────────────────────── */}
          {activeTab === 2 && (() => {
            const rows = data.loss || [];
            const pieData = rows.reduce((acc, r) => {
              const label = LOSS_LABELS[r.reason] || r.reason;
              const ex = acc.find(a => a.name === label);
              if (ex) ex.value += parseFloat(r.total_minutes);
              else acc.push({ name: label, value: parseFloat(r.total_minutes) });
              return acc;
            }, []);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 16 }}>Loss Reasons (Total Minutes)</div>
                    {pieData.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No data.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip {...tooltipStyle} formatter={(v) => [`${Math.round(v)} min`]} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                      <span className="card-title">Loss by Reason & Station</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Reason</th><th>Station</th><th>Occurrences</th><th>Total (min)</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i}>
                              <td>{LOSS_LABELS[r.reason] || r.reason}</td>
                              <td style={{ color: 'var(--accent)' }}>{r.station_name}</td>
                              <td>{r.occurrences}</td>
                              <td style={{ fontWeight: 600 }}>{Math.round(parseFloat(r.total_minutes))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── Throughput ────────────────────────────────────────────────── */}
          {activeTab === 3 && (() => {
            const weekly  = data.throughput?.weekly  || [];
            const monthly = data.throughput?.monthly || [];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="grid-2">
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 16 }}>Aircraft Completed per Week</div>
                    {weekly.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No data.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={weekly}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="period" tick={axisStyle} />
                          <YAxis tick={axisStyle} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Line type="monotone" dataKey="count" name="Aircraft" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 16 }}>Aircraft Completed per Month</div>
                    {monthly.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No data.</p> : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={monthly}>
                          <XAxis dataKey="period" tick={axisStyle} />
                          <YAxis tick={axisStyle} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="count" name="Aircraft" fill="var(--success)" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

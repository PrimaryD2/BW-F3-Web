import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getFleetComponents, getFleetComponentTypes } from '../api';

const SORT_FIELDS = [
  { value: 'component_name', label: 'Component Name' },
  { value: 'component_type', label: 'Type' },
  { value: 'serial_number',  label: 'Serial Number' },
  { value: 'bw_serial',      label: 'Aircraft' },
  { value: 'software_version', label: 'Software / Version' },
  { value: 'date_installed', label: 'Date Installed' },
  { value: 'expiry_date',    label: 'Expiry Date' },
];

export default function Components() {
  const [rows,           setRows]          = useState([]);
  const [componentTypes, setComponentTypes] = useState([]);
  const [loading,        setLoading]       = useState(true);

  // Filters
  const [typeFilter,     setTypeFilter]     = useState('');
  const [aircraftFilter, setAircraftFilter] = useState('');
  const [search,         setSearch]         = useState('');
  const [sortField,      setSortField]      = useState('bw_serial');
  const [sortDir,        setSortDir]        = useState('asc');  // 'asc' | 'desc'
  const [showInstalled,   setShowInstalled]   = useState(true);
  const [showUninstalled, setShowUninstalled] = useState(false);

  useEffect(() => {
    Promise.all([
      getFleetComponents(),
      getFleetComponentTypes(),
    ]).then(([rRes, ctRes]) => {
      setRows(rRes.data || []);
      setComponentTypes(ctRes.data || []);
    }).finally(() => setLoading(false));
  }, []);

  // Re-fetch when filters change (server handles type + search)
  useEffect(() => {
    setLoading(true);
    getFleetComponents({ type: typeFilter || undefined, search: search || undefined })
      .then(r => setRows(r.data || []))
      .finally(() => setLoading(false));
  }, [typeFilter, search]);

  // Build aircraft list for dropdown from loaded rows
  const aircraftOptions = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      if (!seen.has(r.aircraft_id)) seen.set(r.aircraft_id, { id: r.aircraft_id, bw_serial: r.bw_serial, registration: r.registration });
    }
    return [...seen.values()].sort((a, b) => (a.bw_serial || '').localeCompare(b.bw_serial || '', undefined, { numeric: true }));
  }, [rows]);

  const sorted = useMemo(() => {
    let list = rows.filter(r => {
      if (!showInstalled && !r.uninstalled_at) return false;
      if (!showUninstalled && r.uninstalled_at) return false;
      if (aircraftFilter && String(r.aircraft_id) !== aircraftFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const av = (a[sortField] ?? '') + '';
      const bv = (b[sortField] ?? '') + '';
      return sortDir === 'asc' ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
    });

    return list;
  }, [rows, sortField, sortDir, showInstalled, showUninstalled, aircraftFilter]);

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  const SortHeader = ({ field, children, style }) => (
    <th
      onClick={() => toggleSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
    >
      {children}
      {sortField === field && (
        <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );

  // Group distinct types for quick count badges
  const typeCounts = useMemo(() => {
    const m = {};
    for (const r of rows) {
      if (r.component_type) m[r.component_type] = (m[r.component_type] || 0) + 1;
    }
    return m;
  }, [rows]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Components</div>
          <div className="page-subtitle">Browse and search all aircraft component serial numbers across the fleet.</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <input
          style={{ flex: '1 1 220px', maxWidth: 320 }}
          placeholder="Search serial, name, aircraft…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select
          style={{ flex: '0 0 180px' }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {componentTypes.map(ct => (
            <option key={ct.id} value={ct.name}>
              {ct.name} {typeCounts[ct.name] ? `(${typeCounts[ct.name]})` : ''}
            </option>
          ))}
          {Object.keys(typeCounts)
            .filter(t => !componentTypes.some(ct => ct.name === t))
            .sort()
            .map(t => (
              <option key={t} value={t}>{t} ({typeCounts[t]})</option>
            ))
          }
        </select>

        <select
          style={{ flex: '0 0 190px' }}
          value={aircraftFilter}
          onChange={e => setAircraftFilter(e.target.value)}
        >
          <option value="">All Aircraft</option>
          {aircraftOptions.map(a => (
            <option key={a.id} value={String(a.id)}>
              BW-{a.bw_serial}{a.registration ? ` · ${a.registration}` : ''}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInstalled} onChange={e => setShowInstalled(e.target.checked)} />
            Installed
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={showUninstalled} onChange={e => setShowUninstalled(e.target.checked)} />
            Uninstalled
          </label>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {sorted.length} component{sorted.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Type quick-filter chips */}
      {componentTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${typeFilter === '' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTypeFilter('')}
          >
            All
          </button>
          {componentTypes.map(ct => (
            <button
              key={ct.id}
              className={`btn btn-sm ${typeFilter === ct.name ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTypeFilter(prev => prev === ct.name ? '' : ct.name)}
            >
              {ct.name}
              {typeCounts[ct.name] ? (
                <span style={{
                  marginLeft: 5, fontSize: 10, background: typeFilter === ct.name ? 'rgba(255,255,255,0.3)' : 'var(--bg-hover)',
                  borderRadius: 8, padding: '0 5px',
                }}>{typeCounts[ct.name]}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {search || typeFilter ? 'No components match your search.' : 'No component serial numbers registered yet.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortHeader field="bw_serial" style={{ width: 110 }}>Aircraft</SortHeader>
                  <SortHeader field="component_type" style={{ width: 130 }}>Type</SortHeader>
                  <SortHeader field="component_name">Component</SortHeader>
                  <SortHeader field="serial_number" style={{ width: 150 }}>Serial #</SortHeader>
                  <SortHeader field="software_version" style={{ width: 130 }}>SW / Version</SortHeader>
                  <SortHeader field="date_installed" style={{ width: 110 }}>Installed</SortHeader>
                  <SortHeader field="expiry_date" style={{ width: 110 }}>Expiry</SortHeader>
                  <th style={{ width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, idx) => {
                  const showGroupHeader = sortField === 'bw_serial' && (idx === 0 || sorted[idx - 1].aircraft_id !== r.aircraft_id);
                  return (<React.Fragment key={r.id}>
                  {showGroupHeader && (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--bg-hover)', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderTop: idx === 0 ? 'none' : '2px solid var(--border)' }}>
                        BW-{r.bw_serial}{r.registration ? ` · ${r.registration}` : ''}
                      </td>
                    </tr>
                  )}
                  <tr style={{ opacity: r.uninstalled_at ? 0.55 : 1 }}>
                    <td>
                      <Link
                        to={`/fleet/${r.aircraft_id}`}
                        style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}
                      >
                        {r.bw_serial || `#${r.aircraft_id}`}
                      </Link>
                      {r.registration && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.registration}</div>
                      )}
                    </td>
                    <td>
                      {r.component_type ? (
                        <span style={{
                          display: 'inline-block', fontSize: 11, padding: '2px 8px',
                          borderRadius: 12, background: 'var(--bg-hover)',
                          color: 'var(--text-secondary)', fontWeight: 500,
                        }}>
                          {r.component_type}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.component_name || r.component || '—'}</div>
                      {r.notes && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{r.notes}</div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {r.serial_number || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {r.software_version || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.date_installed
                        ? new Date(r.date_installed).toLocaleDateString()
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.expiry_date ? (
                        <span style={{ color: new Date(r.expiry_date) < new Date() ? 'var(--danger)' : 'inherit' }}>
                          {new Date(r.expiry_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {r.uninstalled_at ? (
                        <span className="badge badge-ghost" style={{ fontSize: 10 }}>Removed</span>
                      ) : (
                        <span className="badge badge-success" style={{ fontSize: 10 }}>Installed</span>
                      )}
                    </td>
                  </tr>
                  </React.Fragment>);
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

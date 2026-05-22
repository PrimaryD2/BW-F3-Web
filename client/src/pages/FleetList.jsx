import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFleetList, createFleetAircraft, getFleetModels } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// Key used to persist the scroll position of the Aircraft list across navigation.
// Stored in sessionStorage so it survives back/forward but resets on a new tab.
const SCROLL_KEY = 'fleet_list_scroll_y';

const BUILD_STATUS_BADGE = {
  in_production: 'badge-info',
  completed: 'badge-success',
  delivered: 'badge-success',
  in_service: 'badge-success',
  stored: 'badge-ghost',
  for_sale: 'badge-warning',
  written_off: 'badge-danger',
};

const BUILD_STATUS_LABEL = {
  in_production: 'In Production',
  completed: 'Completed',
  delivered: 'Delivered',
  in_service: 'In Service',
  stored: 'Stored',
  for_sale: 'For Sale',
  written_off: 'Written Off',
};

function FlagIcon({ code }) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={`fi fi-${code.toLowerCase()}`}
      style={{ width: 20, height: 14, display: 'inline-block', borderRadius: 2, flexShrink: 0 }}
    />
  );
}

const EMPTY_FORM = {
  bw_serial: '',
  aircraft_number: '',
  model: 'BW600',
  build_status: 'in_production',
  registration: '',
  country_code: '',
  country_name: '',
  customer_name: '',
  first_flight_date: '',
  delivery_date: '',
};

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FleetList() {
  const navigate = useNavigate();
  const { isSupervisor } = useAuth();
  const toast = useToast();

  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [models, setModels] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [listRes, modelRes] = await Promise.all([getFleetList(), getFleetModels()]);
      setAircraft(listRes.data);
      setModels((modelRes.data || []).map(item => item.name));
    } finally {
      setLoading(false);
    }
  }

  // Restore scroll position once the list has rendered. useLayoutEffect runs
  // before the browser paints, so the page never visibly jumps to the top.
  useLayoutEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      window.scrollTo(0, parseInt(saved, 10) || 0);
    }
  }, [loading]);

  // Save the current scroll position whenever the user clicks a row (about to
  // navigate away). Also save on tab hide/refresh as a fallback.
  useEffect(() => {
    function persist() { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); }
    window.addEventListener('pagehide', persist);
    return () => window.removeEventListener('pagehide', persist);
  }, []);

  function openAircraft(aId) {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    navigate(`/fleet/${aId}`);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.bw_serial.trim() || !form.model) {
      setError('BW Serial and Model are required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await createFleetAircraft(form);
      toast.success(`Aircraft ${res.data.bw_serial} added.`);
      setCreate(false);
      setForm(EMPTY_FORM);
      navigate(`/fleet/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  const setF = patch => setForm(f => ({ ...f, ...patch }));

  const filtered = filter
    ? aircraft.filter(a =>
        a.bw_serial?.toLowerCase().includes(filter.toLowerCase()) ||
        a.registration?.toLowerCase().includes(filter.toLowerCase()) ||
        a.model?.toLowerCase().includes(filter.toLowerCase()) ||
        a.customer_name?.toLowerCase().includes(filter.toLowerCase())
      )
    : aircraft;

  const displayed = [...filtered].sort((a, b) => {
    const cmp = (a.bw_serial || '').localeCompare(b.bw_serial || '', undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function toggleSort() {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Aircrafts</div>
          <div className="page-subtitle">{aircraft.length} aircraft in fleet registry</div>
        </div>
        {isSupervisor && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setError(''); setCreate(true); }}>
            + Add Aircraft
          </button>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search by serial, registration, model, owner..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      ) : displayed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>Registry</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No aircraft in registry</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {isSupervisor ? 'Click "+ Add Aircraft" to register the first aircraft.' : 'No aircraft registered yet.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th
                    style={{ width: 110, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={toggleSort}
                  >
                    BW Serial {sortDir === 'asc' ? '↑' : '↓'}
                  </th>
                  <th style={{ width: 110 }}>Model</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 44 }}></th>
                  <th style={{ width: 110 }}>Registration</th>
                  <th>Owner / Customer</th>
                  <th style={{ width: 90 }}>TSN</th>
                  <th style={{ width: 180 }}>Planned Maintenance</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(a => (
                  <tr key={a.id} onClick={() => openAircraft(a.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{a.bw_serial}</div>
                      {a.aircraft_number && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{a.aircraft_number}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{a.model}</td>
                    <td>
                      <span className={`badge ${BUILD_STATUS_BADGE[a.build_status] || 'badge-ghost'}`} style={{ fontSize: 10 }}>
                        {BUILD_STATUS_LABEL[a.build_status] || a.build_status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {a.country_code ? <FlagIcon code={a.country_code} /> : null}
                    </td>
                    <td>
                      {a.registration ? (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.registration}</div>
                          {a.country_name && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.country_name}</div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.customer_name || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {a.total_hours_tsn != null
                        ? <span style={{ fontFamily: 'monospace' }}>{a.total_hours_tsn.toFixed(1)}h</span>
                        : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.planned_maintenance_date ? (
                        <div>
                          <div>{fmtDate(a.planned_maintenance_date)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {a.planned_maintenance_title || 'Scheduled task'}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No planned work</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setCreate(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Aircraft to Registry</div>
            <form onSubmit={handleCreate}>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>BW Serial *</label>
                  <input autoFocus placeholder="e.g. 040" value={form.bw_serial} onChange={e => setF({ bw_serial: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Aircraft Number</label>
                  <input placeholder="e.g. 040" value={form.aircraft_number} onChange={e => setF({ aircraft_number: e.target.value })} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Model *</label>
                  <select value={form.model} onChange={e => setF({ model: e.target.value })}>
                    {(models.length > 0 ? models : ['BW600', 'BW635RG', 'BW650']).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Build Status</label>
                  <select value={form.build_status} onChange={e => setF({ build_status: e.target.value })}>
                    {Object.entries(BUILD_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Registration</label>
                  <input placeholder="SE-XXX" value={form.registration} onChange={e => setF({ registration: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Country Code (ISO)</label>
                  <input placeholder="SE" maxLength={2} value={form.country_code} onChange={e => setF({ country_code: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Owner / Customer</label>
                <input placeholder="Name" value={form.customer_name} onChange={e => setF({ customer_name: e.target.value })} />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Add Aircraft'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFleetList, createFleetAircraft } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const BUILD_STATUS_BADGE = {
  in_production: 'badge-info',
  completed:     'badge-success',
  delivered:     'badge-success',
  in_service:    'badge-success',
  stored:        'badge-ghost',
  for_sale:      'badge-warning',
  written_off:   'badge-danger',
};
const BUILD_STATUS_LABEL = {
  in_production: 'In Production',
  completed:     'Completed',
  delivered:     'Delivered',
  in_service:    'In Service',
  stored:        'Stored',
  for_sale:      'For Sale',
  written_off:   'Written Off',
};

const MODELS = ['BW600', 'BW635RG', 'BW650', 'Other'];

// Convert ISO-3166-1 alpha-2 code → flag emoji
function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 0x1F1A5)
  );
}

const EMPTY_FORM = {
  bw_serial: '', aircraft_number: '', model: 'BW600', build_status: 'in_production',
  registration: '', country_code: '', country_name: '', customer_name: '',
  first_flight_date: '', delivery_date: '',
};

export default function FleetList() {
  const navigate = useNavigate();
  const { isSupervisor } = useAuth();
  const toast = useToast();

  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setCreate] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await getFleetList();
      setAircraft(res.data);
    } finally { setLoading(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.bw_serial.trim() || !form.model) { setError('BW Serial and Model are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await createFleetAircraft(form);
      toast.success(`Aircraft #${res.data.fleet_number} created.`);
      setCreate(false);
      setForm(EMPTY_FORM);
      navigate(`/fleet/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create');
    } finally { setSaving(false); }
  }

  const setF = patch => setForm(f => ({ ...f, ...patch }));

  const displayed = filter
    ? aircraft.filter(a =>
        a.bw_serial?.toLowerCase().includes(filter.toLowerCase()) ||
        a.registration?.toLowerCase().includes(filter.toLowerCase()) ||
        a.model?.toLowerCase().includes(filter.toLowerCase()) ||
        a.customer_name?.toLowerCase().includes(filter.toLowerCase())
      )
    : aircraft;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">F5 Service</div>
          <div className="page-subtitle">{aircraft.length} aircraft in fleet registry</div>
        </div>
        {isSupervisor && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setError(''); setCreate(true); }}>
            + Add Aircraft
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          placeholder="Search by serial, registration, model, owner…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : displayed.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
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
                  <th style={{ width: 46 }}>#</th>
                  <th style={{ width: 110 }}>BW Serial</th>
                  <th style={{ width: 110 }}>Model</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 130 }}>Registration</th>
                  <th>Owner / Customer</th>
                  <th style={{ width: 90 }}>TSN</th>
                  <th style={{ width: 130 }}>Next Inspection</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(a => (
                  <tr key={a.id} onClick={() => navigate(`/fleet/${a.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>
                      {a.fleet_number}
                    </td>
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
                    <td>
                      {a.registration ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 18, lineHeight: 1 }}>{flagEmoji(a.country_code)}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{a.registration}</div>
                            {a.country_name && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.country_name}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {a.customer_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {a.total_hours_tsn != null
                        ? <span style={{ fontFamily: 'monospace' }}>{a.total_hours_tsn.toFixed(1)}h</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.next_inspection_date ? (
                        <div>
                          <div>{new Date(a.next_inspection_date).toLocaleDateString()}</div>
                          {a.next_inspection_hours != null && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              or {a.next_inspection_hours.toFixed(0)}h
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
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
                    {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
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
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Add Aircraft'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

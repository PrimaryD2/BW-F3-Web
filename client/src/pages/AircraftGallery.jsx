import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFleetGallery } from '../api';

const SCROLL_KEY = 'aircraft_gallery_scroll_y';

const BUILD_STATUS_LABELS = {
  in_production: 'In Production',
  completed: 'Completed',
  delivered: 'Delivered',
  in_service: 'In Service',
  stored: 'Stored',
  for_sale: 'For Sale',
  written_off: 'Written Off',
};

const BUILD_STATUS_COLORS = {
  in_production: '#6366f1',
  completed:     '#22c55e',
  delivered:     '#22c55e',
  in_service:    '#22c55e',
  stored:        '#94a3b8',
  for_sale:      '#f59e0b',
  written_off:   '#ef4444',
};

function FlagIcon({ code }) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={`fi fi-${code.toLowerCase()}`}
      style={{ width: 18, height: 13, display: 'inline-block', borderRadius: 2, flexShrink: 0 }}
    />
  );
}

function uniqueOptions(items, pick) {
  return Array.from(new Set(items.map(pick).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function AircraftGallery() {
  const navigate = useNavigate();
  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    engine: 'all',
    model: 'all',
    buildStatus: 'all',
    country: 'all',
  });

  useEffect(() => {
    getFleetGallery()
      .then((res) => setAircraft(res.data || []))
      .finally(() => setLoading(false));
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) window.scrollTo(0, parseInt(saved, 10) || 0);
  }, [loading]);

  useEffect(() => {
    function persist() { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); }
    window.addEventListener('pagehide', persist);
    return () => window.removeEventListener('pagehide', persist);
  }, []);

  const filterOptions = useMemo(() => ({
    engines: uniqueOptions(aircraft, (item) => item.engine_configuration),
    models: uniqueOptions(aircraft, (item) => item.model),
    buildStatuses: uniqueOptions(aircraft, (item) => item.build_status),
    countries: uniqueOptions(aircraft, (item) => item.country_name || item.country_code),
  }), [aircraft]);

  const filtered = useMemo(() => aircraft.filter((item) => {
    if (filters.engine !== 'all' && item.engine_configuration !== filters.engine) return false;
    if (filters.model !== 'all' && item.model !== filters.model) return false;
    if (filters.buildStatus !== 'all' && item.build_status !== filters.buildStatus) return false;
    if (filters.country !== 'all' && (item.country_name || item.country_code) !== filters.country) return false;
    return true;
  }), [aircraft, filters]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Aircraft Gallery</div>
          <div className="page-subtitle">{filtered.length} aircraft shown</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Engine</span>
            <select value={filters.engine} onChange={(e) => updateFilter('engine', e.target.value)}>
              <option value="all">All Engines</option>
              {filterOptions.engines.map((engine) => <option key={engine} value={engine}>{engine}</option>)}
            </select>
          </label>

          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Model</span>
            <select value={filters.model} onChange={(e) => updateFilter('model', e.target.value)}>
              <option value="all">All Models</option>
              {filterOptions.models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>

          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Build Status</span>
            <select value={filters.buildStatus} onChange={(e) => updateFilter('buildStatus', e.target.value)}>
              <option value="all">All Statuses</option>
              {filterOptions.buildStatuses.map((status) => (
                <option key={status} value={status}>{BUILD_STATUS_LABELS[status] || status}</option>
              ))}
            </select>
          </label>

          <label className="form-group" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Country</span>
            <select value={filters.country} onChange={(e) => updateFilter('country', e.target.value)}>
              <option value="all">All Countries</option>
              {filterOptions.countries.map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
          No aircraft match these filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {filtered.map((item) => {
            const statusColor = BUILD_STATUS_COLORS[item.build_status] || '#94a3b8';
            const statusLabel = BUILD_STATUS_LABELS[item.build_status] || item.build_status;
            return (
              <button
                key={item.id}
                onClick={() => { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); navigate(`/fleet/${item.id}`); }}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Image with overlay info */}
                <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#111' }}>
                  {item.cover_image ? (
                    <img
                      src={`/uploads/fleet/${item.cover_image}`}
                      alt={item.bw_serial}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.92 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.83 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 5.61 5.61l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                    </div>
                  )}

                  {/* Status pill — top right */}
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                    borderRadius: 20, padding: '3px 10px',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: '0.03em' }}>{statusLabel}</span>
                  </div>

                  {/* Bottom gradient overlay with serial + registration */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
                    padding: '28px 14px 12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                          {item.bw_serial}
                        </div>
                        {item.registration && (
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                            {item.registration}
                          </div>
                        )}
                      </div>
                      {item.country_code && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <FlagIcon code={item.country_code} />
                          {item.country_name && (
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item.country_name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card footer — model, engine config, customer */}
                <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {item.model && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.model}</span>
                    )}
                    {item.engine_configuration && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{item.engine_configuration}</span>
                    )}
                  </div>
                  {item.customer_name && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.customer_name}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFleetGallery } from '../api';

const SCROLL_KEY = 'aircraft_gallery_scroll_y';

// Module-level cache so re-entering the page shows instantly (no reload flash)
let galleryCache = null;

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
  const [aircraft, setAircraft] = useState(galleryCache || []);
  const [loading, setLoading] = useState(!galleryCache);
  const [filters, setFilters] = useState({
    engine: 'all',
    model: 'all',
    buildStatus: 'all',
    country: 'all',
  });

  useEffect(() => {
    // Refresh in the background; show cached data immediately if we have it
    getFleetGallery()
      .then((res) => { galleryCache = res.data || []; setAircraft(galleryCache); })
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
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* ── Image area — fixed height, status pill only ── */}
                <div style={{ position: 'relative', height: 200, background: 'var(--bg-tertiary, #1a1a1a)', flexShrink: 0 }}>
                  {item.cover_image ? (
                    <img
                      src={`/uploads/thumb/fleet/${item.cover_image}`}
                      alt={item.bw_serial}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.2">
                        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-1.5 0-2.5.5-4 2L10 8.5 3.5 8 2 9.5l6 2.5-2 3.5-2.5.5L5 17l3-1 2.5 6 1.5-1.5V19l4.5-4 2.8 5.2z"/>
                      </svg>
                    </div>
                  )}

                  {/* Status pill — top right corner of image only */}
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)',
                    borderRadius: 20, padding: '3px 10px',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: '0.03em' }}>{statusLabel}</span>
                  </div>
                </div>

                {/* ── Card body — all text info below the photo ── */}
                <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>

                  {/* Row 1: serial + registration */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1 }}>
                      {item.bw_serial}
                    </span>
                    {item.registration && (
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {item.registration}
                      </span>
                    )}
                  </div>

                  {/* Row 2: model + engine config */}
                  {(item.model || item.engine_configuration) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      {item.model && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.model}</span>
                      )}
                      {item.engine_configuration && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{item.engine_configuration}</span>
                      )}
                    </div>
                  )}

                  {/* Row 3: flag + country name */}
                  {item.country_code && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FlagIcon code={item.country_code} />
                      {item.country_name && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{item.country_name}</span>
                      )}
                    </div>
                  )}

                  {/* Row 4: customer name */}
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

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
          {filtered.map((item) => (
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
              }}
            >
              <div style={{ aspectRatio: '4 / 3', background: 'var(--bg-hover)' }}>
                {item.cover_image ? (
                  <img
                    src={`/uploads/fleet/${item.cover_image}`}
                    alt={item.bw_serial}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : null}
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800 }}>{item.bw_serial}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                  {item.registration || item.model || 'Aircraft'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {item.model && <span className="badge badge-ghost">{item.model}</span>}
                  {item.engine_configuration && <span className="badge badge-ghost">{item.engine_configuration}</span>}
                  {item.build_status && <span className="badge badge-ghost">{BUILD_STATUS_LABELS[item.build_status] || item.build_status}</span>}
                  {(item.country_name || item.country_code) && <span className="badge badge-ghost">{item.country_name || item.country_code}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

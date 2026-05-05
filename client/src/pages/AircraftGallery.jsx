import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFleetGallery } from '../api';

function FlagIcon({ code }) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={`fi fi-${code.toLowerCase()}`}
      style={{ width: 20, height: 14, display: 'inline-block', borderRadius: 2, flexShrink: 0 }}
    />
  );
}

export default function AircraftGallery() {
  const navigate = useNavigate();
  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getFleetGallery()
      .then(res => setAircraft(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Aircraft Gallery</div>
          <div className="page-subtitle">{aircraft.length} aircraft in registry</div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : aircraft.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✈</div>
          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No aircraft yet</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Aircraft will appear here once added to the registry.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 20,
        }}>
          {aircraft.map(a => (
            <div
              key={a.id}
              onClick={() => navigate(`/fleet/${a.id}`)}
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Photo */}
              <div style={{ aspectRatio: '4/3', background: 'var(--bg-hover)', overflow: 'hidden', position: 'relative' }}>
                {a.cover_image ? (
                  <img
                    src={`/uploads/fleet/${a.cover_image}`}
                    alt={a.bw_serial}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div style={{
                  display: a.cover_image ? 'none' : 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  width: '100%', height: '100%',
                  color: 'var(--text-muted)', fontSize: 40,
                  position: 'absolute', inset: 0,
                  background: 'var(--bg-hover)',
                }}>✈</div>
              </div>

              {/* Info */}
              <div style={{ padding: '12px 14px' }}>
                {a.aircraft_number && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Aircraft #{a.aircraft_number}
                  </div>
                )}
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {a.bw_serial}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {a.country_code && <FlagIcon code={a.country_code} />}
                  {a.registration
                    ? <span style={{ fontWeight: 600 }}>{a.registration}</span>
                    : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No registration</span>}
                </div>
                {a.model && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{a.model}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

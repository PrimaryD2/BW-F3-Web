import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAirplanes } from '../api';

const STATUS_DOT = {
  draft:       'var(--text-muted)',
  in_progress: 'var(--accent)',
  qc_review:   'var(--warning)',
};

const NAV_ITEMS = [
  { to: '/',           label: 'Dashboard',  icon: '⬛', exact: true },
  { to: '/airplanes',  label: 'Airplanes',  icon: '✈' },
  { to: '/ncr',        label: 'NCR',        icon: '⚠' },
  { to: '/statistics', label: 'Statistics', icon: '📊' },
  { to: '/fleet',      label: 'F5 Service', icon: '🔧' },
];

const ROLE_COLORS = { admin: 'var(--danger)', supervisor: 'var(--warning)', worker: 'var(--success)' };

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Quick-nav data — active projects only
  const [activePlanes, setActivePlanes] = useState([]);

  useEffect(() => {
    getAirplanes()
      .then(res => setActivePlanes((res.data || []).filter(p => p.status !== 'completed')))
      .catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handlePlaneClick(planeId) {
    navigate(`/airplanes/${planeId}`);
    setSidebarOpen(false);
  }

  const navLinkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '500',
    color: isActive ? 'white' : 'var(--text-secondary)',
    background: isActive ? 'var(--accent)' : 'transparent',
    textDecoration: 'none', transition: 'all 0.15s',
  });

  const sidebar = (
    <nav style={{
      width: 'var(--sidebar-w)', background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      padding: '0 12px 20px', height: '100vh', position: 'sticky', top: 0, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 4px 16px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--accent)' }}>✈ F3</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Production Management</div>
      </div>

      {/* Main nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.exact} style={navLinkStyle}>
            <span>{item.icon}</span> {item.label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/admin" style={navLinkStyle}>
            <span>⚙</span> Admin
          </NavLink>
        )}
      </div>

      {/* Quick Projects nav */}
      <div style={{ marginBottom: 'auto', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          padding: '0 4px', marginBottom: '6px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <span>Quick Nav — Projects</span>
          {activePlanes.length > 0 && (
            <span style={{ color: 'var(--accent)', fontSize: '9px' }}>
              {activePlanes.length} active
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {activePlanes.length === 0 ? (
            <div style={{ padding: '6px 16px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No active projects
            </div>
          ) : (
            activePlanes.map(plane => (
              <button
                key={plane.id}
                onClick={() => handlePlaneClick(plane.id)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-secondary)',
                  textAlign: 'left', padding: '6px 16px', borderRadius: '6px',
                  fontSize: '12px', cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: STATUS_DOT[plane.status] || 'var(--text-muted)',
                  marginRight: 8, flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600 }}>{plane.serial_number}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{plane.model}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* User info */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '700', fontSize: '13px', flexShrink: 0,
          }}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '11px', color: ROLE_COLORS[user?.role] || 'var(--text-muted)', textTransform: 'capitalize' }}>
              {user?.role}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          ⎋ Sign Out
        </button>
      </div>
    </nav>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Desktop sidebar */}
      <div style={{ display: 'flex' }} className="desktop-sidebar">
        {sidebar}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 199 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div style={{
        position: 'fixed', left: sidebarOpen ? 0 : '-240px', top: 0, bottom: 0,
        width: '220px', zIndex: 200, transition: 'left 0.25s ease',
      }}>
        {sidebar}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile header */}
        <div style={{
          display: 'none', alignItems: 'center', gap: '12px',
          padding: '12px 16px', background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }} className="mobile-header">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '20px', cursor: 'pointer' }}
          >☰</button>
          <span style={{ fontWeight: '700', color: 'var(--accent)' }}>✈ F3 Production</span>
        </div>

        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-header { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

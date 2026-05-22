import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/fleet', label: 'Aircrafts', icon: 'A' },
  { to: '/gallery', label: 'Gallery', icon: 'G' },
  { to: '/planned-maintenance', label: 'Planned Maintenance', icon: 'P' },
];

const ROLE_COLORS = {
  admin: 'var(--danger)',
  supervisor: 'var(--warning)',
  worker: 'var(--success)',
};

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
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
      <div style={{ padding: '20px 4px 16px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
        <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent)', letterSpacing: '-0.3px' }}>Blackwing</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Aircraft Management</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: 'auto' }}>
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.exact} style={navLinkStyle}>
            <span>{item.icon}</span> {item.label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/admin" style={navLinkStyle}>
            <span>S</span> Admin
          </NavLink>
        )}
      </div>

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
          Sign Out
        </button>
      </div>
    </nav>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex' }} className="desktop-sidebar">
        {sidebar}
      </div>

      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 199 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div style={{
        position: 'fixed', left: sidebarOpen ? 0 : '-240px', top: 0, bottom: 0,
        width: '220px', zIndex: 200, transition: 'left 0.25s ease',
      }}>
        {sidebar}
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'none', alignItems: 'center', gap: '12px',
          padding: '12px 16px', background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }} className="mobile-header">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '20px', cursor: 'pointer' }}
          >Menu</button>
          <span style={{ fontWeight: '700', color: 'var(--accent)' }}>Blackwing</span>
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

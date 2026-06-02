import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import AirplaneList from './pages/AirplaneList';
import AirplaneDetail from './pages/AirplaneDetail';
import StationView from './pages/StationView';
import NCRList from './pages/NCRList';
import NCRDetail from './pages/NCRDetail';
import Statistics from './pages/Statistics';
import AdminPanel from './pages/AdminPanel';
import FleetList from './pages/FleetList';
import FleetDetail from './pages/FleetDetail';
import AircraftGallery from './pages/AircraftGallery';
import PlannedMaintenance from './pages/PlannedMaintenance';
import CustomerList from './pages/CustomerList';
import CustomerDetail from './pages/CustomerDetail';
import Components from './pages/Components';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-secondary)' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (user.force_password_change) return <Navigate to="/change-password" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/change-password" element={<ChangePassword />} />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="airplanes" element={<AirplaneList />} />
        <Route path="airplanes/:id" element={<AirplaneDetail />} />
        <Route path="airplanes/:airplaneId/station/:stationId" element={<StationView />} />
        <Route path="ncr" element={<NCRList />} />
        <Route path="ncr/:id" element={<NCRDetail />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="fleet" element={<FleetList />} />
        <Route path="fleet/:id" element={<FleetDetail />} />
        <Route path="gallery" element={<AircraftGallery />} />
        <Route path="planned-maintenance" element={<PlannedMaintenance />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="components" element={<Components />} />
        <Route path="admin" element={
          <ProtectedRoute roles={['admin']}>
            <AdminPanel />
          </ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

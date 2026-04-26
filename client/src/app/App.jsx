import React, { useState } from "react";
import { AuthProvider, useAuth } from "../context/AuthContext.jsx";
import { ToastProvider } from "../components/Toast.jsx";
import { Layout } from "../components/Layout.jsx";
import { LoginPage } from "../pages/LoginPage.jsx";
import { DashboardPage } from "../pages/DashboardPage.jsx";
import { AirplanesPage } from "../pages/AirplanesPage.jsx";
import { NcrPage } from "../pages/NcrPage.jsx";
import { StatisticsPage } from "../pages/StatisticsPage.jsx";
import { AdminPage } from "../pages/AdminPage.jsx";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { session } = useAuth();
  const [page, setPage] = useState("dashboard");
  if (!session || session.user.mustChangePassword) return <LoginPage />;

  return (
    <Layout page={page} setPage={setPage}>
      {page === "dashboard" ? <DashboardPage setPage={setPage} /> : null}
      {page === "airplanes" ? <AirplanesPage /> : null}
      {page === "ncrs" ? <NcrPage /> : null}
      {page === "statistics" ? <StatisticsPage /> : null}
      {page === "admin" ? <AdminPage /> : null}
    </Layout>
  );
}

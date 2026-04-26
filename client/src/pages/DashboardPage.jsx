import React from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { label } from "../utils/constants.js";

export function DashboardPage({ setPage }) {
  const { session } = useAuth();
  if (session.user.role === "Worker") {
    return <WorkerDashboard setPage={setPage} />;
  }
  return <SupervisorDashboard session={session} setPage={setPage} />;
}

function SupervisorDashboard({ session, setPage }) {
  const { data, error, loading } = useApiData("/statistics/dashboard", session.token);

  if (loading) return <div className="panel">Loading dashboard...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="stack">
      <header className="page-head">
        <div><p className="eyebrow">Live factory status</p><h2>Dashboard</h2></div>
        <button className="primary-button compact" onClick={() => setPage("airplanes")}>Open Airplanes</button>
      </header>
      <section className="metric-grid">
        <div className="panel"><span>Today logged</span><strong>{Math.round(data.today.minutes / 60)}h</strong><small>Target {Math.round(data.today.targetMinutes / 60)}h</small></div>
        <div className="panel danger"><span>Open NCRs</span><strong>{data.recentNcrs.length}</strong><small>High severity blocks sign-off</small></div>
        <div className="panel"><span>Active airplanes</span><strong>{data.airplanes.length}</strong><small>Draft and in progress</small></div>
      </section>
      <section className="panel">
        <h3>Active Airplanes</h3>
        <div className="list">
          {data.airplanes.map((airplane) => (
            <div className="row" key={airplane.id}><strong>{airplane.serial_number}</strong><span>{airplane.status}</span><progress max="100" value={airplane.completionPercent} /><b>{airplane.completionPercent}%</b></div>
          ))}
        </div>
      </section>
      <section className="station-grid">
        {data.stations.map((station) => <button className={`station-tile ${station.state.includes("blocked") ? "blocked" : station.state.includes("progress") ? "progress" : ""}`} key={station.id} onClick={() => setPage("airplanes")}><strong>{station.name}</strong><span>{station.state}</span></button>)}
      </section>
      <section className="two-col">
        <div className="panel">
          <h3>Recent Open NCRs</h3>
          {data.recentNcrs.map((ncr) => <div className="row danger-text" key={ncr.id}><strong>{ncr.serial_number}</strong><span>{ncr.station_name}</span><span>{ncr.severity}</span></div>)}
        </div>
        <div className="panel">
          <h3>Top Loss Reasons This Week</h3>
          {data.lossReasons.map((loss) => <div className="row" key={loss.reason}><strong>{label(loss.reason)}</strong><span>{loss.minutes} min</span></div>)}
        </div>
      </section>
    </div>
  );
}

function WorkerDashboard({ setPage }) {
  return (
    <div className="stack">
      <header className="page-head"><div><p className="eyebrow">Worker view</p><h2>F3 Operations</h2></div></header>
      <section className="station-grid">
        {["F3-Prep", "F3-S1", "F3-S2", "F3-S3a", "F3-S3B", "F3-S4"].map((name) => (
          <button className="station-tile" key={name} onClick={() => setPage("airplanes")}><strong>{name}</strong><span>Open station tasks</span></button>
        ))}
      </section>
    </div>
  );
}

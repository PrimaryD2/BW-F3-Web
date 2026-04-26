import React from "react";
import { useAuth } from "../context/AuthContext.jsx";

const nav = [
  ["dashboard", "Dashboard"],
  ["airplanes", "Airplanes"],
  ["ncrs", "NCRs"],
  ["statistics", "Statistics"],
  ["admin", "Admin"]
];

export function Layout({ page, setPage, children }) {
  const { session, logout } = useAuth();
  const canAdmin = session.user.role === "Admin";
  const canStats = session.user.role !== "Worker";

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Carbon fiber 2-seater</p>
          <h1>F3 Factory</h1>
        </div>
        <nav>
          {nav.map(([id, text]) => {
            if (id === "admin" && !canAdmin) return null;
            if (id === "statistics" && !canStats) return null;
            return <button key={id} className={page === id ? "nav active" : "nav"} onClick={() => setPage(id)}>{text}</button>;
          })}
        </nav>
        <div className="user-box">
          <strong>{session.user.name}</strong>
          <span>{session.user.role}</span>
          <button className="ghost-button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section className="content">{children}</section>
    </main>
  );
}

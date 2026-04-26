import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { api, openProtectedFile } from "../services/api.js";
import { useToast } from "../components/Toast.jsx";

export function NcrPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState({ status: "", severity: "", serialNumber: "", from: "", to: "" });
  const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))).toString();
  const { data, error, loading, reload } = useApiData(`/ncrs?${query}`, session.token, [query]);
  const canReview = session.user.role !== "Worker";

  async function review(id, status) {
    const resolutionNotes = status === "resolved" ? window.prompt("Resolution notes") : "";
    await api(`/ncrs/${id}/review`, { method: "PATCH", token: session.token, body: { status, resolutionNotes, notes: resolutionNotes } });
    toast.push("NCR updated");
    reload();
  }

  return (
    <div className="stack">
      <header className="page-head"><div><p className="eyebrow">Quality</p><h2>NCRs</h2></div></header>
      <section className="panel form-row">
        <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="open">open</option><option value="under_review">under_review</option><option value="resolved">resolved</option></select></label>
        <label>Severity<select value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })}><option value="">All</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
        <label>Airplane serial<input value={filters.serialNumber} onChange={(event) => setFilters({ ...filters, serialNumber: event.target.value })} /></label>
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      </section>
      {error ? <div className="error-message">{error}</div> : null}
      {loading ? <div className="panel">Loading NCRs...</div> : (
        <section className="panel table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Airplane</th><th>Station</th><th>Severity</th><th>Status</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>{data.ncrs.map((ncr) => (
              <tr key={ncr.id}>
                <td>{ncr.id}</td><td>{ncr.serial_number}</td><td>{ncr.station_name}</td><td className={ncr.severity === "high" ? "danger-text" : ""}>{ncr.severity}</td><td>{ncr.status}</td><td>{ncr.description}</td>
                <td className="inline-actions">
                  <button className="ghost-button" onClick={() => openProtectedFile(`/exports/ncrs/${ncr.id}.pdf`, session.token, `ncr-${ncr.id}.pdf`)}>PDF</button>
                  {canReview ? <button onClick={() => review(ncr.id, "under_review")}>Review</button> : null}
                  {canReview ? <button onClick={() => review(ncr.id, "resolved")}>Resolve</button> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}

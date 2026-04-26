import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useAuth } from "../context/AuthContext.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { API_URL } from "../services/api.js";
import { label } from "../utils/constants.js";

const colors = ["#55c27a", "#f0c94a", "#ef6b5a", "#59a7ff", "#9aa4ad", "#c892ff"];

export function StatisticsPage() {
  const { session } = useAuth();
  const [filters, setFilters] = useState({ from: "", to: "" });
  const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))).toString();
  const { data, error, loading } = useApiData(`/statistics?${query}`, session.token, [query]);

  if (loading) return <div className="panel">Loading statistics...</div>;
  if (error) return <div className="error-message">{error}</div>;

  async function downloadCsv() {
    const response = await fetch(`${API_URL}/statistics/csv`, { headers: { Authorization: `Bearer ${session.token}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "f3-statistics.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <header className="page-head"><div><p className="eyebrow">Analysis</p><h2>Statistics</h2></div><button className="primary-button compact" onClick={downloadCsv}>Export CSV</button></header>
      <section className="panel form-row">
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      </section>
      <section className="two-col">
        <ChartPanel title="Actual vs Estimated">
          <BarChart data={data.timeByTask}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="title" hide /><YAxis /><Tooltip /><Legend /><Bar dataKey="actual_minutes" fill="#59a7ff" /><Bar dataKey="estimated_minutes" fill="#55c27a" /></BarChart>
        </ChartPanel>
        <ChartPanel title="NCRs Over Time">
          <LineChart data={data.ncrOverTime}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Line dataKey="count" stroke="#ef6b5a" strokeWidth={3} /></LineChart>
        </ChartPanel>
      </section>
      <section className="two-col">
        <ChartPanel title="Loss Reason Breakdown">
          <PieChart><Pie data={data.lossBreakdown.map((row) => ({ ...row, name: label(row.reason) }))} dataKey="minutes" nameKey="name" outerRadius={110}>{data.lossBreakdown.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart>
        </ChartPanel>
        <ChartPanel title="Throughput by Month">
          <BarChart data={data.throughputMonth}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Bar dataKey="count" fill="#55c27a" /></BarChart>
        </ChartPanel>
      </section>
      <section className="panel table-wrap">
        <h3>Time Table</h3>
        <table><thead><tr><th>Station</th><th>Task</th><th>Actual</th><th>Estimated</th></tr></thead><tbody>{data.timeByTask.map((row, index) => <tr key={index}><td>{row.station}</td><td>{row.title}</td><td>{row.actual_minutes}</td><td>{row.estimated_minutes}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}

function ChartPanel({ title, children }) {
  return <section className="panel chart-panel"><h3>{title}</h3><ResponsiveContainer width="100%" height={280}>{children}</ResponsiveContainer></section>;
}

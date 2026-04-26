import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useApiData } from "../hooks/useApiData.js";
import { api } from "../services/api.js";
import { useToast } from "../components/Toast.jsx";

export function AdminPage() {
  const [tab, setTab] = useState("users");
  return (
    <div className="stack">
      <header className="page-head"><div><p className="eyebrow">Administration</p><h2>Admin</h2></div></header>
      <div className="toolbar"><button className={tab === "users" ? "chip active" : "chip"} onClick={() => setTab("users")}>Users</button><button className={tab === "templates" ? "chip active" : "chip"} onClick={() => setTab("templates")}>Templates</button><button className={tab === "audit" ? "chip active" : "chip"} onClick={() => setTab("audit")}>Audit Logs</button></div>
      {tab === "users" ? <UsersAdmin /> : tab === "templates" ? <TemplatesAdmin /> : <AuditAdmin />}
    </div>
  );
}

function UsersAdmin() {
  const { session } = useAuth();
  const toast = useToast();
  const { data, reload } = useApiData("/users", session.token);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Worker" });

  async function create(event) {
    event.preventDefault();
    await api("/users", { method: "POST", token: session.token, body: form });
    toast.push("User created");
    setForm({ name: "", username: "", password: "", role: "Worker" });
    reload();
  }

  async function toggle(user) {
    if (!window.confirm(`${user.active ? "Deactivate" : "Activate"} ${user.name}?`)) return;
    await api(`/users/${user.id}`, { method: "PUT", token: session.token, body: { ...user, active: !user.active, mustChangePassword: user.mustChangePassword } });
    toast.push("User updated");
    reload();
  }

  async function reset(user) {
    const password = window.prompt(`New temporary password for ${user.name}`);
    if (!password) return;
    await api(`/users/${user.id}/reset-password`, { method: "POST", token: session.token, body: { password } });
    toast.push("Password reset and password change forced");
    reload();
  }

  async function changeRole(user) {
    const role = window.prompt("Role: Admin, Supervisor, or Worker", user.role);
    if (!role) return;
    await api(`/users/${user.id}`, { method: "PUT", token: session.token, body: { name: user.name, role, active: user.active, mustChangePassword: user.mustChangePassword } });
    toast.push("Role updated");
    reload();
  }

  return (
    <section className="panel stack">
      <form className="form-row" onSubmit={create}>
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
        <label>Password<input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option>Worker</option><option>Supervisor</option><option>Admin</option></select></label>
        <button className="primary-button">Create User</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Active</th><th></th></tr></thead><tbody>{data?.users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.username}</td><td>{user.role}</td><td>{user.active ? "Yes" : "No"}</td><td className="inline-actions"><button onClick={() => changeRole(user)}>Role</button><button onClick={() => reset(user)}>Reset</button><button onClick={() => toggle(user)}>{user.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
    </section>
  );
}

function TemplatesAdmin() {
  const { session } = useAuth();
  const toast = useToast();
  const { data: stationData } = useApiData("/stations", session.token);
  const { data, reload } = useApiData("/task-templates", session.token);
  const [form, setForm] = useState({ stationId: "", title: "", description: "", estimatedMinutes: 30, orderIndex: 1, active: true });

  async function save(event) {
    event.preventDefault();
    await api("/task-templates", { method: "POST", token: session.token, body: form });
    toast.push("Template created");
    setForm({ ...form, title: "", description: "" });
    reload();
  }

  async function toggle(template) {
    await api(`/task-templates/${template.id}`, { method: "PUT", token: session.token, body: { stationId: template.station_id, title: template.title, description: template.description, estimatedMinutes: template.estimated_minutes, orderIndex: template.order_index, active: !template.active } });
    toast.push("Template updated");
    reload();
  }

  async function edit(template) {
    const title = window.prompt("Template title", template.title);
    if (!title) return;
    const orderIndex = Number(window.prompt("Order index", template.order_index) || template.order_index);
    const estimatedMinutes = Number(window.prompt("Estimated minutes", template.estimated_minutes) || template.estimated_minutes);
    await api(`/task-templates/${template.id}`, { method: "PUT", token: session.token, body: { stationId: template.station_id, title, description: template.description, estimatedMinutes, orderIndex, active: template.active } });
    toast.push("Template edited");
    reload();
  }

  return (
    <section className="panel stack">
      <form className="form-row" onSubmit={save}>
        <label>Station<select value={form.stationId} onChange={(event) => setForm({ ...form, stationId: event.target.value })}><option value="">Select</option>{stationData?.stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
        <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Estimated min<input type="number" value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: event.target.value })} /></label>
        <label>Order<input type="number" value={form.orderIndex} onChange={(event) => setForm({ ...form, orderIndex: event.target.value })} /></label>
        <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <button className="primary-button">Add Template</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Station</th><th>Order</th><th>Title</th><th>Est.</th><th>Active</th><th></th></tr></thead><tbody>{data?.templates.map((template) => <tr key={template.id}><td>{template.station_name}</td><td>{template.order_index}</td><td>{template.title}</td><td>{template.estimated_minutes}</td><td>{template.active ? "Yes" : "No"}</td><td className="inline-actions"><button onClick={() => edit(template)}>Edit</button><button onClick={() => toggle(template)}>{template.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
    </section>
  );
}

function AuditAdmin() {
  const { session } = useAuth();
  const { data } = useApiData("/audit-logs", session.token);
  return <section className="panel table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th></tr></thead><tbody>{data?.logs.map((log) => <tr key={log.id}><td>{log.created_at}</td><td>{log.user_name || "System"}</td><td>{log.action}</td><td>{log.entity_type} #{log.entity_id}</td></tr>)}</tbody></table></section>;
}

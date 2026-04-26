import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, openProtectedFile } from "../services/api.js";
import { useApiData } from "../hooks/useApiData.js";
import { PasswordConfirm } from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";
import { airplaneStatuses, lossReasons, label } from "../utils/constants.js";

export function AirplanesPage() {
  const { session } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("active");
  const [form, setForm] = useState({ serialNumber: "", model: "F3 Carbon 2-Seater" });
  const { data, error, loading, reload } = useApiData(`/airplanes?filter=${filter}`, session.token, [filter]);
  const canManage = session.user.role !== "Worker";

  async function create(event) {
    event.preventDefault();
    await api("/airplanes", { method: "POST", token: session.token, body: form });
    setForm({ serialNumber: "", model: "F3 Carbon 2-Seater" });
    toast.push("Airplane created with current active task templates");
    reload();
  }

  if (selected) return <AirplaneDetail id={selected} onBack={() => { setSelected(null); reload(); }} />;

  return (
    <div className="stack">
      <header className="page-head"><div><p className="eyebrow">Projects</p><h2>Airplanes</h2></div></header>
      <div className="toolbar">
        {["active", "completed", "archived", "all"].map((item) => <button key={item} className={filter === item ? "chip active" : "chip"} onClick={() => setFilter(item)}>{item}</button>)}
      </div>
      {canManage ? (
        <form className="panel form-row" onSubmit={create}>
          <label>Serial number<input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></label>
          <label>Model<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label>
          <button className="primary-button" type="submit">Create Airplane</button>
        </form>
      ) : null}
      {error ? <div className="error-message">{error}</div> : null}
      {loading ? <div className="panel">Loading...</div> : (
        <div className="cards">
          {data.airplanes.map((airplane) => (
            <button className="airplane-card" key={airplane.id} onClick={() => setSelected(airplane.id)}>
              <span>{airplane.model}</span>
              <strong>{airplane.serial_number}</strong>
              <em>{airplane.status}</em>
              <progress max="100" value={airplane.completionPercent} />
              <b>{airplane.completionPercent}% complete</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AirplaneDetail({ id, onBack }) {
  const { session } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApiData(`/airplanes/${id}`, session.token, [id]);
  const [sign, setSign] = useState(null);
  const [lossTask, setLossTask] = useState(null);
  const [ncr, setNcr] = useState(null);
  const canManage = session.user.role !== "Worker";

  async function action(path, message, body = {}) {
    await api(path, { method: "POST", token: session.token, body });
    toast.push(message);
    reload();
  }

  async function updateStatus(status) {
    await api(`/airplanes/${id}/status`, { method: "PATCH", token: session.token, body: { status } });
    toast.push("Airplane status updated");
    reload();
  }

  if (loading) return <div className="panel">Loading airplane...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="stack">
      <header className="page-head">
        <div><button className="ghost-button" onClick={onBack}>Back</button><p className="eyebrow">{data.airplane.model}</p><h2>{data.airplane.serial_number}</h2></div>
        {canManage ? <select value={data.airplane.status} onChange={(event) => updateStatus(event.target.value)}>{airplaneStatuses.map((status) => <option key={status}>{status}</option>)}</select> : null}
      </header>
      {data.stations.map((station) => (
        <section className="panel" key={station.id}>
          <div className="section-head">
            <h3>{station.name}</h3>
            <div className="inline-actions">
              <span>{station.completionPercent}%</span>
              <button className="ghost-button" onClick={() => openProtectedFile(`/exports/airplanes/${id}/stations/${station.id}/task-sheet.pdf`, session.token, `${data.airplane.serial_number}-${station.name}.pdf`)}>PDF</button>
              <button className="ghost-button" onClick={() => setNcr({ stationId: station.id })}>Report NCR</button>
            </div>
          </div>
          <div className="task-list">
            {station.tasks.map((task) => (
              <div className={`task-row status-${task.status.toLowerCase().replaceAll(" ", "-")}`} key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.description}</p>
                  <small>Est. {task.estimated_minutes} min | Actual {task.actual_minutes} min | {task.status}</small>
                  {task.notes ? <p className="notes">{task.notes}</p> : null}
                </div>
                <div className="task-actions">
                  <button onClick={() => action(`/task-instances/${task.id}/timers/start`, "Timer started")}>Start Timer</button>
                  <button onClick={() => setLossTask(task)}>Stop Timer</button>
                  <button onClick={() => action(`/task-instances/${task.id}/complete`, "Task ready for sign-off")}>Complete</button>
                  <button onClick={() => setSign({ task, signatureType: "primary" })}>Sign Off</button>
                  <button onClick={() => setSign({ task, signatureType: "double" })}>Double Sign</button>
                  <button onClick={() => setNcr({ stationId: station.id, taskInstanceId: task.id })}>NCR</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {sign ? <PasswordConfirm title={`${sign.signatureType === "primary" ? "Sign Off" : "Double Sign"} ${sign.task.title}`} actionLabel="Confirm Sign-off" onClose={() => setSign(null)} onSubmit={(password) => action(`/task-instances/${sign.task.id}/signoffs`, "Sign-off saved", { password, signatureType: sign.signatureType })} /> : null}
      {lossTask ? <StopTimerDialog task={lossTask} onClose={() => setLossTask(null)} onSubmit={(body) => action(`/task-instances/${lossTask.id}/timers/stop`, "Timer stopped", body)} /> : null}
      {ncr ? <NcrDialog airplaneId={id} data={ncr} onClose={() => setNcr(null)} onSubmit={(body) => action("/ncrs", "NCR submitted", body)} /> : null}
    </div>
  );
}

function StopTimerDialog({ task, onClose, onSubmit }) {
  const [slowed, setSlowed] = useState(false);
  const [loss, setLoss] = useState({ reason: "other", durationMinutes: 5, notes: "" });
  return (
    <div className="modal-backdrop"><section className="modal">
      <div className="modal-head"><h2>Stop Timer</h2><button className="ghost-button" onClick={onClose}>Close</button></div>
      <p>Did anything slow you down on {task.title}?</p>
      <label className="check"><input type="checkbox" checked={slowed} onChange={(event) => setSlowed(event.target.checked)} /> Yes, log production loss</label>
      {slowed ? <>
        <label>Reason<select value={loss.reason} onChange={(event) => setLoss({ ...loss, reason: event.target.value })}>{lossReasons.map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}</select></label>
        <label>Loss minutes<input type="number" min="1" value={loss.durationMinutes} onChange={(event) => setLoss({ ...loss, durationMinutes: event.target.value })} /></label>
        <label>Notes<textarea value={loss.notes} onChange={(event) => setLoss({ ...loss, notes: event.target.value })} /></label>
      </> : null}
      <button className="primary-button" onClick={() => onSubmit(slowed ? { loss } : {})}>Stop Timer</button>
    </section></div>
  );
}

function NcrDialog({ airplaneId, data, onClose, onSubmit }) {
  const [form, setForm] = useState({ description: "", severity: "medium" });
  return (
    <div className="modal-backdrop"><section className="modal">
      <div className="modal-head"><h2>Submit NCR</h2><button className="ghost-button" onClick={onClose}>Close</button></div>
      <label>Severity<select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
      <label>Description<textarea rows="5" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <button className="danger-button" onClick={() => onSubmit({ ...form, airplaneId, stationId: data.stationId, taskInstanceId: data.taskInstanceId })}>Submit NCR</button>
    </section></div>
  );
}

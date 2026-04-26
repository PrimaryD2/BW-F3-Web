import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTasks, updateTask, startTimer, stopTimer, getAirplane } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import SignOffModal from '../components/SignOffModal';
import LossLogModal from '../components/LossLogModal';
import NCRModal from '../components/NCRModal';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_COLOR = {
  not_started:    'var(--text-muted)',
  in_progress:    'var(--accent)',
  pending_signoff:'var(--purple)',
  signed:         'var(--warning)',
  double_signed:  'var(--success)',
};
const STATUS_BG = {
  not_started:    'rgba(148,163,184,0.08)',
  in_progress:    'rgba(79,142,247,0.10)',
  pending_signoff:'rgba(139,92,246,0.10)',
  signed:         'rgba(245,158,11,0.10)',
  double_signed:  'rgba(34,197,94,0.10)',
};

function formatMinutes(mins) {
  if (!mins && mins !== 0) return '—';
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function ElapsedTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
    {h > 0 && `${h}h `}{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
  </span>;
}

export default function StationView() {
  const { airplaneId, stationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [airplane, setAirplane]   = useState(null);
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [stationName, setStation] = useState('');

  const [signOffModal, setSignOffModal]   = useState(null); // { task, type }
  const [lossModal, setLossModal]         = useState(null); // { taskId, title, stoppedLogId }
  const [ncrModal, setNcrModal]           = useState(null); // { taskId }
  const [expandedTask, setExpanded]       = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(null); // task

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, planeRes] = await Promise.all([
        getTasks(airplaneId, stationId),
        getAirplane(airplaneId),
      ]);
      setTasks(taskRes.data);
      setAirplane(planeRes.data);
      if (taskRes.data.length > 0) {
        setStation(taskRes.data[0].station_name || '');
      }
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [airplaneId, stationId]);

  useEffect(() => { load(); }, [load]);

  // Determine if a task is unlocked (all prior tasks double_signed)
  function isUnlocked(task, index) {
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (tasks[i].status !== 'double_signed') return false;
    }
    return true;
  }

  async function handleStartTimer(task) {
    try {
      await startTimer({ task_instance_id: task.id });
      toast.success('Timer started.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start timer');
    }
  }

  async function handleStopTimer(task) {
    try {
      await stopTimer(task.my_active_timer.id);
      toast.info('Timer stopped.');
      setLossModal({ taskId: task.id, title: task.title });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to stop timer');
    }
  }

  async function handleSubmitForSignoff(task) {
    try {
      await updateTask(task.id, { status: 'pending_signoff' });
      toast.success('Task submitted for sign-off.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  }

  async function handleSaveNotes(taskId, notes) {
    try {
      await updateTask(taskId, { notes });
      toast.success('Notes saved.');
      load();
    } catch (err) {
      toast.error('Failed to save notes');
    }
  }

  function handleSignOffSuccess(data) {
    setSignOffModal(null);
    load();
  }

  function getSignOffAction(task) {
    const primary = task.signoffs?.find(s => s.signature_type === 'primary');
    const dbl     = task.signoffs?.find(s => s.signature_type === 'double');
    if (!primary && (task.status === 'in_progress' || task.status === 'pending_signoff')) {
      return { type: 'primary', label: 'Sign Off' };
    }
    if (primary && !dbl && task.status === 'signed') {
      const canDouble = primary.signed_by_user_id !== user.id || user.role !== 'worker';
      return canDouble ? { type: 'double', label: 'Double Sign Off' } : null;
    }
    return null;
  }

  const pdfUrl = `/api/pdf/task-sheet/${airplaneId}/${stationId}`;

  if (loading) return <div style={{ padding: 28, color: 'var(--text-secondary)' }}>Loading tasks…</div>;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <button onClick={() => navigate(`/airplanes/${airplaneId}`)} className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
            ← Back to {airplane?.serial_number}
          </button>
          <div className="page-title">Station {tasks[0]?.station_name || stationId}</div>
          <div className="page-subtitle">{airplane?.serial_number} · {airplane?.model}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setNcrModal({ taskId: null })}>
            ⚠ File NCR
          </button>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            ↓ PDF
          </a>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-muted)' }}>No task templates defined for this station.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tasks.map((task, index) => {
            const unlocked = isUnlocked(task, index);
            const signoffAction = getSignOffAction(task);
            const primary = task.signoffs?.find(s => s.signature_type === 'primary');
            const dbl     = task.signoffs?.find(s => s.signature_type === 'double');
            const overTime = task.total_minutes > 0 && task.total_minutes > task.estimated_minutes * 1.1;
            const isExpanded = expandedTask === task.id;

            return (
              <div
                key={task.id}
                style={{
                  background: STATUS_BG[task.status],
                  border: `1px solid ${task.blocked_by_ncr ? 'var(--danger)' : STATUS_COLOR[task.status]}`,
                  borderRadius: 10, overflow: 'hidden',
                  opacity: unlocked ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Task header */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : task.id)}
                  style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  {/* Order badge */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: STATUS_COLOR[task.status], display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13, color: 'white',
                  }}>
                    {task.status === 'double_signed' ? '✓' : task.order_index}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{task.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[task.status], textTransform: 'uppercase' }}>
                        {task.status.replace(/_/g, ' ')}
                      </span>
                      {task.blocked_by_ncr && <span className="badge badge-danger" style={{ fontSize: 10 }}>BLOCKED</span>}
                      {!unlocked && <span className="badge badge-ghost" style={{ fontSize: 10 }}>LOCKED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>Est: {formatMinutes(task.estimated_minutes)}</span>
                      <span style={{ color: overTime ? 'var(--danger)' : 'inherit' }}>
                        Actual: {formatMinutes(task.total_minutes)}
                        {overTime && ' ⚠'}
                      </span>
                      {task.active_timers > 0 && <span style={{ color: 'var(--accent)' }}>● {task.active_timers} active timer{task.active_timers > 1 ? 's' : ''}</span>}
                    </div>
                  </div>

                  <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {task.description && (
                      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 13 }}>{task.description}</p>
                    )}

                    {/* Timer + live elapsed */}
                    {unlocked && task.status !== 'double_signed' && (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        {task.my_active_timer ? (
                          <>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              Running: <ElapsedTimer startedAt={task.my_active_timer.started_at} />
                            </div>
                            <button className="btn btn-danger btn-sm" onClick={() => handleStopTimer(task)}>
                              ⏹ Stop Timer
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleStartTimer(task)}
                            disabled={task.status === 'pending_signoff' || task.status === 'signed'}
                          >
                            ▶ Start Timer
                          </button>
                        )}
                        {task.status === 'in_progress' && !task.my_active_timer && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmSubmit(task)}>
                            📋 Submit for Sign-off
                          </button>
                        )}
                        {task.blocked_by_ncr ? (
                          <span style={{ fontSize: 12, color: 'var(--danger)' }}>🔒 Blocked by open High NCR</span>
                        ) : signoffAction && (
                          <button
                            className={`btn btn-sm ${signoffAction.type === 'double' ? 'btn-warning' : 'btn-success'}`}
                            onClick={() => setSignOffModal({ task, type: signoffAction.type })}
                          >
                            ✅ {signoffAction.label}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setNcrModal({ taskId: task.id })}>
                          ⚠ NCR
                        </button>
                      </div>
                    )}

                    {/* Sign-off records */}
                    {(primary || dbl) && (
                      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, fontSize: 11, textTransform: 'uppercase' }}>Sign-off Record</div>
                        {primary && (
                          <div style={{ marginBottom: 4 }}>
                            <span style={{ color: 'var(--warning)' }}>Primary:</span>{' '}
                            {primary.signed_by_name} — {new Date(primary.signed_at).toLocaleString()}
                          </div>
                        )}
                        {dbl && (
                          <div>
                            <span style={{ color: 'var(--success)' }}>Double:</span>{' '}
                            {dbl.signed_by_name} — {new Date(dbl.signed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* NCR list */}
                    {task.ncrs && task.ncrs.length > 0 && (
                      <div>
                        {task.ncrs.map(n => (
                          <div
                            key={n.id}
                            onClick={() => navigate(`/ncr/${n.id}`)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginRight: 8 }}
                          >
                            <span className={`badge badge-${n.severity === 'high' ? 'danger' : n.severity === 'medium' ? 'warning' : 'success'}`}>
                              NCR #{n.id} · {n.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    <NotesEditor task={task} onSave={handleSaveNotes} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {signOffModal && (
        <SignOffModal
          task={signOffModal.task}
          signatureType={signOffModal.type}
          onClose={() => setSignOffModal(null)}
          onSuccess={handleSignOffSuccess}
        />
      )}

      {lossModal && (
        <LossLogModal
          taskId={lossModal.taskId}
          taskTitle={lossModal.title}
          onClose={() => { setLossModal(null); load(); }}
          onDone={() => { setLossModal(null); load(); }}
        />
      )}

      {ncrModal && (
        <NCRModal
          airplaneId={parseInt(airplaneId)}
          stationId={parseInt(stationId)}
          taskInstanceId={ncrModal.taskId}
          onClose={() => setNcrModal(null)}
          onSuccess={() => { setNcrModal(null); load(); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmSubmit}
        title="Submit for Sign-off?"
        message={`Mark "${confirmSubmit?.title}" as ready for sign-off? Make sure all work is complete.`}
        confirmLabel="Submit"
        confirmClass="btn btn-primary"
        onConfirm={() => { handleSubmitForSignoff(confirmSubmit); setConfirmSubmit(null); }}
        onCancel={() => setConfirmSubmit(null)}
      />
    </div>
  );
}

function NotesEditor({ task, onSave }) {
  const [notes, setNotes]     = useState(task.notes || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);

  async function save() {
    setSaving(true);
    await onSave(task.id, notes);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Notes</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} style={{ fontSize: 11, minHeight: 28, padding: '4px 10px' }}>
            {task.notes ? 'Edit' : '+ Add Note'}
          </button>
        </div>
        {task.notes ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{task.notes}</p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Notes</label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ resize: 'vertical', marginBottom: 8 }} autoFocus />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setNotes(task.notes || ''); setEditing(false); }}>Cancel</button>
      </div>
    </div>
  );
}

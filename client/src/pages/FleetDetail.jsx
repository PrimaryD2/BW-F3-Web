import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  getFleetAircraft, updateFleetAircraft,
  addFleetContact, updateFleetContact, deleteFleetContact,
  addFleetSerial, updateFleetSerial, deleteFleetSerial, uninstallFleetSerial,
  addFleetPaint, updateFleetPaint, deleteFleetPaint,
  addFleetPartReplacement, updateFleetPartReplacement, deleteFleetPartReplacement,
  addFleetEvent, updateFleetEvent, deleteFleetEvent,
  uploadFleetImage, updateFleetImageCaption, setFleetImageCover, deleteFleetImage,
  getFleetConfigOptions, saveFleetConfig,
  getFleetServiceTemplates, completeFleetService,
  createFleetPlannedMaintenance, updateFleetPlannedMaintenance, deleteFleetServiceRecord, getFleetModels,
  getFleetEventTypes,
  uploadFleetPaperwork, updateFleetPaperwork, deleteFleetPaperwork, paperworkDownloadUrl,
  getActiveUsers,
  resolveFleetBulletinAircraft,
  getComponentTypes,
  getFleetComponentNames,
  getFleetSettings,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Configuration', 'Maintenance', 'Components', 'Events', 'Gallery', 'Paperwork', 'Contacts'];

const PAPERWORK_CATEGORIES = ['Airworthiness', 'Registration', 'Insurance', 'Weight & Balance', 'Manual / POH', 'Logbook', 'Inspection Report', 'Other'];

function fileIcon(mimetype = '') {
  if (mimetype.startsWith('image/'))      return '🖼️';
  if (mimetype === 'application/pdf')     return '📄';
  if (mimetype.includes('word') || mimetype.includes('document')) return '📝';
  if (mimetype.includes('excel') || mimetype.includes('sheet'))   return '📊';
  return '📎';
}

function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024)             return `${n} B`;
  if (n < 1024 * 1024)      return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
const AIRCRAFT_EDIT_TABS = new Set(['Overview', 'Maintenance']); // tabs that save via handleSave

const BUILD_STATUS_BADGE = {
  in_production: 'badge-info',
  completed:     'badge-success',
  delivered:     'badge-success',
  in_service:    'badge-success',
  stored:        'badge-ghost',
  for_sale:      'badge-warning',
  written_off:   'badge-danger',
};
const BUILD_STATUS_LABEL = {
  in_production: 'In Production',
  completed:     'Completed',
  delivered:     'Delivered',
  in_service:    'In Service',
  stored:        'Stored',
  for_sale:      'For Sale',
  written_off:   'Written Off',
};
const MODEL_FALLBACKS = ['BW600', 'BW635RG', 'BW650', 'Other'];
const EVENT_TYPES = ['service', 'upgrade', 'inspection', 'incident', 'repaint', 'avionics_update', 'ownership_change', 'other'];
const EVENT_TYPE_LABEL = {
  service: 'Service', upgrade: 'Upgrade', inspection: 'Inspection',
  incident: 'Incident', repaint: 'Repaint', avionics_update: 'Avionics Update',
  ownership_change: 'Ownership Change', other: 'Other',
};
const EVENT_TYPE_BADGE = {
  service: 'badge-info', upgrade: 'badge-success', inspection: 'badge-info',
  incident: 'badge-danger', repaint: 'badge-ghost', avionics_update: 'badge-info',
  ownership_change: 'badge-warning', other: 'badge-ghost',
};
const DEFAULT_COMPONENTS = ['Engine', 'Propeller', 'Governor', 'ECU', 'Fusebox'];
const EMPTY_CONTACT = { name: '', role: '', email: '', phone: '' };
const EMPTY_EVENT   = { event_date: '', event_type: 'service', title: '', description: '', hours_at_event: '' };
const EMPTY_COMPLETION = { completed_date: '', hours_at_completion: '', signed_by: '', notes: '' };
const EMPTY_PLANNED_MAINTENANCE = { planned_arrival_date: '', assigned_technicians: '', planned_comments: '', work_order_number: '', items: [] };
const EMPTY_PM_ITEM = { template_id: '', title: '', description: '', work_category: 'normal' };

// ─── CSS Flag icon — works cross-platform (no emoji needed) ──────────────────

function FlagIcon({ code }) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={`fi fi-${code.toLowerCase()}`}
      style={{ width: 20, height: 14, display: 'inline-block', borderRadius: 2, flexShrink: 0 }}
    />
  );
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Field helpers ───────────────────────────────────────────────────────────

function FormField({ label, children, half }) {
  return (
    <div className="form-group" style={half ? { flex: '1 1 180px' } : {}}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', fontFamily: mono ? 'monospace' : undefined }}>
        {value || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </span>
    </div>
  );
}

// ─── CG Calculation ──────────────────────────────────────────────────────────
// Moments: nose × (−796mm), mains × 601mm
// CG position (mm) = total_moment / total_weight
// CG % MAC = (cg_mm − 54) / 1121 × 100   (acceptable: 15–20%)

function calcCG(nose, left, right) {
  const n = parseFloat(nose), l = parseFloat(left), r = parseFloat(right);
  if (!n || !l || !r || isNaN(n) || isNaN(l) || isNaN(r)) return null;
  const totalWeight  = n + l + r;
  if (totalWeight <= 0) return null;
  const noseMoment   = n * (-796);
  const leftMoment   = l * 601;
  const rightMoment  = r * 601;
  const totalMoment  = noseMoment + leftMoment + rightMoment;
  const cgMm         = totalMoment / totalWeight;
  const cgPct        = (cgMm - 54) / 1121 * 100;
  return {
    n, l, r,
    noseMoment:  noseMoment.toFixed(1),
    leftMoment:  leftMoment.toFixed(1),
    rightMoment: rightMoment.toFixed(1),
    totalMoment: totalMoment.toFixed(1),
    totalWeight: totalWeight.toFixed(1),
    cgMm:        cgMm.toFixed(1),
    cgPct:       cgPct.toFixed(1),
    ok:          cgPct >= 15 && cgPct <= 20,
  };
}

function CGTable({ cg }) {
  const mono = { fontFamily: 'monospace', fontSize: 13 };
  const muted = { fontSize: 11, color: 'var(--text-muted)' };
  const row = (label, weight, arm, moment, bold) => (
    <tr style={bold ? { borderTop: '2px solid var(--border)' } : {}}>
      <td style={{ fontSize: 13, fontWeight: bold ? 700 : 400, padding: '5px 8px' }}>{label}</td>
      <td style={{ ...mono, textAlign: 'right', padding: '5px 8px' }}>
        {weight != null ? weight : ''}
      </td>
      <td style={{ ...muted, textAlign: 'right', padding: '5px 8px' }}>
        {arm}
      </td>
      <td style={{ ...mono, textAlign: 'right', padding: '5px 8px', fontWeight: bold ? 700 : 400 }}>
        {moment}
      </td>
    </tr>
  );

  return (
    <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-hover)' }}>
            <th style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left',   padding: '5px 8px' }}>Point</th>
            <th style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right',  padding: '5px 8px' }}>Weight (kg)</th>
            <th style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right',  padding: '5px 8px' }}>Arm (mm)</th>
            <th style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right',  padding: '5px 8px' }}>Moment</th>
          </tr>
        </thead>
        <tbody>
          {row('Nose wheel',  cg.n.toFixed(1),  '−796', cg.noseMoment)}
          {row('Left main',   cg.l.toFixed(1),  '601',  cg.leftMoment)}
          {row('Right main',  cg.r.toFixed(1),  '601',  cg.rightMoment)}
          {row('Total',       cg.totalWeight,   '—',    cg.totalMoment, true)}
        </tbody>
      </table>
      <div style={{
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: cg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        borderTop: `1px solid ${cg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.35)'}`,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          CG position: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{cg.cgMm} mm</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: cg.ok ? 'var(--success)' : 'var(--danger)' }}>{cg.cgPct}%</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>MAC (15–20% ✓)</span>
        </div>
      </div>
    </div>
  );
}

// ─── W&B Section (top-level to avoid re-mount on parent re-render) ───────────

// Helper to auto-calc total when any wheel changes
function handleWheel(key, val, currentForm, setF) {
  const patch = { [key]: val };
  // compute from whichever values are available after this change
  const n = key === 'nose_wheel_weight'  ? parseFloat(val) : parseFloat(currentForm.nose_wheel_weight);
  const l = key === 'left_wheel_weight'  ? parseFloat(val) : parseFloat(currentForm.left_wheel_weight);
  const r = key === 'right_wheel_weight' ? parseFloat(val) : parseFloat(currentForm.right_wheel_weight);
  if (!isNaN(n) && !isNaN(l) && !isNaN(r)) patch.empty_weight_kg = (n + l + r).toFixed(1);
  setF(patch);
}

// ─── Toe-in helpers ───────────────────────────────────────────────────────────
function toeInThresholds(settings) {
  const num = (k, def) => { const v = parseFloat(settings?.[k]); return isNaN(v) ? def : v; };
  return {
    wheelMin: num('toe_in_wheel_min', 0),
    wheelMax: num('toe_in_wheel_max', 1),
    totalMin: num('toe_in_total_min', 0.4),
    totalMax: num('toe_in_total_max', 2),
  };
}

function ToeInSection({ form, aircraft, canEdit, setF, settings }) {
  const th = toeInThresholds(settings);
  const left  = canEdit ? form.toe_in_left  : aircraft.toe_in_left;
  const right = canEdit ? form.toe_in_right : aircraft.toe_in_right;
  const l = parseFloat(left);
  const r = parseFloat(right);
  const total = (!isNaN(l) && !isNaN(r)) ? l + r : null;

  const wheelOk = (v) => isNaN(v) ? null : (v >= th.wheelMin && v <= th.wheelMax);
  const totalOk = total == null ? null : (total >= th.totalMin && total <= th.totalMax);
  const colorFor = (ok) => ok == null ? 'var(--text-secondary)' : ok ? '#16a34a' : 'var(--danger)';

  return (
    <>
      <div style={{ fontWeight: 700, margin: '16px 0 4px' }}>Main Gear Toe-in</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        Acceptable: {th.wheelMin}–{th.wheelMax}° per wheel · {th.totalMin}–{th.totalMax}° total
      </div>
      {canEdit ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <FormField label="Left Main (°)" half>
            <input
              type="number" step="0.01" value={form.toe_in_left}
              onChange={e => setF({ toe_in_left: e.target.value })}
              placeholder="0.00"
              style={{ borderColor: wheelOk(l) === false ? 'var(--danger)' : undefined }}
            />
            {wheelOk(l) === false && <span style={{ fontSize: 10, color: 'var(--danger)' }}>Outside {th.wheelMin}–{th.wheelMax}°</span>}
          </FormField>
          <FormField label="Right Main (°)" half>
            <input
              type="number" step="0.01" value={form.toe_in_right}
              onChange={e => setF({ toe_in_right: e.target.value })}
              placeholder="0.00"
              style={{ borderColor: wheelOk(r) === false ? 'var(--danger)' : undefined }}
            />
            {wheelOk(r) === false && <span style={{ fontSize: 10, color: 'var(--danger)' }}>Outside {th.wheelMin}–{th.wheelMax}°</span>}
          </FormField>
          {total != null && (
            <div style={{ flexBasis: '100%', fontSize: 13, marginTop: 4 }}>
              Total: <strong style={{ color: colorFor(totalOk) }}>{total.toFixed(2)}°</strong>
              {totalOk === false && <span style={{ color: 'var(--danger)', marginLeft: 6, fontSize: 12 }}>⚠ outside {th.totalMin}–{th.totalMax}°</span>}
              {totalOk === true && <span style={{ color: '#16a34a', marginLeft: 6, fontSize: 12 }}>✓ within range</span>}
            </div>
          )}
        </div>
      ) : (
        (left != null && left !== '') || (right != null && right !== '') ? (
          <>
            <InfoRow label="Left Main" value={left != null && left !== '' ? <span style={{ color: colorFor(wheelOk(l)) }}>{l.toFixed(2)}°</span> : null} />
            <InfoRow label="Right Main" value={right != null && right !== '' ? <span style={{ color: colorFor(wheelOk(r)) }}>{r.toFixed(2)}°</span> : null} />
            {total != null && (
              <InfoRow label="Total" value={<span style={{ color: colorFor(totalOk), fontWeight: 600 }}>{total.toFixed(2)}° {totalOk === false ? '⚠' : totalOk === true ? '✓' : ''}</span>} />
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No toe-in recorded.</div>
        )
      )}
    </>
  );
}

function WBSection({ form, aircraft, canEdit, setF }) {
  const cg      = calcCG(form.nose_wheel_weight, form.left_wheel_weight, form.right_wheel_weight);
  const cgSaved = calcCG(aircraft.nose_wheel_weight, aircraft.left_wheel_weight, aircraft.right_wheel_weight);

  return (
    <>
      <div style={{ fontWeight: 700, margin: '16px 0 12px' }}>Weight & Balance</div>
      {canEdit ? (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <FormField label="Nose Wheel (kg)" half>
              <input type="number" step="0.1" value={form.nose_wheel_weight} onChange={e => handleWheel('nose_wheel_weight', e.target.value, form, setF)} placeholder="e.g. 120" />
            </FormField>
            <FormField label="Left Main (kg)" half>
              <input type="number" step="0.1" value={form.left_wheel_weight} onChange={e => handleWheel('left_wheel_weight', e.target.value, form, setF)} placeholder="e.g. 230" />
            </FormField>
            <FormField label="Right Main (kg)" half>
              <input type="number" step="0.1" value={form.right_wheel_weight} onChange={e => handleWheel('right_wheel_weight', e.target.value, form, setF)} placeholder="e.g. 230" />
            </FormField>
          </div>
          {cg && <CGTable cg={cg} />}
        </>
      ) : (
        <>
          <InfoRow label="Empty Weight (total)" value={
            (aircraft.nose_wheel_weight != null && aircraft.left_wheel_weight != null && aircraft.right_wheel_weight != null)
              ? `${(parseFloat(aircraft.nose_wheel_weight) + parseFloat(aircraft.left_wheel_weight) + parseFloat(aircraft.right_wheel_weight)).toFixed(1)} kg`
              : (aircraft.empty_weight_kg != null ? `${aircraft.empty_weight_kg} kg` : null)
          } />
          <InfoRow label="Nose Wheel" value={aircraft.nose_wheel_weight != null ? `${aircraft.nose_wheel_weight} kg` : null} />
          <InfoRow label="Left Main" value={aircraft.left_wheel_weight != null ? `${aircraft.left_wheel_weight} kg` : null} />
          <InfoRow label="Right Main" value={aircraft.right_wheel_weight != null ? `${aircraft.right_wheel_weight} kg` : null} />
          {cgSaved && <CGTable cg={cgSaved} />}
        </>
      )}
    </>
  );
}

// ─── Configuration Tab (top-level to avoid re-mount) ─────────────────────────

function ConfigTab({ configOptions, selectedConfig, canEdit, onToggle }) {
  const grouped = configOptions.reduce((acc, o) => {
    if (!acc[o.category]) acc[o.category] = [];
    acc[o.category].push(o);
    return acc;
  }, {});

  if (configOptions.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚙</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No configuration options defined</div>
        <p style={{ fontSize: 13 }}>Go to <strong>Admin → Fleet Config</strong> to add engine, propeller, avionics, and other options.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cat, opts]) => (
        <div key={cat} className="card">
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            {cat}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opts.map(o => {
              const checked = selectedConfig.has(o.id);
              return (
                <label
                  key={o.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: canEdit ? 'pointer' : 'default',
                    padding: '7px 10px', borderRadius: 6,
                    background: checked ? 'rgba(99,102,241,0.08)' : 'transparent',
                    border: checked ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                    transition: 'all 0.12s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => canEdit && onToggle(o.id)}
                    disabled={!canEdit}
                    style={{ width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Maintenance Tab (top-level to avoid re-mount) ───────────────────────────

function MaintenanceTab({
  aircraft, serviceTemplates, serviceRecords, setServiceRecords,
  plannedMaintenance, setPlannedMaintenance,
  form, canEdit, setF, isSupervisor, toast, users,
}) {
  const [openForm, setOpenForm] = useState(null);
  const [compForm, setCompForm] = useState(EMPTY_COMPLETION);
  const [compSaving, setCompSaving] = useState(false);
  const [plannedForm, setPlannedForm] = useState({
    ...EMPTY_PLANNED_MAINTENANCE,
    planned_arrival_date: new Date().toISOString().slice(0, 10),
  });
  const [plannedSaving, setPlannedSaving] = useState(false);

  // Build a quick lookup: template_id → latest record
  const latestByTemplate = serviceRecords.reduce((acc, rec) => {
    if (!acc[rec.template_id] || rec.id > acc[rec.template_id].id) {
      acc[rec.template_id] = rec;
    }
    return acc;
  }, {});

  // All records grouped by template
  const recordsByTemplate = serviceRecords.reduce((acc, rec) => {
    if (!acc[rec.template_id]) acc[rec.template_id] = [];
    acc[rec.template_id].push(rec);
    return acc;
  }, {});

  // Group templates by category, sorted by interval_hours ascending within each group
  const grouped = serviceTemplates.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});
  // Sort templates within each category: lowest interval hours first, nulls last
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => {
      const aH = a.interval_hours != null ? Number(a.interval_hours) : Infinity;
      const bH = b.interval_hours != null ? Number(b.interval_hours) : Infinity;
      return aH - bH;
    });
  }
  // Category display order: Engine first, then Airframe, then others alphabetically
  const CATEGORY_ORDER = ['Engine', 'Airframe'];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a), bi = CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const openPlannedItems = plannedMaintenance.filter(item => item.status === 'planned');
  const completedPlannedItems = plannedMaintenance.filter(item => item.status === 'completed');

  function calcNextDue(template, latest, tsnHours) {
    let byDate = null, byHours = null;

    // Date-based: add interval months to the last completion date
    if (template.interval_months && latest) {
      const d = new Date(latest.completed_date);
      d.setMonth(d.getMonth() + template.interval_months);
      byDate = d;
    }

    // Hours-based: fixed milestones (100h → 200h → 300h…)
    // next milestone = (floor(lastH / interval) + 1) * interval
    if (template.interval_hours) {
      const interval = template.interval_hours;
      if (latest && latest.hours_at_completion != null) {
        const lastH = parseFloat(latest.hours_at_completion);
        byHours = (Math.floor(lastH / interval) + 1) * interval;
      } else if (tsnHours != null) {
        // Never done (or done without hours): show next upcoming milestone
        byHours = (Math.floor(tsnHours / interval) + 1) * interval;
      }
    }

    return { byDate, byHours };
  }

  function dueBadge(template, latest) {
    const tsn = aircraft.total_hours_tsn;
    const now = new Date();
    let overdue = false, dueSoon = false;

    if (!latest) return <span className="badge badge-ghost" style={{ fontSize: 10 }}>Never done</span>;

    // ── Hours: fixed-milestone check (mirrors server logic) ───────────────
    if (template.interval_hours != null && tsn != null) {
      const interval    = template.interval_hours;
      const lastDue     = Math.floor(tsn / interval) * interval;
      const nextDue     = lastDue + interval;
      const prevMilestone = lastDue - interval;
      const lastH       = latest.hours_at_completion != null ? parseFloat(latest.hours_at_completion) : null;
      const serviced    = lastH == null || lastH > prevMilestone; // null hours = trust the technician

      if (lastDue > 0 && !serviced) {
        overdue = true;
      } else {
        const hoursUntil = nextDue - tsn;
        if (hoursUntil <= 0)  overdue = true;
        else if (hoursUntil <= 20) dueSoon = true;
      }
    }

    // ── Date: only if hours didn't already set a flag ─────────────────────
    // Skip the date check when an hours interval exists but the aircraft
    // hasn't reached the first milestone yet (avoids premature "Due soon"
    // on a brand-new aircraft with e.g. 25h TSN and a 100h/12-month service).
    const hasHoursInterval    = template.interval_hours != null && tsn != null;
    const pastFirstMilestone  = hasHoursInterval && tsn >= template.interval_hours;
    const applyDateCheck      = !hasHoursInterval || pastFirstMilestone;

    if (!overdue && !dueSoon && template.interval_months && applyDateCheck) {
      const d = new Date(latest.completed_date);
      d.setMonth(d.getMonth() + template.interval_months);
      const daysUntil = (d - now) / (1000 * 60 * 60 * 24);
      if (daysUntil < 0)   overdue = true;
      else if (daysUntil <= 60) dueSoon = true;
    }

    if (overdue)  return <span className="badge badge-danger"  style={{ fontSize: 10 }}>Overdue</span>;
    if (dueSoon)  return <span className="badge badge-warning" style={{ fontSize: 10 }}>Due soon</span>;
    return <span className="badge badge-success" style={{ fontSize: 10 }}>OK</span>;
  }

  function extractIntervalHoursFixed(template) {
    if (template.interval_hours != null) return Number(template.interval_hours);
    const match = String(template.title || '').match(/(\d+)\s*h/i);
    return match ? Number(match[1]) : null;
  }

  function addMonthsSafeFixed(dateValue, months) {
    if (!dateValue || !months) return null;
    const d = new Date(dateValue);
    d.setMonth(d.getMonth() + Number(months));
    return d;
  }

  function getMaintenanceStateFixed(template, records, allTemplates = []) {
    const now = new Date();
    const intervalHours = extractIntervalHoursFixed(template);
    const toleranceHours = intervalHours && intervalHours >= 100 ? 10 : (intervalHours === 25 ? 5 : 0);
    // is_one_time flag: 25h, 200h, 600h… fire ONCE at TSN ±tolerance, never repeat.
    // Legacy fallback: intervalHours === 25 was always treated as one-time.
    const isOneTime = Boolean(template.is_one_time) || intervalHours === 25;
    const annualMonths = template.interval_months != null ? Number(template.interval_months) : (intervalHours === 100 ? 12 : null);
    const annualToleranceMonths = annualMonths && intervalHours === 100 ? 2 : 0;
    const tsn = aircraft.total_hours_tsn != null ? Number(aircraft.total_hours_tsn) : null;

    const hourRecords = [...records]
      .filter(record => record.hours_at_completion != null && record.hours_at_completion !== '')
      .sort((a, b) => Number(a.hours_at_completion) - Number(b.hours_at_completion));

    const latestByDate = [...records]
      .filter(record => record.completed_date)
      .sort((a, b) => new Date(b.completed_date) - new Date(a.completed_date))[0] || null;

    let nextDueHours = intervalHours;
    let hourStatus = 'ok';

    // ── ONE-TIME milestone (25h, 200h, 600h…) ─────────────────────────────
    // Fires once at TSN within ±tolerance of interval_hours, never again.
    if (isOneTime && intervalHours != null) {
      if (records.length > 0) {
        // Already done — locked, never fires again.
        nextDueHours = null;
      } else if (tsn != null) {
        const distance = tsn - intervalHours;
        if (distance > toleranceHours) hourStatus = 'overdue';
        else if (distance >= -Math.min(20, intervalHours)) hourStatus = 'dueSoon';
      }
    } else if (intervalHours != null) {
      // ── RECURRING hours (100h every 100h, etc.) ─────────────────────────
      for (const record of hourRecords) {
        const completedAt = Number(record.hours_at_completion);
        if (!Number.isFinite(completedAt)) continue;

        if (completedAt < nextDueHours) {
          nextDueHours = completedAt + intervalHours;
        } else if (completedAt <= nextDueHours + toleranceHours) {
          nextDueHours += intervalHours;
        } else {
          const wholeIntervals = Math.max(1, Math.floor(completedAt / intervalHours));
          nextDueHours = Math.max((wholeIntervals + 1) * intervalHours, completedAt + intervalHours);
        }
      }

      if (tsn != null && nextDueHours != null) {
        if (tsn > nextDueHours + toleranceHours) hourStatus = 'overdue';
        else if (tsn >= nextDueHours - Math.min(20, intervalHours)) hourStatus = 'dueSoon';
      }
    }

    // ── Calendar interval (annual etc.) — only for recurring templates ────
    // One-time milestones don't use a date trigger.
    let nextDueDate = null;
    let dateStatus = 'ok';
    if (annualMonths && !isOneTime) {
      const referenceDate =
        latestByDate?.completed_date ||
        aircraft.first_flight_date ||
        aircraft.delivery_date ||
        aircraft.created_at;

      if (referenceDate) {
        nextDueDate = addMonthsSafeFixed(referenceDate, annualMonths);
        const overdueDate = addMonthsSafeFixed(referenceDate, annualMonths + annualToleranceMonths);
        const daysUntil = Math.ceil((nextDueDate - now) / 86400000);
        if (overdueDate && now > overdueDate) dateStatus = 'overdue';
        else if (daysUntil <= 60) dateStatus = 'dueSoon';
      }
    }

    // ── SUPERSESSION ───────────────────────────────────────────────────────
    // If this is a recurring template (e.g. 100h) AND a larger ONE-TIME
    // milestone is currently active for the same aircraft (e.g. 200h or 600h),
    // and that milestone's TSN value is a multiple of THIS template's interval,
    // then suppress this row — doing the milestone will satisfy this template.
    let supersededBy = null;
    if (!isOneTime && intervalHours && tsn != null) {
      for (const t of allTemplates) {
        if (t.id === template.id) continue;
        if (!t.is_one_time) continue;
        const tInterval = t.interval_hours != null ? Number(t.interval_hours) : null;
        if (!tInterval || tInterval <= intervalHours) continue;
        if (tInterval % intervalHours !== 0) continue;
        // Skip if the milestone has already been completed for this aircraft
        // (recordsByTemplate is closed over from MaintenanceTab's scope above)
        const tDoneOnThisAircraft = (recordsByTemplate?.[t.id] || []).length > 0;
        if (tDoneOnThisAircraft) continue;
        // Active when TSN is within ±tolerance of the milestone value
        if (Math.abs(tsn - tInterval) <= 10) {
          if (!supersededBy || Number(supersededBy.interval_hours) < tInterval) {
            supersededBy = t;
          }
        }
      }
    }

    let status = 'ok';
    if (hourStatus === 'overdue' || dateStatus === 'overdue') status = 'overdue';
    else if (hourStatus === 'dueSoon' || dateStatus === 'dueSoon') status = 'dueSoon';
    if (supersededBy) status = 'superseded';

    return {
      status,
      nextDueHours,
      nextDueDate,
      intervalHours,
      annualMonths,
      isOneTime,
      isInitial25: intervalHours === 25,
      supersededBy,
      canDirectComplete: status === 'overdue' || status === 'dueSoon',
    };
  }

  function dueBadgeFixed(state, latest) {
    const servicedByUs = aircraft.serviced_by_us;
    if (state.status === 'superseded') {
      const supTitle = state.supersededBy?.title || `${state.supersededBy?.interval_hours}h`;
      return <span className="badge badge-info" style={{ fontSize: 10 }} title={`Will be done as part of ${supTitle}`}>
        Superseded by {supTitle}
      </span>;
    }
    // For non-serviced aircraft: suppress "Never done" / "Not due" / overdue badges
    if (!servicedByUs) {
      if (!latest) return null;
      if (state.isOneTime && latest) return <span className="badge badge-success" style={{ fontSize: 10 }}>✓ Done (one-time)</span>;
      return <span className="badge badge-success" style={{ fontSize: 10 }}>OK</span>;
    }
    if (!latest && state.isOneTime && state.status === 'ok') return <span className="badge badge-ghost" style={{ fontSize: 10 }}>Not yet due</span>;
    if (!latest && state.status === 'ok') return <span className="badge badge-ghost" style={{ fontSize: 10 }}>Not due</span>;
    if (!latest && state.status !== 'ok') return <span className="badge badge-ghost" style={{ fontSize: 10 }}>Never done</span>;
    if (state.status === 'overdue') return <span className="badge badge-danger" style={{ fontSize: 10 }}>Overdue</span>;
    if (state.status === 'dueSoon') return <span className="badge badge-warning" style={{ fontSize: 10 }}>Due soon</span>;
    if (state.isOneTime && latest) return <span className="badge badge-success" style={{ fontSize: 10 }}>✓ Done (one-time)</span>;
    return <span className="badge badge-success" style={{ fontSize: 10 }}>OK</span>;
  }

  async function handleComplete(templateId) {
    if (!compForm.completed_date || !compForm.signed_by.trim()) return;
    setCompSaving(true);
    try {
      const res = await completeFleetService(aircraft.id, { template_id: templateId, ...compForm });
      setServiceRecords(prev => [res.data, ...prev]);
      setOpenForm(null);
      setCompForm(EMPTY_COMPLETION);
      toast.success('Service recorded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setCompSaving(false);
    }
  }

  async function handleDeleteRecord(aircraftId, recordId) {
    if (!window.confirm('Delete this service record?')) return;
    try {
      await deleteFleetServiceRecord(aircraftId, recordId);
      setServiceRecords(prev => prev.filter(r => r.id !== recordId));
      toast.success('Record deleted');
    } catch {
      toast.error('Delete failed');
    }
  }

  async function handleCreatePlannedMaintenance() {
    if (!plannedForm.planned_arrival_date) {
      toast.error('Planned date of arrival is required');
      return;
    }
    if (!plannedForm.items || plannedForm.items.length === 0) {
      toast.error('Add at least one work item');
      return;
    }
    for (const item of plannedForm.items) {
      if (!item.template_id && !item.title.trim()) {
        toast.error('Each work item must have a service template or a title');
        return;
      }
    }

    setPlannedSaving(true);
    try {
      const payload = {
        planned_arrival_date: plannedForm.planned_arrival_date,
        assigned_technicians: plannedForm.assigned_technicians || null,
        planned_comments: plannedForm.planned_comments || null,
        work_order_number: plannedForm.work_order_number || null,
        items: plannedForm.items.map(item => ({
          template_id: item.template_id || null,
          title: item.title || '',
          description: item.description || null,
          work_category: item.work_category || 'normal',
        })),
      };
      const res = await createFleetPlannedMaintenance(aircraft.id, payload);
      setPlannedMaintenance(prev => {
        const next = [...prev, res.data];
        return next.sort((a, b) => {
          if (a.status !== b.status) return a.status === 'planned' ? -1 : 1;
          const aDate = a.status === 'planned' ? a.planned_arrival_date || a.planned_date : a.completed_date;
          const bDate = b.status === 'planned' ? b.planned_arrival_date || b.planned_date : b.completed_date;
          return String(aDate || '').localeCompare(String(bDate || ''));
        });
      });
      setPlannedForm({
        ...EMPTY_PLANNED_MAINTENANCE,
        planned_arrival_date: new Date().toISOString().slice(0, 10),
      });
      toast.success('Planned maintenance created');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create planned maintenance');
    } finally {
      setPlannedSaving(false);
    }
  }

  if (serviceTemplates.length === 0) {
    return (
      <>
        {/* Hours section still shown at top */}
        <HoursSummary aircraft={aircraft} form={form} canEdit={canEdit} setF={setF} />
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', marginTop: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No service templates defined</div>
          <p style={{ fontSize: 13 }}>Go to <strong>Admin - Service Templates</strong> to add service intervals.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Hours at top */}
      <HoursSummary aircraft={aircraft} form={form} canEdit={canEdit} setF={setF} />

      <div style={{ marginTop: 20 }} className="card">
        <div className="card-header">
          <span className="card-title">Planned Maintenance</span>
        </div>

        {canEdit ? (
          <div style={{ marginBottom: 18 }}>
            {/* Header row: date + technician */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <FormField label="Planned Date of Arrival *" half>
                <input
                  type="date"
                  value={plannedForm.planned_arrival_date}
                  onChange={e => setPlannedForm(f => ({ ...f, planned_arrival_date: e.target.value }))}
                />
              </FormField>
              <FormField label="Assigned Technician(s)" half>
                {(() => {
                  const selected = new Set((plannedForm.assigned_technicians || '').split(',').map(s => s.trim()).filter(Boolean));
                  const toggle = (name) => {
                    const s = new Set(selected);
                    s.has(name) ? s.delete(name) : s.add(name);
                    setPlannedForm(f => ({ ...f, assigned_technicians: [...s].join(', ') }));
                  };
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {users.map(u => {
                        const on = selected.has(u.name);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => toggle(u.name)}
                            style={{
                              fontSize: 12, padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                              background: on ? 'var(--accent)' : 'transparent',
                              color: on ? '#fff' : 'var(--text-secondary)', fontWeight: on ? 700 : 400,
                            }}
                          >{on ? '✓ ' : ''}{u.name}</button>
                        );
                      })}
                      {users.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No users available</span>}
                    </div>
                  );
                })()}
              </FormField>
              <FormField label="Work Order Number" half>
                <input
                  value={plannedForm.work_order_number}
                  onChange={e => setPlannedForm(f => ({ ...f, work_order_number: e.target.value }))}
                  placeholder="e.g. WO-2026-014"
                />
              </FormField>
            </div>

            {/* Work items */}
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Work Items
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {(plannedForm.items || []).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                          Service Template
                        </label>
                        <select
                          value={item.template_id}
                          onChange={e => setPlannedForm(f => {
                            const items = [...f.items];
                            const tmpl = serviceTemplates.find(t => String(t.id) === e.target.value);
                            items[idx] = { ...items[idx], template_id: e.target.value, title: tmpl ? `${tmpl.category} - ${tmpl.title}` : items[idx].title };
                            return { ...f, items };
                          })}
                        >
                          <option value="">— Custom task —</option>
                          {serviceTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.category} - {t.title}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: '1 1 200px' }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                          Title {!item.template_id && <span style={{ color: 'var(--danger)' }}>*</span>}
                        </label>
                        <input
                          value={item.title}
                          onChange={e => setPlannedForm(f => {
                            const items = [...f.items];
                            items[idx] = { ...items[idx], title: e.target.value };
                            return { ...f, items };
                          })}
                          placeholder={item.template_id ? 'Optional override' : 'Describe the work'}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <input
                        value={item.description}
                        onChange={e => setPlannedForm(f => {
                          const items = [...f.items];
                          items[idx] = { ...items[idx], description: e.target.value };
                          return { ...f, items };
                        })}
                        placeholder="Additional notes (optional)"
                        style={{ fontSize: 13, flex: '1 1 200px' }}
                      />
                      <div style={{ flex: '0 0 150px' }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                          Billing
                        </label>
                        <select
                          value={item.work_category || 'normal'}
                          onChange={e => setPlannedForm(f => {
                            const items = [...f.items];
                            items[idx] = { ...items[idx], work_category: e.target.value };
                            return { ...f, items };
                          })}
                        >
                          <option value="normal">Normal (billable)</option>
                          <option value="warranty">Warranty (no charge)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Reorder + remove */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--border)' : 'var(--text-secondary)', fontSize: 14, padding: '0 4px' }}
                      disabled={idx === 0}
                      onClick={() => setPlannedForm(f => { const its = [...f.items]; [its[idx-1], its[idx]] = [its[idx], its[idx-1]]; return { ...f, items: its }; })}
                      title="Move up"
                    >▲</button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: idx === (plannedForm.items.length - 1) ? 'default' : 'pointer', color: idx === (plannedForm.items.length - 1) ? 'var(--border)' : 'var(--text-secondary)', fontSize: 14, padding: '0 4px' }}
                      disabled={idx === (plannedForm.items.length - 1)}
                      onClick={() => setPlannedForm(f => { const its = [...f.items]; [its[idx+1], its[idx]] = [its[idx], its[idx+1]]; return { ...f, items: its }; })}
                      title="Move down"
                    >▼</button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, padding: '2px 4px' }}
                      onClick={() => setPlannedForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                      title="Remove item"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, marginBottom: 14 }}
              onClick={() => setPlannedForm(f => ({ ...f, items: [...(f.items || []), { ...EMPTY_PM_ITEM }] }))}
            >
              + Add Work Item
            </button>

            {/* Comments */}
            <FormField label="Overall Comments">
              <textarea
                rows={2}
                value={plannedForm.planned_comments}
                onChange={e => setPlannedForm(f => ({ ...f, planned_comments: e.target.value }))}
                placeholder="Scope, notes, or what should be checked"
              />
            </FormField>

            <button className="btn btn-primary" disabled={plannedSaving} onClick={handleCreatePlannedMaintenance}>
              {plannedSaving ? 'Saving...' : 'Add Planned Maintenance'}
            </button>
          </div>
        ) : null}

        {openPlannedItems.length === 0 && completedPlannedItems.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No planned maintenance scheduled for this aircraft.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openPlannedItems.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Open Items
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {openPlannedItems.map(pm => (
                    <div key={pm.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--bg-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>
                            {pm.items && pm.items.length > 0
                              ? `${pm.items.length} work item${pm.items.length !== 1 ? 's' : ''}`
                              : pm.template_title || 'Planned Maintenance'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Arrival: {fmtDate(pm.planned_arrival_date || pm.planned_date)}
                            {(pm.assigned_technicians || pm.assigned_technician_name) && ` · ${pm.assigned_technicians || pm.assigned_technician_name}`}
                          </div>
                          {pm.items && pm.items.length > 0 && (
                            <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 13 }}>
                              {pm.items.map(it => (
                                <li key={it.id} style={{ marginBottom: 2 }}>
                                  {it.title || it.template_title || '—'}
                                  {it.description && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> — {it.description}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          {pm.planned_comments && (
                            <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{pm.planned_comments}</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="badge badge-info" style={{ fontSize: 10 }}>Planned</span>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                            Sign off from the Planned Maintenance page
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedPlannedItems.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Signed Off
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {completedPlannedItems.map(item => (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--bg-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.template_title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Completed {fmtDate(item.completed_date)} by {item.signed_off_by || '-'}
                          </div>
                          {item.signoff_notes && (
                            <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.signoff_notes}</div>
                          )}
                          {item.additional_work && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                              Extra work: {item.additional_work}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="badge badge-success" style={{ fontSize: 10 }}>Completed</span>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                            {item.labor_hours != null ? `${Number(item.labor_hours).toFixed(1)} h` : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        {sortedCategories.map(cat => {
          const templates = grouped[cat];
          return (
          <div key={cat} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
              {cat}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => {
                const latest = latestByTemplate[t.id] || null;
                const allRecords = recordsByTemplate[t.id] || [];
                const isOpen = openForm === t.id;
                const state = getMaintenanceStateFixed(t, allRecords, serviceTemplates);
                const hasOpenPlan = openPlannedItems.some(pm =>
                  Number(pm.template_id) === Number(t.id) ||
                  (pm.items || []).some(it => Number(it.template_id) === Number(t.id))
                );

                return (
                  <div key={t.id} className="card" style={{ padding: 0 }}>
                    {/* Template header row */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</span>
                          {dueBadgeFixed(state, latest)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          {state.isOneTime && state.intervalHours && <span>One-time milestone at {state.intervalHours}h TSN (±10h)</span>}
                          {!state.isOneTime && state.intervalHours && <span>Every {state.intervalHours}h</span>}
                          {!state.isOneTime && state.annualMonths && <span>or every {state.annualMonths} month{state.annualMonths !== 1 ? 's' : ''}</span>}
                          {state.supersededBy && <span style={{ color: 'var(--accent)' }}>· superseded when {state.supersededBy.title || `${state.supersededBy.interval_hours}h`} is due</span>}
                          {t.description && <span style={{ fontStyle: 'italic' }}>{t.description}</span>}
                        </div>
                      </div>

                      {/* Last completion summary */}
                      <div style={{ textAlign: 'right', minWidth: 160 }}>
                        {latest ? (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              Last: <strong>{fmtDate(latest.completed_date)}</strong>
                              {latest.hours_at_completion != null && (
                                <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>@ {parseFloat(latest.hours_at_completion).toFixed(1)}h</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>by {latest.signed_by}</div>
                            {(state.nextDueDate || state.nextDueHours != null) && (
                              <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
                                Next due:{' '}
                                {state.nextDueDate && <span>{fmtDate(state.nextDueDate)}</span>}
                                {state.nextDueDate && state.nextDueHours != null && ' / '}
                                {state.nextDueHours != null && <span style={{ fontFamily: 'monospace' }}>{state.nextDueHours.toFixed(0)}h TSN</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          aircraft.serviced_by_us
                            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Never completed</div>
                            : null
                        )}
                      </div>

                      {/* Action button — only when aircraft is serviced by us */}
                      {aircraft.serviced_by_us && state.canDirectComplete && !hasOpenPlan && (
                        <button
                          className={`btn btn-sm ${isOpen ? 'btn-ghost' : 'btn-primary'}`}
                          style={{ flexShrink: 0 }}
                          onClick={() => {
                            if (isOpen) { setOpenForm(null); setCompForm(EMPTY_COMPLETION); }
                            else { setOpenForm(t.id); setCompForm({ ...EMPTY_COMPLETION, completed_date: new Date().toISOString().slice(0, 10) }); }
                          }}
                        >
                          {isOpen ? '✕ Cancel' : '✓ Mark Complete'}
                        </button>
                      )}
                      {hasOpenPlan && (
                        <span className="badge badge-info" style={{ fontSize: 10 }}>Planned</span>
                      )}
                    </div>

                    {/* Completion inline form */}
                    {isOpen && (
                      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Record Completion</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <div className="form-group" style={{ flex: '1 1 140px' }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Date *</label>
                            <input
                              type="date"
                              value={compForm.completed_date}
                              onChange={e => setCompForm(f => ({ ...f, completed_date: e.target.value }))}
                              required
                            />
                          </div>
                          <div className="form-group" style={{ flex: '1 1 120px' }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Hours (TSN)</label>
                            <input
                              type="number" step="0.1" min="0"
                              placeholder={aircraft.total_hours_tsn != null ? `Current: ${aircraft.total_hours_tsn}` : 'Optional'}
                              value={compForm.hours_at_completion}
                              onChange={e => setCompForm(f => ({ ...f, hours_at_completion: e.target.value }))}
                            />
                          </div>
                          <div className="form-group" style={{ flex: '1 1 160px' }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Signed by *</label>
                            <input
                              placeholder="Technician name"
                              value={compForm.signed_by}
                              onChange={e => setCompForm(f => ({ ...f, signed_by: e.target.value }))}
                            />
                          </div>
                          <div className="form-group" style={{ flex: '2 1 240px' }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Notes</label>
                            <input
                              placeholder="Optional notes"
                              value={compForm.notes}
                              onChange={e => setCompForm(f => ({ ...f, notes: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleComplete(t.id)}
                            disabled={compSaving || !compForm.completed_date || !compForm.signed_by.trim()}
                          >
                            {compSaving ? 'Saving…' : '💾 Save Record'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setOpenForm(null); setCompForm(EMPTY_COMPLETION); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Service history (collapsed, show last 3) */}
                    {allRecords.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {allRecords.slice(0, 3).map(rec => (
                          <div key={rec.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
                            fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                          }}>
                            <span style={{ color: 'var(--success)', fontSize: 13 }}>✓</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{fmtDate(rec.completed_date)}</span>
                            {rec.hours_at_completion != null && (
                              <span style={{ fontFamily: 'monospace' }}>@ {parseFloat(rec.hours_at_completion).toFixed(1)}h</span>
                            )}
                            <span style={{ flex: 1 }}>by <strong>{rec.signed_by}</strong></span>
                            {rec.notes && <span style={{ fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.notes}</span>}
                            {isSupervisor && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '1px 6px', fontSize: 11, color: 'var(--danger)', flexShrink: 0 }}
                                onClick={() => handleDeleteRecord(aircraft.id, rec.id)}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        {allRecords.length > 3 && (
                          <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            + {allRecords.length - 3} older records
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Hours summary (split out so MaintenanceTab can include it) ───────────────

function HoursSummary({ aircraft, form, canEdit, setF }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px)', gap: 20 }}>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Time Since New (TSN)</div>
        {canEdit ? (
          <>
            <FormField label="Total Hours (TSN)">
              <input type="number" step="0.1" min="0" value={form.total_hours_tsn} onChange={e => setF({ total_hours_tsn: e.target.value })} placeholder="0.0" />
            </FormField>
            <FormField label="Engine Hours">
              <input type="number" step="0.1" min="0" value={form.engine_hours} onChange={e => setF({ engine_hours: e.target.value })} placeholder="0.0" />
            </FormField>
          </>
        ) : (
          <>
            <InfoRow label="Total (TSN)" value={aircraft.total_hours_tsn != null ? `${aircraft.total_hours_tsn.toFixed(1)} h` : null} mono />
            <InfoRow label="Engine"      value={aircraft.engine_hours != null ? `${aircraft.engine_hours.toFixed(1)} h` : null} mono />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FleetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSupervisor } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [tab, setTab]         = useState('Overview');
  const [aircraft, setAircraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);

  // Sub-resources
  const [contacts,   setContacts]   = useState([]);
  const [serials,    setSerials]    = useState([]);
  const [events,     setEvents]     = useState([]);
  const [images,     setImages]     = useState([]);
  const [paperwork,  setPaperwork]  = useState([]);
  const [partReplacements, setPartReplacements] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  const [models, setModels] = useState([]);

  // Bulletin sign-off state
  const [bulletinActingId,   setBulletinActingId]   = useState(null);
  const [bulletinActingMode, setBulletinActingMode] = useState('fixed'); // 'fixed' | 'not_affected'
  const [bulletinSignoffForm, setBulletinSignoffForm] = useState({ resolution_notes: '', labor_hours: '', signed_off_by: '' });
  const [bulletinSaving, setBulletinSaving] = useState(false);

  // Configuration options (from admin panel)
  const [configOptions,   setConfigOptions]   = useState([]);
  const [selectedConfig,  setSelectedConfig]  = useState(new Set());
  const [configDirty,     setConfigDirty]     = useState(false);
  const [configSaving,    setConfigSaving]    = useState(false);

  // Service templates & records
  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [serviceRecords,   setServiceRecords]   = useState([]);
  const [plannedMaintenance, setPlannedMaintenance] = useState([]);
  const [users, setUsers] = useState([]);

  // Event types (dynamic, from DB)
  const [eventTypes, setEventTypes] = useState([]);

  // Component types + names for serial-number dropdowns
  const [componentTypes, setComponentTypes] = useState([]);
  const [componentNames, setComponentNames] = useState([]); // { id, component_type, name }
  const [fleetSettings, setFleetSettings] = useState({});   // toe-in thresholds etc.

  // Contact modal
  const [cModal, setCModal] = useState(null);

  // Serial add row (most fields are optional — only component + type are required)
  const EMPTY_SERIAL = {
    component: '', component_type: '', component_name: '',
    serial_number: '', manufacturing_date: '', date_installed: '', expiry_date: '', repack_date: '',
    software_version: '', system_id: '', password: '',
    notes: '', extra_data: {},
  };
  const [serialSearch,    setSerialSearch]    = useState('');
  const [serialSortField, setSerialSortField] = useState('component_name');
  const [serialSortDir,   setSerialSortDir]   = useState('asc');
  const [newSerial,    setNewSerial]    = useState(EMPTY_SERIAL);
  const [addingSerial, setAddingSerial] = useState(false);
  const [serialSaving, setSerialSaving] = useState(false);
  const [editingSerialId, setEditingSerialId] = useState(null);
  const [revealedPasswords, setRevealedPasswords] = useState({}); // { [serialId]: bool }
  const [versionLogSerial,  setVersionLogSerial]  = useState(null); // serial object for version log modal
  // Uninstall modal state
  const [uninstallTarget, setUninstallTarget] = useState(null); // serial object being uninstalled
  const EMPTY_UNINSTALL = { uninstalled_at: '', uninstall_reason: '', uninstall_tsn: '', uninstall_technician: '', uninstall_notes: '' };
  const [uninstallForm,   setUninstallForm]   = useState(EMPTY_UNINSTALL);
  const [uninstallSaving, setUninstallSaving] = useState(false);

  // Paint codes (multiple per aircraft)
  const [paints, setPaints] = useState([]);
  const EMPTY_PAINT = { color_name: '', paint_code: '', area: '', notes: '' };
  const [newPaint,    setNewPaint]    = useState(EMPTY_PAINT);
  const [addingPaint, setAddingPaint] = useState(false);
  const [editingPaintId, setEditingPaintId] = useState(null);
  const [paintSaving, setPaintSaving] = useState(false);

  // Event form
  const [newEvent,    setNewEvent]    = useState(EMPTY_EVENT);
  const [eventSaving, setEventSaving] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);

  // Image upload
  const [imgUploading, setImgUploading] = useState(false);
  const [captionEdit,  setCaptionEdit]  = useState({});

  // Paperwork upload
  const paperworkInputRef  = useRef(null);
  const [pwUploading,  setPwUploading]  = useState(false);
  const [pwTitle,      setPwTitle]      = useState('');
  const [pwCategory,   setPwCategory]   = useState('');
  const [pwEditId,     setPwEditId]     = useState(null);
  const [pwEditForm,   setPwEditForm]   = useState({});

  // ─── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [res, optsRes, tmplRes, etRes, modelRes, usersRes, ctRes, cnRes, setRes] = await Promise.allSettled([
        getFleetAircraft(id),
        getFleetConfigOptions(),
        getFleetServiceTemplates(),
        getFleetEventTypes(),
        getFleetModels(),
        getActiveUsers(),
        getComponentTypes(),
        getFleetComponentNames(),
        getFleetSettings(),
      ]);
      if (optsRes.status === 'fulfilled')  setConfigOptions(optsRes.value.data || []);
      if (tmplRes.status === 'fulfilled')  setServiceTemplates((tmplRes.value.data || []).filter(t => t.active));
      if (etRes.status === 'fulfilled')    setEventTypes(etRes.value.data || []);
      if (modelRes.status === 'fulfilled') setModels((modelRes.value.data || []).map(item => item.name));
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);
      if (ctRes.status === 'fulfilled')    setComponentTypes(ctRes.value.data || []);
      if (cnRes.status === 'fulfilled')    setComponentNames(cnRes.value.data || []);
      if (setRes.status === 'fulfilled')   setFleetSettings(setRes.value.data || {});
      if (res.status === 'fulfilled')      applyData(res.value.data);
      else throw new Error('Failed to load aircraft');
    } finally {
      setLoading(false);
    }
  }

  function applyData(a) {
    setAircraft(a);
    setContacts(a.contacts    || []);
    setSerials(a.serials      || []);
    setEvents(a.events        || []);
    setImages(a.images        || []);
    setPaperwork(a.paperwork  || []);
    setPartReplacements(a.part_replacements || []);
    setBulletins(a.bulletins || []);
    setPaints(a.paints || []);
    setServiceRecords(a.service_records || []);
    setPlannedMaintenance(a.planned_maintenance || []);
    setSelectedConfig(new Set((a.selected_config || []).map(Number)));
    setConfigDirty(false);
    setForm({
      bw_serial:             a.bw_serial             || '',
      aircraft_number:       a.aircraft_number        || '',
      model:                 a.model                 || 'BW600',
      build_status:          a.build_status           || 'in_production',
      registration:          a.registration           || '',
      country_code:          a.country_code           || '',
      country_name:          a.country_name           || '',
      customer_name:         a.customer_name          || '',
      first_flight_date:     a.first_flight_date   ? a.first_flight_date.slice(0, 10)   : '',
      delivery_date:         a.delivery_date       ? a.delivery_date.slice(0, 10)       : '',
      empty_weight_kg:       a.empty_weight_kg     != null ? String(a.empty_weight_kg)     : '',
      nose_wheel_weight:     a.nose_wheel_weight   != null ? String(a.nose_wheel_weight)   : '',
      left_wheel_weight:     a.left_wheel_weight   != null ? String(a.left_wheel_weight)   : '',
      right_wheel_weight:    a.right_wheel_weight  != null ? String(a.right_wheel_weight)  : '',
      toe_in_left:           a.toe_in_left         != null ? String(a.toe_in_left)         : '',
      toe_in_right:          a.toe_in_right        != null ? String(a.toe_in_right)        : '',
      airworthiness_status:  a.airworthiness_status  || '',
      airworthiness_expiry:  a.airworthiness_expiry ? a.airworthiness_expiry.slice(0, 10) : '',
      total_hours_tsn:       a.total_hours_tsn     != null ? String(a.total_hours_tsn)     : '',
      engine_hours:          a.engine_hours        != null ? String(a.engine_hours)        : '',
      financing_flag:        a.financing_flag      || false,
      serviced_by_us:        a.serviced_by_us      || false,
      notes:                 a.notes              || '',
    });
    setDirty(false);
  }

  const setF = patch => { setForm(f => ({ ...f, ...patch })); setDirty(true); };

  // ─── Save aircraft ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateFleetAircraft(id, form);
      applyData({
        ...res.data,
        contacts,
        serials,
        events,
        images,
        service_records: serviceRecords,
        planned_maintenance: plannedMaintenance,
        selected_config: [...selectedConfig],
      });
      toast.success('Aircraft saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig() {
    setConfigSaving(true);
    try {
      await saveFleetConfig(id, [...selectedConfig]);
      setConfigDirty(false);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setConfigSaving(false);
    }
  }

  function toggleConfigOption(optId) {
    setSelectedConfig(prev => {
      const next = new Set(prev);
      if (next.has(optId)) next.delete(optId); else next.add(optId);
      return next;
    });
    setConfigDirty(true);
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────

  async function handleSaveContact() {
    const { mode, data } = cModal;
    setCModal(m => ({ ...m, saving: true, error: '' }));
    try {
      if (mode === 'add') {
        const res = await addFleetContact(id, data);
        setContacts(c => [...c, res.data]);
      } else {
        const res = await updateFleetContact(id, data.id, data);
        setContacts(c => c.map(x => x.id === data.id ? res.data : x));
      }
      setCModal(null);
    } catch (err) {
      setCModal(m => ({ ...m, saving: false, error: err.response?.data?.error || 'Failed' }));
    }
  }

  async function handleDeleteContact(cid) {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await deleteFleetContact(id, cid);
      setContacts(c => c.filter(x => x.id !== cid));
    } catch { toast.error('Delete failed'); }
  }

  // ─── Serials ───────────────────────────────────────────────────────────────

  async function handleAddSerial(e) {
    if (e?.preventDefault) e.preventDefault();
    const componentName = (newSerial.component_name || newSerial.component || '').trim();
    // Only component name is required now; serial number is optional
    if (!componentName) return;
    setSerialSaving(true);
    try {
      const payload = {
        ...newSerial,
        component: componentName,
        component_name: componentName,
      };
      const action = editingSerialId
        ? updateFleetSerial(id, editingSerialId, payload)
        : addFleetSerial(id, payload);
      const res = await action;
      setSerials(s => editingSerialId ? s.map(item => item.id === editingSerialId ? res.data : item) : [...s, res.data]);
      setNewSerial(EMPTY_SERIAL);
      setAddingSerial(false);
      setEditingSerialId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSerialSaving(false);
    }
  }

  function handleEditSerial(serial) {
    setEditingSerialId(serial.id);
    setAddingSerial(true);
    setNewSerial({
      component: serial.component || '',
      component_type: serial.component_type || '',
      component_name: serial.component_name || '',
      serial_number: serial.serial_number || '',
      manufacturing_date: serial.manufacturing_date ? serial.manufacturing_date.slice(0, 10) : '',
      date_installed: serial.date_installed ? serial.date_installed.slice(0, 10) : '',
      expiry_date: serial.expiry_date ? serial.expiry_date.slice(0, 10) : '',
      repack_date: serial.repack_date ? serial.repack_date.slice(0, 10) : '',
      software_version: serial.software_version || '',
      system_id: serial.system_id || '',
      password: serial.password || '',
      notes: serial.notes || '',
      extra_data: serial.extra_data && typeof serial.extra_data === 'object' ? serial.extra_data : {},
    });
  }

  function openUninstallModal(serial) {
    setUninstallTarget(serial);
    setUninstallForm({
      ...EMPTY_UNINSTALL,
      uninstalled_at: new Date().toISOString().slice(0, 10),
      uninstall_tsn: aircraft?.total_hours_tsn != null ? String(aircraft.total_hours_tsn) : '',
    });
  }

  async function handleConfirmUninstall() {
    if (!uninstallTarget || !uninstallForm.uninstalled_at) return;
    setUninstallSaving(true);
    try {
      const res = await uninstallFleetSerial(id, uninstallTarget.id, uninstallForm);
      setSerials(s => s.map(item => item.id === uninstallTarget.id ? res.data : item));
      setUninstallTarget(null);
      setUninstallForm(EMPTY_UNINSTALL);
      toast.success('Component marked as uninstalled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to uninstall');
    } finally {
      setUninstallSaving(false);
    }
  }

  async function handleDeleteSerial(sid) {
    if (!window.confirm('Delete this component entry completely? (Use Uninstall instead to preserve history.)')) return;
    try {
      await deleteFleetSerial(id, sid);
      setSerials(s => s.filter(x => x.id !== sid));
    } catch { toast.error('Delete failed'); }
  }

  // ─── Export components to Excel ───────────────────────────────────────────

  function exportComponentsExcel() {
    const fmt = (d) => d ? new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB') : '';

    // Build rows for ALL components (active + uninstalled)
    const allComponents = [...serials].sort((a, b) => {
      // Active first, then by type, then by name
      if (a.uninstalled !== b.uninstalled) return a.uninstalled ? 1 : -1;
      return (a.component_type || '').localeCompare(b.component_type || '') ||
             (a.component_name || a.component || '').localeCompare(b.component_name || b.component || '');
    });

    const rows = allComponents.map(s => ({
      'Component Name':    s.component_name || s.component || '',
      'Type':              s.component_type || '',
      'Serial Number':     s.serial_number  || '',
      'System ID':         s.system_id      || '',
      'Software Version':  s.software_version || '',
      'Manufactured':      fmt(s.manufacturing_date),
      'Installed':         fmt(s.date_installed),
      'Expiry Date':       fmt(s.expiry_date),
      'Repack/Test Date':  fmt(s.repack_date),
      'Status':            s.uninstalled ? 'Uninstalled' : 'Installed',
      'Uninstalled Date':  fmt(s.uninstalled_at),
      'Uninstall Reason':  s.uninstall_reason  || '',
      'TSN at Removal':    s.uninstall_tsn != null ? Number(s.uninstall_tsn).toFixed(1) : '',
      'Uninstall Tech.':   s.uninstall_technician || '',
      'Notes':             s.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 20 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 28 },
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = `BW-${aircraft?.bw_serial || 'Components'}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel sheet name limit
    XLSX.writeFile(wb, `Components_BW-${aircraft?.bw_serial || 'Aircraft'}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // ─── Paints ────────────────────────────────────────────────────────────────

  async function handleSavePaint(e) {
    if (e?.preventDefault) e.preventDefault();
    if (!newPaint.color_name.trim()) return;
    setPaintSaving(true);
    try {
      const action = editingPaintId
        ? updateFleetPaint(id, editingPaintId, newPaint)
        : addFleetPaint(id, newPaint);
      const res = await action;
      setPaints(p => editingPaintId ? p.map(x => x.id === editingPaintId ? res.data : x) : [...p, res.data]);
      setNewPaint(EMPTY_PAINT);
      setAddingPaint(false);
      setEditingPaintId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save paint');
    } finally { setPaintSaving(false); }
  }

  function handleEditPaint(p) {
    setEditingPaintId(p.id);
    setAddingPaint(true);
    setNewPaint({
      color_name: p.color_name || '',
      paint_code: p.paint_code || '',
      area: p.area || '',
      notes: p.notes || '',
    });
  }

  async function handleDeletePaint(pid) {
    if (!window.confirm('Delete this paint entry?')) return;
    try {
      await deleteFleetPaint(id, pid);
      setPaints(p => p.filter(x => x.id !== pid));
    } catch { toast.error('Delete failed'); }
  }

  // (Legacy part-replacement handlers removed — replaced by the Uninstall flow
  //  on each component card.)

  // ─── Events ────────────────────────────────────────────────────────────────

  async function handleAddEvent(e) {
    e.preventDefault();
    if (!newEvent.event_date || !newEvent.title.trim()) return;
    setEventSaving(true);
    try {
      if (editingEventId) {
        const res = await updateFleetEvent(id, editingEventId, newEvent);
        setEvents(ev => ev.map(item => item.id === editingEventId ? res.data : item));
        toast.success('Event updated');
      } else {
        const res = await addFleetEvent(id, newEvent);
        setEvents(ev => [res.data, ...ev]);
        toast.success('Event added');
      }
      setNewEvent(EMPTY_EVENT);
      setEditingEventId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${editingEventId ? 'update' : 'add'} event`);
    } finally {
      setEventSaving(false);
    }
  }

  function handleEditEvent(event) {
    setEditingEventId(event.id);
    setNewEvent({
      event_date: event.event_date ? String(event.event_date).slice(0, 10) : '',
      event_type: event.event_type || 'service',
      title: event.title || '',
      description: event.description || '',
      hours_at_event: event.hours_at_event != null ? String(event.hours_at_event) : '',
    });
  }

  function handleCancelEventEdit() {
    setEditingEventId(null);
    setNewEvent(EMPTY_EVENT);
  }

  async function handleDeleteEvent(eid) {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteFleetEvent(id, eid);
      setEvents(ev => ev.filter(x => x.id !== eid));
    } catch { toast.error('Delete failed'); }
  }

  // ─── Bulletin sign-off ─────────────────────────────────────────────────────

  async function handleBulletinResolve(bulletinItem) {
    if (bulletinActingMode === 'fixed') {
      if (!bulletinSignoffForm.resolution_notes.trim()) {
        toast.error('Resolution notes are required before signing off');
        return;
      }
      if (!bulletinSignoffForm.signed_off_by) {
        toast.error('Please select who is signing off');
        return;
      }
    }
    setBulletinSaving(true);
    try {
      const payload = {
        resolution_notes: bulletinSignoffForm.resolution_notes || (bulletinActingMode === 'not_affected' ? 'Not affected' : ''),
        labor_hours: bulletinSignoffForm.labor_hours || null,
        signed_off_by: bulletinActingMode === 'not_affected'
          ? (bulletinSignoffForm.signed_off_by || 'N/A')
          : (bulletinSignoffForm.signed_off_by || ''),
        resolved_extra_work: bulletinActingMode === 'not_affected' ? 'not_affected' : null,
      };
      await resolveFleetBulletinAircraft(bulletinItem.id, aircraft.id, payload);
      setBulletins(prev => prev.map(b =>
        b.id === bulletinItem.id
          ? { ...b, aircraft_status: 'resolved', signed_off_by: payload.signed_off_by, resolved_at: new Date().toISOString() }
          : b
      ));
      setBulletinActingId(null);
      setBulletinSignoffForm({ resolution_notes: '', labor_hours: '', signed_off_by: '' });
      toast.success(bulletinActingMode === 'not_affected' ? 'Marked as not affected' : 'Bulletin signed off as fixed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign off bulletin');
    } finally {
      setBulletinSaving(false);
    }
  }

  // ─── Images ────────────────────────────────────────────────────────────────

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await uploadFleetImage(id, fd);
      setImages(imgs => [...imgs, res.data]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setImgUploading(false);
      e.target.value = '';
    }
  }

  async function handleSaveCaption(imgId) {
    const caption = captionEdit[imgId] ?? '';
    try {
      const res = await updateFleetImageCaption(id, imgId, { caption });
      setImages(imgs => imgs.map(x => x.id === imgId ? res.data : x));
      setCaptionEdit(c => { const n = { ...c }; delete n[imgId]; return n; });
    } catch { toast.error('Caption update failed'); }
  }

  async function handleDeleteImage(imgId) {
    if (!window.confirm('Delete this image?')) return;
    try {
      await deleteFleetImage(id, imgId);
      setImages(imgs => imgs.filter(x => x.id !== imgId));
    } catch { toast.error('Delete failed'); }
  }

  async function handleSetCover(imgId) {
    try {
      const res = await setFleetImageCover(id, imgId);
      setImages(res.data); // server returns full updated list
      toast.success('Cover photo set');
    } catch { toast.error('Failed to set cover'); }
  }

  // ─── Paperwork ─────────────────────────────────────────────────────────────

  async function handlePaperworkUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPwUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (pwTitle.trim())    fd.append('title',    pwTitle.trim());
      if (pwCategory.trim()) fd.append('category', pwCategory.trim());
      const res = await uploadFleetPaperwork(id, fd);
      setPaperwork(pw => [res.data, ...pw]);
      setPwTitle('');
      setPwCategory('');
      toast.success('File uploaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setPwUploading(false);
      e.target.value = '';
    }
  }

  async function handlePaperworkUpdate(pid) {
    try {
      const res = await updateFleetPaperwork(id, pid, pwEditForm);
      setPaperwork(pw => pw.map(x => x.id === pid ? res.data : x));
      setPwEditId(null);
      toast.success('Updated');
    } catch { toast.error('Update failed'); }
  }

  async function handlePaperworkDelete(pid) {
    if (!window.confirm('Delete this document?')) return;
    try {
      await deleteFleetPaperwork(id, pid);
      setPaperwork(pw => pw.filter(x => x.id !== pid));
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="page">
      <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
    </div>
  );

  if (!aircraft) return (
    <div className="page">
      <p style={{ color: 'var(--danger)' }}>Aircraft not found.</p>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/fleet')}>← Back</button>
    </div>
  );

  const canEdit = isSupervisor;
  const canEditComponents = isSupervisor;
  const canEditEvents = isSupervisor;
  const canEditGallery = isSupervisor;
  const canEditReplacements = isSupervisor;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/fleet')} style={{ flexShrink: 0 }}>
            ← Back
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{aircraft.bw_serial}</span>
              {aircraft.aircraft_number && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ {aircraft.aircraft_number}</span>
              )}
              <span className={`badge ${BUILD_STATUS_BADGE[aircraft.build_status] || 'badge-ghost'}`} style={{ fontSize: 10 }}>
                {BUILD_STATUS_LABEL[aircraft.build_status] || aircraft.build_status}
              </span>
              {aircraft.financing_flag && (
                <span className="badge badge-warning" style={{ fontSize: 10 }}>💳 Financing</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{aircraft.model}</span>
              {aircraft.registration && (
                <>
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <FlagIcon code={aircraft.country_code} />
                  <span>{aircraft.registration}</span>
                </>
              )}
              {aircraft.customer_name && (
                <>
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <span>{aircraft.customer_name}</span>
                </>
              )}
            </div>
          </div>
        </div>
        {canEdit && AIRCRAFT_EDIT_TABS.has(tab) && dirty && (
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flexShrink: 0 }}>
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        )}
        {canEdit && tab === 'Configuration' && configDirty && (
          <button className="btn btn-primary" onClick={handleSaveConfig} disabled={configSaving} style={{ flexShrink: 0 }}>
            {configSaving ? 'Saving…' : '💾 Save Configuration'}
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', padding: '8px 16px', fontSize: 13,
              fontWeight: tab === t ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {t}
            {t === 'Maintenance' && serviceRecords.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{serviceRecords.length}</span>
            )}
            {t === 'Components' && serials.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{serials.length}</span>
            )}
            {t === 'Events' && events.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{events.length}</span>
            )}
            {t === 'Gallery' && images.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{images.length}</span>
            )}
            {t === 'Paperwork' && paperwork.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{paperwork.length}</span>
            )}
            {t === 'Contacts' && contacts.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{contacts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab === 'Overview' && (
        <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* Identity */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Aircraft Identity</div>
            {canEdit ? (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <FormField label="BW Serial" half>
                    <input value={form.bw_serial} onChange={e => setF({ bw_serial: e.target.value })} />
                  </FormField>
                  <FormField label="Aircraft Number" half>
                    <input value={form.aircraft_number} onChange={e => setF({ aircraft_number: e.target.value })} placeholder="e.g. 040" />
                  </FormField>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <FormField label="Model" half>
                    <select value={form.model} onChange={e => setF({ model: e.target.value })}>
                      {(models.length > 0 ? models : MODEL_FALLBACKS).map(m => <option key={m}>{m}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Build Status" half>
                    <select value={form.build_status} onChange={e => setF({ build_status: e.target.value })}>
                      {Object.entries(BUILD_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </FormField>
                </div>
                <FormField label="Owner / Customer">
                  <input value={form.customer_name} onChange={e => setF({ customer_name: e.target.value })} placeholder="Owner or operator name" />
                </FormField>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <FormField label="Registration" half>
                    <input value={form.registration} onChange={e => setF({ registration: e.target.value })} placeholder="SE-XXX" />
                  </FormField>
                  <FormField label="Country Code (ISO)" half>
                    <input value={form.country_code} onChange={e => setF({ country_code: e.target.value })} placeholder="SE" maxLength={2} />
                  </FormField>
                </div>
                <FormField label="Country Name">
                  <input value={form.country_name} onChange={e => setF({ country_name: e.target.value })} placeholder="Sweden" />
                </FormField>
              </>
            ) : (
              <>
                <InfoRow label="BW Serial" value={aircraft.bw_serial} />
                <InfoRow label="Aircraft Number" value={aircraft.aircraft_number} />
                <InfoRow label="Model" value={aircraft.model} />
                <InfoRow label="Build Status" value={BUILD_STATUS_LABEL[aircraft.build_status]} />
                <InfoRow label="Owner / Customer" value={aircraft.customer_name} />
                <InfoRow label="Registration" value={aircraft.registration} />
                <InfoRow label="Country" value={
                  aircraft.country_name
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FlagIcon code={aircraft.country_code} />
                        {aircraft.country_name}
                      </span>
                    : null
                } />
              </>
            )}
          </div>

          {/* Key Dates */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Key Dates & Flags</div>
            {canEdit ? (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <FormField label="First Flight Date" half>
                    <input type="date" value={form.first_flight_date} onChange={e => setF({ first_flight_date: e.target.value })} />
                  </FormField>
                  <FormField label="Delivery Date" half>
                    <input type="date" value={form.delivery_date} onChange={e => setF({ delivery_date: e.target.value })} />
                  </FormField>
                </div>
                <FormField label="">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
                    <input
                      type="checkbox"
                      checked={!!form.financing_flag}
                      onChange={e => setF({ financing_flag: e.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13 }}>Aircraft is on financing / leasing</span>
                  </label>
                </FormField>
                <FormField label="">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
                    <input
                      type="checkbox"
                      checked={!!form.serviced_by_us}
                      onChange={e => setF({ serviced_by_us: e.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13 }}>We service this aircraft (include in maintenance tracking)</span>
                  </label>
                </FormField>
              </>
            ) : (
              <>
                <InfoRow label="First Flight" value={fmtDate(aircraft.first_flight_date)} />
                <InfoRow label="Delivery" value={fmtDate(aircraft.delivery_date)} />
                <InfoRow label="Financing" value={aircraft.financing_flag ? '💳 Yes' : 'No'} />
                <InfoRow label="Serviced by us" value={aircraft.serviced_by_us ? '✓ Yes' : 'No'} />
              </>
            )}

            <div style={{ fontWeight: 700, margin: '16px 0 12px' }}>Airworthiness</div>
            {canEdit ? (
              <>
                <FormField label="Status">
                  <select value={form.airworthiness_status} onChange={e => setF({ airworthiness_status: e.target.value })}>
                    <option value="">— Not set —</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="pending">Pending</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </FormField>
                <FormField label="Expiry">
                  <input type="date" value={form.airworthiness_expiry} onChange={e => setF({ airworthiness_expiry: e.target.value })} />
                </FormField>
              </>
            ) : (
              <>
                <InfoRow label="Status" value={aircraft.airworthiness_status ? aircraft.airworthiness_status.charAt(0).toUpperCase() + aircraft.airworthiness_status.slice(1) : null} />
                <InfoRow label="Expiry" value={fmtDate(aircraft.airworthiness_expiry)} />
              </>
            )}
          </div>

          {/* Weight, Balance & Toe-in — own card so it's visible without scrolling */}
          <div className="card">
            <WBSection form={form} aircraft={aircraft} canEdit={canEdit} setF={setF} />
            <ToeInSection form={form} aircraft={aircraft} canEdit={canEdit} setF={setF} settings={fleetSettings} />
          </div>

          {/* Paint Codes — multiple per aircraft */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>
                Paint Codes <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>({paints.length})</span>
              </div>
              {canEdit && !addingPaint && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setAddingPaint(true); setEditingPaintId(null); setNewPaint(EMPTY_PAINT); }}>
                  + Add Paint
                </button>
              )}
            </div>

            {addingPaint && canEdit && (
              <form onSubmit={handleSavePaint} style={{ marginBottom: 14, padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  <FormField label="Color name *">
                    <input
                      value={newPaint.color_name}
                      onChange={e => setNewPaint(n => ({ ...n, color_name: e.target.value }))}
                      placeholder="e.g. Pearl White"
                      autoFocus required
                    />
                  </FormField>
                  <FormField label="Paint code">
                    <input
                      value={newPaint.paint_code}
                      onChange={e => setNewPaint(n => ({ ...n, paint_code: e.target.value }))}
                      placeholder="e.g. RAL 9010 / PPG ABC"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </FormField>
                  <FormField label="Area">
                    <input
                      value={newPaint.area}
                      onChange={e => setNewPaint(n => ({ ...n, area: e.target.value }))}
                      placeholder="e.g. Fuselage / Stripes / Cowl"
                    />
                  </FormField>
                  <FormField label="Notes">
                    <input
                      value={newPaint.notes}
                      onChange={e => setNewPaint(n => ({ ...n, notes: e.target.value }))}
                      placeholder="Optional"
                    />
                  </FormField>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={paintSaving}>
                    {paintSaving ? 'Saving…' : (editingPaintId ? '💾 Save' : '+ Add')}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAddingPaint(false); setEditingPaintId(null); setNewPaint(EMPTY_PAINT); }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {paints.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                {canEdit ? 'No paint codes recorded yet.' : 'No paint codes.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {paints.map(p => (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.color_name}</div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', fontSize: 11 }} onClick={() => handleEditPaint(p)}>✎</button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', fontSize: 11, color: 'var(--danger)' }} onClick={() => handleDeletePaint(p.id)}>✕</button>
                        </div>
                      )}
                    </div>
                    {p.paint_code && (
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: 2 }}>{p.paint_code}</div>
                    )}
                    {p.area && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.area}</div>
                    )}
                    {p.notes && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{p.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Notes</div>
            {canEdit ? (
              <textarea
                value={form.notes}
                onChange={e => setF({ notes: e.target.value })}
                rows={4}
                placeholder="General notes, remarks, history…"
                style={{ resize: 'vertical' }}
              />
            ) : (
              <p style={{ fontSize: 13, color: aircraft.notes ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {aircraft.notes || 'No notes.'}
              </p>
            )}
          </div>
        </div>
        </div>
      )}

      {/* ── CONFIGURATION ────────────────────────────────────────────────────── */}
      {tab === 'Configuration' && (
        <ConfigTab
          configOptions={configOptions}
          selectedConfig={selectedConfig}
          canEdit={canEdit}
          onToggle={toggleConfigOption}
        />
      )}

      {/* ── MAINTENANCE ──────────────────────────────────────────────────────── */}
      {tab === 'Maintenance' && (
        <MaintenanceTab
          aircraft={aircraft}
          serviceTemplates={serviceTemplates}
          serviceRecords={serviceRecords}
          setServiceRecords={setServiceRecords}
          plannedMaintenance={plannedMaintenance}
          setPlannedMaintenance={setPlannedMaintenance}
          form={form}
          canEdit={canEdit}
          setF={setF}
          isSupervisor={isSupervisor}
          toast={toast}
          users={users}
        />
      )}

      {/* ── COMPONENTS ───────────────────────────────────────────────────────── */}
      {tab === 'Components' && (
        <>
        {(() => {
          // Split active vs uninstalled, then apply search + sort
          const q = serialSearch.toLowerCase();
          function matchSerial(s) {
            if (!q) return true;
            return [s.component_name, s.component, s.component_type, s.serial_number, s.notes]
              .some(v => v && String(v).toLowerCase().includes(q));
          }
          function sortSerials(list) {
            return [...list].sort((a, b) => {
              const av = (a[serialSortField] ?? '') + '';
              const bv = (b[serialSortField] ?? '') + '';
              const cmp = av.localeCompare(bv, undefined, { numeric: true });
              return serialSortDir === 'asc' ? cmp : -cmp;
            });
          }
          const activeComponents      = sortSerials(serials.filter(s => !s.uninstalled).filter(matchSerial));
          const uninstalledComponents = sortSerials(serials.filter(s =>  s.uninstalled).filter(matchSerial));

          // Helper: render a labelled field row only when there's a value.
          function Field({ label, value, mono, children }) {
            if (children == null && (value == null || value === '')) return null;
            return (
              <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>{label}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>
                  {children ?? value}
                </span>
              </div>
            );
          }

          function ComponentCard({ s, isUninstalled }) {
            const revealed = !!revealedPasswords[s.id];
            return (
              <div className="card" style={{ padding: 14, opacity: isUninstalled ? 0.85 : 1 }}>
                {/* Prominent type badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {s.component_type ? (
                    <span style={{
                      display: 'inline-block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', color: '#fff', background: 'var(--accent)',
                      borderRadius: 5, padding: '3px 9px',
                    }}>{s.component_type}</span>
                  ) : <span />}
                  {isUninstalled && <span className="badge badge-ghost" style={{ fontSize: 10 }}>Uninstalled</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{s.component_name || s.component}</div>

                {/* Only the fields with values render */}
                <Field label="Serial number"    value={s.serial_number} mono />
                <Field label="System ID"        value={s.system_id} mono />
                <Field label="Software version" value={s.software_version} mono />
                {s.password && (
                  <Field label="Password">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ fontFamily: 'monospace' }}>{revealed ? s.password : '••••••••'}</code>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0 6px', fontSize: 11 }}
                        onClick={() => setRevealedPasswords(p => ({ ...p, [s.id]: !p[s.id] }))}
                      >{revealed ? 'Hide' : 'Reveal'}</button>
                    </span>
                  </Field>
                )}
                <Field label="Manufactured"  value={s.manufacturing_date ? new Date(s.manufacturing_date).toLocaleDateString() : ''} />
                <Field label="Installed"     value={s.date_installed     ? new Date(s.date_installed).toLocaleDateString()     : ''} />
                <Field label="Expiry"        value={s.expiry_date        ? new Date(s.expiry_date).toLocaleDateString()        : ''} />
                <Field label="Repack/Test"   value={s.repack_date        ? new Date(s.repack_date).toLocaleDateString()        : ''} />
                <Field label="Notes"         value={s.notes} />

                {/* Type-specific extra fields (propeller / governor) */}
                {s.extra_data && Object.keys(s.extra_data).length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                    {/propeller|prop/i.test(s.component_type || '') && (
                      <>
                        <Field label="Blade 1" value={s.extra_data.blade1} />
                        <Field label="Blade 2" value={s.extra_data.blade2} />
                        <Field label="Blade 3" value={s.extra_data.blade3} />
                        <Field label="Hub"     value={s.extra_data.hub} />
                        <Field label="Spinner" value={s.extra_data.spinner} />
                        <Field label="Plate"   value={s.extra_data.plate} />
                        <Field label="Weights" value={s.extra_data.weights} />
                      </>
                    )}
                    {/governor/i.test(s.component_type || '') && (
                      <>
                        <Field label="Governor Plate S/N"    value={s.extra_data.gov_plate} />
                        <Field label="Governor Solenoid S/N" value={s.extra_data.gov_solenoid} />
                        <Field label="Plate Hole Size"       value={s.extra_data.gov_hole_size ? `${s.extra_data.gov_hole_size} mm` : ''} />
                      </>
                    )}
                  </div>
                )}

                {/* Software version history button */}
                {s.version_logs && s.version_logs.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => setVersionLogSerial(s)}
                    >
                      🕐 SW Version History ({s.version_logs.length})
                    </button>
                  </div>
                )}

                {/* Uninstall details — only on uninstalled cards */}
                {isUninstalled && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                    <Field label="Uninstalled"  value={s.uninstalled_at ? new Date(s.uninstalled_at).toLocaleDateString() : ''} />
                    <Field label="Reason"       value={s.uninstall_reason} />
                    <Field label="TSN at remove" value={s.uninstall_tsn != null ? `${parseFloat(s.uninstall_tsn).toFixed(1)} h` : ''} mono />
                    <Field label="Technician"   value={s.uninstall_technician} />
                    <Field label="Notes"        value={s.uninstall_notes} />
                  </div>
                )}

                {canEditComponents && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {!isUninstalled && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEditSerial(s)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => openUninstallModal(s)}>
                          ⏏ Uninstall
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', marginLeft: 'auto' }}
                      onClick={() => handleDeleteSerial(s.id)}
                    >✕ Delete</button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <>
              {/* Search + sort controls */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <input
                  style={{ flex: '1 1 180px', maxWidth: 280 }}
                  placeholder="Search components…"
                  value={serialSearch}
                  onChange={e => setSerialSearch(e.target.value)}
                />
                <select
                  style={{ flex: '0 0 160px' }}
                  value={serialSortField}
                  onChange={e => setSerialSortField(e.target.value)}
                >
                  <option value="component_type">Sort by Type</option>
                  <option value="component_name">Sort A–Z (Name)</option>
                  <option value="date_installed">Sort by Installed</option>
                  <option value="expiry_date">Sort by Expiry</option>
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSerialSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  title="Toggle sort direction"
                >
                  {serialSortDir === 'asc' ? '↑ A–Z' : '↓ Z–A'}
                </button>
                {serials.length > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: canEditComponents && !addingSerial ? 0 : 'auto' }}
                    onClick={exportComponentsExcel}
                    title="Export to Excel"
                  >
                    ⬇ Export Excel
                  </button>
                )}
                {canEditComponents && !addingSerial && (
                  <button className="btn btn-primary btn-sm" style={{ marginLeft: serials.length > 0 ? 0 : 'auto' }} onClick={() => setAddingSerial(true)}>+ Add Component</button>
                )}
              </div>
              {/* Active Components header */}
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Active Components <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>({activeComponents.length})</span>
              </div>

              {/* Add / Edit form */}
              {addingSerial && canEditComponents && (
                <div className="card" style={{ marginBottom: 16, background: 'var(--bg-hover)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>{editingSerialId ? 'Edit Component' : 'New Component'}</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 14 }}>
                    Only <strong>Component name</strong> and <strong>Type</strong> are required. Leave any field blank to hide it on the card.
                  </p>
                  <form onSubmit={handleAddSerial}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      <FormField label="Type *">
                        {componentTypes.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0', fontStyle: 'italic' }}>
                            No types defined — add them in <strong>Admin → Component Types</strong>.
                          </div>
                        ) : (
                          <select
                            value={newSerial.component_type}
                            onChange={e => setNewSerial(n => ({ ...n, component_type: e.target.value, component_name: '', component: '' }))}
                            required
                          >
                            <option value="">— Select type —</option>
                            {componentTypes.map(ct => (
                              <option key={ct.id} value={ct.name}>{ct.name}</option>
                            ))}
                          </select>
                        )}
                      </FormField>
                      <FormField label="Component name *">
                        {(() => {
                          const namesForType = componentNames.filter(cn => cn.component_type === newSerial.component_type);
                          if (!newSerial.component_type || namesForType.length === 0) {
                            return (
                              <input
                                value={newSerial.component_name}
                                onChange={e => setNewSerial(n => ({ ...n, component_name: e.target.value, component: e.target.value }))}
                                placeholder={newSerial.component_type ? 'No names defined for this type yet — type manually' : 'Select a type first'}
                                required
                              />
                            );
                          }
                          return (
                            <select
                              value={newSerial.component_name}
                              onChange={e => setNewSerial(n => ({ ...n, component_name: e.target.value, component: e.target.value }))}
                              required
                            >
                              <option value="">— Select component —</option>
                              {namesForType.map(cn => (
                                <option key={cn.id} value={cn.name}>{cn.name}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </FormField>
                      <FormField label="Serial number">
                        <input
                          value={newSerial.serial_number}
                          onChange={e => setNewSerial(n => ({ ...n, serial_number: e.target.value }))}
                          style={{ fontFamily: 'monospace' }}
                        />
                      </FormField>
                      <FormField label="System ID">
                        <input
                          value={newSerial.system_id}
                          onChange={e => setNewSerial(n => ({ ...n, system_id: e.target.value }))}
                          style={{ fontFamily: 'monospace' }}
                        />
                      </FormField>
                      <FormField label="Software version">
                        <input
                          value={newSerial.software_version}
                          onChange={e => setNewSerial(n => ({ ...n, software_version: e.target.value }))}
                        />
                      </FormField>
                      <FormField label="Password">
                        <input
                          type="text"
                          value={newSerial.password}
                          onChange={e => setNewSerial(n => ({ ...n, password: e.target.value }))}
                          placeholder="Device / system password"
                          autoComplete="off"
                        />
                      </FormField>
                      <FormField label="Manufacturing date">
                        <input type="date" value={newSerial.manufacturing_date} onChange={e => setNewSerial(n => ({ ...n, manufacturing_date: e.target.value }))} />
                      </FormField>
                      <FormField label="Date installed">
                        <input type="date" value={newSerial.date_installed} onChange={e => setNewSerial(n => ({ ...n, date_installed: e.target.value }))} />
                      </FormField>
                      <FormField label="Expiry date">
                        <input type="date" value={newSerial.expiry_date} onChange={e => setNewSerial(n => ({ ...n, expiry_date: e.target.value }))} />
                      </FormField>
                      <FormField label="Repack/Test date">
                        <input type="date" value={newSerial.repack_date} onChange={e => setNewSerial(n => ({ ...n, repack_date: e.target.value }))} />
                      </FormField>

                      {/* ── Propeller-specific fields ── */}
                      {/propeller|prop/i.test(newSerial.component_type) && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 8px' }}>Propeller Details</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                            {['Blade 1', 'Blade 2', 'Blade 3', 'Hub', 'Spinner', 'Plate'].map(label => {
                              const key = label.toLowerCase().replace(/\s+/g, '');
                              return (
                                <FormField key={key} label={label}>
                                  <input
                                    value={newSerial.extra_data?.[key] || ''}
                                    onChange={e => setNewSerial(n => ({ ...n, extra_data: { ...n.extra_data, [key]: e.target.value } }))}
                                    placeholder="Serial / ref"
                                  />
                                </FormField>
                              );
                            })}
                            <FormField label="Weights">
                              <select value={newSerial.extra_data?.weights || ''} onChange={e => setNewSerial(n => ({ ...n, extra_data: { ...n.extra_data, weights: e.target.value } }))}>
                                <option value="">— Select —</option>
                                <option value="No">No weights</option>
                                <option value="Stainless">Stainless</option>
                                <option value="Brass">Brass</option>
                              </select>
                            </FormField>
                          </div>
                        </div>
                      )}

                      {/* ── Governor-specific fields ── */}
                      {/governor/i.test(newSerial.component_type) && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 8px' }}>Governor Details</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                            <FormField label="Governor Plate Serial Number">
                              <input value={newSerial.extra_data?.gov_plate || ''} onChange={e => setNewSerial(n => ({ ...n, extra_data: { ...n.extra_data, gov_plate: e.target.value } }))} placeholder="Serial number" />
                            </FormField>
                            <FormField label="Governor Solenoid Serial Number">
                              <input value={newSerial.extra_data?.gov_solenoid || ''} onChange={e => setNewSerial(n => ({ ...n, extra_data: { ...n.extra_data, gov_solenoid: e.target.value } }))} placeholder="Serial number" />
                            </FormField>
                            <FormField label="Plate Hole Size (mm)">
                              <input value={newSerial.extra_data?.gov_hole_size || ''} onChange={e => setNewSerial(n => ({ ...n, extra_data: { ...n.extra_data, gov_hole_size: e.target.value } }))} placeholder="e.g. 2.5" />
                            </FormField>
                          </div>
                        </div>
                      )}

                      <div style={{ gridColumn: '1 / -1' }}>
                        <FormField label="Notes">
                          <textarea rows={2} value={newSerial.notes} onChange={e => setNewSerial(n => ({ ...n, notes: e.target.value }))} />
                        </FormField>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button type="submit" className="btn btn-primary" disabled={serialSaving}>
                        {serialSaving ? 'Saving…' : (editingSerialId ? '💾 Save' : '+ Add Component')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => { setAddingSerial(false); setEditingSerialId(null); setNewSerial(EMPTY_SERIAL); }}
                      >Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {/* Active components grid */}
              {activeComponents.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No active components.{canEditComponents && ' Click "+ Add Component" to add one.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {activeComponents.map(s => <ComponentCard key={s.id} s={s} isUninstalled={false} />)}
                </div>
              )}

              {/* Uninstalled history */}
              {uninstalledComponents.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>
                    Uninstalled Components <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}>({uninstalledComponents.length})</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {uninstalledComponents.map(s => <ComponentCard key={s.id} s={s} isUninstalled={true} />)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        </>
      )}

      {/* ── EVENTS ───────────────────────────────────────────────────────────── */}
      {tab === 'Events' && (() => {
        const BULLETIN_BADGE = {
          mandatory:   { label: 'Mandatory',   cls: 'badge-danger'  },
          obligatory:  { label: 'Obligatory',  cls: 'badge-warning' },
          recommended: { label: 'Recommended', cls: 'badge-info'    },
          optional:    { label: 'Optional',    cls: 'badge-ghost'   },
        };
        const openBulletins = bulletins.filter(b => b.aircraft_status === 'open');
        const resolvedBulletins = bulletins.filter(b => b.aircraft_status === 'resolved');

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
            {/* Left column: bulletins + event list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Service Bulletins ────────────────────────────────────── */}
              {bulletins.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Service Bulletins</span>
                    {openBulletins.length > 0 && (
                      <span className="badge badge-danger" style={{ fontSize: 10 }}>{openBulletins.length} open</span>
                    )}
                  </div>

                  {/* Open bulletins */}
                  {openBulletins.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: resolvedBulletins.length > 0 ? 16 : 0 }}>
                      {openBulletins.map(item => {
                        const meta = BULLETIN_BADGE[item.category] || BULLETIN_BADGE.optional;
                        const isActing = bulletinActingId === item.id;
                        return (
                          <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                  <span className={`badge ${meta.cls}`} style={{ fontSize: 10 }}>{meta.label}</span>
                                  <span style={{ fontWeight: 700 }}>{item.title}</span>
                                </div>
                                {item.reason && (
                                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                                    <strong>Reason:</strong> {item.reason}
                                  </div>
                                )}
                                {item.what_to_do && (
                                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                                    <strong>What to do:</strong> {item.what_to_do}
                                  </div>
                                )}
                              </div>
                              {isSupervisor && (
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--text-secondary)', fontSize: 11 }}
                                    onClick={() => {
                                      if (isActing && bulletinActingMode === 'not_affected') { setBulletinActingId(null); }
                                      else { setBulletinActingId(item.id); setBulletinActingMode('not_affected'); setBulletinSignoffForm({ resolution_notes: '', labor_hours: '', signed_off_by: '' }); }
                                    }}
                                  >
                                    Not Affected
                                  </button>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    style={{ fontSize: 11 }}
                                    onClick={() => {
                                      if (isActing && bulletinActingMode === 'fixed') { setBulletinActingId(null); }
                                      else { setBulletinActingId(item.id); setBulletinActingMode('fixed'); setBulletinSignoffForm({ resolution_notes: '', labor_hours: aircraft?.total_hours_tsn != null ? String(aircraft.total_hours_tsn) : '', signed_off_by: '' }); }
                                    }}
                                  >
                                    ✓ Sign Off Fixed
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Inline sign-off / not-affected form */}
                            {isActing && (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {bulletinActingMode === 'fixed' ? (
                                  <>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Sign Off as Fixed</div>
                                    <FormField label="Resolution notes">
                                      <textarea
                                        rows={2}
                                        value={bulletinSignoffForm.resolution_notes || ''}
                                        onChange={e => setBulletinSignoffForm(f => ({ ...f, resolution_notes: e.target.value }))}
                                        placeholder="What was done to comply with this bulletin?"
                                      />
                                    </FormField>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                      <FormField label="TSN Hours" half>
                                        <input type="number" step="0.1" min="0" value={bulletinSignoffForm.labor_hours || ''} onChange={e => setBulletinSignoffForm(f => ({ ...f, labor_hours: e.target.value }))} placeholder="0.0" />
                                      </FormField>
                                      <FormField label="Signed off by" half>
                                        <select value={bulletinSignoffForm.signed_off_by || ''} onChange={e => setBulletinSignoffForm(f => ({ ...f, signed_off_by: e.target.value }))}>
                                          <option value="">— Select person —</option>
                                          {users.map(u => (
                                            <option key={u.id} value={u.name}>{u.name}</option>
                                          ))}
                                        </select>
                                      </FormField>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Mark as Not Affected</div>
                                    <FormField label="Notes (optional)">
                                      <input value={bulletinSignoffForm.resolution_notes || ''} onChange={e => setBulletinSignoffForm(f => ({ ...f, resolution_notes: e.target.value }))} placeholder="Why this aircraft is not affected" />
                                    </FormField>
                                  </>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setBulletinActingId(null)}>Cancel</button>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    disabled={bulletinSaving}
                                    onClick={() => handleBulletinResolve(item)}
                                  >
                                    {bulletinSaving ? 'Saving…' : 'Confirm'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Resolved bulletins — collapsed summary */}
                  {resolvedBulletins.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Resolved ({resolvedBulletins.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {resolvedBulletins.map(item => {
                          const meta = BULLETIN_BADGE[item.category] || BULLETIN_BADGE.optional;
                          return (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-hover)', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <span className={`badge ${meta.cls}`} style={{ fontSize: 10, flexShrink: 0 }}>{meta.label}</span>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</span>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span className="badge badge-success" style={{ fontSize: 10 }}>Resolved</span>
                                {item.signed_off_by && (
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                    by {item.signed_off_by}{item.resolved_at && ` · ${new Date(item.resolved_at).toLocaleDateString()}`}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Event list ──────────────────────────────────────────── */}
              {events.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No events logged yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {events.map(ev => (
                    <div key={ev.id} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            {(() => { const evType = eventTypes.find(t => t.label === ev.event_type); return (
                            <span className={`badge ${evType?.color || EVENT_TYPE_BADGE[ev.event_type] || 'badge-ghost'}`} style={{ fontSize: 10 }}>
                              {ev.event_type}
                            </span>
                            ); })()}
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(ev.event_date)}</span>
                            {ev.hours_at_event != null && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ev.hours_at_event}h TSN</span>
                            )}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
                          {ev.description && (
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{ev.description}</p>
                          )}
                          {ev.logged_by_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Logged by {ev.logged_by_name}</div>
                          )}
                        </div>
                        {canEdit && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleEditEvent(ev)}>
                            Edit
                          </button>
                        )}
                        {canEdit && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)', flexShrink: 0 }}
                            onClick={() => handleDeleteEvent(ev.id)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add event form */}
            <div className="card" style={{ position: 'sticky', top: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>{editingEventId ? 'Edit Event' : 'Log New Event'}</div>
              <form onSubmit={handleAddEvent}>
                <FormField label="Date *">
                  <input type="date" value={newEvent.event_date} onChange={e => setNewEvent(n => ({ ...n, event_date: e.target.value }))} required />
                </FormField>
                <FormField label="Type">
                  <select value={newEvent.event_type} onChange={e => setNewEvent(n => ({ ...n, event_type: e.target.value }))}>
                    {eventTypes.length > 0
                      ? eventTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)
                      : EVENT_TYPES.map(t => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)
                    }
                  </select>
                </FormField>
                <FormField label="Title *">
                  <input value={newEvent.title} onChange={e => setNewEvent(n => ({ ...n, title: e.target.value }))} placeholder="Short title" required />
                </FormField>
                <FormField label="Hours at Event (TSN)">
                  <input type="number" step="0.1" min="0" value={newEvent.hours_at_event} onChange={e => setNewEvent(n => ({ ...n, hours_at_event: e.target.value }))} placeholder="Optional" />
                </FormField>
                <FormField label="Description">
                  <textarea value={newEvent.description} onChange={e => setNewEvent(n => ({ ...n, description: e.target.value }))} rows={3} placeholder="Details…" style={{ resize: 'vertical' }} />
                </FormField>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={eventSaving}>
                  {eventSaving ? 'Saving…' : '+ Log Event'}
                </button>
                {editingEventId && (
                  <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={handleCancelEventEdit}>
                    Cancel Edit
                  </button>
                )}
              </form>
            </div>
          </div>
        );
      })()}

      {/* ── GALLERY ──────────────────────────────────────────────────────────── */}
      {tab === 'Gallery' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{images.length} image{images.length !== 1 ? 's' : ''}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {imgUploading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploading…</span>}
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={imgUploading}
              >
                📷 Upload Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
            </div>
          </div>

          {images.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
              <div>No images yet. Upload the first photo.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {images.map(img => {
                const isEditing = img.id in captionEdit;
                const isCover   = Boolean(img.is_cover);
                return (
                  <div key={img.id} className="card" style={{ padding: 0, overflow: 'hidden', outline: isCover ? '2px solid var(--accent)' : 'none' }}>
                    {/* Image with cover badge overlay */}
                    <div style={{ position: 'relative' }}>
                      <img
                        src={`/uploads/fleet/${img.filename}`}
                        alt={img.caption || 'Aircraft photo'}
                        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                        onClick={() => window.open(`/uploads/fleet/${img.filename}`, '_blank')}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      {isCover && (
                        <div style={{
                          position: 'absolute', top: 8, left: 8,
                          background: 'var(--accent)', color: '#fff',
                          fontSize: 10, fontWeight: 700, padding: '3px 8px',
                          borderRadius: 20, letterSpacing: '0.04em',
                        }}>
                          ★ Cover
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      {isEditing ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <input
                            value={captionEdit[img.id] ?? ''}
                            onChange={e => setCaptionEdit(c => ({ ...c, [img.id]: e.target.value }))}
                            placeholder="Caption…"
                            style={{ width: '100%', fontSize: 12 }}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveCaption(img.id);
                              if (e.key === 'Escape') setCaptionEdit(c => { const n = { ...c }; delete n[img.id]; return n; });
                            }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveCaption(img.id)}>✓</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: canEdit ? 6 : 0 }}>
                            <span
                              style={{ fontSize: 12, color: img.caption ? 'var(--text-secondary)' : 'var(--text-muted)', flex: 1, cursor: 'pointer' }}
                              onClick={() => setCaptionEdit(c => ({ ...c, [img.id]: img.caption || '' }))}
                              title="Click to edit caption"
                            >
                              {img.caption || 'Add caption…'}
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '2px 6px', fontSize: 11 }}
                                onClick={() => setCaptionEdit(c => ({ ...c, [img.id]: img.caption || '' }))}
                                title="Edit caption"
                              >✎</button>
                              {canEdit && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }}
                                  onClick={() => handleDeleteImage(img.id)}
                                  title="Delete image"
                                >✕</button>
                              )}
                            </div>
                          </div>
                          {canEdit && !isCover && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ width: '100%', fontSize: 11, color: 'var(--text-muted)', justifyContent: 'center' }}
                              onClick={() => handleSetCover(img.id)}
                              title="Use as cover in Aircraft Gallery"
                            >
                              ☆ Set as Cover
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PAPERWORK ────────────────────────────────────────────────────────── */}
      {tab === 'Paperwork' && (
        <div>
          {/* Upload bar */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>Upload Document</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Title (optional)</label>
                <input
                  value={pwTitle}
                  onChange={e => setPwTitle(e.target.value)}
                  placeholder="e.g. Annual Inspection Report 2024"
                  disabled={pwUploading}
                />
              </div>
              <div className="form-group" style={{ flex: '0 0 180px', marginBottom: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Category</label>
                <select value={pwCategory} onChange={e => setPwCategory(e.target.value)} disabled={pwUploading}>
                  <option value="">— None —</option>
                  {PAPERWORK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 0 auto', paddingBottom: 1 }}>
                {pwUploading
                  ? <span style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', paddingBottom: 8 }}>Uploading…</span>
                  : (
                    <button
                      className="btn btn-primary"
                      onClick={() => paperworkInputRef.current?.click()}
                    >
                      📎 Choose File
                    </button>
                  )
                }
                <input
                  ref={paperworkInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  style={{ display: 'none' }}
                  onChange={handlePaperworkUpload}
                />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              Accepted: images, PDF, Word, Excel, plain text — max 50 MB
            </p>
          </div>

          {/* Document list */}
          {paperwork.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
              <div>No documents uploaded yet.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Document</th>
                      <th style={{ width: 160 }}>Category</th>
                      <th style={{ width: 80 }}>Size</th>
                      <th style={{ width: 130 }}>Uploaded</th>
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperwork.map(doc => (
                      <tr key={doc.id}>
                        {/* Icon */}
                        <td style={{ textAlign: 'center', fontSize: 18 }}>
                          {fileIcon(doc.mimetype)}
                        </td>

                        {/* Title / filename */}
                        <td>
                          {pwEditId === doc.id ? (
                            <input
                              autoFocus
                              value={pwEditForm.title}
                              onChange={e => setPwEditForm(f => ({ ...f, title: e.target.value }))}
                              placeholder="Title"
                              style={{ fontSize: 13, width: '100%' }}
                            />
                          ) : (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>
                                {doc.title || doc.original_name}
                              </div>
                              {doc.title && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{doc.original_name}</div>
                              )}
                              {doc.uploaded_by_name && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>by {doc.uploaded_by_name}</div>
                              )}
                            </>
                          )}
                        </td>

                        {/* Category */}
                        <td>
                          {pwEditId === doc.id ? (
                            <select
                              value={pwEditForm.category || ''}
                              onChange={e => setPwEditForm(f => ({ ...f, category: e.target.value }))}
                              style={{ fontSize: 12 }}
                            >
                              <option value="">— None —</option>
                              {PAPERWORK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            doc.category
                              ? <span className="badge badge-ghost" style={{ fontSize: 10 }}>{doc.category}</span>
                              : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                          )}
                        </td>

                        {/* Size */}
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {fmtBytes(doc.size_bytes)}
                        </td>

                        {/* Date */}
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(doc.uploaded_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>

                        {/* Actions */}
                        <td>
                          {pwEditId === doc.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handlePaperworkUpdate(doc.id)}>✓</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setPwEditId(null)}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <a
                                href={paperworkDownloadUrl(doc.id)}
                                download={doc.original_name}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11, padding: '3px 8px' }}
                                title="Download"
                              >⬇</a>
                              {canEdit && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 11, padding: '3px 6px' }}
                                    title="Edit title / category"
                                    onClick={() => { setPwEditId(doc.id); setPwEditForm({ title: doc.title || '', category: doc.category || '' }); }}
                                  >✎</button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 11, padding: '3px 6px', color: 'var(--danger)' }}
                                    title="Delete"
                                    onClick={() => handlePaperworkDelete(doc.id)}
                                  >✕</button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONTACTS ─────────────────────────────────────────────────────────── */}
      {tab === 'Contacts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setCModal({ mode: 'add', data: { ...EMPTY_CONTACT }, saving: false, error: '' })}>
                + Add Contact
              </button>
            )}
          </div>

          {contacts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              No contacts added.{canEdit && ' Click "+ Add Contact" to add one.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {contacts.map(c => (
                <div key={c.id} className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      {c.role && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>{c.role}</div>}
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px' }}
                          onClick={() => setCModal({ mode: 'edit', data: { ...c }, saving: false, error: '' })}
                        >✎</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px', color: 'var(--danger)' }}
                          onClick={() => handleDeleteContact(c.id)}
                        >✕</button>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {c.email && (
                      <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                        ✉ {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                        📞 {c.phone}
                      </a>
                    )}
                    {!c.email && !c.phone && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No contact details</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Uninstall Component Modal ───────────────────────────────────────── */}
      {uninstallTarget && (
        <div className="modal-overlay" onClick={() => setUninstallTarget(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Uninstall — {uninstallTarget.component_name || uninstallTarget.component}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -6, marginBottom: 16 }}>
              The component is preserved in the Uninstalled history with the details below.
            </p>
            <FormField label="Uninstall Date *">
              <input
                type="date"
                value={uninstallForm.uninstalled_at}
                onChange={e => setUninstallForm(f => ({ ...f, uninstalled_at: e.target.value }))}
                required
              />
            </FormField>
            <FormField label="TSN at uninstall (hours)">
              <input
                type="number" step="0.1" min="0"
                value={uninstallForm.uninstall_tsn}
                onChange={e => setUninstallForm(f => ({ ...f, uninstall_tsn: e.target.value }))}
                placeholder={aircraft?.total_hours_tsn != null ? `Current: ${aircraft.total_hours_tsn}` : ''}
              />
            </FormField>
            <FormField label="Technician">
              <input
                value={uninstallForm.uninstall_technician}
                onChange={e => setUninstallForm(f => ({ ...f, uninstall_technician: e.target.value }))}
                placeholder="Name of technician"
              />
            </FormField>
            <FormField label="Reason">
              <input
                value={uninstallForm.uninstall_reason}
                onChange={e => setUninstallForm(f => ({ ...f, uninstall_reason: e.target.value }))}
                placeholder="e.g. End of life, upgrade, failure…"
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                rows={3}
                value={uninstallForm.uninstall_notes}
                onChange={e => setUninstallForm(f => ({ ...f, uninstall_notes: e.target.value }))}
              />
            </FormField>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setUninstallTarget(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmUninstall}
                disabled={uninstallSaving || !uninstallForm.uninstalled_at}
              >
                {uninstallSaving ? 'Saving…' : '⏏ Uninstall Component'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SW Version Log Modal ────────────────────────────────────────────── */}
      {versionLogSerial && (
        <div className="modal-overlay" onClick={() => setVersionLogSerial(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">SW Version History — {versionLogSerial.component_name || versionLogSerial.component}</div>
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              Current version: <strong>{versionLogSerial.software_version || '—'}</strong>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Date</th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Previous Version</th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>New Version</th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Updated By</th>
                  </tr>
                </thead>
                <tbody>
                  {[...versionLogSerial.version_logs].reverse().map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontSize: 12 }}>{new Date(log.updated_at).toLocaleDateString()}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'monospace' }}>{log.old_version || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{log.new_version || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{log.updated_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setVersionLogSerial(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Modal ─────────────────────────────────────────────────────── */}
      {cModal && (
        <div className="modal-overlay" onClick={() => setCModal(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{cModal.mode === 'add' ? 'Add Contact' : 'Edit Contact'}</div>
            <FormField label="Name *">
              <input
                autoFocus
                value={cModal.data.name}
                onChange={e => setCModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))}
                placeholder="Full name"
              />
            </FormField>
            <FormField label="Role / Title">
              <input
                value={cModal.data.role}
                onChange={e => setCModal(m => ({ ...m, data: { ...m.data, role: e.target.value } }))}
                placeholder="e.g. Owner, Mechanic, Operator"
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={cModal.data.email}
                onChange={e => setCModal(m => ({ ...m, data: { ...m.data, email: e.target.value } }))}
                placeholder="email@example.com"
              />
            </FormField>
            <FormField label="Phone">
              <input
                type="tel"
                value={cModal.data.phone}
                onChange={e => setCModal(m => ({ ...m, data: { ...m.data, phone: e.target.value } }))}
                placeholder="+46 70 000 0000"
              />
            </FormField>
            {cModal.error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{cModal.error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setCModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveContact}
                disabled={cModal.saving || !cModal.data.name.trim()}
              >
                {cModal.saving ? 'Saving…' : cModal.mode === 'add' ? 'Add Contact' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

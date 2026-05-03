import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getFleetAircraft, updateFleetAircraft,
  addFleetContact, updateFleetContact, deleteFleetContact,
  addFleetSerial, deleteFleetSerial,
  addFleetEvent, deleteFleetEvent,
  uploadFleetImage, updateFleetImageCaption, deleteFleetImage,
  getFleetConfigOptions, saveFleetConfig,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Configuration', 'Maintenance', 'Components', 'Events', 'Gallery', 'Contacts'];
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
const MODELS = ['BW600', 'BW635RG', 'BW650', 'Other'];
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

function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 0x1F1A5)
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
  const totalWeight = n + l + r;
  if (totalWeight <= 0) return null;
  const totalMoment = n * (-796) + (l + r) * 601;
  const cgMm = totalMoment / totalWeight;
  const cgPct = (cgMm - 54) / 1121 * 100;
  return { cgMm: cgMm.toFixed(1), cgPct: cgPct.toFixed(1), totalWeight: totalWeight.toFixed(1), ok: cgPct >= 15 && cgPct <= 20 };
}

// ─── W&B Section (top-level to avoid re-mount on parent re-render) ───────────

function WBSection({ form, aircraft, canEdit, setF }) {
  const cg = calcCG(form.nose_wheel_weight, form.left_wheel_weight, form.right_wheel_weight);

  return (
    <>
      <div style={{ fontWeight: 700, margin: '16px 0 12px' }}>Weight & Balance</div>
      {canEdit ? (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <FormField label="Empty Weight (kg)" half>
              <input type="number" step="0.1" value={form.empty_weight_kg} onChange={e => setF({ empty_weight_kg: e.target.value })} placeholder="Total empty weight" />
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <FormField label="Nose Wheel (kg)" half>
              <input type="number" step="0.1" value={form.nose_wheel_weight} onChange={e => setF({ nose_wheel_weight: e.target.value })} placeholder="e.g. 120" />
            </FormField>
            <FormField label="Left Main (kg)" half>
              <input type="number" step="0.1" value={form.left_wheel_weight} onChange={e => setF({ left_wheel_weight: e.target.value })} placeholder="e.g. 230" />
            </FormField>
            <FormField label="Right Main (kg)" half>
              <input type="number" step="0.1" value={form.right_wheel_weight} onChange={e => setF({ right_wheel_weight: e.target.value })} placeholder="e.g. 230" />
            </FormField>
          </div>
          {cg && (
            <div style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 8,
              background: cg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${cg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.35)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>CG Position: </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cg.cgMm} mm</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>Total: {cg.totalWeight} kg</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: cg.ok ? 'var(--success)' : 'var(--danger)' }}>{cg.cgPct}%</span>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>% MAC (15–20% OK)</div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <InfoRow label="Empty Weight" value={aircraft.empty_weight_kg != null ? `${aircraft.empty_weight_kg} kg` : null} />
          <InfoRow label="Nose Wheel" value={aircraft.nose_wheel_weight != null ? `${aircraft.nose_wheel_weight} kg` : null} />
          <InfoRow label="Left Main" value={aircraft.left_wheel_weight != null ? `${aircraft.left_wheel_weight} kg` : null} />
          <InfoRow label="Right Main" value={aircraft.right_wheel_weight != null ? `${aircraft.right_wheel_weight} kg` : null} />
          {(() => {
            const cg2 = calcCG(aircraft.nose_wheel_weight, aircraft.left_wheel_weight, aircraft.right_wheel_weight);
            if (!cg2) return null;
            return (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 8, display: 'flex', justifyContent: 'space-between',
                background: cg2.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${cg2.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.35)'}`,
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>CG: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cg2.cgMm} mm</span></span>
                <span style={{ fontWeight: 700, color: cg2.ok ? 'var(--success)' : 'var(--danger)' }}>{cg2.cgPct}% MAC</span>
              </div>
            );
          })()}
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
  const [contacts, setContacts] = useState([]);
  const [serials,  setSerials]  = useState([]);
  const [events,   setEvents]   = useState([]);
  const [images,   setImages]   = useState([]);

  // Configuration options (from admin panel)
  const [configOptions,   setConfigOptions]   = useState([]);   // all available options
  const [selectedConfig,  setSelectedConfig]  = useState(new Set()); // selected option IDs
  const [configDirty,     setConfigDirty]     = useState(false);
  const [configSaving,    setConfigSaving]    = useState(false);

  // Contact modal: null | { mode:'add'|'edit', data:{...}, saving:bool, error:'' }
  const [cModal, setCModal] = useState(null);

  // Serial add row
  const [newSerial,   setNewSerial]   = useState({ component: '', serial_number: '', notes: '' });
  const [addingSerial, setAddingSerial] = useState(false);
  const [serialSaving, setSerialSaving] = useState(false);

  // Event form
  const [newEvent,   setNewEvent]   = useState(EMPTY_EVENT);
  const [eventSaving, setEventSaving] = useState(false);

  // Image upload
  const [imgUploading, setImgUploading] = useState(false);
  const [captionEdit,  setCaptionEdit]  = useState({}); // { [imgId]: string }

  // ─── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [res, optsRes] = await Promise.all([
        getFleetAircraft(id),
        getFleetConfigOptions(),
      ]);
      setConfigOptions(optsRes.data || []);
      applyData(res.data);
    } finally {
      setLoading(false);
    }
  }

  function applyData(a) {
    setAircraft(a);
    setContacts(a.contacts || []);
    setSerials(a.serials  || []);
    setEvents(a.events   || []);
    setImages(a.images   || []);
    setSelectedConfig(new Set((a.selected_config || []).map(Number)));
    setConfigDirty(false);
    setForm({
      bw_serial:            a.bw_serial            || '',
      aircraft_number:      a.aircraft_number       || '',
      model:                a.model                || 'BW600',
      build_status:         a.build_status          || 'in_production',
      registration:         a.registration          || '',
      country_code:         a.country_code          || '',
      country_name:         a.country_name          || '',
      customer_name:        a.customer_name         || '',
      first_flight_date:    a.first_flight_date  ? a.first_flight_date.slice(0, 10)  : '',
      delivery_date:        a.delivery_date      ? a.delivery_date.slice(0, 10)      : '',
      empty_weight_kg:      a.empty_weight_kg    != null ? String(a.empty_weight_kg)    : '',
      nose_wheel_weight:    a.nose_wheel_weight  != null ? String(a.nose_wheel_weight)  : '',
      left_wheel_weight:    a.left_wheel_weight  != null ? String(a.left_wheel_weight)  : '',
      right_wheel_weight:   a.right_wheel_weight != null ? String(a.right_wheel_weight) : '',
      airworthiness_status: a.airworthiness_status  || '',
      airworthiness_expiry: a.airworthiness_expiry ? a.airworthiness_expiry.slice(0, 10) : '',
      total_hours_tsn:      a.total_hours_tsn    != null ? String(a.total_hours_tsn)    : '',
      engine_hours:         a.engine_hours       != null ? String(a.engine_hours)       : '',
      prop_hours:           a.prop_hours         != null ? String(a.prop_hours)         : '',
      next_inspection_date:  a.next_inspection_date  ? a.next_inspection_date.slice(0, 10) : '',
      next_inspection_hours: a.next_inspection_hours != null ? String(a.next_inspection_hours) : '',
      financing_flag:        a.financing_flag    || false,
      notes:                 a.notes             || '',
    });
    setDirty(false);
  }

  const setF = patch => { setForm(f => ({ ...f, ...patch })); setDirty(true); };

  // ─── Save aircraft ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateFleetAircraft(id, form);
      applyData({ ...res.data, contacts, serials, events, images, selected_config: [...selectedConfig] });
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
    e.preventDefault();
    if (!newSerial.component.trim() || !newSerial.serial_number.trim()) return;
    setSerialSaving(true);
    try {
      const res = await addFleetSerial(id, newSerial);
      setSerials(s => [...s, res.data]);
      setNewSerial({ component: '', serial_number: '', notes: '' });
      setAddingSerial(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add');
    } finally {
      setSerialSaving(false);
    }
  }

  async function handleDeleteSerial(sid) {
    if (!window.confirm('Delete this serial number entry?')) return;
    try {
      await deleteFleetSerial(id, sid);
      setSerials(s => s.filter(x => x.id !== sid));
    } catch { toast.error('Delete failed'); }
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  async function handleAddEvent(e) {
    e.preventDefault();
    if (!newEvent.event_date || !newEvent.title.trim()) return;
    setEventSaving(true);
    try {
      const res = await addFleetEvent(id, newEvent);
      setEvents(ev => [res.data, ...ev]);
      setNewEvent(EMPTY_EVENT);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add event');
    } finally {
      setEventSaving(false);
    }
  }

  async function handleDeleteEvent(eid) {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteFleetEvent(id, eid);
      setEvents(ev => ev.filter(x => x.id !== eid));
    } catch { toast.error('Delete failed'); }
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
      const res = await updateFleetImageCaption(id, imgId, caption);
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
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', borderRadius: 4, padding: '2px 7px' }}>
                #{aircraft.fleet_number}
              </span>
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
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{aircraft.model}</span>
              {aircraft.registration && (
                <>
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <span style={{ fontSize: 16 }}>{flagEmoji(aircraft.country_code)}</span>
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
            {t === 'Components' && serials.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{serials.length}</span>
            )}
            {t === 'Events' && events.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{events.length}</span>
            )}
            {t === 'Gallery' && images.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{images.length}</span>
            )}
            {t === 'Contacts' && contacts.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-hover)', borderRadius: 10, padding: '1px 6px' }}>{contacts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {tab === 'Overview' && (
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
                      {MODELS.map(m => <option key={m}>{m}</option>)}
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
                <InfoRow label="Country" value={[flagEmoji(aircraft.country_code), aircraft.country_name].filter(Boolean).join(' ')} />
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
              </>
            ) : (
              <>
                <InfoRow label="First Flight" value={fmtDate(aircraft.first_flight_date)} />
                <InfoRow label="Delivery" value={fmtDate(aircraft.delivery_date)} />
                <InfoRow label="Financing" value={aircraft.financing_flag ? '💳 Yes' : 'No'} />
              </>
            )}

            <WBSection form={form} aircraft={aircraft} canEdit={canEdit} setF={setF} />

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
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
                <FormField label="Propeller Hours">
                  <input type="number" step="0.1" min="0" value={form.prop_hours} onChange={e => setF({ prop_hours: e.target.value })} placeholder="0.0" />
                </FormField>
              </>
            ) : (
              <>
                <InfoRow label="Total (TSN)" value={aircraft.total_hours_tsn != null ? `${aircraft.total_hours_tsn.toFixed(1)} h` : null} mono />
                <InfoRow label="Engine"      value={aircraft.engine_hours != null ? `${aircraft.engine_hours.toFixed(1)} h` : null} mono />
                <InfoRow label="Propeller"   value={aircraft.prop_hours != null ? `${aircraft.prop_hours.toFixed(1)} h` : null} mono />
              </>
            )}
          </div>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Next Inspection Due</div>
            {canEdit ? (
              <>
                <FormField label="By Date">
                  <input type="date" value={form.next_inspection_date} onChange={e => setF({ next_inspection_date: e.target.value })} />
                </FormField>
                <FormField label="By Hours">
                  <input type="number" step="1" min="0" value={form.next_inspection_hours} onChange={e => setF({ next_inspection_hours: e.target.value })} placeholder="Total hours at next inspection" />
                </FormField>
              </>
            ) : (
              <>
                <InfoRow label="By Date"  value={fmtDate(aircraft.next_inspection_date)} />
                <InfoRow label="By Hours" value={aircraft.next_inspection_hours != null ? `${aircraft.next_inspection_hours.toFixed(0)} h` : null} mono />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── COMPONENTS ───────────────────────────────────────────────────────── */}
      {tab === 'Components' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Component Serial Numbers</div>
            {canEdit && !addingSerial && (
              <button className="btn btn-primary btn-sm" onClick={() => setAddingSerial(true)}>+ Add Component</button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Serial Number</th>
                  <th>Notes</th>
                  {canEdit && <th style={{ width: 50 }}></th>}
                </tr>
              </thead>
              <tbody>
                {serials.length === 0 && !addingSerial && (
                  <tr>
                    <td colSpan={canEdit ? 4 : 3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>
                      No component serial numbers recorded.
                      {canEdit && ' Click "+ Add Component" to begin.'}
                    </td>
                  </tr>
                )}
                {serials.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{s.component}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.serial_number}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.notes || '—'}</td>
                    {canEdit && (
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)', padding: '2px 8px' }}
                          onClick={() => handleDeleteSerial(s.id)}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {addingSerial && (
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    <td>
                      <input
                        list="component-suggestions"
                        value={newSerial.component}
                        onChange={e => setNewSerial(n => ({ ...n, component: e.target.value }))}
                        placeholder="Component name"
                        style={{ fontSize: 13 }}
                        autoFocus
                      />
                      <datalist id="component-suggestions">
                        {DEFAULT_COMPONENTS.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </td>
                    <td>
                      <input
                        value={newSerial.serial_number}
                        onChange={e => setNewSerial(n => ({ ...n, serial_number: e.target.value }))}
                        placeholder="Serial number"
                        style={{ fontFamily: 'monospace', fontSize: 13 }}
                      />
                    </td>
                    <td>
                      <input
                        value={newSerial.notes}
                        onChange={e => setNewSerial(n => ({ ...n, notes: e.target.value }))}
                        placeholder="Optional notes"
                        style={{ fontSize: 12 }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={handleAddSerial} disabled={serialSaving}>✓</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setAddingSerial(false); setNewSerial({ component: '', serial_number: '', notes: '' }); }}>✕</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EVENTS ───────────────────────────────────────────────────────────── */}
      {tab === 'Events' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }}>
          {/* Event list */}
          <div>
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
                          <span className={`badge ${EVENT_TYPE_BADGE[ev.event_type] || 'badge-ghost'}`} style={{ fontSize: 10 }}>
                            {EVENT_TYPE_LABEL[ev.event_type] || ev.event_type}
                          </span>
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
            <div style={{ fontWeight: 700, marginBottom: 14 }}>Log New Event</div>
            <form onSubmit={handleAddEvent}>
              <FormField label="Date *">
                <input type="date" value={newEvent.event_date} onChange={e => setNewEvent(n => ({ ...n, event_date: e.target.value }))} required />
              </FormField>
              <FormField label="Type">
                <select value={newEvent.event_type} onChange={e => setNewEvent(n => ({ ...n, event_type: e.target.value }))}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)}
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
            </form>
          </div>
        </div>
      )}

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
                return (
                  <div key={img.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <img
                      src={`/uploads/fleet/${img.filename}`}
                      alt={img.caption || 'Aircraft photo'}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                      onClick={() => window.open(`/uploads/fleet/${img.filename}`, '_blank')}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div style={{ padding: '10px 12px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={captionEdit[img.id]}
                            onChange={e => setCaptionEdit(c => ({ ...c, [img.id]: e.target.value }))}
                            placeholder="Caption…"
                            style={{ flex: 1, fontSize: 12 }}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveCaption(img.id); if (e.key === 'Escape') setCaptionEdit(c => { const n = { ...c }; delete n[img.id]; return n; }); }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveCaption(img.id)}>✓</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
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
                      )}
                    </div>
                  </div>
                );
              })}
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

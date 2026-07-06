// ─── Build statuses ───────────────────────────────────────────────────────────
// The list is admin-editable (stored in fleet_settings under `build_statuses` as a
// JSON array of { value, label }). These defaults are the fallback when the setting
// hasn't been loaded or is missing.
export const DEFAULT_BUILD_STATUSES = [
  { value: 'in_production', label: 'In Production' },
  { value: 'completed',     label: 'Completed' },
  { value: 'delivered',     label: 'Delivered' },
  { value: 'maintenance',   label: 'Maintenance' },
  { value: 'stored',        label: 'Stored' },
  { value: 'for_sale',      label: 'For Sale' },
  { value: 'written_off',   label: 'Written Off' },
];

// Parse the `build_statuses` value out of a fleet-settings object.
export function parseBuildStatuses(settings) {
  try {
    const raw = settings?.build_statuses;
    if (raw) {
      const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(list)) {
        const clean = list.filter(s => s && s.value).map(s => ({ value: String(s.value), label: String(s.label || s.value) }));
        if (clean.length) return clean;
      }
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_BUILD_STATUSES;
}

const BADGE_BY_VALUE = {
  in_production: 'badge-info',
  completed:     'badge-success',
  delivered:     'badge-success',
  maintenance:   'badge-warning',
  in_service:    'badge-success', // legacy, in case any record still has it
  stored:        'badge-ghost',
  for_sale:      'badge-warning',
  written_off:   'badge-danger',
};

export function buildStatusBadge(value) {
  return BADGE_BY_VALUE[value] || 'badge-ghost';
}

export function buildStatusLabel(value, statuses) {
  const list = statuses && statuses.length ? statuses : DEFAULT_BUILD_STATUSES;
  const found = list.find(s => s.value === value);
  if (found) return found.label;
  // Legacy fallback + humanised raw value
  if (value === 'in_service') return 'Maintenance';
  return value ? String(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';
}

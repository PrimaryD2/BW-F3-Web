// One date format across the whole app: "20 APR 2026".
//
// Numeric formats are ambiguous between locales (04/05/2026 is April 5th to a
// US reader and May 4th to a European one), and on maintenance records that
// ambiguity is a safety problem. The month is always spelled with letters, so
// a date can only be read one way. Do not introduce other formats.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Accepts a Date, an ISO string, or a "YYYY-MM-DD" date-only string. Date-only
// values are pinned to local midnight so they never shift a day via UTC.
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && s.length <= 10
    ? new Date(s + 'T00:00:00')
    : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// "20 APR 2026" — the canonical display format.
export function fmtDate(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// "20 APR 2026 14:30" — for timestamps where the time matters (uploads, logs).
export function fmtDateTime(value, fallback = '—') {
  const d = toDate(value);
  if (!d) return fallback;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(d)} ${hh}:${mm}`;
}

// "YYYY-MM-DD" for <input type="date"> values and filenames — never for display.
export function toDateInput(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

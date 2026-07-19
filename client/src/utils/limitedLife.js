// Limited-life rules for a component name (defined in Admin → Component Names).
//
// A part carries a primary rule ("retire at 15 years") and optionally a second,
// usually recurring, rule ("retest every 5 years until the replacement is due").
// Lifespans are stored as years + months, which add together — 16 months and
// "10 years and 2 months" are both expressible.

export const LIFE_ACTIONS = [
  { value: 'retire',   label: 'Retire (replace)', verb: 'Retire',   word: 'RETIRE'   },
  { value: 'overhaul', label: 'Overhaul',         verb: 'Overhaul', word: 'OVERHAUL' },
  { value: 'retest',   label: 'Retest',           verb: 'Retest',   word: 'RETEST'   },
  { value: 'inspect',  label: 'Inspect',          verb: 'Inspect',  word: 'INSPECT'  },
];

const ACTION_BY_VALUE = Object.fromEntries(LIFE_ACTIONS.map(a => [a.value, a]));

export const lifeAction = (v) => ACTION_BY_VALUE[v] || ACTION_BY_VALUE.retire;
export const lifeActionVerb = (v) => lifeAction(v).verb;
export const lifeActionWord = (v) => lifeAction(v).word;

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// years + months collapsed into whole months; null when neither is set.
function totalMonths(years, months) {
  const y = num(years);
  const m = num(months);
  if (y == null && m == null) return null;
  return Math.round((y || 0) * 12 + (m || 0));
}

// "10 yr 2 mo", "16 mo", "15 yr" — empty string when there's no calendar limit.
export function formatSpan(years, months) {
  const total = totalMonths(years, months);
  if (total == null) return '';
  const y = Math.floor(total / 12);
  const m = total % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
}

// The rules a component name defines, in display order. Empty when the name
// isn't flagged as limited life.
export function lifeRules(cn) {
  if (!cn || !Number(cn.is_limited_life)) return [];
  const rules = [{
    key: 'primary',
    action: cn.life_action || 'retire',
    hours: num(cn.tbo_hours),
    months: totalMonths(cn.lifespan_years, cn.lifespan_months),
    years: num(cn.lifespan_years),
    rawMonths: num(cn.lifespan_months),
    recurring: false,
  }];
  const secondMonths = totalMonths(cn.second_lifespan_years, cn.second_lifespan_months);
  const secondHours  = num(cn.second_tbo_hours);
  if (cn.second_action && (secondMonths != null || secondHours != null)) {
    rules.push({
      key: 'second',
      action: cn.second_action,
      hours: secondHours,
      months: secondMonths,
      years: num(cn.second_lifespan_years),
      rawMonths: num(cn.second_lifespan_months),
      recurring: !!Number(cn.second_is_recurring),
    });
  }
  return rules;
}

// Both rules are measured from the same date, chosen by lifespan_basis.
export const basisField = (cn) => (cn?.lifespan_basis === 'install' ? 'date_installed' : 'manufacturing_date');
export const basisLabel = (cn) => (cn?.lifespan_basis === 'install' ? 'installed-on-aircraft date' : 'manufacturing date');
export const basisShort = (cn) => (cn?.lifespan_basis === 'install' ? 'install' : 'mfg');

// True when a rule needs a basis date before it can be evaluated.
export const rulesNeedDate = (cn) => lifeRules(cn).some(r => r.months != null);

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const targetDay = d.getDate();
  d.setMonth(d.getMonth() + months);
  // setMonth rolls over when the target month is short (31 Jan + 1 mo → 3 Mar);
  // clamp back to the last day of the intended month instead.
  if (d.getDate() < targetDay) d.setDate(0);
  return d;
}

// When a rule next comes due, given the basis date. Recurring rules return the
// next occurrence in the future (or the last overdue one if it's already
// lapsed); one-off rules return the single expiry. Null when not date-driven.
export function ruleDueDate(rule, basisDate, now = new Date()) {
  if (!rule || rule.months == null || !basisDate) return null;
  const start = new Date(String(basisDate).slice(0, 10) + 'T00:00:00');
  if (isNaN(start.getTime())) return null;
  if (!rule.recurring) return addMonths(start, rule.months);
  // Walk forward one interval at a time until we pass today. Bounded by a
  // sane number of intervals so a tiny interval can't spin.
  let due = addMonths(start, rule.months);
  for (let i = 0; i < 1000 && due < now; i++) due = addMonths(due, rule.months);
  return due;
}

// One-line description of a rule's limits, including its cadence:
// "TBO 2000 h or 10 yr 2 mo" for a one-off, "every 5 yr" for a recurring one.
export function describeRule(rule) {
  const bits = [];
  // "TBO" only reads right for a one-off overhaul/retirement limit.
  if (rule.hours != null) bits.push(`${rule.recurring ? '' : 'TBO '}${rule.hours.toFixed(0)} h`);
  const span = formatSpan(rule.years, rule.rawMonths);
  if (span) bits.push(span);
  const body = bits.join(' or ');
  return rule.recurring && body ? `every ${body}` : body;
}

// Short summary of every rule on a component name, for admin lists.
export function limitedLifeSummary(cn) {
  const rules = lifeRules(cn);
  if (!rules.length) return null;
  return rules
    .map(r => `${lifeActionVerb(r.action)}: ${describeRule(r) || 'limited life'}`)
    .join(' · ');
}

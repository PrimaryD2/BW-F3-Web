const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/** Strip time portion from a date value — keeps MariaDB DATE columns happy
 *  even when the client accidentally sends a full ISO-8601 timestamp. */
function toDateOnly(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('T')) return s.slice(0, 10);
  return s.slice(0, 10);
}

router.get('/models', async (_req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM fleet_models WHERE active = 1 ORDER BY sort_order ASC, name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Image upload via multer ──────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads/fleet');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, base + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ─── Paperwork upload via multer ──────────────────────────────────────────────
const PAPERWORK_DIR = path.join(__dirname, '../../uploads/paperwork');
if (!fs.existsSync(PAPERWORK_DIR)) fs.mkdirSync(PAPERWORK_DIR, { recursive: true });

const paperworkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PAPERWORK_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, base + ext);
  },
});
const ALLOWED_PAPERWORK = /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.|text\/plain$)/i;
const uploadPaperwork = multer({
  storage: paperworkStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_PAPERWORK.test(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normAircraft(a) {
  return {
    ...a,
    financing_flag:        Boolean(a.financing_flag),
    serviced_by_us:        Boolean(a.serviced_by_us),
    total_hours_tsn:       a.total_hours_tsn       != null ? parseFloat(a.total_hours_tsn)       : null,
    engine_hours:          a.engine_hours           != null ? parseFloat(a.engine_hours)           : null,
    prop_hours:            a.prop_hours             != null ? parseFloat(a.prop_hours)             : null,
    empty_weight_kg:       a.empty_weight_kg        != null ? parseFloat(a.empty_weight_kg)        : null,
    nose_wheel_weight:     a.nose_wheel_weight      != null ? parseFloat(a.nose_wheel_weight)      : null,
    left_wheel_weight:     a.left_wheel_weight      != null ? parseFloat(a.left_wheel_weight)      : null,
    right_wheel_weight:    a.right_wheel_weight     != null ? parseFloat(a.right_wheel_weight)     : null,
    next_inspection_hours: a.next_inspection_hours  != null ? parseFloat(a.next_inspection_hours)  : null,
  };
}

function normPlannedMaintenance(item) {
  return {
    ...item,
    labor_hours: item.labor_hours != null ? parseFloat(item.labor_hours) : null,
  };
}

const AIRCRAFT_SELECT = `
  id, fleet_number, bw_serial, aircraft_number, model, build_status,
  registration, country_code, country_name,
  empty_weight_kg, nose_wheel_weight, left_wheel_weight, right_wheel_weight,
  airworthiness_status, airworthiness_expiry,
  total_hours_tsn, engine_hours, prop_hours,
  next_inspection_date, next_inspection_hours,
  customer_name, first_flight_date, delivery_date, financing_flag, serviced_by_us, notes,
  created_at, updated_at
`;

const PLANNED_MAINTENANCE_SELECT = `
  fpm.id, fpm.aircraft_id, fpm.template_id, fpm.customer_id,
  fpm.planned_date, COALESCE(fpm.planned_arrival_date, fpm.planned_date) AS planned_arrival_date,
  fpm.assigned_technician_id, fpm.planned_comments,
  fpm.status, fpm.completed_date, fpm.labor_hours, fpm.additional_work,
  fpm.signoff_notes, fpm.signed_off_by, fpm.signed_off_at, fpm.created_at,
  fst.title AS template_title, fst.category,
  fa.bw_serial, fa.registration, fa.model, fa.country_code, fa.total_hours_tsn AS aircraft_tsn,
  tech.name AS assigned_technician_name,
  COALESCE(cust.full_name, fa.customer_name) AS customer_name
`;

// ─── Components list (all serials across fleet) ──────────────────────────────

// GET /api/fleet/component-names — active component names for dropdowns
router.get('/component-names', async (_req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM fleet_component_names WHERE active = TRUE ORDER BY component_type, sort_order, name'
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/fleet/components?type=Engine&search=
router.get('/components', async (req, res) => {
  try {
    const { type, search } = req.query;
    let q = `
      SELECT fsn.*, fa.bw_serial, fa.registration, fa.model, fa.build_status
      FROM fleet_serial_numbers fsn
      JOIN fleet_aircraft fa ON fa.id = fsn.aircraft_id
      WHERE 1=1`;
    const params = [];
    if (type) { q += ' AND fsn.component_type = ?'; params.push(type); }
    if (search) {
      q += ' AND (fsn.component_name LIKE ? OR fsn.serial_number LIKE ? OR fsn.component_type LIKE ? OR fsn.software_version LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    q += ' ORDER BY fsn.component_type, fsn.component_name, fa.bw_serial';
    const rows = await query(q, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Service Templates (registered before /:id to avoid param capture) ──────────

// GET /api/fleet/service-templates
router.get('/service-templates', async (_req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM fleet_service_templates WHERE active = TRUE ORDER BY category, sort_order, title'
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/fleet/service-templates
router.post('/service-templates', requireRole('admin', 'supervisor'), async (req, res) => {
  const { category, title, interval_hours, interval_months, description, sort_order = 0, is_one_time = false } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const r = await query(
      'INSERT INTO fleet_service_templates (category, title, interval_hours, interval_months, description, sort_order, is_one_time) VALUES (?,?,?,?,?,?,?)',
      [category?.trim() || 'General', title.trim(), interval_hours || null, interval_months || null, description || null, sort_order, is_one_time ? 1 : 0]
    );
    const rows = await query('SELECT * FROM fleet_service_templates WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/fleet/service-templates/:tid
router.put('/service-templates/:tid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { category, title, interval_hours, interval_months, description, sort_order, is_one_time } = req.body;
  try {
    await query(
      'UPDATE fleet_service_templates SET category=?, title=?, interval_hours=?, interval_months=?, description=?, sort_order=?, is_one_time=? WHERE id=?',
      [category?.trim() || 'General', title, interval_hours || null, interval_months || null, description || null, sort_order ?? 0, is_one_time ? 1 : 0, req.params.tid]
    );
    const rows = await query('SELECT * FROM fleet_service_templates WHERE id = ?', [req.params.tid]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/fleet/service-templates/:tid (soft-delete)
router.delete('/service-templates/:tid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('UPDATE fleet_service_templates SET active = FALSE WHERE id=?', [req.params.tid]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/fleet/planned-maintenance
router.get('/planned-maintenance', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT ${PLANNED_MAINTENANCE_SELECT}
       FROM fleet_planned_maintenance fpm
       LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
       JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
       LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
       LEFT JOIN customers cust ON cust.id = fpm.customer_id
       ORDER BY
         CASE WHEN fpm.status = 'planned' THEN 0 ELSE 1 END,
         CASE WHEN fpm.status = 'planned' THEN COALESCE(fpm.planned_arrival_date, fpm.planned_date) END ASC,
         CASE WHEN fpm.status = 'completed' THEN fpm.completed_date END DESC,
         fpm.id DESC`
    );

    const ids = rows.map(r => r.id);
    let itemsByPm = {};
    let photosByItem = {};

    if (ids.length) {
      const itemRows = await query(
        `SELECT fpmi.*, fst.title AS template_title, fst.category, u.name AS item_technician_name
         FROM fleet_planned_maintenance_items fpmi
         LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
         LEFT JOIN users u ON u.id = fpmi.assigned_technician_id
         WHERE fpmi.planned_id IN (${ids.map(() => '?').join(',')})
         ORDER BY fpmi.sort_order, fpmi.id`,
        ids
      );
      for (const item of itemRows) {
        if (!itemsByPm[item.planned_id]) itemsByPm[item.planned_id] = [];
        itemsByPm[item.planned_id].push(item);
      }

      const itemIds = itemRows.map(i => i.id);
      if (itemIds.length) {
        const photoRows = await query(
          `SELECT fmp.*, u.name AS uploaded_by_name
           FROM fleet_maintenance_photos fmp
           LEFT JOIN users u ON u.id = fmp.uploaded_by
           WHERE fmp.item_id IN (${itemIds.map(() => '?').join(',')})
           ORDER BY fmp.created_at ASC`,
          itemIds
        );
        for (const p of photoRows) {
          if (!photosByItem[p.item_id]) photosByItem[p.item_id] = [];
          photosByItem[p.item_id].push(p);
        }
      }
    }

    res.json(rows.map(r => normPlannedMaintenance({
      ...r,
      items: (itemsByPm[r.id] || []).map(it => ({ ...it, photos: photosByItem[it.id] || [] })),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/fleet/upcoming-services — services due in the next 60 days or within 20h
//
// Rules:
//   • 25h, 200h, 600h… (is_one_time = TRUE)  — fire ONCE at TSN within ±10h of
//     interval_hours, then never again.
//   • 100h (is_one_time = FALSE, has interval_hours) — recurring every N hours
//     OR every interval_months, whichever comes first.
//   • When a one-time milestone is currently "active" for an aircraft, any
//     SMALLER-interval recurring template (e.g. 100h at TSN=200) is suppressed
//     for that aircraft — the milestone supersedes it.
router.get('/upcoming-services', async (_req, res) => {
  try {
    // Only aircraft flagged "serviced_by_us" are checked — we don't try to
    // track maintenance for planes we built but don't maintain.
    const rows = await query(`
      SELECT
        fa.id AS aircraft_id, fa.bw_serial, fa.registration, fa.country_code,
        fa.total_hours_tsn, fa.first_flight_date, fa.delivery_date,
        fst.id AS template_id, fst.title, fst.category,
        fst.interval_hours, fst.interval_months, fst.is_one_time,
        (SELECT fsr.completed_date FROM fleet_service_records fsr
         WHERE fsr.aircraft_id = fa.id AND fsr.template_id = fst.id
         ORDER BY fsr.completed_date DESC LIMIT 1) AS last_date,
        (SELECT fsr.hours_at_completion FROM fleet_service_records fsr
         WHERE fsr.aircraft_id = fa.id AND fsr.template_id = fst.id
         ORDER BY fsr.completed_date DESC LIMIT 1) AS last_hours
      FROM fleet_service_templates fst
      CROSS JOIN fleet_aircraft fa
      WHERE fst.active = TRUE AND fa.serviced_by_us = TRUE
      ORDER BY fa.bw_serial, fst.sort_order, fst.title
    `);

    const today = new Date();
    const TOL_HOURS = 10;
    const HOUR_WARN_WINDOW = 20;
    const DATE_WARN_DAYS = 60;

    // Group by aircraft so we can apply per-aircraft supersession.
    const byAircraft = {};
    for (const r of rows) {
      if (!byAircraft[r.aircraft_id]) byAircraft[r.aircraft_id] = [];
      byAircraft[r.aircraft_id].push(r);
    }

    // Helper: which one-time milestones are currently "active" for this aircraft?
    // A one-time milestone is active when TSN is within ±10h of its interval AND
    // no completion record exists for it yet.
    function activeOneTimeIntervals(rowsForAircraft, tsn) {
      const intervals = [];
      for (const t of rowsForAircraft) {
        if (!t.is_one_time || !t.interval_hours) continue;
        if (t.last_date) continue; // already done, no longer active
        if (tsn == null) continue;
        if (Math.abs(tsn - Number(t.interval_hours)) <= TOL_HOURS) {
          intervals.push(Number(t.interval_hours));
        }
      }
      return intervals;
    }

    const upcoming = [];

    for (const [, aircraftRows] of Object.entries(byAircraft)) {
      const tsn = aircraftRows[0].total_hours_tsn != null ? parseFloat(aircraftRows[0].total_hours_tsn) : null;
      const activeMilestones = activeOneTimeIntervals(aircraftRows, tsn); // e.g. [200] or [600]

      for (const r of aircraftRows) {
        const interval  = r.interval_hours != null ? Number(r.interval_hours) : null;
        const neverDone = !r.last_date;
        const isOneTime = !!r.is_one_time;
        let pushed = false;

        // Recurring templates: suppress if a larger active milestone exists whose
        // value is a multiple of this template's interval (so doing the milestone
        // satisfies this one too).
        if (!isOneTime && interval) {
          const supersededBy = activeMilestones.find(m => m > interval && m % interval === 0);
          if (supersededBy) {
            // Skip — the milestone inspection will cover this. The milestone
            // will be reported by its own row below.
            continue;
          }
        }

        // ── ONE-TIME milestone (e.g. 25h, 200h, 600h) ───────────────────────
        if (isOneTime && interval && tsn != null) {
          if (r.last_date) continue;          // already done — never fires again
          const distance = tsn - interval;
          if (distance > TOL_HOURS) {
            // Already past the tolerance window without doing it — flag overdue
            upcoming.push({
              ...r,
              due_date:    null,
              due_hours:   interval,
              hours_until: -distance,
              overdue:     true,
            });
          } else if (distance >= -HOUR_WARN_WINDOW) {
            // In window or close — flag due-soon
            upcoming.push({
              ...r,
              due_date:    null,
              due_hours:   interval,
              hours_until: interval - tsn,
              overdue:     distance > 0,
            });
          }
          continue; // one-time templates don't use the date-interval branch
        }

        // ── Recurring HOURS interval (e.g. 100h every 100h) ─────────────────
        if (interval && tsn != null) {
          const lastDue = Math.floor(tsn / interval) * interval;
          const nextDue = lastDue + interval;
          const prevMilestone = lastDue - interval;
          const lastCompletedHours = r.last_hours != null ? parseFloat(r.last_hours) : null;
          const servicedCurrentWindow =
            !neverDone &&
            (lastCompletedHours == null || lastCompletedHours > prevMilestone);

          if (lastDue > 0 && !servicedCurrentWindow) {
            upcoming.push({
              ...r,
              due_date:    null,
              due_hours:   lastDue,
              hours_until: -(tsn - lastDue),
              overdue:     true,
            });
            pushed = true;
          } else {
            const hoursUntil = nextDue - tsn;
            if (hoursUntil <= HOUR_WARN_WINDOW) {
              upcoming.push({
                ...r,
                due_date:    null,
                due_hours:   nextDue,
                hours_until: hoursUntil,
                overdue:     false,
              });
              pushed = true;
            }
          }
        }

        // ── Recurring CALENDAR interval (e.g. annual) ──────────────────────
        if (r.interval_months != null && !pushed) {
          if (neverDone) {
            // Only flag "never done" from the date side when there's no hours
            // interval, OR TSN has passed the first hours milestone. Stops
            // brand-new aircraft from being flagged for everything at delivery.
            const hasHoursInterval   = interval != null && tsn != null;
            const pastFirstMilestone = hasHoursInterval && tsn >= interval;
            if (!hasHoursInterval || pastFirstMilestone) {
              upcoming.push({ ...r, due_date: null, due_hours: null, days_until: null, overdue: true });
            }
          } else {
            const d = new Date(r.last_date);
            d.setMonth(d.getMonth() + r.interval_months);
            const dueDateStr = d.toISOString().slice(0, 10);
            const daysUntil  = Math.ceil((d - today) / 86400000);
            if (daysUntil <= DATE_WARN_DAYS) {
              upcoming.push({
                ...r,
                due_date:    dueDateStr,
                due_hours:   null,
                days_until:  daysUntil,
                overdue:     daysUntil < 0,
              });
            }
          }
        }
      }
    }

    res.json(upcoming);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Event Types ─────────────────────────────────────────────────────────────

// GET /api/fleet/event-types
router.get('/event-types', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_event_types ORDER BY sort_order, label');
    res.json(rows.map((row) => ({
      ...row,
      image_count: row.image_count != null ? Number(row.image_count) : 0,
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/fleet/event-types
router.post('/event-types', requireRole('admin', 'supervisor'), async (req, res) => {
  const { label, color = 'badge-ghost', sort_order = 0 } = req.body;
  if (!label) return res.status(400).json({ error: 'label is required' });
  try {
    const r = await query(
      'INSERT INTO fleet_event_types (label, color, sort_order) VALUES (?,?,?)',
      [label.trim(), color, sort_order]
    );
    const rows = await query('SELECT * FROM fleet_event_types WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/fleet/event-types/:etid
router.put('/event-types/:etid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { label, color, sort_order } = req.body;
  try {
    await query(
      'UPDATE fleet_event_types SET label=?, color=?, sort_order=? WHERE id=?',
      [label?.trim(), color || 'badge-ghost', sort_order ?? 0, req.params.etid]
    );
    const rows = await query('SELECT * FROM fleet_event_types WHERE id = ?', [req.params.etid]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/fleet/event-types/:etid
router.delete('/event-types/:etid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_event_types WHERE id=?', [req.params.etid]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Gallery (cover images for all aircraft) ──────────────────────────────────

// GET /api/fleet/gallery
router.get('/gallery', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT
        fa.id, fa.bw_serial, fa.aircraft_number, fa.model,
        fa.registration, fa.country_code, fa.country_name, fa.customer_name, fa.build_status,
        (
          SELECT GROUP_CONCAT(DISTINCT fco.label ORDER BY fco.sort_order ASC, fco.label ASC SEPARATOR ', ')
          FROM fleet_aircraft_config fac
          JOIN fleet_config_options fco ON fco.id = fac.option_id
          WHERE fac.aircraft_id = fa.id AND fco.category = 'Engine'
        ) AS engine_configuration,
        (SELECT fi.filename FROM fleet_images fi
         WHERE fi.aircraft_id = fa.id
         ORDER BY fi.is_cover DESC, fi.sort_order ASC, fi.id ASC LIMIT 1) AS cover_image,
        (
          SELECT COUNT(*)
          FROM fleet_images fi
          WHERE fi.aircraft_id = fa.id
        ) AS image_count
      FROM fleet_aircraft fa
      ORDER BY
        CASE WHEN fa.aircraft_number REGEXP '^[0-9]+$'
             THEN CAST(fa.aircraft_number AS UNSIGNED)
             ELSE 999999 END ASC,
        fa.bw_serial ASC
    `);
    const normalizedRows = rows.map((row) => ({
      ...row,
      image_count: row.image_count != null ? Number(row.image_count) : 0,
    }));
    res.json(normalizedRows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Config Options (registered before /:id to avoid param capture) ───────────

// GET /api/fleet/config-options
router.get('/config-options', async (_req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM fleet_config_options ORDER BY category, sort_order, label'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fleet/config-options
router.post('/config-options', requireRole('admin', 'supervisor'), async (req, res) => {
  const { category, label, sort_order = 0, is_standard = false, price, show_in_configurator = true } = req.body;
  if (!category || !label) return res.status(400).json({ error: 'category and label are required' });
  try {
    const r = await query(
      'INSERT INTO fleet_config_options (category, label, sort_order, is_standard, price, show_in_configurator) VALUES (?,?,?,?,?,?)',
      [category.trim(), label.trim(), sort_order, is_standard ? 1 : 0, price != null && price !== '' ? Number(price) : null, show_in_configurator ? 1 : 0]
    );
    const rows = await query('SELECT * FROM fleet_config_options WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/config-options/:oid
router.put('/config-options/:oid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { category, label, sort_order, is_standard, price, show_in_configurator } = req.body;
  try {
    await query(
      'UPDATE fleet_config_options SET category=?, label=?, sort_order=?, is_standard=?, price=?, show_in_configurator=? WHERE id=?',
      [category?.trim(), label?.trim(), sort_order ?? 0, is_standard ? 1 : 0, price != null && price !== '' ? Number(price) : null, show_in_configurator ? 1 : 0, req.params.oid]
    );
    const rows = await query('SELECT * FROM fleet_config_options WHERE id = ?', [req.params.oid]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/fleet/config-options/:oid
router.delete('/config-options/:oid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_config_options WHERE id=?', [req.params.oid]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Aircraft CRUD ───────────────────────────────────────────────────────────

// GET /api/fleet  — sorted by bw_serial
router.get('/', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT ${AIRCRAFT_SELECT},
        (
          SELECT fpm.planned_date
          FROM fleet_planned_maintenance fpm
          WHERE fpm.aircraft_id = fleet_aircraft.id AND fpm.status = 'planned'
          ORDER BY fpm.planned_date ASC, fpm.id ASC
          LIMIT 1
        ) AS planned_maintenance_date,
        (
          SELECT COALESCE(fst.title, fpm.planned_comments, 'Custom work')
          FROM fleet_planned_maintenance fpm
          LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
          WHERE fpm.aircraft_id = fleet_aircraft.id AND fpm.status = 'planned'
          ORDER BY COALESCE(fpm.planned_arrival_date, fpm.planned_date) ASC, fpm.id ASC
          LIMIT 1
        ) AS planned_maintenance_title,
        (
          SELECT COUNT(*)
          FROM fleet_bulletin_aircraft fba
          JOIN fleet_bulletins fb ON fb.id = fba.bulletin_id
          WHERE fba.aircraft_id = fleet_aircraft.id AND fba.status = 'open'
        ) AS open_bulletin_count
       FROM fleet_aircraft
       ORDER BY bw_serial ASC`
    );
    res.json(rows.map((row) => ({
      ...normAircraft(row),
      open_bulletin_count: row.open_bulletin_count != null ? Number(row.open_bulletin_count) : 0,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fleet
router.post('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    bw_serial, aircraft_number, model, build_status = 'in_production',
    registration, country_code, country_name,
    empty_weight_kg, nose_wheel_weight, left_wheel_weight, right_wheel_weight,
    airworthiness_status, airworthiness_expiry,
    total_hours_tsn, engine_hours, prop_hours,
    next_inspection_date, next_inspection_hours,
    customer_name, first_flight_date, delivery_date, financing_flag = false, notes,
  } = req.body;

  if (!bw_serial || !model) {
    return res.status(400).json({ error: 'bw_serial and model are required' });
  }
  try {
    const numRow = await query('SELECT COALESCE(MAX(fleet_number), 0) + 1 AS next_num FROM fleet_aircraft');
    const fleet_number = Number(numRow[0].next_num);

    const result = await query(
      `INSERT INTO fleet_aircraft
       (fleet_number, bw_serial, aircraft_number, model, build_status,
        registration, country_code, country_name,
        empty_weight_kg, nose_wheel_weight, left_wheel_weight, right_wheel_weight,
        airworthiness_status, airworthiness_expiry,
        total_hours_tsn, engine_hours, prop_hours,
        next_inspection_date, next_inspection_hours,
        customer_name, first_flight_date, delivery_date, financing_flag, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        fleet_number, bw_serial.trim(), aircraft_number || null, model, build_status,
        registration || null, country_code?.toUpperCase() || null, country_name || null,
        empty_weight_kg || null, nose_wheel_weight || null,
        left_wheel_weight || null, right_wheel_weight || null,
        airworthiness_status || null, airworthiness_expiry || null,
        total_hours_tsn || null, engine_hours || null, prop_hours || null,
        next_inspection_date || null, next_inspection_hours || null,
        customer_name || null, first_flight_date || null, delivery_date || null,
        financing_flag ? 1 : 0, notes || null,
      ]
    );
    const rows = await query(`SELECT ${AIRCRAFT_SELECT} FROM fleet_aircraft WHERE id = ?`, [result.insertId]);
    res.status(201).json(normAircraft(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/fleet/:id
router.get('/:id', async (req, res) => {
  try {
    const rows = await query(`SELECT ${AIRCRAFT_SELECT} FROM fleet_aircraft WHERE id = ?`, [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Aircraft not found' });
    const aircraft = normAircraft(rows[0]);

    const [contacts, serials, events, images, configRows, serviceRecords, plannedMaintenance, paperwork, partReplacements, bulletins, paints] = await Promise.all([
      query('SELECT * FROM fleet_contacts WHERE aircraft_id = ? ORDER BY id', [req.params.id]),
      query('SELECT * FROM fleet_serial_numbers WHERE aircraft_id = ? ORDER BY uninstalled ASC, sort_order, id', [req.params.id]),
      query(
        `SELECT fe.*, u.name AS logged_by_name FROM fleet_events fe
         LEFT JOIN users u ON fe.logged_by = u.id
         WHERE fe.aircraft_id = ? ORDER BY fe.event_date DESC, fe.id DESC`,
        [req.params.id]
      ),
      query('SELECT * FROM fleet_images WHERE aircraft_id = ? ORDER BY sort_order, id', [req.params.id]),
      query('SELECT option_id FROM fleet_aircraft_config WHERE aircraft_id = ?', [req.params.id]),
      query(
        `SELECT fsr.*, u.name AS logged_by_name FROM fleet_service_records fsr
         LEFT JOIN users u ON fsr.logged_by = u.id
         WHERE fsr.aircraft_id = ? ORDER BY fsr.completed_date DESC, fsr.id DESC`,
        [req.params.id]
      ),
      query(
        `SELECT ${PLANNED_MAINTENANCE_SELECT}
         FROM fleet_planned_maintenance fpm
         LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
         JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
         LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
         LEFT JOIN customers cust ON cust.id = fpm.customer_id
         WHERE fpm.aircraft_id = ?
         ORDER BY
           CASE WHEN fpm.status = 'planned' THEN 0 ELSE 1 END,
           CASE WHEN fpm.status = 'planned' THEN COALESCE(fpm.planned_arrival_date, fpm.planned_date) END ASC,
           CASE WHEN fpm.status = 'completed' THEN fpm.completed_date END DESC,
           fpm.id DESC`,
        [req.params.id]
      ),
      query(
        `SELECT fp.*, u.name AS uploaded_by_name FROM fleet_paperwork fp
         LEFT JOIN users u ON fp.uploaded_by = u.id
         WHERE fp.aircraft_id = ? ORDER BY fp.uploaded_at DESC`,
        [req.params.id]
      ),
      query(
        `SELECT * FROM fleet_part_replacements
         WHERE aircraft_id = ?
         ORDER BY replacement_date DESC, id DESC`,
        [req.params.id]
      ),
      query(
        `SELECT fb.id, fb.title, fb.serial_prefix, fb.status, fb.component_type, fb.component_name,
                fb.category, fb.reason, fb.what_to_do, fb.details,
                fba.status AS aircraft_status, fba.resolution_notes, fba.resolved_extra_work,
                fba.labor_hours, fba.signed_off_by, fba.resolved_at
         FROM fleet_bulletin_aircraft fba
         JOIN fleet_bulletins fb ON fb.id = fba.bulletin_id
         WHERE fba.aircraft_id = ?
         ORDER BY CASE WHEN fba.status = 'open' THEN 0 ELSE 1 END, fb.created_at DESC`,
        [req.params.id]
      ),
      query('SELECT * FROM fleet_paints WHERE aircraft_id = ? ORDER BY sort_order, id', [req.params.id]),
    ]);

    const selected_config = configRows.map(r => Number(r.option_id));

    // Attach software version logs to each serial
    const serialIds = serials.map(s => s.id);
    let versionLogsBySerial = {};
    if (serialIds.length) {
      const vLogs = await query(
        `SELECT * FROM fleet_serial_version_logs WHERE serial_id IN (${serialIds.map(() => '?').join(',')}) ORDER BY updated_at ASC`,
        serialIds
      );
      for (const log of vLogs) {
        if (!versionLogsBySerial[log.serial_id]) versionLogsBySerial[log.serial_id] = [];
        versionLogsBySerial[log.serial_id].push(log);
      }
    }
    const serialsWithLogs = serials.map(s => ({ ...s, version_logs: versionLogsBySerial[s.id] || [] }));

    // Fetch items for planned maintenance entries
    const pmIds = plannedMaintenance.map(p => p.id);
    let pmItemsByPm = {};
    if (pmIds.length) {
      const pmItemRows = await query(
        `SELECT fpmi.*, fst.title AS template_title, fst.category, u.name AS item_technician_name
         FROM fleet_planned_maintenance_items fpmi
         LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
         LEFT JOIN users u ON u.id = fpmi.assigned_technician_id
         WHERE fpmi.planned_id IN (${pmIds.map(() => '?').join(',')})
         ORDER BY fpmi.sort_order, fpmi.id`,
        pmIds
      );
      for (const item of pmItemRows) {
        if (!pmItemsByPm[item.planned_id]) pmItemsByPm[item.planned_id] = [];
        pmItemsByPm[item.planned_id].push(item);
      }
    }

    res.json({
      ...aircraft,
      contacts,
      serials: serialsWithLogs,
      events,
      images,
      bulletins,
      paints,
      selected_config,
      service_records: serviceRecords,
      planned_maintenance: plannedMaintenance.map(p => normPlannedMaintenance({ ...p, items: pmItemsByPm[p.id] || [] })),
      part_replacements: partReplacements,
      paperwork,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/:id — update main aircraft fields
router.put('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  const fields = [
    'bw_serial', 'aircraft_number', 'model', 'build_status',
    'registration', 'country_code', 'country_name',
    'empty_weight_kg', 'nose_wheel_weight', 'left_wheel_weight', 'right_wheel_weight',
    'airworthiness_status', 'airworthiness_expiry',
    'total_hours_tsn', 'engine_hours', 'prop_hours',
    'next_inspection_date', 'next_inspection_hours',
    'customer_name', 'first_flight_date', 'delivery_date',
    'financing_flag', 'serviced_by_us', 'notes',
  ];
  const setClauses = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      if (f === 'country_code' && req.body[f]) {
        setClauses.push(`${f} = ?`); params.push(req.body[f].toUpperCase());
      } else if (f === 'financing_flag' || f === 'serviced_by_us') {
        setClauses.push(`${f} = ?`); params.push(req.body[f] ? 1 : 0);
      } else {
        setClauses.push(`${f} = ?`);
        params.push(req.body[f] === '' ? null : req.body[f]);
      }
    }
  }
  if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  try {
    await query(`UPDATE fleet_aircraft SET ${setClauses.join(', ')} WHERE id = ?`, params);
    const rows = await query(`SELECT ${AIRCRAFT_SELECT} FROM fleet_aircraft WHERE id = ?`, [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Aircraft not found' });
    res.json(normAircraft(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/:id/config — replace selected config options
router.put('/:id/config', requireRole('admin', 'supervisor'), async (req, res) => {
  const { option_ids = [] } = req.body;
  try {
    await query('DELETE FROM fleet_aircraft_config WHERE aircraft_id = ?', [req.params.id]);
    if (option_ids.length > 0) {
      const placeholders = option_ids.map(() => '(?,?)').join(',');
      const vals = option_ids.flatMap(oid => [req.params.id, oid]);
      await query(`INSERT INTO fleet_aircraft_config (aircraft_id, option_id) VALUES ${placeholders}`, vals);
    }
    const rows = await query('SELECT option_id FROM fleet_aircraft_config WHERE aircraft_id = ?', [req.params.id]);
    res.json({ selected_config: rows.map(r => Number(r.option_id)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Service Records ─────────────────────────────────────────────────────────

// POST /api/fleet/:id/services — log a service completion
router.post('/:id/services', async (req, res) => {
  const { template_id, completed_date, hours_at_completion, signed_by, notes } = req.body;
  if (!template_id || !completed_date || !signed_by) {
    return res.status(400).json({ error: 'template_id, completed_date, and signed_by are required' });
  }
  try {
    const r = await query(
      'INSERT INTO fleet_service_records (aircraft_id, template_id, completed_date, hours_at_completion, signed_by, notes, logged_by) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, template_id, toDateOnly(completed_date), hours_at_completion || null, signed_by.trim(), notes || null, req.user.id]
    );
    const rows = await query(
      `SELECT fsr.*, u.name AS logged_by_name FROM fleet_service_records fsr
       LEFT JOIN users u ON fsr.logged_by = u.id WHERE fsr.id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/fleet/:id/planned-maintenance
router.post('/:id/planned-maintenance', requireRole('admin', 'supervisor'), async (req, res) => {
  const { planned_arrival_date, assigned_technician_id, planned_comments, items = [], customer_id } = req.body;

  if (!planned_arrival_date) {
    return res.status(400).json({ error: 'planned_arrival_date is required' });
  }
  if (!items.length) {
    return res.status(400).json({ error: 'At least one work item is required' });
  }

  try {
    const primaryTemplateId = items.find(i => i.template_id)?.template_id || null;

    const result = await query(
      `INSERT INTO fleet_planned_maintenance
       (aircraft_id, customer_id, template_id, planned_date, planned_arrival_date, assigned_technician_id, planned_comments, planned_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.params.id, customer_id || null, primaryTemplateId, planned_arrival_date, planned_arrival_date,
       assigned_technician_id || null, planned_comments || null, req.user.id]
    );

    const plannedId = result.insertId;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await query(
        `INSERT INTO fleet_planned_maintenance_items (planned_id, template_id, title, description, assigned_technician_id, sort_order) VALUES (?,?,?,?,?,?)`,
        [plannedId, item.template_id || null, item.title || '', item.description || null, item.assigned_technician_id || null, i]
      );
    }

    const rows = await query(
      `SELECT ${PLANNED_MAINTENANCE_SELECT}
       FROM fleet_planned_maintenance fpm
       LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
       JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
       LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
       LEFT JOIN customers cust ON cust.id = fpm.customer_id
       WHERE fpm.id = ?`,
      [plannedId]
    );
    const itemRows = await query(
      `SELECT fpmi.*, fst.title AS template_title, fst.category, u.name AS item_technician_name
       FROM fleet_planned_maintenance_items fpmi
       LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
       LEFT JOIN users u ON u.id = fpmi.assigned_technician_id
       WHERE fpmi.planned_id = ? ORDER BY fpmi.sort_order, fpmi.id`,
      [plannedId]
    );

    res.status(201).json(normPlannedMaintenance({ ...rows[0], items: itemRows }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Per-item sign-off ────────────────────────────────────────────────────────
// PUT /api/fleet/planned-maintenance/items/:itemId/signoff
router.put('/planned-maintenance/items/:itemId/signoff', requireRole('admin', 'supervisor'), async (req, res) => {
  const { signed_by, completed_date, notes } = req.body;
  if (!completed_date) return res.status(400).json({ error: 'completed_date is required' });
  const safeDate = toDateOnly(completed_date);

  try {
    const itemRows = await query(
      `SELECT fpmi.*, fpm.aircraft_id
       FROM fleet_planned_maintenance_items fpmi
       JOIN fleet_planned_maintenance fpm ON fpm.id = fpmi.planned_id
       WHERE fpmi.id = ?`,
      [req.params.itemId]
    );
    const item = itemRows[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const techName = (signed_by || req.user.name || 'Unknown').trim();

    // Create service record if item has a template
    let recordId = null;
    if (item.template_id) {
      const aircraftRows = await query('SELECT total_hours_tsn FROM fleet_aircraft WHERE id = ?', [item.aircraft_id]);
      const hrsAtCompletion = aircraftRows[0]?.total_hours_tsn != null ? Number(aircraftRows[0].total_hours_tsn) : null;
      const sr = await query(
        `INSERT INTO fleet_service_records (aircraft_id, template_id, completed_date, hours_at_completion, signed_by, notes, logged_by) VALUES (?,?,?,?,?,?,?)`,
        [item.aircraft_id, item.template_id, safeDate, hrsAtCompletion, techName, notes || null, req.user.id]
      );
      recordId = Number(sr.insertId);
    }

    await query(
      `UPDATE fleet_planned_maintenance_items
       SET signed_off = 1, signed_off_by = ?, signed_off_at = CURRENT_TIMESTAMP,
           completed_date = ?, notes = ?, signed_off_record_id = ?
       WHERE id = ?`,
      [techName, safeDate, notes || null, recordId, req.params.itemId]
    );

    // Return updated item with photos
    const updated = await query(
      `SELECT fpmi.*, fst.title AS template_title, fst.category
       FROM fleet_planned_maintenance_items fpmi
       LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
       WHERE fpmi.id = ?`,
      [req.params.itemId]
    );
    const photos = await query(
      `SELECT fmp.*, u.name AS uploaded_by_name FROM fleet_maintenance_photos fmp
       LEFT JOIN users u ON u.id = fmp.uploaded_by WHERE fmp.item_id = ? ORDER BY fmp.created_at`,
      [req.params.itemId]
    );
    res.json({ ...updated[0], photos });
  } catch (err) {
    console.error('PUT /planned-maintenance/items/:itemId/signoff error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fleet/planned-maintenance/items/:itemId/photos
router.post('/planned-maintenance/items/:itemId/photos', requireRole('admin', 'supervisor'), upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  try {
    const r = await query(
      'INSERT INTO fleet_maintenance_photos (item_id, filename, caption, uploaded_by) VALUES (?,?,?,?)',
      [req.params.itemId, req.file.filename, req.body.caption || null, req.user.id]
    );
    const rows = await query(
      `SELECT fmp.*, u.name AS uploaded_by_name FROM fleet_maintenance_photos fmp
       LEFT JOIN users u ON u.id = fmp.uploaded_by WHERE fmp.id = ?`,
      [Number(r.insertId)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /planned-maintenance/items/:itemId/photos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/fleet/planned-maintenance/items/:itemId/photos/:photoId
router.delete('/planned-maintenance/items/:itemId/photos/:photoId', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const rows = await query(
      'SELECT filename FROM fleet_maintenance_photos WHERE id = ? AND item_id = ?',
      [req.params.photoId, req.params.itemId]
    );
    if (rows && rows.length > 0) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, rows[0].filename)); } catch {}
      await query('DELETE FROM fleet_maintenance_photos WHERE id = ?', [req.params.photoId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /planned-maintenance/items/:itemId/photos/:photoId error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/planned-maintenance/:pid
router.put('/planned-maintenance/:pid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { planned_arrival_date, assigned_technician_id, planned_comments, items } = req.body;
  if (!planned_arrival_date) {
    return res.status(400).json({ error: 'planned_arrival_date is required' });
  }

  try {
    const primaryTemplateId = items ? (items.find(i => i.template_id)?.template_id || null) : undefined;

    const setClauses = [
      'planned_date = ?', 'planned_arrival_date = ?',
      'assigned_technician_id = ?', 'planned_comments = ?',
    ];
    const setValues = [planned_arrival_date, planned_arrival_date, assigned_technician_id || null, planned_comments || null];
    if (primaryTemplateId !== undefined) { setClauses.push('template_id = ?'); setValues.push(primaryTemplateId); }

    await query(
      `UPDATE fleet_planned_maintenance SET ${setClauses.join(', ')} WHERE id = ? AND status = 'planned'`,
      [...setValues, req.params.pid]
    );

    if (items) {
      await query('DELETE FROM fleet_planned_maintenance_items WHERE planned_id = ?', [req.params.pid]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await query(
          `INSERT INTO fleet_planned_maintenance_items (planned_id, template_id, title, description, assigned_technician_id, sort_order) VALUES (?,?,?,?,?,?)`,
          [req.params.pid, item.template_id || null, item.title || '', item.description || null, item.assigned_technician_id || null, i]
        );
      }
    }

    const rows = await query(
      `SELECT ${PLANNED_MAINTENANCE_SELECT}
       FROM fleet_planned_maintenance fpm
       LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
       JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
       LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
       LEFT JOIN customers cust ON cust.id = fpm.customer_id
       WHERE fpm.id = ?`,
      [req.params.pid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Planned maintenance not found' });

    const itemRows = await query(
      `SELECT fpmi.*, fst.title AS template_title, fst.category, u.name AS item_technician_name
       FROM fleet_planned_maintenance_items fpmi
       LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
       LEFT JOIN users u ON u.id = fpmi.assigned_technician_id
       WHERE fpmi.planned_id = ? ORDER BY fpmi.sort_order, fpmi.id`,
      [req.params.pid]
    );

    res.json(normPlannedMaintenance({ ...rows[0], items: itemRows }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/fleet/planned-maintenance/:pid
// Supervisors can only delete planned records; admins can delete any (including completed)
router.delete('/planned-maintenance/:pid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    if (isAdmin) {
      // Delete work items first, then the parent record
      await query(`DELETE FROM fleet_planned_maintenance_items WHERE planned_id = ?`, [req.params.pid]);
      await query(`DELETE FROM fleet_planned_maintenance WHERE id = ?`, [req.params.pid]);
    } else {
      await query(`DELETE FROM fleet_planned_maintenance WHERE id = ? AND status = 'planned'`, [req.params.pid]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/fleet/planned-maintenance/:pid — admin-only edit of completed maintenance metadata
router.patch('/planned-maintenance/:pid', requireRole('admin'), async (req, res) => {
  const { completed_date, labor_hours, signoff_notes, additional_work, signed_off_by } = req.body;
  try {
    await query(
      `UPDATE fleet_planned_maintenance
       SET completed_date = ?, labor_hours = ?, signoff_notes = ?, additional_work = ?, signed_off_by = ?
       WHERE id = ? AND status = 'completed'`,
      [
        completed_date || null,
        labor_hours != null && labor_hours !== '' ? parseFloat(labor_hours) : null,
        signoff_notes || null,
        additional_work || null,
        signed_off_by || null,
        req.params.pid,
      ]
    );
    const rows = await query(
      `SELECT ${PLANNED_MAINTENANCE_SELECT}
       FROM fleet_planned_maintenance fpm
       LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
       JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
       LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
       LEFT JOIN customers cust ON cust.id = fpm.customer_id
       WHERE fpm.id = ?`,
      [req.params.pid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const itemRows = await query(
      `SELECT fpmi.*, fst.title AS template_title, fst.category, u.name AS item_technician_name
       FROM fleet_planned_maintenance_items fpmi
       LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
       LEFT JOIN users u ON u.id = fpmi.assigned_technician_id
       WHERE fpmi.planned_id = ? ORDER BY fpmi.sort_order, fpmi.id`,
      [req.params.pid]
    );
    res.json(normPlannedMaintenance({ ...rows[0], items: itemRows }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/fleet/planned-maintenance/:pid/signoff
router.post('/planned-maintenance/:pid/signoff', requireRole('admin', 'supervisor'), async (req, res) => {
  const { completed_date, labor_hours, additional_work, signoff_notes, signed_by } = req.body;
  if (!completed_date) {
    return res.status(400).json({ error: 'completed_date is required' });
  }
  const safeDate = toDateOnly(completed_date);

  try {
    const plannedRows = await query(`SELECT * FROM fleet_planned_maintenance WHERE id = ?`, [req.params.pid]);
    const planned = plannedRows[0];
    if (!planned) return res.status(404).json({ error: 'Planned maintenance not found' });
    if (planned.status !== 'planned') return res.status(400).json({ error: 'Planned maintenance is already signed off' });

    const aircraftRows = await query(`SELECT total_hours_tsn FROM fleet_aircraft WHERE id = ?`, [planned.aircraft_id]);
    const aircraft = aircraftRows[0] || null;
    const techName = (signed_by || req.user.name || req.user.username || 'Unknown').trim();
    const hrsAtCompletion = aircraft?.total_hours_tsn != null ? Number(aircraft.total_hours_tsn) : null;

    // Get items for this planned maintenance
    const itemRows = await query(`SELECT * FROM fleet_planned_maintenance_items WHERE planned_id = ? ORDER BY sort_order, id`, [req.params.pid]);

    // Create service records for each item that has a template.
    // If the item was already signed off individually, reuse its existing record to avoid duplicates.
    let lastRecordId = null;
    for (const item of itemRows) {
      if (!item.template_id) continue;
      if (item.signed_off && item.signed_off_record_id) {
        // Already signed off individually — reuse existing service record
        lastRecordId = item.signed_off_record_id;
        continue;
      }
      // Use the person who actually did the work (item-level signer, or fallback to techName)
      const workerName = item.signed_off_by || techName;
      const sr = await query(
        `INSERT INTO fleet_service_records (aircraft_id, template_id, completed_date, hours_at_completion, signed_by, notes, logged_by) VALUES (?,?,?,?,?,?,?)`,
        [planned.aircraft_id, item.template_id, safeDate, hrsAtCompletion, workerName, signoff_notes || planned.planned_comments || null, req.user.id]
      );
      lastRecordId = sr.insertId;
      await query(
        `UPDATE fleet_planned_maintenance_items SET signed_off = 1, signed_off_by = ?, signed_off_at = CURRENT_TIMESTAMP, signed_off_record_id = ? WHERE id = ?`,
        [workerName, lastRecordId, item.id]
      );
    }

    // Fallback: if no items with templates, use primary template
    if (!lastRecordId && planned.template_id) {
      const sr = await query(
        `INSERT INTO fleet_service_records (aircraft_id, template_id, completed_date, hours_at_completion, signed_by, notes, logged_by) VALUES (?,?,?,?,?,?,?)`,
        [planned.aircraft_id, planned.template_id, safeDate, hrsAtCompletion, techName, signoff_notes || planned.planned_comments || null, req.user.id]
      );
      lastRecordId = sr.insertId;
    }

    await query(
      `UPDATE fleet_planned_maintenance
       SET status = 'completed', completed_date = ?, labor_hours = ?,
           additional_work = ?, signoff_notes = ?, signed_off_by = ?,
           signed_off_at = CURRENT_TIMESTAMP, completed_record_id = ?
       WHERE id = ?`,
      [safeDate, labor_hours || null, additional_work || null, signoff_notes || null, techName, lastRecordId, req.params.pid]
    );

    // Build event description from items
    const allItems = itemRows.length
      ? itemRows.map(it => it.title || it.template_title || '').filter(Boolean).join(', ')
      : planned.planned_comments || 'Planned maintenance';

    // Log to fleet events so it appears in the aircraft events history
    await query(
      `INSERT INTO fleet_events (aircraft_id, event_date, event_type, title, description, logged_by)
       VALUES (?, ?, 'service', ?, ?, ?)`,
      [
        planned.aircraft_id,
        completed_date,
        'Maintenance Completed',
        `Planned maintenance completed by ${techName}${signoff_notes ? ': ' + signoff_notes : ''}`,
        req.user.id,
      ]
    );

    const rows = await query(
      `SELECT ${PLANNED_MAINTENANCE_SELECT}
       FROM fleet_planned_maintenance fpm
       LEFT JOIN fleet_service_templates fst ON fst.id = fpm.template_id
       JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
       LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
       LEFT JOIN customers cust ON cust.id = fpm.customer_id
       WHERE fpm.id = ?`,
      [req.params.pid]
    );
    const updatedItems = await query(
      `SELECT fpmi.*, fst.title AS template_title, fst.category, u.name AS item_technician_name
       FROM fleet_planned_maintenance_items fpmi
       LEFT JOIN fleet_service_templates fst ON fst.id = fpmi.template_id
       LEFT JOIN users u ON u.id = fpmi.assigned_technician_id
       WHERE fpmi.planned_id = ? ORDER BY fpmi.sort_order, fpmi.id`,
      [req.params.pid]
    );

    res.json(normPlannedMaintenance({ ...rows[0], items: updatedItems }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/fleet/:id/services/:rid
router.delete('/:id/services/:rid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_service_records WHERE id=? AND aircraft_id=?', [req.params.rid, req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Contacts ────────────────────────────────────────────────────────────────

router.post('/:id/contacts', requireRole('admin', 'supervisor'), async (req, res) => {
  const { name, role, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const r = await query(
      'INSERT INTO fleet_contacts (aircraft_id, name, role, email, phone) VALUES (?,?,?,?,?)',
      [req.params.id, name, role || null, email || null, phone || null]
    );
    const rows = await query('SELECT * FROM fleet_contacts WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/contacts/:cid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { name, role, email, phone } = req.body;
  try {
    await query(
      'UPDATE fleet_contacts SET name=?, role=?, email=?, phone=? WHERE id=? AND aircraft_id=?',
      [name, role || null, email || null, phone || null, req.params.cid, req.params.id]
    );
    const rows = await query('SELECT * FROM fleet_contacts WHERE id = ?', [req.params.cid]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/contacts/:cid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_contacts WHERE id=? AND aircraft_id=?', [req.params.cid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Serial Numbers ──────────────────────────────────────────────────────────

router.post('/:id/serials', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    component,
    component_type,
    component_name,
    serial_number,
    manufacturing_date,
    date_installed,
    expiry_date,
    repack_date,
    software_version,
    system_id,
    password,
    notes,
    sort_order = 0,
  } = req.body;
  // Only component + type are now required (serial_number is optional too —
  // e.g. an avionics box with a system_id but no physical serial yet)
  if (!component) return res.status(400).json({ error: 'component is required' });
  try {
    const r = await query(
      `INSERT INTO fleet_serial_numbers
       (aircraft_id, component, component_type, component_name, serial_number,
        manufacturing_date, date_installed, expiry_date, repack_date,
        software_version, system_id, password,
        notes, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.params.id,
        component,
        component_type || null,
        component_name || null,
        serial_number || null,
        manufacturing_date || null,
        date_installed || null,
        expiry_date || null,
        repack_date || null,
        software_version || null,
        system_id || null,
        password || null,
        notes || null,
        sort_order,
      ]
    );
    const rows = await query('SELECT * FROM fleet_serial_numbers WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/serials/:sid', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    component,
    component_type,
    component_name,
    serial_number,
    manufacturing_date,
    date_installed,
    expiry_date,
    repack_date,
    software_version,
    system_id,
    password,
    notes,
    sort_order,
  } = req.body;
  try {
    // Read old software_version before updating so we can log changes
    const [oldRow] = await query(
      'SELECT software_version FROM fleet_serial_numbers WHERE id = ? AND aircraft_id = ?',
      [req.params.sid, req.params.id]
    );
    const oldVersion = oldRow?.software_version || null;

    await query(
      `UPDATE fleet_serial_numbers
       SET component=?, component_type=?, component_name=?, serial_number=?,
           manufacturing_date=?, date_installed=?, expiry_date=?, repack_date=?,
           software_version=?, system_id=?, password=?,
           notes=?, sort_order=?
       WHERE id=? AND aircraft_id=?`,
      [
        component,
        component_type || null,
        component_name || null,
        serial_number || null,
        manufacturing_date || null,
        date_installed || null,
        expiry_date || null,
        repack_date || null,
        software_version || null,
        system_id || null,
        password || null,
        notes || null,
        sort_order ?? 0,
        req.params.sid,
        req.params.id,
      ]
    );
    // Log software version change if it changed
    const newVersion = software_version || null;
    if (newVersion !== oldVersion) {
      await query(
        'INSERT INTO fleet_serial_version_logs (serial_id, old_version, new_version, updated_by_name) VALUES (?,?,?,?)',
        [req.params.sid, oldVersion, newVersion, req.user?.name || null]
      );
    }

    const rows = await query('SELECT * FROM fleet_serial_numbers WHERE id = ?', [req.params.sid]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/:id/serials/:sid/uninstall — mark a component as uninstalled,
// recording the date/reason/TSN/technician/notes. The row is kept so it appears
// in the "Uninstalled history" section.
router.put('/:id/serials/:sid/uninstall', requireRole('admin', 'supervisor'), async (req, res) => {
  const { uninstalled_at, uninstall_reason, uninstall_tsn, uninstall_technician, uninstall_notes } = req.body;
  if (!uninstalled_at) return res.status(400).json({ error: 'uninstalled_at is required' });
  try {
    await query(
      `UPDATE fleet_serial_numbers
       SET uninstalled = TRUE,
           uninstalled_at = ?,
           uninstall_reason = ?,
           uninstall_tsn = ?,
           uninstall_technician = ?,
           uninstall_notes = ?
       WHERE id = ? AND aircraft_id = ?`,
      [
        uninstalled_at,
        uninstall_reason || null,
        uninstall_tsn || null,
        uninstall_technician || null,
        uninstall_notes || null,
        req.params.sid,
        req.params.id,
      ]
    );
    const rows = await query('SELECT * FROM fleet_serial_numbers WHERE id = ?', [req.params.sid]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/serials/:sid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_serial_numbers WHERE id=? AND aircraft_id=?', [req.params.sid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Paint codes ─────────────────────────────────────────────────────────────

router.post('/:id/paints', requireRole('admin', 'supervisor'), async (req, res) => {
  const { color_name, paint_code, area, notes, sort_order = 0 } = req.body;
  if (!color_name) return res.status(400).json({ error: 'color_name is required' });
  try {
    const r = await query(
      `INSERT INTO fleet_paints (aircraft_id, color_name, paint_code, area, notes, sort_order)
       VALUES (?,?,?,?,?,?)`,
      [req.params.id, color_name.trim(), paint_code || null, area || null, notes || null, sort_order]
    );
    const rows = await query('SELECT * FROM fleet_paints WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/paints/:pid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { color_name, paint_code, area, notes, sort_order } = req.body;
  try {
    await query(
      `UPDATE fleet_paints SET color_name=?, paint_code=?, area=?, notes=?, sort_order=?
       WHERE id=? AND aircraft_id=?`,
      [color_name, paint_code || null, area || null, notes || null, sort_order ?? 0, req.params.pid, req.params.id]
    );
    const rows = await query('SELECT * FROM fleet_paints WHERE id = ?', [req.params.pid]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/paints/:pid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_paints WHERE id=? AND aircraft_id=?', [req.params.pid, req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Events ──────────────────────────────────────────────────────────────────

router.post('/:id/part-replacements', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    component_serial_id,
    component_type,
    component_name,
    old_part_serial,
    new_part_serial,
    reason,
    replacement_date,
    flight_hours,
    technician,
    notes,
  } = req.body || {};
  if (!old_part_serial || !new_part_serial || !replacement_date) {
    return res.status(400).json({ error: 'old_part_serial, new_part_serial and replacement_date required' });
  }
  try {
    const result = await query(
      `INSERT INTO fleet_part_replacements
       (aircraft_id, component_serial_id, component_type, component_name, old_part_serial, new_part_serial, reason, replacement_date, flight_hours, technician, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        component_serial_id || null,
        component_type || null,
        component_name || null,
        old_part_serial,
        new_part_serial,
        reason || null,
        replacement_date,
        flight_hours != null && flight_hours !== '' ? Number(flight_hours) : null,
        technician || null,
        notes || null,
        req.user.id,
      ]
    );
    const rows = await query('SELECT * FROM fleet_part_replacements WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/part-replacements/:rid', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    component_serial_id,
    component_type,
    component_name,
    old_part_serial,
    new_part_serial,
    reason,
    replacement_date,
    flight_hours,
    technician,
    notes,
  } = req.body || {};
  try {
    await query(
      `UPDATE fleet_part_replacements
       SET component_serial_id=?, component_type=?, component_name=?, old_part_serial=?, new_part_serial=?, reason=?, replacement_date=?, flight_hours=?, technician=?, notes=?
       WHERE id=? AND aircraft_id=?`,
      [
        component_serial_id || null,
        component_type || null,
        component_name || null,
        old_part_serial,
        new_part_serial,
        reason || null,
        replacement_date,
        flight_hours != null && flight_hours !== '' ? Number(flight_hours) : null,
        technician || null,
        notes || null,
        req.params.rid,
        req.params.id,
      ]
    );
    const rows = await query('SELECT * FROM fleet_part_replacements WHERE id = ?', [req.params.rid]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/part-replacements/:rid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_part_replacements WHERE id=? AND aircraft_id=?', [req.params.rid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/events', requireRole('admin', 'supervisor'), async (req, res) => {
  const { event_date, event_type = 'other', title, description, hours_at_event } = req.body;
  if (!event_date || !title) return res.status(400).json({ error: 'event_date and title required' });
  try {
    const r = await query(
      'INSERT INTO fleet_events (aircraft_id, event_date, event_type, title, description, hours_at_event, logged_by) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, event_date, event_type, title, description || null, hours_at_event || null, req.user.id]
    );
    const rows = await query(
      `SELECT fe.*, u.name AS logged_by_name FROM fleet_events fe
       LEFT JOIN users u ON fe.logged_by = u.id WHERE fe.id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/events/:eid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { event_date, event_type = 'other', title, description, hours_at_event } = req.body;
  if (!event_date || !title) return res.status(400).json({ error: 'event_date and title required' });
  try {
    await query(
      `UPDATE fleet_events
       SET event_date = ?, event_type = ?, title = ?, description = ?, hours_at_event = ?
       WHERE id = ? AND aircraft_id = ?`,
      [event_date, event_type, title, description || null, hours_at_event || null, req.params.eid, req.params.id]
    );
    const rows = await query(
      `SELECT fe.*, u.name AS logged_by_name FROM fleet_events fe
       LEFT JOIN users u ON fe.logged_by = u.id WHERE fe.id = ?`,
      [req.params.eid]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/events/:eid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_events WHERE id=? AND aircraft_id=?', [req.params.eid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Images ──────────────────────────────────────────────────────────────────

router.post('/:id/images', requireRole('admin', 'supervisor'), upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const { caption, category } = req.body;
  try {
    const r = await query(
      'INSERT INTO fleet_images (aircraft_id, filename, caption, category, uploaded_by) VALUES (?,?,?,?,?)',
      [req.params.id, req.file.filename, caption || null, category || null, req.user.id]
    );
    const rows = await query('SELECT * FROM fleet_images WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/images/:iid/caption', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query(
      'UPDATE fleet_images SET caption=?, category=? WHERE id=? AND aircraft_id=?',
      [req.body.caption || null, req.body.category || null, req.params.iid, req.params.id]
    );
    const rows = await query('SELECT * FROM fleet_images WHERE id = ?', [req.params.iid]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/:id/images/:iid/cover — set one image as the cover, clear others
router.put('/:id/images/:iid/cover', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('UPDATE fleet_images SET is_cover = FALSE WHERE aircraft_id = ?', [req.params.id]);
    await query('UPDATE fleet_images SET is_cover = TRUE  WHERE id = ? AND aircraft_id = ?', [req.params.iid, req.params.id]);
    const rows = await query('SELECT * FROM fleet_images WHERE aircraft_id = ? ORDER BY sort_order, id', [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/images/:iid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const rows = await query('SELECT filename FROM fleet_images WHERE id=? AND aircraft_id=?', [req.params.iid, req.params.id]);
    if (rows && rows.length > 0) {
      await query('DELETE FROM fleet_images WHERE id=? AND aircraft_id=?', [req.params.iid, req.params.id]);
      try { fs.unlinkSync(path.join(UPLOAD_DIR, rows[0].filename)); } catch {}
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Paperwork ────────────────────────────────────────────────────────────────

// GET /api/fleet/:id/paperwork
router.get('/:id/paperwork', async (req, res) => {
  try {
    const rows = await query(
      `SELECT fp.*, u.name AS uploaded_by_name
       FROM fleet_paperwork fp
       LEFT JOIN users u ON fp.uploaded_by = u.id
       WHERE fp.aircraft_id = ?
       ORDER BY fp.uploaded_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/fleet/:id/paperwork
router.post('/:id/paperwork', requireRole('admin', 'supervisor'), uploadPaperwork.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const { title, category } = req.body;
  try {
    const r = await query(
      `INSERT INTO fleet_paperwork
         (aircraft_id, filename, original_name, mimetype, size_bytes, title, category, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        req.params.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        title?.trim() || null,
        category?.trim() || null,
        req.user.id,
      ]
    );
    const rows = await query(
      `SELECT fp.*, u.name AS uploaded_by_name FROM fleet_paperwork fp
       LEFT JOIN users u ON fp.uploaded_by = u.id WHERE fp.id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    try { fs.unlinkSync(path.join(PAPERWORK_DIR, req.file.filename)); } catch {}
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/:id/paperwork/:pid — update title / category
router.put('/:id/paperwork/:pid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { title, category } = req.body;
  try {
    await query(
      'UPDATE fleet_paperwork SET title=?, category=? WHERE id=? AND aircraft_id=?',
      [title?.trim() || null, category?.trim() || null, req.params.pid, req.params.id]
    );
    const rows = await query(
      `SELECT fp.*, u.name AS uploaded_by_name FROM fleet_paperwork fp
       LEFT JOIN users u ON fp.uploaded_by = u.id WHERE fp.id = ?`,
      [req.params.pid]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/fleet/:id/paperwork/:pid
router.delete('/:id/paperwork/:pid', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const rows = await query(
      'SELECT filename FROM fleet_paperwork WHERE id=? AND aircraft_id=?',
      [req.params.pid, req.params.id]
    );
    if (rows && rows.length > 0) {
      await query('DELETE FROM fleet_paperwork WHERE id=? AND aircraft_id=?', [req.params.pid, req.params.id]);
      try { fs.unlinkSync(path.join(PAPERWORK_DIR, rows[0].filename)); } catch {}
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/fleet/paperwork/:pid/download — serve file with original filename
router.get('/paperwork/:pid/download', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_paperwork WHERE id=?', [req.params.pid]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const doc = rows[0];
    res.download(path.join(PAPERWORK_DIR, doc.filename), doc.original_name);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;

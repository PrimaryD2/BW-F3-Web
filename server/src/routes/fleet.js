const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normAircraft(a) {
  return {
    ...a,
    financing_flag:        Boolean(a.financing_flag),
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

const AIRCRAFT_SELECT = `
  id, fleet_number, bw_serial, aircraft_number, model, build_status,
  registration, country_code, country_name,
  empty_weight_kg, nose_wheel_weight, left_wheel_weight, right_wheel_weight,
  airworthiness_status, airworthiness_expiry,
  total_hours_tsn, engine_hours, prop_hours,
  next_inspection_date, next_inspection_hours,
  customer_name, first_flight_date, delivery_date, financing_flag, notes,
  created_at, updated_at
`;

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
  const { category, title, interval_hours, interval_months, description, sort_order = 0 } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const r = await query(
      'INSERT INTO fleet_service_templates (category, title, interval_hours, interval_months, description, sort_order) VALUES (?,?,?,?,?,?)',
      [category?.trim() || 'General', title.trim(), interval_hours || null, interval_months || null, description || null, sort_order]
    );
    const rows = await query('SELECT * FROM fleet_service_templates WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/fleet/service-templates/:tid
router.put('/service-templates/:tid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { category, title, interval_hours, interval_months, description, sort_order } = req.body;
  try {
    await query(
      'UPDATE fleet_service_templates SET category=?, title=?, interval_hours=?, interval_months=?, description=?, sort_order=? WHERE id=?',
      [category?.trim() || 'General', title, interval_hours || null, interval_months || null, description || null, sort_order ?? 0, req.params.tid]
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

// GET /api/fleet/upcoming-services — services due in the next 60 days or within 20h
router.get('/upcoming-services', async (_req, res) => {
  try {
    // Latest completion per (aircraft, template)
    const rows = await query(`
      SELECT
        fa.id AS aircraft_id, fa.bw_serial, fa.registration, fa.country_code,
        fa.total_hours_tsn,
        fst.id AS template_id, fst.title, fst.category,
        fst.interval_hours, fst.interval_months,
        (SELECT fsr.completed_date FROM fleet_service_records fsr
         WHERE fsr.aircraft_id = fa.id AND fsr.template_id = fst.id
         ORDER BY fsr.completed_date DESC LIMIT 1) AS last_date,
        (SELECT fsr.hours_at_completion FROM fleet_service_records fsr
         WHERE fsr.aircraft_id = fa.id AND fsr.template_id = fst.id
         ORDER BY fsr.completed_date DESC LIMIT 1) AS last_hours
      FROM fleet_service_templates fst
      CROSS JOIN fleet_aircraft fa
      WHERE fst.active = TRUE
      ORDER BY fa.bw_serial, fst.sort_order, fst.title
    `);

    const today = new Date();
    const upcoming = [];

    for (const r of rows) {
      const tsn      = r.total_hours_tsn != null ? parseFloat(r.total_hours_tsn) : null;
      const neverDone = !r.last_date; // no completion record exists at all
      let pushed = false;

      // ── Hours-interval: fixed-milestone approach ───────────────────────────
      // Milestones are at interval, 2×interval, 3×interval, …  (100h, 200h, 300h…)
      // regardless of when the last service was actually performed.
      if (r.interval_hours != null && tsn != null) {
        const interval = r.interval_hours;

        // Last milestone that was/is due (0 if TSN hasn't yet reached the first one)
        const lastDue = Math.floor(tsn / interval) * interval;
        const nextDue = lastDue + interval;

        // The milestone boundary before lastDue — used to decide if the aircraft
        // was serviced in the current interval window.
        const prevMilestone = lastDue - interval; // may be 0 or negative (handled below)

        const lastCompletedHours = r.last_hours != null ? parseFloat(r.last_hours) : null;

        // "Serviced since last milestone" is true if:
        //   • At least one completion exists (last_date set), AND
        //   • Either we have no hours recorded (trust the technician), OR
        //     the recorded hours fall after the previous milestone boundary
        const servicedCurrentWindow =
          !neverDone &&
          (lastCompletedHours == null || lastCompletedHours > prevMilestone);

        if (lastDue > 0 && !servicedCurrentWindow) {
          // Overdue — the last due milestone was not covered by any service record
          upcoming.push({
            ...r,
            due_date:    null,
            due_hours:   lastDue,
            hours_until: -(tsn - lastDue),
            overdue:     true,
          });
          pushed = true;
        } else {
          // Either we're before the first milestone, or the last milestone was serviced.
          // Alert if the NEXT milestone is within 20 hours.
          const hoursUntil = nextDue - tsn;
          if (hoursUntil <= 20) {
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

      // ── Date-interval: only fires when the hours check didn't already ──────
      // (Prevents duplicate alerts for templates that have both intervals)
      if (r.interval_months != null && !pushed) {
        if (neverDone) {
          // Only flag "never done" from the date side when:
          //   • There is no hours interval (purely calendar-based service), OR
          //   • The aircraft TSN has already passed the first hours milestone
          //     (meaning it should have been done by now even by hours).
          // This prevents alerting on e.g. a "100h OR 12-month" service for a
          // brand-new aircraft that only has 25h TSN.
          const hasHoursInterval  = r.interval_hours != null && tsn != null;
          const pastFirstMilestone = hasHoursInterval && tsn >= r.interval_hours;
          if (!hasHoursInterval || pastFirstMilestone) {
            upcoming.push({ ...r, due_date: null, due_hours: null, days_until: null, overdue: true });
          }
        } else {
          const d = new Date(r.last_date);
          d.setMonth(d.getMonth() + r.interval_months);
          const dueDateStr = d.toISOString().slice(0, 10);
          const daysUntil  = Math.ceil((d - today) / 86400000);
          if (daysUntil <= 60) {
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

    res.json(upcoming);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Event Types ─────────────────────────────────────────────────────────────

// GET /api/fleet/event-types
router.get('/event-types', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_event_types ORDER BY sort_order, label');
    res.json(rows);
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
        fa.registration, fa.country_code, fa.country_name, fa.build_status,
        (SELECT fi.filename FROM fleet_images fi
         WHERE fi.aircraft_id = fa.id
         ORDER BY fi.is_cover DESC, fi.sort_order ASC, fi.id ASC LIMIT 1) AS cover_image
      FROM fleet_aircraft fa
      ORDER BY
        CASE WHEN fa.aircraft_number REGEXP '^[0-9]+$'
             THEN CAST(fa.aircraft_number AS UNSIGNED)
             ELSE 999999 END ASC,
        fa.bw_serial ASC
    `);
    res.json(rows);
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
  const { category, label, sort_order = 0 } = req.body;
  if (!category || !label) return res.status(400).json({ error: 'category and label are required' });
  try {
    const r = await query(
      'INSERT INTO fleet_config_options (category, label, sort_order) VALUES (?,?,?)',
      [category.trim(), label.trim(), sort_order]
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
  const { category, label, sort_order } = req.body;
  try {
    await query(
      'UPDATE fleet_config_options SET category=?, label=?, sort_order=? WHERE id=?',
      [category?.trim(), label?.trim(), sort_order ?? 0, req.params.oid]
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
      `SELECT ${AIRCRAFT_SELECT} FROM fleet_aircraft ORDER BY bw_serial ASC`
    );
    res.json(rows.map(normAircraft));
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

    const [contacts, serials, events, images, configRows, serviceRecords] = await Promise.all([
      query('SELECT * FROM fleet_contacts WHERE aircraft_id = ? ORDER BY id', [req.params.id]),
      query('SELECT * FROM fleet_serial_numbers WHERE aircraft_id = ? ORDER BY sort_order, id', [req.params.id]),
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
    ]);

    const selected_config = configRows.map(r => Number(r.option_id));
    res.json({ ...aircraft, contacts, serials, events, images, selected_config, service_records: serviceRecords });
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
    'customer_name', 'first_flight_date', 'delivery_date', 'financing_flag', 'notes',
  ];
  const setClauses = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      if (f === 'country_code' && req.body[f]) {
        setClauses.push(`${f} = ?`); params.push(req.body[f].toUpperCase());
      } else if (f === 'financing_flag') {
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
      [req.params.id, template_id, completed_date, hours_at_completion || null, signed_by.trim(), notes || null, req.user.id]
    );
    const rows = await query(
      `SELECT fsr.*, u.name AS logged_by_name FROM fleet_service_records fsr
       LEFT JOIN users u ON fsr.logged_by = u.id WHERE fsr.id = ?`,
      [r.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
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
  const { component, serial_number, notes, sort_order = 0 } = req.body;
  if (!component || !serial_number) return res.status(400).json({ error: 'component and serial_number required' });
  try {
    const r = await query(
      'INSERT INTO fleet_serial_numbers (aircraft_id, component, serial_number, notes, sort_order) VALUES (?,?,?,?,?)',
      [req.params.id, component, serial_number, notes || null, sort_order]
    );
    const rows = await query('SELECT * FROM fleet_serial_numbers WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/serials/:sid', requireRole('admin', 'supervisor'), async (req, res) => {
  const { component, serial_number, notes, sort_order } = req.body;
  try {
    await query(
      'UPDATE fleet_serial_numbers SET component=?, serial_number=?, notes=?, sort_order=? WHERE id=? AND aircraft_id=?',
      [component, serial_number, notes || null, sort_order ?? 0, req.params.sid, req.params.id]
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

// ─── Events ──────────────────────────────────────────────────────────────────

router.post('/:id/events', async (req, res) => {
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

router.post('/:id/images', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const { caption } = req.body;
  try {
    const r = await query(
      'INSERT INTO fleet_images (aircraft_id, filename, caption, uploaded_by) VALUES (?,?,?,?)',
      [req.params.id, req.file.filename, caption || null, req.user.id]
    );
    const rows = await query('SELECT * FROM fleet_images WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/images/:iid/caption', async (req, res) => {
  try {
    await query(
      'UPDATE fleet_images SET caption=? WHERE id=? AND aircraft_id=?',
      [req.body.caption || null, req.params.iid, req.params.id]
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

module.exports = router;

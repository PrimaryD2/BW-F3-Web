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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normAircraft(a) {
  return {
    ...a,
    financing_flag: Boolean(a.financing_flag),
    total_hours_tsn:      a.total_hours_tsn      != null ? parseFloat(a.total_hours_tsn)      : null,
    engine_hours:         a.engine_hours          != null ? parseFloat(a.engine_hours)          : null,
    prop_hours:           a.prop_hours            != null ? parseFloat(a.prop_hours)            : null,
    empty_weight_kg:      a.empty_weight_kg       != null ? parseFloat(a.empty_weight_kg)       : null,
    useful_load_kg:       a.useful_load_kg        != null ? parseFloat(a.useful_load_kg)        : null,
    next_inspection_hours:a.next_inspection_hours != null ? parseFloat(a.next_inspection_hours) : null,
  };
}

const AIRCRAFT_SELECT = `
  id, fleet_number, bw_serial, aircraft_number, model, build_status,
  registration, country_code, country_name,
  empty_weight_kg, useful_load_kg,
  airworthiness_status, airworthiness_authority, airworthiness_expiry,
  config_engine, config_prop, config_avionics, config_interior, config_paint,
  total_hours_tsn, engine_hours, prop_hours,
  next_inspection_date, next_inspection_hours,
  customer_name, first_flight_date, delivery_date, financing_flag, notes,
  created_at, updated_at
`;

// ─── Aircraft CRUD ───────────────────────────────────────────────────────────

// GET /api/fleet
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT ${AIRCRAFT_SELECT} FROM fleet_aircraft ORDER BY fleet_number ASC`
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
    empty_weight_kg, useful_load_kg,
    airworthiness_status, airworthiness_authority, airworthiness_expiry,
    config_engine, config_prop, config_avionics, config_interior, config_paint,
    total_hours_tsn, engine_hours, prop_hours,
    next_inspection_date, next_inspection_hours,
    customer_name, first_flight_date, delivery_date, financing_flag = false, notes,
  } = req.body;

  if (!bw_serial || !model) {
    return res.status(400).json({ error: 'bw_serial and model are required' });
  }
  try {
    // Assign next fleet number
    const numRow = await query('SELECT COALESCE(MAX(fleet_number), 0) + 1 AS next_num FROM fleet_aircraft');
    const fleet_number = Number(numRow[0].next_num);

    const result = await query(
      `INSERT INTO fleet_aircraft
       (fleet_number, bw_serial, aircraft_number, model, build_status,
        registration, country_code, country_name,
        empty_weight_kg, useful_load_kg,
        airworthiness_status, airworthiness_authority, airworthiness_expiry,
        config_engine, config_prop, config_avionics, config_interior, config_paint,
        total_hours_tsn, engine_hours, prop_hours,
        next_inspection_date, next_inspection_hours,
        customer_name, first_flight_date, delivery_date, financing_flag, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        fleet_number, bw_serial.trim(), aircraft_number || null, model, build_status,
        registration || null, country_code?.toUpperCase() || null, country_name || null,
        empty_weight_kg || null, useful_load_kg || null,
        airworthiness_status || null, airworthiness_authority || null, airworthiness_expiry || null,
        config_engine || null, config_prop || null, config_avionics || null,
        config_interior || null, config_paint || null,
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

    const [contacts, serials, events, images] = await Promise.all([
      query('SELECT * FROM fleet_contacts WHERE aircraft_id = ? ORDER BY id', [req.params.id]),
      query('SELECT * FROM fleet_serial_numbers WHERE aircraft_id = ? ORDER BY sort_order, id', [req.params.id]),
      query(
        `SELECT fe.*, u.name AS logged_by_name FROM fleet_events fe
         LEFT JOIN users u ON fe.logged_by = u.id
         WHERE fe.aircraft_id = ? ORDER BY fe.event_date DESC, fe.id DESC`,
        [req.params.id]
      ),
      query('SELECT * FROM fleet_images WHERE aircraft_id = ? ORDER BY sort_order, id', [req.params.id]),
    ]);

    res.json({ ...aircraft, contacts, serials, events, images });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/fleet/:id
router.put('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  const fields = [
    'bw_serial', 'aircraft_number', 'model', 'build_status',
    'registration', 'country_code', 'country_name',
    'empty_weight_kg', 'useful_load_kg',
    'airworthiness_status', 'airworthiness_authority', 'airworthiness_expiry',
    'config_engine', 'config_prop', 'config_avionics', 'config_interior', 'config_paint',
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
    // Remove uploaded file on DB error
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

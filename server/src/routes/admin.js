const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));

// ─── Users ───────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, username, role, active, force_password_change, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const { name, username, password, role = 'worker' } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username, and password required' });
  }
  if (!['admin', 'supervisor', 'worker'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (name, username, password_hash, role, force_password_change) VALUES (?,?,?,?,TRUE)',
      [name, username, hash, role]
    );
    const user = await query(
      'SELECT id, name, username, role, active, force_password_change, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(user[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  const { name, role, active, password } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (role !== undefined) {
      if (!['admin', 'supervisor', 'worker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      fields.push('role = ?'); params.push(role);
    }
    if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      fields.push('password_hash = ?'); params.push(hash);
      fields.push('force_password_change = TRUE');
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await query(
      'SELECT id, name, username, role, active, force_password_change, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Task Templates ───────────────────────────────────────────────────────────

// Parse JSON text columns returned by MariaDB back into JS arrays/booleans.
function parseTpl(t) {
  return {
    ...t,
    kits_required:          t.kits_required  ? JSON.parse(t.kits_required)  : [],
    image_urls:             t.image_urls     ? JSON.parse(t.image_urls)     : [],
    is_section_header:      Boolean(t.is_section_header),
    requires_serial_number: Boolean(t.requires_serial_number),
  };
}

// GET /api/admin/task-templates
router.get('/task-templates', async (req, res) => {
  try {
    const rows = await query(
      `SELECT tt.*, s.name AS station_name FROM task_templates tt
       JOIN stations s ON tt.station_id = s.id
       ORDER BY tt.station_id,
                CASE WHEN tt.op_number IS NULL THEN 1 ELSE 0 END,
                tt.op_number,
                tt.order_index`
    );
    res.json(rows.map(parseTpl));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/task-templates/station/:stationId
router.get('/task-templates/station/:stationId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT tt.*, s.name AS station_name FROM task_templates tt
       JOIN stations s ON tt.station_id = s.id
       WHERE tt.station_id = ?
       ORDER BY CASE WHEN tt.op_number IS NULL THEN 1 ELSE 0 END, tt.op_number, tt.order_index`,
      [req.params.stationId]
    );
    res.json(rows.map(parseTpl));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/task-templates
router.post('/task-templates', async (req, res) => {
  const {
    station_id, title, description, estimated_minutes = 60, order_index = 0,
    op_number, is_section_header = false, kits_required = [],
    drawing_reference, instructions, requires_serial_number = false, image_urls = [],
  } = req.body;
  if (!station_id || !title) return res.status(400).json({ error: 'station_id and title required' });
  try {
    const result = await query(
      `INSERT INTO task_templates
         (station_id, title, description, estimated_minutes, order_index,
          op_number, is_section_header, kits_required, drawing_reference,
          instructions, requires_serial_number, image_urls)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        station_id, title, description || null, estimated_minutes, order_index,
        op_number || null, is_section_header ? 1 : 0,
        JSON.stringify(kits_required),
        drawing_reference || null, instructions || null,
        requires_serial_number ? 1 : 0,
        JSON.stringify(image_urls),
      ]
    );
    const t = await query(
      `SELECT tt.*, s.name AS station_name FROM task_templates tt
       JOIN stations s ON tt.station_id = s.id WHERE tt.id = ?`,
      [result.insertId]
    );
    res.status(201).json(parseTpl(t[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/task-templates/:id
router.put('/task-templates/:id', async (req, res) => {
  const {
    title, description, estimated_minutes, order_index, active,
    op_number, is_section_header, kits_required, drawing_reference,
    instructions, requires_serial_number, image_urls,
  } = req.body;
  try {
    const fields = [];
    const params = [];
    if (title              !== undefined) { fields.push('title = ?');               params.push(title); }
    if (description        !== undefined) { fields.push('description = ?');         params.push(description); }
    if (estimated_minutes  !== undefined) { fields.push('estimated_minutes = ?');   params.push(estimated_minutes); }
    if (order_index        !== undefined) { fields.push('order_index = ?');         params.push(order_index); }
    if (active             !== undefined) { fields.push('active = ?');              params.push(active ? 1 : 0); }
    if (op_number          !== undefined) { fields.push('op_number = ?');           params.push(op_number || null); }
    if (is_section_header  !== undefined) { fields.push('is_section_header = ?');  params.push(is_section_header ? 1 : 0); }
    if (kits_required      !== undefined) { fields.push('kits_required = ?');      params.push(JSON.stringify(kits_required)); }
    if (drawing_reference  !== undefined) { fields.push('drawing_reference = ?');  params.push(drawing_reference || null); }
    if (instructions       !== undefined) { fields.push('instructions = ?');        params.push(instructions || null); }
    if (requires_serial_number !== undefined) { fields.push('requires_serial_number = ?'); params.push(requires_serial_number ? 1 : 0); }
    if (image_urls         !== undefined) { fields.push('image_urls = ?');          params.push(JSON.stringify(image_urls)); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await query(`UPDATE task_templates SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await query(
      `SELECT tt.*, s.name AS station_name FROM task_templates tt
       JOIN stations s ON tt.station_id = s.id WHERE tt.id = ?`,
      [req.params.id]
    );
    res.json(parseTpl(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

// GET /api/admin/audit
router.get('/audit', async (req, res) => {
  try {
    const { from_date, to_date, type } = req.query;

    const signoffConditions = ['1=1'];
    const signoffParams = [];
    if (from_date) { signoffConditions.push('DATE(ts.signed_at) >= ?'); signoffParams.push(from_date); }
    if (to_date) { signoffConditions.push('DATE(ts.signed_at) <= ?'); signoffParams.push(to_date); }

    const signoffs = await query(
      `SELECT 'signoff' AS type, ts.signed_at AS timestamp,
              u.name AS actor, u.username,
              CONCAT(a.serial_number, ' / ', s.name, ' / ', tt.title) AS subject,
              ts.signature_type AS detail
       FROM task_signoffs ts
       JOIN users u ON ts.signed_by_user_id = u.id
       JOIN task_instances ti ON ts.task_instance_id = ti.id
       JOIN airplanes a ON ti.airplane_id = a.id
       JOIN stations s ON ti.station_id = s.id
       JOIN task_templates tt ON ti.template_id = tt.id
       WHERE ${signoffConditions.join(' AND ')}`,
      signoffParams
    );

    const ncrConditions = ['1=1'];
    const ncrParams = [];
    if (from_date) { ncrConditions.push('DATE(na.approved_at) >= ?'); ncrParams.push(from_date); }
    if (to_date) { ncrConditions.push('DATE(na.approved_at) <= ?'); ncrParams.push(to_date); }

    const ncrActions = await query(
      `SELECT 'ncr_action' AS type, na.approved_at AS timestamp,
              u.name AS actor, u.username,
              CONCAT('NCR #', na.ncr_id, ' — ', a.serial_number) AS subject,
              na.action AS detail
       FROM ncr_approvals na
       JOIN users u ON na.approved_by = u.id
       JOIN nonconformity_reports ncr ON na.ncr_id = ncr.id
       JOIN airplanes a ON ncr.airplane_id = a.id
       WHERE ${ncrConditions.join(' AND ')}`,
      ncrParams
    );

    const combined = [...signoffs, ...ncrActions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const filtered = type ? combined.filter(e => e.type === type) : combined;
    res.json(filtered.slice(0, 500));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

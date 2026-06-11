const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireRole('admin'));
const VALID_ROLES = ['admin', 'supervisor', 'worker'];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

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
  const normalizedRole = normalizeRole(role);
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username, and password required' });
  }
  if (!VALID_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (name, username, password_hash, role, force_password_change) VALUES (?,?,?,?,TRUE)',
      [name, username, hash, normalizedRole]
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
  const { name, username, role, active, password } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (username !== undefined) {
      const uname = String(username || '').trim();
      if (!uname) return res.status(400).json({ error: 'Username cannot be empty' });
      fields.push('username = ?'); params.push(uname);
    }
    if (role !== undefined) {
      const normalizedRole = normalizeRole(role);
      if (!VALID_ROLES.includes(normalizedRole)) return res.status(400).json({ error: 'Invalid role' });
      fields.push('role = ?'); params.push(normalizedRole);
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
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Task Templates ───────────────────────────────────────────────────────────

// Parse JSON text columns returned by MariaDB back into JS arrays/booleans.
// Also normalise BigInt aggregates and include the average actual time.
function parseTpl(t) {
  return {
    ...t,
    kits_required:          t.kits_required  ? JSON.parse(t.kits_required)  : [],
    image_urls:             t.image_urls     ? JSON.parse(t.image_urls)     : [],
    is_section_header:      Boolean(t.is_section_header),
    requires_serial_number: Boolean(t.requires_serial_number),
    // avg_actual_minutes: average minutes per completed task instance (null = no data yet)
    avg_actual_minutes:     t.avg_actual_minutes != null ? Math.round(Number(t.avg_actual_minutes)) : null,
    completed_count:        Number(t.completed_count) || 0,
  };
}

// Subquery fragments that add avg actual time and completion count per template.
// Uses a flat correlated subquery (no derived table) so MariaDB allows the
// outer-query reference to tt.id.
// AVG(sum_per_instance) = SUM(all durations) / COUNT(DISTINCT instances) — equivalent.
const AVG_SUBQUERY = `
  (SELECT ROUND(
     SUM(tl.duration_minutes) / NULLIF(COUNT(DISTINCT tl.task_instance_id), 0)
   , 0)
   FROM time_logs tl
   JOIN task_instances ti2 ON tl.task_instance_id = ti2.id
   WHERE ti2.template_id = tt.id AND tl.ended_at IS NOT NULL
  ) AS avg_actual_minutes,
  (SELECT COUNT(*) FROM task_instances ti3
   WHERE ti3.template_id = tt.id AND ti3.status = 'double_signed') AS completed_count
`;

// GET /api/admin/task-templates
router.get('/task-templates', async (req, res) => {
  try {
    const rows = await query(
      `SELECT tt.*, s.name AS station_name, ${AVG_SUBQUERY}
       FROM task_templates tt
       JOIN stations s ON tt.station_id = s.id
       ORDER BY tt.station_id,
                CASE WHEN tt.op_number IS NULL THEN 1 ELSE 0 END,
                tt.op_number, tt.order_index`
    );
    res.json(rows.map(parseTpl));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/task-templates/station/:stationId
router.get('/task-templates/station/:stationId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT tt.*, s.name AS station_name, ${AVG_SUBQUERY}
       FROM task_templates tt
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

// GET /api/admin/roles
router.get('/roles', async (_req, res) => {
  res.json(ROLES);
});

// GET /api/admin/permissions
router.get('/permissions', async (_req, res) => {
  try {
    const rows = await query(
      'SELECT role, permission_key, allowed FROM role_permissions ORDER BY role, permission_key'
    );
    const byRole = Object.fromEntries(ROLES.map((role) => [role, {}]));
    for (const role of ROLES) {
      const defaults = new Set(DEFAULT_ROLE_PERMISSIONS[role] || []);
      for (const definition of PERMISSION_DEFINITIONS) {
        byRole[role][definition.key] = defaults.has(definition.key);
      }
    }
    for (const row of rows) {
      if (!byRole[row.role]) byRole[row.role] = {};
      byRole[row.role][row.permission_key] = !!row.allowed;
    }
    res.json({ roles: ROLES, definitions: PERMISSION_DEFINITIONS, permissions: byRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/permissions/:role
router.put('/permissions/:role', async (req, res) => {
  const role = normalizeRole(req.params.role);
  const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : null;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (!permissions) return res.status(400).json({ error: 'permissions array required' });
  try {
    await query('DELETE FROM role_permissions WHERE role = ?', [role]);
    for (const key of permissions) {
      await query(
        'INSERT INTO role_permissions (role, permission_key, allowed) VALUES (?, ?, TRUE)',
        [role, key]
      );
    }
    res.json({ ok: true, role, permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/models
router.get('/models', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_models ORDER BY active DESC, sort_order ASC, name ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/models
router.post('/models', async (req, res) => {
  const { name, code, active = true, sort_order = 0, show_in_configurator = false, base_price, description, mtom_kg, empty_weight_kg, specs } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Model name required' });
  const specsJson = Array.isArray(specs) ? JSON.stringify(specs.filter(s => s && (s.label || s.value))) : (specs || null);
  try {
    const result = await query(
      'INSERT INTO fleet_models (name, code, active, sort_order, show_in_configurator, base_price, description, mtom_kg, empty_weight_kg, specs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [String(name).trim(), code || null, active ? 1 : 0, Number(sort_order) || 0, show_in_configurator ? 1 : 0, base_price != null && base_price !== '' ? Number(base_price) : null, description || null,
       mtom_kg != null && mtom_kg !== '' ? Number(mtom_kg) : null, empty_weight_kg != null && empty_weight_kg !== '' ? Number(empty_weight_kg) : null, specsJson]
    );
    const rows = await query('SELECT * FROM fleet_models WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Model already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/models/:id
router.put('/models/:id', async (req, res) => {
  const { name, code, active, sort_order, show_in_configurator, base_price, description, mtom_kg, empty_weight_kg, specs } = req.body || {};
  const specsJson = Array.isArray(specs) ? JSON.stringify(specs.filter(s => s && (s.label || s.value))) : (specs || null);
  try {
    await query(
      'UPDATE fleet_models SET name = ?, code = ?, active = ?, sort_order = ?, show_in_configurator = ?, base_price = ?, description = ?, mtom_kg = ?, empty_weight_kg = ?, specs = ? WHERE id = ?',
      [String(name || '').trim(), code || null, active ? 1 : 0, Number(sort_order) || 0, show_in_configurator ? 1 : 0, base_price != null && base_price !== '' ? Number(base_price) : null, description || null,
       mtom_kg != null && mtom_kg !== '' ? Number(mtom_kg) : null, empty_weight_kg != null && empty_weight_kg !== '' ? Number(empty_weight_kg) : null, specsJson, req.params.id]
    );
    const rows = await query('SELECT * FROM fleet_models WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/models/:id
router.delete('/models/:id', async (req, res) => {
  try {
    await query('DELETE FROM fleet_models WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Service Bulletins ──────────────────────────────────────────────────────
//
// New model: a bulletin targets one or more **config options** (e.g. "Rotax 912 ULS",
// "Garmin G3X Touch") rather than a serial-number prefix. Any aircraft that has one
// of those options selected in its configuration becomes "affected" automatically.
//
// Fields on the bulletin:
//   title       — short title
//   reason      — why this bulletin exists
//   category    — mandatory | obligatory | recommended | optional
//   what_to_do  — instructions
//
// The legacy serial_prefix / component_type / component_name / details fields are
// still in the table for backward-compat with existing rows but are no longer used
// by new bulletins.

// ─── Component Types ─────────────────────────────────────────────────────────

router.get('/component-types', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_component_types ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/component-types', async (req, res) => {
  const { name, sort_order = 0 } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const r = await query('INSERT INTO fleet_component_types (name, sort_order) VALUES (?, ?)', [String(name).trim(), sort_order]);
    const rows = await query('SELECT * FROM fleet_component_types WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A component type with this name already exists' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

router.put('/component-types/:id', async (req, res) => {
  const { name, sort_order } = req.body || {};
  try {
    if (name !== undefined) {
      await query('UPDATE fleet_component_types SET name = ?, sort_order = ? WHERE id = ?',
        [String(name).trim(), sort_order ?? 0, req.params.id]);
    }
    const rows = await query('SELECT * FROM fleet_component_types WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A component type with this name already exists' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/component-types/:id', async (req, res) => {
  try {
    await query('DELETE FROM fleet_component_types WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Component Names ──────────────────────────────────────────────────────────

router.get('/component-names', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_component_names ORDER BY component_type, sort_order, name');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/component-names', async (req, res) => {
  const { component_type, name, sort_order = 0 } = req.body || {};
  if (!String(component_type || '').trim() || !String(name || '').trim())
    return res.status(400).json({ error: 'component_type and name are required' });
  try {
    const r = await query(
      'INSERT INTO fleet_component_names (component_type, name, sort_order) VALUES (?,?,?)',
      [component_type.trim(), name.trim(), sort_order]
    );
    const rows = await query('SELECT * FROM fleet_component_names WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/component-names/:id', async (req, res) => {
  const { component_type, name, sort_order } = req.body || {};
  try {
    await query(
      'UPDATE fleet_component_names SET component_type=?, name=?, sort_order=? WHERE id=?',
      [component_type, name, sort_order ?? 0, req.params.id]
    );
    const rows = await query('SELECT * FROM fleet_component_names WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/component-names/:id', async (req, res) => {
  try {
    await query('DELETE FROM fleet_component_names WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Settings (key-value) ─────────────────────────────────────────────────────

router.get('/settings', async (_req, res) => {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM fleet_settings');
    const out = {};
    for (const r of rows) out[r.setting_key] = r.setting_value;
    res.json(out);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/settings', async (req, res) => {
  const updates = req.body || {};
  try {
    for (const [key, value] of Object.entries(updates)) {
      await query(
        `INSERT INTO fleet_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value == null ? null : String(value)]
      );
    }
    const rows = await query('SELECT setting_key, setting_value FROM fleet_settings');
    const out = {};
    for (const r of rows) out[r.setting_key] = r.setting_value;
    res.json(out);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Bulletin helpers ─────────────────────────────────────────────────────────

// Helper: recompute the affected-aircraft list from the bulletin's config-option
// links AND serial-number criteria. Existing resolved rows are preserved.
async function recomputeAffectedAircraft(bulletinId) {
  const aircraftIds = new Set();

  // 1) Match by config options
  const optMatches = await query(
    `SELECT DISTINCT fac.aircraft_id
       FROM fleet_bulletin_config_options bco
       JOIN fleet_aircraft_config fac ON fac.option_id = bco.option_id
      WHERE bco.bulletin_id = ?`,
    [bulletinId]
  );
  for (const m of optMatches) aircraftIds.add(m.aircraft_id);

  // 2) Match by serial criteria
  const criteria = await query(
    'SELECT * FROM fleet_bulletin_serial_criteria WHERE bulletin_id = ?',
    [bulletinId]
  );
  for (const c of criteria) {
    let q = `SELECT DISTINCT aircraft_id FROM fleet_serial_numbers
             WHERE uninstalled = FALSE AND component_type = ?`;
    const params = [c.component_type];
    if (c.component_name) { q += ` AND component_name LIKE ?`; params.push(`%${c.component_name}%`); }
    if (c.exact_serial) {
      q += ` AND serial_number = ?`; params.push(c.exact_serial);
    } else if (c.serial_from || c.serial_to) {
      if (c.serial_from && c.serial_to) {
        q += ` AND CAST(serial_number AS UNSIGNED) BETWEEN CAST(? AS UNSIGNED) AND CAST(? AS UNSIGNED)`;
        params.push(c.serial_from, c.serial_to);
      } else if (c.serial_from) {
        q += ` AND CAST(serial_number AS UNSIGNED) >= CAST(? AS UNSIGNED)`; params.push(c.serial_from);
      } else {
        q += ` AND CAST(serial_number AS UNSIGNED) <= CAST(? AS UNSIGNED)`; params.push(c.serial_to);
      }
    }
    const serialMatches = await query(q, params);
    for (const m of serialMatches) aircraftIds.add(m.aircraft_id);
  }

  // 3) Match by explicit aircraft / airplane numbers (comma-separated bw_serial or aircraft_number)
  const [bulletinRow] = await query('SELECT aircraft_numbers FROM fleet_bulletins WHERE id = ?', [bulletinId]);
  if (bulletinRow?.aircraft_numbers) {
    const nums = bulletinRow.aircraft_numbers.split(',').map(s => s.trim()).filter(Boolean);
    if (nums.length) {
      const placeholders = nums.map(() => '?').join(',');
      const acMatches = await query(
        `SELECT id AS aircraft_id FROM fleet_aircraft
         WHERE bw_serial IN (${placeholders}) OR aircraft_number IN (${placeholders})`,
        [...nums, ...nums]
      );
      for (const m of acMatches) aircraftIds.add(m.aircraft_id);
    }
  }

  for (const aircraft_id of aircraftIds) {
    await query(
      `INSERT IGNORE INTO fleet_bulletin_aircraft (bulletin_id, aircraft_id, serial_id) VALUES (?, ?, NULL)`,
      [bulletinId, aircraft_id]
    );
  }
  return aircraftIds.size;
}

// GET /api/admin/bulletins
router.get('/bulletins', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT fb.*,
              u.name AS created_by_name,
              (
                SELECT COUNT(*) FROM fleet_bulletin_aircraft fba
                WHERE fba.bulletin_id = fb.id AND fba.status = 'open'
              ) AS open_aircraft_count,
              (
                SELECT COUNT(*) FROM fleet_bulletin_aircraft fba
                WHERE fba.bulletin_id = fb.id
              ) AS total_aircraft_count
       FROM fleet_bulletins fb
       LEFT JOIN users u ON u.id = fb.created_by
       ORDER BY CASE WHEN fb.status = 'open' THEN 0 ELSE 1 END, fb.created_at DESC`
    );
    // Join affected config options for each bulletin (single query, grouped client-side)
    const optionRows = await query(
      `SELECT bco.bulletin_id, fco.id, fco.label, fco.category
         FROM fleet_bulletin_config_options bco
         JOIN fleet_config_options fco ON fco.id = bco.option_id`
    );
    const optsByBulletin = {};
    for (const r of optionRows) {
      if (!optsByBulletin[r.bulletin_id]) optsByBulletin[r.bulletin_id] = [];
      optsByBulletin[r.bulletin_id].push({ id: r.id, label: r.label, category: r.category });
    }
    res.json(rows.map(b => ({
      ...b,
      open_aircraft_count:  Number(b.open_aircraft_count  ?? 0),
      total_aircraft_count: Number(b.total_aircraft_count ?? 0),
      affected_options: optsByBulletin[b.id] || [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/bulletins/:id — single bulletin (for edit form)
router.get('/bulletins/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM fleet_bulletins WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const options = await query(
      `SELECT fco.id, fco.label, fco.category
         FROM fleet_bulletin_config_options bco
         JOIN fleet_config_options fco ON fco.id = bco.option_id
        WHERE bco.bulletin_id = ?`,
      [req.params.id]
    );
    const serialCriteria = await query(
      'SELECT * FROM fleet_bulletin_serial_criteria WHERE bulletin_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json({
      ...rows[0],
      affected_options: options,
      affected_option_ids: options.map(o => o.id),
      serial_criteria: serialCriteria,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/bulletins
router.post('/bulletins', async (req, res) => {
  const {
    title,
    reason,
    category = 'optional',
    what_to_do,
    affected_option_ids = [],
    serial_criteria = [],
    aircraft_numbers,
  } = req.body || {};
  if (!String(title || '').trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!['mandatory', 'obligatory', 'recommended', 'optional'].includes(category)) {
    return res.status(400).json({ error: 'invalid category' });
  }
  try {
    const result = await query(
      `INSERT INTO fleet_bulletins (title, category, reason, what_to_do, created_by, serial_prefix, aircraft_numbers)
       VALUES (?, ?, ?, ?, ?, '', ?)`,
      [String(title).trim(), category, reason || null, what_to_do || null, req.user.id, aircraft_numbers || null]
    );
    const bulletinId = result.insertId;
    for (const oid of affected_option_ids) {
      if (oid == null) continue;
      await query(`INSERT IGNORE INTO fleet_bulletin_config_options (bulletin_id, option_id) VALUES (?, ?)`, [bulletinId, Number(oid)]);
    }
    for (const c of serial_criteria) {
      if (!c.component_type) continue;
      await query(
        `INSERT INTO fleet_bulletin_serial_criteria (bulletin_id, component_type, component_name, serial_from, serial_to, exact_serial) VALUES (?,?,?,?,?,?)`,
        [bulletinId, c.component_type, c.component_name || null, c.serial_from || null, c.serial_to || null, c.exact_serial || null]
      );
    }
    const matchedCount = await recomputeAffectedAircraft(bulletinId);
    const rows = await query('SELECT * FROM fleet_bulletins WHERE id = ?', [bulletinId]);
    res.status(201).json({ ...rows[0], matched_aircraft_count: matchedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/bulletins/:id
router.put('/bulletins/:id', async (req, res) => {
  const {
    title,
    reason,
    category,
    what_to_do,
    status,
    affected_option_ids,
  } = req.body || {};
  try {
    // Build dynamic update — only touch what was sent so simple status flips work.
    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(String(title).trim()); }
    if (category !== undefined) {
      if (!['mandatory', 'obligatory', 'recommended', 'optional'].includes(category)) {
        return res.status(400).json({ error: 'invalid category' });
      }
      fields.push('category = ?'); params.push(category);
    }
    if (reason !== undefined)     { fields.push('reason = ?');     params.push(reason || null); }
    if (what_to_do !== undefined) { fields.push('what_to_do = ?'); params.push(what_to_do || null); }
    if (status !== undefined)     { fields.push('status = ?');     params.push(status === 'closed' ? 'closed' : 'open'); }
    if (req.body.aircraft_numbers !== undefined) { fields.push('aircraft_numbers = ?'); params.push(req.body.aircraft_numbers || null); }

    if (fields.length > 0) {
      params.push(req.params.id);
      await query(`UPDATE fleet_bulletins SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    // If affected options were passed, replace them (and re-link aircraft).
    if (Array.isArray(affected_option_ids)) {
      await query('DELETE FROM fleet_bulletin_config_options WHERE bulletin_id = ?', [req.params.id]);
      for (const oid of affected_option_ids) {
        if (oid == null) continue;
        await query(
          `INSERT IGNORE INTO fleet_bulletin_config_options (bulletin_id, option_id) VALUES (?, ?)`,
          [req.params.id, Number(oid)]
        );
      }
    }
    // If serial criteria were passed, replace them
    const { serial_criteria } = req.body || {};
    if (Array.isArray(serial_criteria)) {
      await query('DELETE FROM fleet_bulletin_serial_criteria WHERE bulletin_id = ?', [req.params.id]);
      for (const c of serial_criteria) {
        if (!c.component_type) continue;
        await query(
          `INSERT INTO fleet_bulletin_serial_criteria (bulletin_id, component_type, component_name, serial_from, serial_to, exact_serial) VALUES (?,?,?,?,?,?)`,
          [req.params.id, c.component_type, c.component_name || null, c.serial_from || null, c.serial_to || null, c.exact_serial || null]
        );
      }
    }
    if (Array.isArray(affected_option_ids) || Array.isArray(serial_criteria) || req.body.aircraft_numbers !== undefined) {
      await recomputeAffectedAircraft(req.params.id);
    }

    const rows = await query('SELECT * FROM fleet_bulletins WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/bulletins/:id
router.delete('/bulletins/:id', async (req, res) => {
  try {
    // Aircraft + config-option links cascade via FK ON DELETE CASCADE
    await query('DELETE FROM fleet_bulletins WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/bulletins/:id/aircraft
router.get('/bulletins/:id/aircraft', async (req, res) => {
  try {
    const rows = await query(
      `SELECT fba.*, fa.bw_serial, fa.registration, fa.model,
              fsn.component, fsn.component_type, fsn.component_name, fsn.serial_number
       FROM fleet_bulletin_aircraft fba
       JOIN fleet_aircraft fa ON fa.id = fba.aircraft_id
       LEFT JOIN fleet_serial_numbers fsn ON fsn.id = fba.serial_id
       WHERE fba.bulletin_id = ?
       ORDER BY CASE WHEN fba.status = 'open' THEN 0 ELSE 1 END, fa.bw_serial ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/bulletins/:id/aircraft/:aircraftId/resolve
router.post('/bulletins/:id/aircraft/:aircraftId/resolve', async (req, res) => {
  const { resolution_notes, resolved_extra_work, labor_hours, signed_off_by } = req.body || {};
  try {
    await query(
      `UPDATE fleet_bulletin_aircraft
       SET status = 'resolved',
           resolution_notes = ?,
           resolved_extra_work = ?,
           labor_hours = ?,
           signed_off_by = ?,
           resolved_at = NOW()
       WHERE bulletin_id = ? AND aircraft_id = ?`,
      [
        resolution_notes || null,
        resolved_extra_work || null,
        labor_hours != null && labor_hours !== '' ? Number(labor_hours) : null,
        signed_off_by || req.user.name || req.user.username,
        req.params.id,
        req.params.aircraftId,
      ]
    );
    const openRows = await query(
      'SELECT COUNT(*) AS count FROM fleet_bulletin_aircraft WHERE bulletin_id = ? AND status = ?',
      [req.params.id, 'open']
    );
    if (Number(openRows[0]?.count || 0) === 0) {
      await query(
        'UPDATE fleet_bulletins SET status = ?, closed_by = ?, closed_at = NOW() WHERE id = ?',
        ['closed', req.user.id, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

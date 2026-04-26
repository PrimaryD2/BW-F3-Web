const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Parse JSON text columns and coerce booleans returned by MariaDB.
function parseInst(inst) {
  return {
    ...inst,
    kits_required:          inst.kits_required  ? JSON.parse(inst.kits_required)  : [],
    image_urls:             inst.image_urls     ? JSON.parse(inst.image_urls)     : [],
    is_section_header:      Boolean(inst.is_section_header),
    requires_serial_number: Boolean(inst.requires_serial_number),
  };
}

// Full SELECT for task instances — includes all template enrichment fields and station name.
// Sorted: op_number first (numerically), then order_index.
const INSTANCE_SELECT = `
  SELECT ti.*, tt.title, tt.description, tt.estimated_minutes, tt.order_index,
         tt.op_number, tt.is_section_header, tt.kits_required, tt.drawing_reference,
         tt.instructions, tt.requires_serial_number, tt.image_urls,
         s.name AS station_name
  FROM task_instances ti
  JOIN task_templates tt ON ti.template_id = tt.id
  JOIN stations s       ON ti.station_id  = s.id
`;
const INSTANCE_ORDER = `
  ORDER BY CASE WHEN tt.op_number IS NULL THEN 1 ELSE 0 END, tt.op_number, tt.order_index
`;

// GET /api/tasks/airplane/:airplaneId/station/:stationId
// Returns task instances; auto-initialises from active templates if none exist yet.
router.get('/airplane/:airplaneId/station/:stationId', authenticateToken, async (req, res) => {
  const { airplaneId, stationId } = req.params;
  try {
    const planes = await query('SELECT id FROM airplanes WHERE id = ?', [airplaneId]);
    if (!planes || planes.length === 0) return res.status(404).json({ error: 'Airplane not found' });

    const stations = await query('SELECT id FROM stations WHERE id = ?', [stationId]);
    if (!stations || stations.length === 0) return res.status(404).json({ error: 'Station not found' });

    let instances = await query(
      `${INSTANCE_SELECT} WHERE ti.airplane_id = ? AND ti.station_id = ? ${INSTANCE_ORDER}`,
      [airplaneId, stationId]
    );

    // Auto-initialise from active templates if no instances exist yet.
    if (!instances || instances.length === 0) {
      const templates = await query(
        'SELECT * FROM task_templates WHERE station_id = ? AND active = TRUE ORDER BY CASE WHEN op_number IS NULL THEN 1 ELSE 0 END, op_number, order_index',
        [stationId]
      );
      for (const t of templates) {
        // Section headers are pre-completed — they are visual dividers, not work items.
        const initStatus = t.is_section_header ? 'double_signed' : 'not_started';
        await query(
          'INSERT INTO task_instances (airplane_id, template_id, station_id, status) VALUES (?,?,?,?)',
          [airplaneId, t.id, stationId, initStatus]
        );
      }
      instances = await query(
        `${INSTANCE_SELECT} WHERE ti.airplane_id = ? AND ti.station_id = ? ${INSTANCE_ORDER}`,
        [airplaneId, stationId]
      );
    }

    // Enrich each instance with time totals, signoffs, and linked NCRs.
    const enriched = await Promise.all(instances.map(async (inst) => {
      const base = parseInst(inst);

      const timeTotals = await query(
        `SELECT COALESCE(SUM(duration_minutes),0) AS total_minutes,
                SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) AS active_timers
         FROM time_logs WHERE task_instance_id = ?`,
        [inst.id]
      );
      const activeTimer = await query(
        'SELECT id, started_at FROM time_logs WHERE task_instance_id = ? AND user_id = ? AND ended_at IS NULL',
        [inst.id, req.user.id]
      );
      const signoffs = await query(
        `SELECT ts.*, u.name AS signed_by_name FROM task_signoffs ts
         JOIN users u ON ts.signed_by_user_id = u.id
         WHERE ts.task_instance_id = ?`,
        [inst.id]
      );
      const ncrs = await query(
        `SELECT id, severity, status FROM nonconformity_reports
         WHERE task_instance_id = ? AND status != 'resolved'`,
        [inst.id]
      );

      return {
        ...base,
        total_minutes:    parseFloat(timeTotals[0].total_minutes) || 0,
        active_timers:    parseInt(timeTotals[0].active_timers) || 0,
        my_active_timer:  activeTimer.length > 0 ? activeTimer[0] : null,
        signoffs,
        ncrs,
        blocked_by_ncr:   ncrs.some(n => n.severity === 'high'),
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id — update status, notes, or installed part serial number
router.put('/:id', authenticateToken, async (req, res) => {
  const { status, notes, installed_part_serial } = req.body;
  try {
    const rows = await query('SELECT * FROM task_instances WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = rows[0];

    // Enforce sequential ordering — cannot advance past not_started until all prior non-header tasks are double_signed.
    if (status && status !== 'not_started') {
      const priorIncomplete = await query(
        `SELECT COUNT(*) AS cnt FROM task_instances ti
         JOIN task_templates tt ON ti.template_id = tt.id
         WHERE ti.airplane_id = ? AND ti.station_id = ?
           AND tt.order_index < (SELECT order_index FROM task_templates WHERE id = ?)
           AND tt.is_section_header = FALSE
           AND ti.status != 'double_signed'`,
        [task.airplane_id, task.station_id, task.template_id]
      );
      if (Number(priorIncomplete[0].cnt) > 0) {
        return res.status(409).json({ error: 'Previous tasks must be completed first' });
      }
    }

    const fields = [];
    const params = [];
    if (status !== undefined) {
      fields.push('status = ?');
      params.push(status);
      if (status === 'in_progress' && !task.started_at) {
        fields.push('started_at = CURRENT_TIMESTAMP');
      }
      if (status === 'double_signed') {
        fields.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    if (notes !== undefined) { fields.push('notes = ?'); params.push(notes); }
    if (installed_part_serial !== undefined) { fields.push('installed_part_serial = ?'); params.push(installed_part_serial || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await query(`UPDATE task_instances SET ${fields.join(', ')} WHERE id = ?`, params);

    const updated = await query(
      `${INSTANCE_SELECT} WHERE ti.id = ?`,
      [req.params.id]
    );
    res.json(parseInst(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/:id/signoff — primary or double sign-off with password verification
router.post('/:id/signoff', authenticateToken, async (req, res) => {
  const { password, signature_type } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required for sign-off' });
  if (!['primary', 'double'].includes(signature_type)) {
    return res.status(400).json({ error: 'signature_type must be primary or double' });
  }
  try {
    // Verify password
    const userRows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(password, userRows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    const rows = await query('SELECT * FROM task_instances WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = rows[0];

    // Block if high-severity unresolved NCR exists
    const blocking = await query(
      `SELECT COUNT(*) AS cnt FROM nonconformity_reports
       WHERE task_instance_id = ? AND severity = 'high' AND status != 'resolved'`,
      [req.params.id]
    );
    if (Number(blocking[0].cnt) > 0) {
      return res.status(409).json({ error: 'Task blocked by a high-severity NCR. Resolve it before signing off.' });
    }

    // For primary sign-off: validate serial number if required by template
    if (signature_type === 'primary') {
      const tplRow = await query('SELECT requires_serial_number FROM task_templates WHERE id = ?', [task.template_id]);
      if (tplRow[0].requires_serial_number && !task.installed_part_serial) {
        return res.status(409).json({ error: 'Installed part serial number is required before signing off this task.' });
      }
    }

    const existingSignoffs = await query(
      'SELECT * FROM task_signoffs WHERE task_instance_id = ?',
      [req.params.id]
    );
    const primarySignoff = existingSignoffs.find(s => s.signature_type === 'primary');
    const doubleSignoff  = existingSignoffs.find(s => s.signature_type === 'double');

    if (signature_type === 'primary') {
      if (primarySignoff) return res.status(409).json({ error: 'Primary sign-off already recorded' });
      if (!['in_progress', 'pending_signoff'].includes(task.status)) {
        return res.status(409).json({ error: 'Task must be in progress or pending sign-off' });
      }
      await query(
        'INSERT INTO task_signoffs (task_instance_id, signed_by_user_id, signature_type) VALUES (?,?,?)',
        [req.params.id, req.user.id, 'primary']
      );
      await query("UPDATE task_instances SET status = 'signed' WHERE id = ?", [req.params.id]);
    } else {
      if (!primarySignoff) return res.status(409).json({ error: 'Primary sign-off required first' });
      if (doubleSignoff)   return res.status(409).json({ error: 'Double sign-off already recorded' });
      if (primarySignoff.signed_by_user_id === req.user.id && req.user.role === 'worker') {
        return res.status(409).json({ error: 'Double sign-off must be performed by a different worker' });
      }
      await query(
        'INSERT INTO task_signoffs (task_instance_id, signed_by_user_id, signature_type) VALUES (?,?,?)',
        [req.params.id, req.user.id, 'double']
      );
      await query(
        "UPDATE task_instances SET status = 'double_signed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [req.params.id]
      );
    }

    const updated = await query(
      `${INSTANCE_SELECT} WHERE ti.id = ?`,
      [req.params.id]
    );
    const updatedSignoffs = await query(
      `SELECT ts.*, u.name AS signed_by_name FROM task_signoffs ts
       JOIN users u ON ts.signed_by_user_id = u.id
       WHERE ts.task_instance_id = ?`,
      [req.params.id]
    );
    res.json({ task: parseInst(updated[0]), signoffs: updatedSignoffs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/:id/signoffs
router.get('/:id/signoffs', authenticateToken, async (req, res) => {
  try {
    const rows = await query(
      `SELECT ts.*, u.name AS signed_by_name, u.username
       FROM task_signoffs ts
       JOIN users u ON ts.signed_by_user_id = u.id
       WHERE ts.task_instance_id = ?
       ORDER BY ts.signed_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

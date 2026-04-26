const express = require('express');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const validSeverities = ['low', 'medium', 'high'];
const validStatuses = ['open', 'under_review', 'resolved'];

// GET /api/ncr — list with filters
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, severity, station_id, airplane_id, serial_number, from_date, to_date } = req.query;
    let sql = `
      SELECT ncr.*, u.name AS reporter_name, a.serial_number, s.name AS station_name,
             ti.id AS task_instance_id
      FROM nonconformity_reports ncr
      JOIN users u ON ncr.reported_by = u.id
      JOIN airplanes a ON ncr.airplane_id = a.id
      JOIN stations s ON ncr.station_id = s.id
      LEFT JOIN task_instances ti ON ncr.task_instance_id = ti.id
    `;
    const conditions = [];
    const params = [];
    if (status) { conditions.push('ncr.status = ?'); params.push(status); }
    if (severity) { conditions.push('ncr.severity = ?'); params.push(severity); }
    if (station_id) { conditions.push('ncr.station_id = ?'); params.push(station_id); }
    if (airplane_id) { conditions.push('ncr.airplane_id = ?'); params.push(airplane_id); }
    if (serial_number) { conditions.push('a.serial_number LIKE ?'); params.push(`%${serial_number}%`); }
    if (from_date) { conditions.push('DATE(ncr.created_at) >= ?'); params.push(from_date); }
    if (to_date) { conditions.push('DATE(ncr.created_at) <= ?'); params.push(to_date); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY ncr.created_at DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/ncr
router.post('/', authenticateToken, async (req, res) => {
  const { airplane_id, task_instance_id, station_id, description, severity } = req.body;
  if (!airplane_id || !station_id || !description || !severity) {
    return res.status(400).json({ error: 'airplane_id, station_id, description, severity required' });
  }
  if (!validSeverities.includes(severity)) {
    return res.status(400).json({ error: 'severity must be low, medium, or high' });
  }
  try {
    const result = await query(
      `INSERT INTO nonconformity_reports
       (airplane_id, task_instance_id, station_id, reported_by, description, severity)
       VALUES (?,?,?,?,?,?)`,
      [airplane_id, task_instance_id || null, station_id, req.user.id, description, severity]
    );
    const ncr = await query(
      `SELECT ncr.*, u.name AS reporter_name, a.serial_number, s.name AS station_name
       FROM nonconformity_reports ncr
       JOIN users u ON ncr.reported_by = u.id
       JOIN airplanes a ON ncr.airplane_id = a.id
       JOIN stations s ON ncr.station_id = s.id
       WHERE ncr.id = ?`,
      [result.insertId]
    );
    res.status(201).json(ncr[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/ncr/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const ncr = await query(
      `SELECT ncr.*, u.name AS reporter_name, a.serial_number, s.name AS station_name
       FROM nonconformity_reports ncr
       JOIN users u ON ncr.reported_by = u.id
       JOIN airplanes a ON ncr.airplane_id = a.id
       JOIN stations s ON ncr.station_id = s.id
       WHERE ncr.id = ?`,
      [req.params.id]
    );
    if (!ncr || ncr.length === 0) return res.status(404).json({ error: 'NCR not found' });
    const approvals = await query(
      `SELECT na.*, u.name AS approver_name FROM ncr_approvals na
       JOIN users u ON na.approved_by = u.id
       WHERE na.ncr_id = ? ORDER BY na.approved_at`,
      [req.params.id]
    );
    res.json({ ...ncr[0], approvals });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/ncr/:id — update status / resolution notes (supervisor/admin)
router.put('/:id', authenticateToken, requireRole('admin', 'supervisor'), async (req, res) => {
  const { status, resolution_notes } = req.body;
  try {
    const ncr = await query('SELECT * FROM nonconformity_reports WHERE id = ?', [req.params.id]);
    if (!ncr || ncr.length === 0) return res.status(404).json({ error: 'NCR not found' });
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const fields = [];
    const params = [];
    if (status) {
      fields.push('status = ?');
      params.push(status);
      if (status === 'resolved') {
        fields.push('resolved_at = CURRENT_TIMESTAMP');
      }
    }
    if (resolution_notes !== undefined) { fields.push('resolution_notes = ?'); params.push(resolution_notes); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await query(`UPDATE nonconformity_reports SET ${fields.join(', ')} WHERE id = ?`, params);

    // Record approval action
    const action = status ? `Status changed to ${status}` : 'Notes updated';
    await query(
      'INSERT INTO ncr_approvals (ncr_id, approved_by, action, notes) VALUES (?,?,?,?)',
      [req.params.id, req.user.id, action, resolution_notes || null]
    );

    const updated = await query(
      `SELECT ncr.*, u.name AS reporter_name, a.serial_number, s.name AS station_name
       FROM nonconformity_reports ncr
       JOIN users u ON ncr.reported_by = u.id
       JOIN airplanes a ON ncr.airplane_id = a.id
       JOIN stations s ON ncr.station_id = s.id
       WHERE ncr.id = ?`,
      [req.params.id]
    );
    const approvals = await query(
      `SELECT na.*, u.name AS approver_name FROM ncr_approvals na
       JOIN users u ON na.approved_by = u.id
       WHERE na.ncr_id = ? ORDER BY na.approved_at`,
      [req.params.id]
    );
    res.json({ ...updated[0], approvals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

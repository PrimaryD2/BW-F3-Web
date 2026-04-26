const express = require('express');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/airplanes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM airplanes';
    const params = [];
    const conditions = [];
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (search) { conditions.push('serial_number LIKE ?'); params.push(`%${search}%`); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/airplanes
router.post('/', authenticateToken, requireRole('admin', 'supervisor'), async (req, res) => {
  const { serial_number, model, status = 'draft' } = req.body;
  if (!serial_number || !model) {
    return res.status(400).json({ error: 'serial_number and model are required' });
  }
  try {
    const result = await query(
      "INSERT INTO airplanes (serial_number, model, status) VALUES (?, ?, ?)",
      [serial_number.trim().toUpperCase(), model.trim(), status]
    );
    const rows = await query('SELECT * FROM airplanes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Serial number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/airplanes/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM airplanes WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Airplane not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/airplanes/:id
router.put('/:id', authenticateToken, requireRole('admin', 'supervisor'), async (req, res) => {
  const { serial_number, model, status } = req.body;
  try {
    const existing = await query('SELECT * FROM airplanes WHERE id = ?', [req.params.id]);
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Airplane not found' });
    const fields = [];
    const params = [];
    if (serial_number !== undefined) { fields.push('serial_number = ?'); params.push(serial_number.trim().toUpperCase()); }
    if (model !== undefined) { fields.push('model = ?'); params.push(model.trim()); }
    if (status !== undefined) {
      fields.push('status = ?');
      params.push(status);
      if (status === 'completed') {
        fields.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await query(`UPDATE airplanes SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await query('SELECT * FROM airplanes WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Serial number already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/airplanes/:id/progress — overall + per-station progress
router.get('/:id/progress', authenticateToken, async (req, res) => {
  try {
    const stations = await query('SELECT * FROM stations ORDER BY id');
    const results = [];
    let totalTasks = 0;
    let completedTasks = 0;
    for (const station of stations) {
      const all = await query(
        'SELECT status FROM task_instances WHERE airplane_id = ? AND station_id = ?',
        [req.params.id, station.id]
      );
      const done = all.filter(t => t.status === 'double_signed').length;
      totalTasks += all.length;
      completedTasks += done;
      // Check for blocking NCR
      const blocking = await query(
        `SELECT COUNT(*) AS cnt FROM nonconformity_reports
         WHERE airplane_id = ? AND station_id = ? AND severity = 'high' AND status != 'resolved'`,
        [req.params.id, station.id]
      );
      const hasBlockingNcr = blocking[0].cnt > 0;
      let stationStatus = 'idle';
      if (all.length > 0) {
        if (done === all.length) stationStatus = 'complete';
        else if (hasBlockingNcr) stationStatus = 'blocked';
        else if (all.some(t => t.status !== 'not_started')) stationStatus = 'in_progress';
      }
      results.push({
        station,
        total: all.length,
        completed: done,
        percent: all.length ? Math.round((done / all.length) * 100) : 0,
        status: stationStatus,
        has_blocking_ncr: hasBlockingNcr,
      });
    }
    res.json({
      total: totalTasks,
      completed: completedTasks,
      percent: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
      stations: results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

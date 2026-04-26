const express = require('express');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/time-logs/start
router.post('/start', authenticateToken, async (req, res) => {
  const { task_instance_id } = req.body;
  if (!task_instance_id) return res.status(400).json({ error: 'task_instance_id required' });
  try {
    // Verify task exists
    const tasks = await query('SELECT * FROM task_instances WHERE id = ?', [task_instance_id]);
    if (!tasks || tasks.length === 0) return res.status(404).json({ error: 'Task not found' });

    // Check no active timer for this user on this task
    const existing = await query(
      'SELECT id FROM time_logs WHERE task_instance_id = ? AND user_id = ? AND ended_at IS NULL',
      [task_instance_id, req.user.id]
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Timer already running for this task', log_id: existing[0].id });
    }

    const result = await query(
      'INSERT INTO time_logs (task_instance_id, user_id) VALUES (?, ?)',
      [task_instance_id, req.user.id]
    );

    // Set task to in_progress if not already
    const task = tasks[0];
    if (task.status === 'not_started') {
      await query(
        "UPDATE task_instances SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE id = ?",
        [task_instance_id]
      );
    }

    const log = await query('SELECT * FROM time_logs WHERE id = ?', [result.insertId]);
    res.status(201).json(log[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/time-logs/:id/stop
router.put('/:id/stop', authenticateToken, async (req, res) => {
  try {
    const logs = await query('SELECT * FROM time_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!logs || logs.length === 0) return res.status(404).json({ error: 'Time log not found' });
    const log = logs[0];
    if (log.ended_at) return res.status(409).json({ error: 'Timer already stopped' });

    const now = new Date();
    const start = new Date(log.started_at);
    const durationMinutes = (now - start) / 60000;

    await query(
      'UPDATE time_logs SET ended_at = CURRENT_TIMESTAMP, duration_minutes = ? WHERE id = ?',
      [Math.round(durationMinutes * 100) / 100, req.params.id]
    );
    const updated = await query('SELECT * FROM time_logs WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/time-logs/my-active — returns all active timers for the current user
router.get('/my-active', authenticateToken, async (req, res) => {
  try {
    const rows = await query(
      `SELECT tl.*, ti.station_id, ti.airplane_id, tt.title AS task_title,
              a.serial_number, s.name AS station_name
       FROM time_logs tl
       JOIN task_instances ti ON tl.task_instance_id = ti.id
       JOIN task_templates tt ON ti.template_id = tt.id
       JOIN airplanes a ON ti.airplane_id = a.id
       JOIN stations s ON ti.station_id = s.id
       WHERE tl.user_id = ? AND tl.ended_at IS NULL`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/time-logs/loss — create a loss log entry
router.post('/loss', authenticateToken, async (req, res) => {
  const { task_instance_id, reason, duration_minutes, notes } = req.body;
  const validReasons = ['walked_to_warehouse', 'fix_issue', 'missing_tools', 'waiting_for_material', 'machine_downtime', 'other'];
  if (!task_instance_id || !reason || !duration_minutes) {
    return res.status(400).json({ error: 'task_instance_id, reason, and duration_minutes required' });
  }
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: 'Invalid loss reason' });
  }
  try {
    const result = await query(
      'INSERT INTO loss_logs (task_instance_id, user_id, reason, duration_minutes, notes) VALUES (?,?,?,?,?)',
      [task_instance_id, req.user.id, reason, parseFloat(duration_minutes), notes || null]
    );
    const log = await query('SELECT * FROM loss_logs WHERE id = ?', [result.insertId]);
    res.status(201).json(log[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/time-logs/task/:taskId — time and loss logs for a task
router.get('/task/:taskId', authenticateToken, async (req, res) => {
  try {
    const timeLogs = await query(
      `SELECT tl.*, u.name AS user_name FROM time_logs tl
       JOIN users u ON tl.user_id = u.id
       WHERE tl.task_instance_id = ? ORDER BY tl.started_at DESC`,
      [req.params.taskId]
    );
    const lossLogs = await query(
      `SELECT ll.*, u.name AS user_name FROM loss_logs ll
       JOIN users u ON ll.user_id = u.id
       WHERE ll.task_instance_id = ? ORDER BY ll.logged_at DESC`,
      [req.params.taskId]
    );
    res.json({ timeLogs, lossLogs });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

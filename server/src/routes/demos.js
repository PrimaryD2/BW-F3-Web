const express = require('express');
const { query } = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/demos — schedule of "aircraft away" / demo periods (any authenticated user)
router.get('/', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT d.*, u.name AS created_by_name
       FROM fleet_demos d
       LEFT JOIN users u ON u.id = d.created_by
       ORDER BY d.start_date DESC, d.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /demos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function validate(body) {
  const title = String(body.title || '').trim();
  const start = body.start_date || null;
  const end = body.end_date || null;
  if (!title) return { error: 'A title is required' };
  if (!start) return { error: 'A start date is required' };
  if (!end) return { error: 'An end date is required' };
  if (end < start) return { error: 'End date cannot be before the start date' };
  return {
    values: {
      title,
      aircraft: String(body.aircraft || '').trim() || null,
      location: String(body.location || '').trim() || null,
      start_date: start,
      end_date: end,
      notes: String(body.notes || '').trim() || null,
    },
  };
}

// POST /api/demos
router.post('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const { error, values } = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const r = await query(
      `INSERT INTO fleet_demos (title, aircraft, location, start_date, end_date, notes, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [values.title, values.aircraft, values.location, values.start_date, values.end_date, values.notes, req.user.id]
    );
    const rows = await query('SELECT * FROM fleet_demos WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /demos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/demos/:id
router.put('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  const { error, values } = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    await query(
      `UPDATE fleet_demos SET title=?, aircraft=?, location=?, start_date=?, end_date=?, notes=? WHERE id=?`,
      [values.title, values.aircraft, values.location, values.start_date, values.end_date, values.notes, req.params.id]
    );
    const rows = await query('SELECT * FROM fleet_demos WHERE id = ?', [req.params.id]);
    res.json(rows[0] || { ok: true });
  } catch (err) {
    console.error('PUT /demos/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/demos/:id
router.delete('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await query('DELETE FROM fleet_demos WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /demos/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

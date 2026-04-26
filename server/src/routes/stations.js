const express = require('express');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/stations
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM stations ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/stations/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM stations WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Station not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

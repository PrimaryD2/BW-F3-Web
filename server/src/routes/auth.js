const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const rows = await query(
      'SELECT id, name, username, password_hash, role, active, force_password_change FROM users WHERE username = ?',
      [username]
    );
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    if (!user.active) {
      return res.status(401).json({ error: 'Account is inactive. Contact your administrator.' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        force_password_change: !!user.force_password_change,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    username: req.user.username,
    role: req.user.role,
    force_password_change: !!req.user.force_password_change,
  });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  try {
    const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    // Skip current password check if force_password_change is set (first login)
    if (!req.user.force_password_change) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password required' });
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    const hash = await bcrypt.hash(new_password, 12);
    await query(
      'UPDATE users SET password_hash = ?, force_password_change = FALSE WHERE id = ?',
      [hash, req.user.id]
    );
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/users — active user list for dropdowns (any authenticated user)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, role FROM users WHERE active = 1 ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /auth/users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/verify-password — used for sign-off password re-entry
router.post('/verify-password', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  try {
    const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

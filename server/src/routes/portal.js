const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const TOKEN_TTL = '8h'; // session length (matches staff)

// ─── Customer auth middleware ─────────────────────────────────────────────────
async function authenticateCustomer(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.kind !== 'customer') return res.status(403).json({ error: 'Invalid token' });
    const rows = await query(
      'SELECT id, full_name, company_name, email, portal_enabled, portal_must_change_password FROM customers WHERE id = ? AND portal_enabled = TRUE AND archived = FALSE',
      [decoded.customer_id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Account not found or portal access disabled' });
    req.customer = rows[0];
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired session' });
  }
}

// ─── POST /api/portal/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const rows = await query(
      'SELECT * FROM customers WHERE email = ? AND portal_enabled = TRUE AND archived = FALSE LIMIT 1',
      [String(email).trim()]
    );
    const customer = rows[0];
    if (!customer || !customer.portal_password_hash) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, customer.portal_password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ kind: 'customer', customer_id: customer.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({
      token,
      must_change_password: !!customer.portal_must_change_password,
      customer: { id: customer.id, full_name: customer.full_name, company_name: customer.company_name, email: customer.email },
    });
  } catch (err) {
    console.error('POST /portal/login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All routes below require a logged-in customer
router.use(authenticateCustomer);

// ─── POST /api/portal/change-password ─────────────────────────────────────────
router.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  try {
    const rows = await query('SELECT portal_password_hash, portal_must_change_password FROM customers WHERE id = ?', [req.customer.id]);
    const hash = rows[0]?.portal_password_hash;
    // Require the current password unless this is the forced first-login change
    if (!rows[0]?.portal_must_change_password) {
      if (!current_password || !(await bcrypt.compare(current_password, hash || ''))) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }
    const newHash = await bcrypt.hash(new_password, 12);
    await query('UPDATE customers SET portal_password_hash = ?, portal_must_change_password = FALSE WHERE id = ?', [newHash, req.customer.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /portal/change-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/me ───────────────────────────────────────────────────────
router.get('/me', (req, res) => res.json(req.customer));

// ─── GET /api/portal/quotes ───────────────────────────────────────────────────
router.get('/quotes', async (req, res) => {
  try {
    const quotes = await query(
      `SELECT cq.*, fm.base_price, fm.mtom_kg, fm.empty_weight_kg, fm.specs, fm.name AS model_name2
       FROM customer_quotes cq
       LEFT JOIN fleet_models fm ON fm.id = cq.model_id
       WHERE cq.customer_id = ? ORDER BY cq.created_at DESC`,
      [req.customer.id]
    );
    const ids = quotes.map(q => q.id);
    let optsByQuote = {};
    if (ids.length) {
      const opts = await query(
        `SELECT cqo.*, fco.weight_kg FROM customer_quote_options cqo
         LEFT JOIN fleet_config_options fco ON fco.id = cqo.option_id
         WHERE cqo.quote_id IN (${ids.map(() => '?').join(',')})
         ORDER BY cqo.option_category, cqo.option_label`,
        ids
      );
      for (const o of opts) (optsByQuote[o.quote_id] ||= []).push(o);
    }
    res.json(quotes.map(q => ({
      ...q,
      model_name: q.model_name || q.model_name2,
      specs: (() => { try { return q.specs ? JSON.parse(q.specs) : []; } catch { return []; } })(),
      options: optsByQuote[q.id] || [],
    })));
  } catch (err) {
    console.error('GET /portal/quotes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/aircraft — with production stage + dedicated progress photos ──
router.get('/aircraft', async (req, res) => {
  try {
    const aircraft = await query(
      `SELECT id, bw_serial, registration, model, build_status, production_stage,
              country_name, first_flight_date, delivery_date
       FROM fleet_aircraft WHERE customer_id = ? ORDER BY bw_serial`,
      [req.customer.id]
    );
    const ids = aircraft.map(a => a.id);
    let photosByAircraft = {};
    if (ids.length) {
      const photos = await query(
        `SELECT id, aircraft_id, filename, caption, created_at FROM fleet_progress_photos
         WHERE aircraft_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC, id DESC`,
        ids
      );
      for (const p of photos) (photosByAircraft[p.aircraft_id] ||= []).push(p);
    }
    res.json(aircraft.map(a => ({ ...a, photos: photosByAircraft[a.id] || [] })));
  } catch (err) {
    console.error('GET /portal/aircraft error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/news — announcements for this customer ───────────────────
router.get('/news', async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT n.* FROM portal_news n
       LEFT JOIN portal_news_recipients r ON r.news_id = n.id
       WHERE n.audience = 'all' OR r.customer_id = ?
       ORDER BY n.created_at DESC`,
      [req.customer.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /portal/news error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/bulletins — service bulletins affecting the customer's aircraft ──
router.get('/bulletins', async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT fb.id, fb.title, fb.category, fb.reason, fb.what_to_do, fb.created_at,
              fa.bw_serial, fba.status AS aircraft_status
       FROM fleet_bulletin_aircraft fba
       JOIN fleet_bulletins fb ON fb.id = fba.bulletin_id
       JOIN fleet_aircraft fa ON fa.id = fba.aircraft_id
       WHERE fa.customer_id = ?
       ORDER BY fb.created_at DESC`,
      [req.customer.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /portal/bulletins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/faq ──────────────────────────────────────────────────────
router.get('/faq', async (_req, res) => {
  try {
    const rows = await query('SELECT id, question, answer FROM portal_faq WHERE active = TRUE ORDER BY sort_order, id');
    res.json(rows);
  } catch (err) { console.error('GET /portal/faq error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Maintenance booking requests ─────────────────────────────────────────────
router.get('/maintenance-requests', async (req, res) => {
  try {
    const rows = await query(
      `SELECT mr.*, fa.bw_serial FROM portal_maintenance_requests mr
       LEFT JOIN fleet_aircraft fa ON fa.id = mr.aircraft_id
       WHERE mr.customer_id = ? ORDER BY mr.created_at DESC`,
      [req.customer.id]
    );
    res.json(rows);
  } catch (err) { console.error('GET /portal/maintenance-requests error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/maintenance-requests', async (req, res) => {
  const { aircraft_id, requested_date, notes } = req.body || {};
  if (!aircraft_id) return res.status(400).json({ error: 'Please choose an aircraft' });
  if (!requested_date) return res.status(400).json({ error: 'Please choose a preferred date' });
  if (!String(notes || '').trim()) return res.status(400).json({ error: 'Please describe what you need done' });
  try {
    // Only allow booking against the customer's own aircraft
    let validAircraftId = null;
    if (aircraft_id) {
      const own = await query('SELECT id FROM fleet_aircraft WHERE id = ? AND customer_id = ?', [aircraft_id, req.customer.id]);
      if (own.length) validAircraftId = aircraft_id;
    }
    if (!validAircraftId) return res.status(400).json({ error: 'Invalid aircraft' });
    const r = await query(
      'INSERT INTO portal_maintenance_requests (customer_id, aircraft_id, requested_date, notes) VALUES (?,?,?,?)',
      [req.customer.id, validAircraftId, requested_date || null, notes || null]
    );
    const rows = await query('SELECT * FROM portal_maintenance_requests WHERE id = ?', [r.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('POST /portal/maintenance-requests error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;

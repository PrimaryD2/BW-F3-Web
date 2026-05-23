const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  waiting_reply: 'Waiting for Reply',
  active_discussion: 'Active Discussion',
  quote_sent: 'Quote Sent',
  test_flight_planned: 'Test Flight Planned',
  problem_support: 'Problem / Support',
  closed_won: 'Closed – Won',
  closed_lost: 'Closed – Lost',
  future_prospect: 'Future Prospect',
};

// ─── GET /api/customers — list all (non-archived) customers ──────────────────
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { search, status, priority, assigned } = req.query;

    let where = ['c.archived = FALSE'];
    const params = [];

    if (search) {
      where.push('(c.full_name LIKE ? OR c.email LIKE ? OR c.company_name LIKE ? OR c.country LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (status && status !== 'all') { where.push('c.status = ?'); params.push(status); }
    if (priority && priority !== 'all') { where.push('c.priority = ?'); params.push(priority); }
    if (assigned && assigned !== 'all') { where.push('c.assigned_employee_id = ?'); params.push(Number(assigned)); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const rows = await conn.query(`
      SELECT
        c.id, c.full_name, c.company_name, c.country, c.city,
        c.email, c.phone, c.status, c.priority, c.customer_type,
        c.source, c.interested_aircraft,
        c.last_contact_date, c.next_followup_date,
        c.assigned_employee_id, u.name AS assigned_employee_name,
        c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM customer_logs l WHERE l.customer_id = c.id) AS log_count,
        (SELECT COUNT(*) FROM customer_logs l WHERE l.customer_id = c.id AND l.follow_up_needed = TRUE AND l.follow_up_date IS NOT NULL AND l.follow_up_date <= CURDATE() AND l.entry_status NOT IN ('solved','closed')) AS overdue_followups
      FROM customers c
      LEFT JOIN users u ON u.id = c.assigned_employee_id
      ${whereClause}
      ORDER BY c.updated_at DESC
    `, params);

    res.json(rows.map(r => ({
      ...r,
      log_count: Number(r.log_count ?? 0),
      overdue_followups: Number(r.overdue_followups ?? 0),
    })));
  } catch (err) {
    console.error('GET /customers error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /api/customers/followups — overdue + today + upcoming (7 days) ──────
router.get('/followups', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(`
      SELECT
        l.id AS log_id, l.customer_id, l.title, l.follow_up_date,
        l.follow_up_responsible, l.entry_status, l.contact_type,
        c.full_name, c.company_name, c.status AS customer_status,
        CASE
          WHEN l.follow_up_date < CURDATE() THEN 'overdue'
          WHEN l.follow_up_date = CURDATE() THEN 'today'
          ELSE 'upcoming'
        END AS urgency
      FROM customer_logs l
      JOIN customers c ON c.id = l.customer_id
      WHERE l.follow_up_needed = TRUE
        AND l.follow_up_date IS NOT NULL
        AND l.follow_up_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        AND l.entry_status NOT IN ('solved','closed')
        AND c.archived = FALSE
      ORDER BY l.follow_up_date ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /customers/followups error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── GET /api/customers/:id — single customer ─────────────────────────────────
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [customer] = await conn.query(`
      SELECT c.*, u.name AS assigned_employee_name
      FROM customers c
      LEFT JOIN users u ON u.id = c.assigned_employee_id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    console.error('GET /customers/:id error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /api/customers — create customer ────────────────────────────────────
router.post('/', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const {
      full_name, company_name, country, city, email, phone,
      preferred_language, source, interested_aircraft, customer_type,
      status, priority, assigned_employee_id, general_notes,
    } = req.body;

    if (!full_name) return res.status(400).json({ error: 'full_name is required' });

    const result = await conn.query(`
      INSERT INTO customers
        (full_name, company_name, country, city, email, phone,
         preferred_language, source, interested_aircraft, customer_type,
         status, priority, assigned_employee_id, general_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      full_name, company_name || null, country || null, city || null,
      email || null, phone || null, preferred_language || null,
      source || 'other', interested_aircraft || null,
      customer_type || 'new_buyer', status || 'new',
      priority || 'medium', assigned_employee_id || null,
      general_notes || null,
    ]);

    res.status(201).json({ id: Number(result.insertId) });
  } catch (err) {
    console.error('POST /customers error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /api/customers/:id — update customer ─────────────────────────────────
router.put('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const {
      full_name, company_name, country, city, email, phone,
      preferred_language, source, interested_aircraft, customer_type,
      status, priority, assigned_employee_id, general_notes,
      last_contact_date, next_followup_date, archived,
    } = req.body;

    await conn.query(`
      UPDATE customers SET
        full_name = ?, company_name = ?, country = ?, city = ?,
        email = ?, phone = ?, preferred_language = ?, source = ?,
        interested_aircraft = ?, customer_type = ?, status = ?,
        priority = ?, assigned_employee_id = ?, general_notes = ?,
        last_contact_date = ?, next_followup_date = ?,
        archived = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      full_name, company_name || null, country || null, city || null,
      email || null, phone || null, preferred_language || null,
      source || 'other', interested_aircraft || null,
      customer_type || 'new_buyer', status || 'new',
      priority || 'medium', assigned_employee_id || null,
      general_notes || null, last_contact_date || null,
      next_followup_date || null,
      archived ? 1 : 0,
      req.params.id,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /customers/:id error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /api/customers/:id — archive (soft delete) ───────────────────────
router.delete('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      'UPDATE customers SET archived = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /customers/:id error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Communication Logs
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/customers/:id/logs — get all logs for a customer ────────────────
router.get('/:id/logs', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { order = 'desc' } = req.query;
    const direction = order === 'asc' ? 'ASC' : 'DESC';

    const rows = await conn.query(`
      SELECT l.*, u.name AS user_name
      FROM customer_logs l
      LEFT JOIN users u ON u.id = l.employee_id
      WHERE l.customer_id = ?
      ORDER BY l.date_time ${direction}
    `, [req.params.id]);

    res.json(rows);
  } catch (err) {
    console.error('GET /customers/:id/logs error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /api/customers/:id/logs — add log entry ────────────────────────────
router.post('/:id/logs', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const {
      date_time, contact_type, category, title, detailed_notes,
      customer_question, blackwing_answer,
      follow_up_needed, follow_up_date, follow_up_responsible, entry_status,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    const employee_id = req.user.id;
    const employee_name = req.user.name;

    const result = await conn.query(`
      INSERT INTO customer_logs
        (customer_id, date_time, employee_id, employee_name, contact_type, category,
         title, detailed_notes, customer_question, blackwing_answer,
         follow_up_needed, follow_up_date, follow_up_responsible, entry_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.params.id,
      date_time || new Date().toISOString().slice(0, 19).replace('T', ' '),
      employee_id, employee_name,
      contact_type || 'other', category || 'other',
      title,
      detailed_notes || null, customer_question || null, blackwing_answer || null,
      follow_up_needed ? 1 : 0,
      follow_up_date || null, follow_up_responsible || null,
      entry_status || 'open',
    ]);

    // Update customer's last_contact_date
    await conn.query(
      'UPDATE customers SET last_contact_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [date_time || new Date().toISOString().slice(0, 19).replace('T', ' '), req.params.id]
    );

    // If follow-up set, update next_followup_date if earlier
    if (follow_up_needed && follow_up_date) {
      await conn.query(`
        UPDATE customers SET next_followup_date = ?
        WHERE id = ? AND (next_followup_date IS NULL OR next_followup_date > ?)
      `, [follow_up_date, req.params.id, follow_up_date]);
    }

    res.status(201).json({ id: Number(result.insertId) });
  } catch (err) {
    console.error('POST /customers/:id/logs error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /api/customers/:customerId/logs/:logId — update log entry ────────────
router.put('/:customerId/logs/:logId', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const {
      date_time, contact_type, category, title, detailed_notes,
      customer_question, blackwing_answer,
      follow_up_needed, follow_up_date, follow_up_responsible, entry_status,
    } = req.body;

    await conn.query(`
      UPDATE customer_logs SET
        date_time = ?, contact_type = ?, category = ?, title = ?,
        detailed_notes = ?, customer_question = ?, blackwing_answer = ?,
        follow_up_needed = ?, follow_up_date = ?, follow_up_responsible = ?,
        entry_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND customer_id = ?
    `, [
      date_time, contact_type || 'other', category || 'other', title,
      detailed_notes || null, customer_question || null, blackwing_answer || null,
      follow_up_needed ? 1 : 0,
      follow_up_date || null, follow_up_responsible || null,
      entry_status || 'open',
      req.params.logId, req.params.customerId,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /customers/:customerId/logs/:logId error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /api/customers/:customerId/logs/:logId — delete log entry ─────────
router.delete('/:customerId/logs/:logId', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      'DELETE FROM customer_logs WHERE id = ? AND customer_id = ?',
      [req.params.logId, req.params.customerId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /customers/:customerId/logs/:logId error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;

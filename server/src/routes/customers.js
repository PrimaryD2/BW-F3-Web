const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
// nodemailer removed — using Brevo HTTP API instead (avoids Docker DNS issues)

const router = express.Router();
router.use(authenticateToken);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip time component from a value that may be a Date, ISO string, or plain date string.
 *  Returns 'YYYY-MM-DD' or null so MariaDB DATE columns don't choke on ISO timestamps. */
function toDateOnly(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  // Already plain date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO string like '2026-05-28T00:00:00.000Z' — just take the date part
  if (s.includes('T')) return s.slice(0, 10);
  return s.slice(0, 10);
}

// Recompute a customer's next_followup_date from its open follow-up logs.
// Keeps the customer-level reminder accurate after logs are added/resolved/deleted.
async function recomputeNextFollowup(conn, customerId) {
  const rows = await conn.query(
    `SELECT MIN(follow_up_date) AS next FROM customer_logs
     WHERE customer_id = ? AND follow_up_needed = TRUE AND follow_up_date IS NOT NULL
       AND entry_status NOT IN ('solved','closed')`,
    [customerId]
  );
  await conn.query('UPDATE customers SET next_followup_date = ? WHERE id = ?', [rows[0]?.next || null, customerId]);
}

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
      next_followup_date, archived,
    } = req.body;

    // NOTE: last_contact_date is intentionally NOT updated here — it is
    // auto-set by the log endpoint so manual edits cannot accidentally
    // overwrite it with a stale or malformed datetime string.
    await conn.query(`
      UPDATE customers SET
        full_name = ?, company_name = ?, country = ?, city = ?,
        email = ?, phone = ?, preferred_language = ?, source = ?,
        interested_aircraft = ?, customer_type = ?, status = ?,
        priority = ?, assigned_employee_id = ?, general_notes = ?,
        next_followup_date = ?,
        archived = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      full_name, company_name || null, country || null, city || null,
      email || null, phone || null, preferred_language || null,
      source || 'other', interested_aircraft || null,
      customer_type || 'new_buyer', status || 'new',
      priority || 'medium', assigned_employee_id || null,
      general_notes || null,
      toDateOnly(next_followup_date),
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
      toDateOnly(follow_up_date), follow_up_responsible || null,
      entry_status || 'open',
    ]);

    // Update customer's last_contact_date
    await conn.query(
      'UPDATE customers SET last_contact_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [date_time || new Date().toISOString().slice(0, 19).replace('T', ' '), req.params.id]
    );

    // Keep the customer-level next follow-up date in sync with open follow-ups
    await recomputeNextFollowup(conn, req.params.id);

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
      toDateOnly(follow_up_date), follow_up_responsible || null,
      entry_status || 'open',
      req.params.logId, req.params.customerId,
    ]);

    await recomputeNextFollowup(conn, req.params.customerId);

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
    await recomputeNextFollowup(conn, req.params.customerId);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /customers/:customerId/logs/:logId error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Service / Planned-maintenance bookings linked to a customer
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/customers/:id/bookings ─────────────────────────────────────────
router.get('/:id/bookings', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(`
      SELECT
        fpm.id, fpm.aircraft_id, fpm.status,
        COALESCE(fpm.planned_arrival_date, fpm.planned_date) AS planned_arrival_date,
        fpm.planned_comments, fpm.signed_off_by, fpm.completed_date, fpm.labor_hours,
        fa.bw_serial, fa.registration, fa.model,
        tech.name AS assigned_technician_name
      FROM fleet_planned_maintenance fpm
      JOIN fleet_aircraft fa ON fa.id = fpm.aircraft_id
      LEFT JOIN users tech ON tech.id = fpm.assigned_technician_id
      WHERE fpm.customer_id = ?
      ORDER BY CASE WHEN fpm.status='planned' THEN 0 ELSE 1 END,
               COALESCE(fpm.planned_arrival_date, fpm.planned_date) DESC
    `, [req.params.id]);

    const ids = rows.map(r => r.id);
    let itemsByPm = {};
    if (ids.length) {
      const itemRows = await conn.query(`
        SELECT fpmi.id, fpmi.planned_id, fpmi.title, fpmi.signed_off, fpmi.signed_off_by
        FROM fleet_planned_maintenance_items fpmi
        WHERE fpmi.planned_id IN (${ids.map(() => '?').join(',')})
        ORDER BY fpmi.sort_order, fpmi.id
      `, ids);
      for (const it of itemRows) {
        if (!itemsByPm[it.planned_id]) itemsByPm[it.planned_id] = [];
        itemsByPm[it.planned_id].push(it);
      }
    }

    res.json(rows.map(r => ({
      ...r,
      labor_hours: r.labor_hours != null ? parseFloat(r.labor_hours) : null,
      items: itemsByPm[r.id] || [],
    })));
  } catch (err) {
    console.error('GET /customers/:id/bookings error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /api/customers/:id/bookings — create a planned-maintenance booking ──
router.post('/:id/bookings', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { aircraft_id, planned_arrival_date, assigned_technician_id, planned_comments, items = [] } = req.body;

    if (!aircraft_id) return res.status(400).json({ error: 'aircraft_id is required' });
    if (!planned_arrival_date) return res.status(400).json({ error: 'planned_arrival_date is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one work item is required' });

    const primaryTemplateId = items.find(i => i.template_id)?.template_id || null;

    const result = await conn.query(
      `INSERT INTO fleet_planned_maintenance
       (aircraft_id, customer_id, template_id, planned_date, planned_arrival_date, assigned_technician_id, planned_comments)
       VALUES (?,?,?,?,?,?,?)`,
      [aircraft_id, req.params.id, primaryTemplateId,
       planned_arrival_date, planned_arrival_date,
       assigned_technician_id || null, planned_comments || null]
    );

    const plannedId = Number(result.insertId);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await conn.query(
        `INSERT INTO fleet_planned_maintenance_items (planned_id, template_id, title, description, sort_order) VALUES (?,?,?,?,?)`,
        [plannedId, item.template_id || null, item.title || '', item.description || null, i]
      );
    }

    res.status(201).json({ id: plannedId });
  } catch (err) {
    console.error('POST /customers/:id/bookings error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Aircraft Configuration Quotes (buying process)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/customers/:id/quotes ───────────────────────────────────────────
router.get('/:id/quotes', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const quotes = await conn.query(`
      SELECT cq.*, u.name AS created_by_name
      FROM customer_quotes cq
      LEFT JOIN users u ON u.id = cq.created_by
      WHERE cq.customer_id = ?
      ORDER BY cq.created_at DESC
    `, [req.params.id]);

    const ids = quotes.map(q => Number(q.id));
    let optsByQuote = {};
    if (ids.length) {
      const opts = await conn.query(
        `SELECT * FROM customer_quote_options
         WHERE quote_id IN (${ids.map(() => '?').join(',')})
         ORDER BY option_category, option_label`,
        ids
      );
      for (const o of opts) {
        const qid = Number(o.quote_id);
        if (!optsByQuote[qid]) optsByQuote[qid] = [];
        optsByQuote[qid].push(o);
      }
    }
    res.json(quotes.map(q => ({ ...q, options: optsByQuote[Number(q.id)] || [] })));
  } catch (err) {
    console.error('GET /customers/:id/quotes error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /api/customers/:id/quotes ──────────────────────────────────────────
router.post('/:id/quotes', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { model_id, model_name, title, status = 'draft', notes, vat_rate, options = [] } = req.body;

    const r = await conn.query(`
      INSERT INTO customer_quotes (customer_id, model_id, model_name, title, status, notes, vat_rate, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.params.id, model_id || null, model_name || null, title || null, status, notes || null,
        vat_rate != null ? Number(vat_rate) : 20, req.user.id]);

    const quoteId = Number(r.insertId);
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      await conn.query(
        `INSERT INTO customer_quote_options (quote_id, option_id, option_label, option_category, option_price) VALUES (?,?,?,?,?)`,
        [quoteId, opt.option_id || null, opt.option_label, opt.option_category,
         opt.option_price != null ? Number(opt.option_price) : null]
      );
    }
    res.status(201).json({ id: quoteId });
  } catch (err) {
    console.error('POST /customers/:id/quotes error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── PUT /api/customers/:id/quotes/:qid ──────────────────────────────────────
router.put('/:id/quotes/:qid', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { model_id, model_name, title, status, notes, vat_rate, options = [] } = req.body;

    await conn.query(`
      UPDATE customer_quotes
      SET model_id=?, model_name=?, title=?, status=?, notes=?, vat_rate=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND customer_id=?
    `, [model_id || null, model_name || null, title || null, status || 'draft', notes || null,
        vat_rate != null ? Number(vat_rate) : 20, req.params.qid, req.params.id]);

    await conn.query('DELETE FROM customer_quote_options WHERE quote_id=?', [req.params.qid]);
    for (const opt of options) {
      await conn.query(
        `INSERT INTO customer_quote_options (quote_id, option_id, option_label, option_category, option_price) VALUES (?,?,?,?,?)`,
        [req.params.qid, opt.option_id || null, opt.option_label, opt.option_category,
         opt.option_price != null ? Number(opt.option_price) : null]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /customers/:id/quotes/:qid error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── POST /api/customers/:id/quotes/:qid/send-email ──────────────────────────
router.post('/:id/quotes/:qid/send-email', async (req, res) => {
  if (!process.env.BREVO_API_KEY) {
    return res.status(503).json({ error: 'Email sending is not configured on this server. Set BREVO_API_KEY in environment.' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    // Load quote + options
    const quotes = await conn.query(`
      SELECT cq.*, u.name AS created_by_name FROM customer_quotes cq
      LEFT JOIN users u ON u.id = cq.created_by
      WHERE cq.id = ? AND cq.customer_id = ?
    `, [req.params.qid, req.params.id]);
    if (!quotes.length) return res.status(404).json({ error: 'Quote not found' });
    const quote = quotes[0];

    const options = await conn.query(
      `SELECT cqo.*, fco.weight_kg
       FROM customer_quote_options cqo
       LEFT JOIN fleet_config_options fco ON fco.id = cqo.option_id
       WHERE cqo.quote_id = ? ORDER BY cqo.option_category, cqo.option_label`,
      [req.params.qid]
    );

    // Load model base price, weight envelope and spec sheet
    let basePrice = null, modelMtom = null, modelEmpty = null, modelSpecs = [];
    if (quote.model_id) {
      const mRows = await conn.query('SELECT base_price, mtom_kg, empty_weight_kg, specs FROM fleet_models WHERE id = ?', [quote.model_id]);
      const m = mRows[0] || {};
      basePrice = m.base_price != null ? Number(m.base_price) : null;
      modelMtom = m.mtom_kg != null ? Number(m.mtom_kg) : null;
      modelEmpty = m.empty_weight_kg != null ? Number(m.empty_weight_kg) : null;
      try { modelSpecs = m.specs ? JSON.parse(m.specs) : []; } catch { modelSpecs = []; }
      if (!Array.isArray(modelSpecs)) modelSpecs = [];
    }

    // Load customer
    const customers = await conn.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    const customer = customers[0];

    const { to_email, personal_message } = req.body;
    const recipientEmail = to_email || customer?.email;
    if (!recipientEmail) return res.status(400).json({ error: 'No recipient email address' });

    // Build pricing
    const vatRate = Number(quote.vat_rate ?? 20) / 100;
    const optionsTotal = options.reduce((sum, o) => {
      const p = o.option_price != null ? Number(o.option_price) : 0;
      return sum + p;
    }, 0);
    const subtotal = (basePrice || 0) + optionsTotal;
    const vatAmount = subtotal * vatRate;
    const totalWithVat = subtotal + vatAmount;

    const fmt = (n) => n != null ? `€${Number(n).toLocaleString('en-EU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

    // Weight & payload
    const additionalWeight = options.reduce((s, o) => s + (o.weight_kg != null ? Number(o.weight_kg) : 0), 0);
    const estEmptyWeight = modelEmpty != null ? modelEmpty + additionalWeight : null;
    const remainingPayload = (modelMtom != null && estEmptyWeight != null) ? modelMtom - estEmptyWeight : null;
    const kg = (n) => `${Number(n).toLocaleString('en-EU', { maximumFractionDigits: 1 })} kg`;

    const weightBlock = estEmptyWeight != null ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:13px;color:#333;">
        <tr><td style="padding:3px 0;color:#666;">Standard empty weight</td><td align="right">${kg(modelEmpty)}</td></tr>
        <tr><td style="padding:3px 0;color:#666;">Additional options</td><td align="right">+ ${kg(additionalWeight)}</td></tr>
        <tr><td style="padding:5px 0;font-weight:800;border-top:1px solid #e8e8e8;">Estimated empty weight</td><td align="right" style="font-weight:800;border-top:1px solid #e8e8e8;">${kg(estEmptyWeight)}</td></tr>
        ${modelMtom != null ? `<tr><td style="padding:3px 0;color:#666;">MTOM</td><td align="right">${kg(modelMtom)}</td></tr>
        <tr><td style="padding:3px 0;font-weight:700;color:#2563eb;">Remaining payload</td><td align="right" style="font-weight:700;color:#2563eb;">${remainingPayload != null ? kg(remainingPayload) : '—'}</td></tr>` : ''}
      </table>` : '';

    const specsBlock = modelSpecs.length ? `
      <h3 style="font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#888;margin:26px 0 8px;">Specifications</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;">
        ${modelSpecs.map((sp, i) => `<tr style="background:${i % 2 ? '#fafafa' : '#fff'};"><td style="padding:6px 8px;color:#666;">${sp.label || ''}</td><td align="right" style="padding:6px 8px;font-weight:600;">${sp.value || ''}</td></tr>`).join('')}
      </table>` : '';

    // Group options by category
    const byCategory = options.reduce((acc, o) => {
      if (!acc[o.option_category]) acc[o.option_category] = [];
      acc[o.option_category].push(o);
      return acc;
    }, {});

    const companyName = process.env.COMPANY_NAME || 'Blackwing Aircraft';
    const companyEmail = process.env.COMPANY_EMAIL || 'info@blackwing.aero';
    const companyWebsite = process.env.COMPANY_WEBSITE || 'https://blackwing.aero';
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // Category icon map for email
    const catIcons = { Engine: '🔧', Propeller: '⚙', Avionics: '📡', Interior: '💺', Paint: '🎨' };

    const categoryRows = Object.entries(byCategory).map(([cat, opts]) => `
      <tr><td colspan="2" style="padding:18px 0 6px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#888;border-bottom:1px solid #e8e8e8;">
        ${catIcons[cat] || '◆'} ${cat}
      </td></tr>
      ${opts.map(o => `
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#1a1a2e;border-bottom:1px solid #f0f0f0;">${o.option_label}</td>
          <td style="padding:8px 0;font-size:14px;color:#1a1a2e;text-align:right;border-bottom:1px solid #f0f0f0;">${o.option_price != null ? fmt(o.option_price) : '—'}</td>
        </tr>`).join('')}
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Aircraft Configuration Proposal</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0f0f1a 0%,#1a1a3e 100%);padding:40px 40px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.12em;text-transform:uppercase;">✈ ${companyName}</div>
              <div style="font-size:12px;font-weight:500;color:#8892b0;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">Aircraft Configuration Proposal</div>
            </td>
            <td align="right">
              <div style="font-size:11px;color:#8892b0;">${dateStr}</div>
            </td>
          </tr>
        </table>
        <div style="margin-top:28px;padding:20px 24px;background:rgba(255,255,255,0.07);border-radius:10px;border:1px solid rgba(255,255,255,0.12);">
          <div style="font-size:11px;font-weight:700;color:#8892b0;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Prepared for</div>
          <div style="font-size:20px;font-weight:800;color:#ffffff;">${customer?.full_name || 'Valued Customer'}</div>
          ${customer?.company_name ? `<div style="font-size:13px;color:#a0aec0;margin-top:3px;">${customer.company_name}</div>` : ''}
        </div>
      </td></tr>

      <!-- Model Hero -->
      <tr><td style="padding:32px 40px 0;background:#fafbfc;border-bottom:3px solid #e2e8f0;">
        <div style="display:flex;align-items:center;">
          <div style="font-size:48px;line-height:1;margin-right:16px;">✈</div>
          <div>
            <div style="font-size:28px;font-weight:900;color:#0f0f1a;letter-spacing:-0.02em;">${quote.model_name || 'Custom Configuration'}</div>
            ${quote.title ? `<div style="font-size:15px;color:#64748b;margin-top:4px;font-style:italic;">${quote.title}</div>` : ''}
          </div>
        </div>
        <div style="margin-top:20px;display:inline-block;padding:4px 14px;background:#eef2ff;border-radius:20px;font-size:12px;font-weight:700;color:#4f46e5;border:1px solid #c7d2fe;">
          ${options.length} option${options.length !== 1 ? 's' : ''} selected
        </div>
        <div style="height:24px;"></div>
      </td></tr>

      ${personal_message ? `
      <!-- Personal message -->
      <tr><td style="padding:24px 40px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Message from ${companyName}</div>
        <div style="font-size:14px;color:#334155;line-height:1.7;white-space:pre-wrap;">${personal_message}</div>
      </td></tr>` : ''}

      <!-- Spec table -->
      <tr><td style="padding:32px 40px;">
        ${basePrice != null ? `
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td colspan="2" style="padding:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#888;border-bottom:1px solid #e8e8e8;">
            ✈ Base Aircraft
          </td></tr>
          <tr>
            <td style="padding:8px 0;font-size:14px;color:#1a1a2e;border-bottom:1px solid #f0f0f0;">${quote.model_name}</td>
            <td style="padding:8px 0;font-size:14px;color:#1a1a2e;text-align:right;border-bottom:1px solid #f0f0f0;">${fmt(basePrice)}</td>
          </tr>
        </table>` : ''}
        ${options.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="${basePrice != null ? 'margin-top:16px;' : ''}">
          ${categoryRows}
        </table>` : ''}

        <!-- Pricing breakdown -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:#f8fafc;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
          ${basePrice != null ? `
          <tr style="background:#f8fafc;">
            <td style="padding:12px 20px;font-size:13px;color:#64748b;">Base aircraft price</td>
            <td style="padding:12px 20px;font-size:13px;color:#1e293b;text-align:right;font-weight:600;">${fmt(basePrice)}</td>
          </tr>` : ''}
          ${optionsTotal > 0 ? `
          <tr style="background:#f8fafc;">
            <td style="padding:12px 20px;font-size:13px;color:#64748b;">Options total</td>
            <td style="padding:12px 20px;font-size:13px;color:#1e293b;text-align:right;font-weight:600;">${fmt(optionsTotal)}</td>
          </tr>` : ''}
          ${subtotal > 0 ? `
          <tr style="background:#eef2ff;border-top:2px solid #c7d2fe;">
            <td style="padding:14px 20px;font-size:14px;color:#374151;font-weight:700;">Subtotal (ex. VAT)</td>
            <td style="padding:14px 20px;font-size:14px;color:#1e293b;text-align:right;font-weight:800;">${fmt(subtotal)}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="padding:12px 20px;font-size:13px;color:#64748b;">VAT (${Math.round((quote.vat_rate ?? 20))}%)</td>
            <td style="padding:12px 20px;font-size:13px;color:#64748b;text-align:right;">${fmt(vatAmount)}</td>
          </tr>
          <tr style="background:linear-gradient(135deg,#0f0f1a 0%,#1a1a3e 100%);">
            <td style="padding:18px 20px;font-size:16px;font-weight:900;color:#ffffff;letter-spacing:0.02em;">TOTAL (inc. VAT)</td>
            <td style="padding:18px 20px;font-size:20px;font-weight:900;color:#ffffff;text-align:right;">${fmt(totalWithVat)}</td>
          </tr>` : ''}
        </table>

        ${weightBlock ? `
        <h3 style="font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#888;margin:26px 0 4px;">Weight &amp; Payload</h3>
        ${weightBlock}` : ''}

        ${specsBlock}

        ${quote.notes ? `
        <div style="margin-top:24px;padding:16px 20px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b;">
          <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Notes</div>
          <div style="font-size:13px;color:#78350f;line-height:1.6;white-space:pre-wrap;">${quote.notes}</div>
        </div>` : ''}
      </td></tr>

      <!-- Disclaimer -->
      <tr><td style="padding:0 40px 24px;">
        <div style="font-size:11px;color:#94a3b8;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:16px;">
          This is an indicative configuration proposal. Prices are subject to change and do not constitute a binding offer. Final pricing will be confirmed in a formal quotation. All prices in EUR excluding delivery, registration, and training unless stated otherwise.
        </div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 40px;background:#0f0f1a;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="font-size:14px;font-weight:800;color:#ffffff;letter-spacing:0.08em;">${companyName}</div>
              <div style="font-size:12px;color:#8892b0;margin-top:4px;">${companyEmail} · ${companyWebsite}</div>
            </td>
            <td align="right">
              <div style="font-size:11px;color:#4a5568;">Generated ${dateStr}</div>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

    // Send via Brevo Transactional Email HTTP API (avoids Docker DNS issues with SMTP)
    const fromEmail = process.env.SMTP_FROM
      ? process.env.SMTP_FROM.replace(/.*<(.+)>/, '$1').trim()
      : 'noreply@blackwing.aero';
    const fromName = process.env.SMTP_FROM
      ? (process.env.SMTP_FROM.match(/^([^<]+)</) || [])[1]?.trim() || companyName
      : companyName;

    const brevoPayload = {
      sender: { name: fromName, email: fromEmail },
      to: [{ email: recipientEmail, name: customer?.full_name || recipientEmail }],
      subject: `Aircraft Configuration Proposal — ${quote.model_name || 'Custom Spec'}${quote.title ? ` (${quote.title})` : ''}`,
      htmlContent: html,
    };

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    });

    if (!brevoRes.ok) {
      const errBody = await brevoRes.text();
      throw new Error(`Brevo API error ${brevoRes.status}: ${errBody}`);
    }

    res.json({ ok: true, sent_to: recipientEmail });
  } catch (err) {
    console.error('POST /customers/:id/quotes/:qid/send-email error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /api/customers/:id/quotes/:qid ───────────────────────────────────
router.delete('/:id/quotes/:qid', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('DELETE FROM customer_quotes WHERE id=? AND customer_id=?', [req.params.qid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /customers/:id/quotes/:qid error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;

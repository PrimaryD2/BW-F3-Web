const express = require('express');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// MariaDB returns COUNT(*)/SUM() as BigInt which JSON.stringify cannot handle.
// Convert every BigInt value in a result set to a regular Number.
function normalizeBigInt(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'bigint' ? Number(v) : v;
    }
    return out;
  });
}

function addDateFilter(conditions, params, field, from_date, to_date) {
  if (from_date) { conditions.push(`DATE(${field}) >= ?`); params.push(from_date); }
  if (to_date) { conditions.push(`DATE(${field}) <= ?`); params.push(to_date); }
}

// GET /api/statistics/time-per-task?from_date=&to_date=&station_id=
router.get('/time-per-task', async (req, res) => {
  try {
    const { from_date, to_date, station_id } = req.query;
    const conditions = ['tl.ended_at IS NOT NULL'];
    const params = [];
    addDateFilter(conditions, params, 'tl.started_at', from_date, to_date);
    if (station_id) { conditions.push('ti.station_id = ?'); params.push(station_id); }
    const rows = await query(
      `SELECT tt.title AS task_title, s.name AS station_name,
              tt.estimated_minutes,
              COALESCE(SUM(tl.duration_minutes),0) AS actual_minutes,
              COUNT(DISTINCT ti.airplane_id) AS airplane_count
       FROM time_logs tl
       JOIN task_instances ti ON tl.task_instance_id = ti.id
       JOIN task_templates tt ON ti.template_id = tt.id
       JOIN stations s ON ti.station_id = s.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY tt.id, s.id
       ORDER BY s.id, tt.order_index`,
      params
    );
    res.json(normalizeBigInt(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/statistics/ncr-frequency?from_date=&to_date=&station_id=
router.get('/ncr-frequency', async (req, res) => {
  try {
    const { from_date, to_date, station_id } = req.query;
    const conditions = ['1=1'];
    const params = [];
    addDateFilter(conditions, params, 'ncr.created_at', from_date, to_date);
    if (station_id) { conditions.push('ncr.station_id = ?'); params.push(station_id); }
    const whereClause = conditions.join(' AND ');

    // By station
    const byStation = await query(
      `SELECT s.name AS station_name, ncr.severity,
              COUNT(*) AS count
       FROM nonconformity_reports ncr
       JOIN stations s ON ncr.station_id = s.id
       WHERE ${whereClause}
       GROUP BY s.id, ncr.severity ORDER BY s.id`,
      params
    );

    // Over time (weekly)
    const overTime = await query(
      `SELECT DATE_FORMAT(ncr.created_at, '%Y-%u') AS week,
              ncr.severity, COUNT(*) AS count
       FROM nonconformity_reports ncr
       WHERE ${whereClause}
       GROUP BY week, ncr.severity ORDER BY week`,
      params
    );

    res.json({ byStation: normalizeBigInt(byStation), overTime: normalizeBigInt(overTime) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/statistics/loss-breakdown?from_date=&to_date=&station_id=
router.get('/loss-breakdown', async (req, res) => {
  try {
    const { from_date, to_date, station_id } = req.query;
    const conditions = ['1=1'];
    const params = [];
    addDateFilter(conditions, params, 'll.logged_at', from_date, to_date);
    if (station_id) { conditions.push('ti.station_id = ?'); params.push(station_id); }

    const rows = await query(
      `SELECT ll.reason,
              s.name AS station_name,
              COUNT(*) AS occurrences,
              COALESCE(SUM(ll.duration_minutes),0) AS total_minutes
       FROM loss_logs ll
       JOIN task_instances ti ON ll.task_instance_id = ti.id
       JOIN stations s ON ti.station_id = s.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY ll.reason, s.id
       ORDER BY total_minutes DESC`,
      params
    );
    res.json(normalizeBigInt(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/statistics/throughput?from_date=&to_date=
router.get('/throughput', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const conditions = ["status = 'completed'", 'completed_at IS NOT NULL'];
    const params = [];
    addDateFilter(conditions, params, 'completed_at', from_date, to_date);

    const weekly = await query(
      `SELECT DATE_FORMAT(completed_at, '%Y-%u') AS period,
              COUNT(*) AS count
       FROM airplanes WHERE ${conditions.join(' AND ')}
       GROUP BY period ORDER BY period`,
      params
    );

    const monthly = await query(
      `SELECT DATE_FORMAT(completed_at, '%Y-%m') AS period,
              COUNT(*) AS count
       FROM airplanes WHERE ${conditions.join(' AND ')}
       GROUP BY period ORDER BY period`,
      params
    );

    res.json({ weekly: normalizeBigInt(weekly), monthly: normalizeBigInt(monthly) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/statistics/dashboard — quick summary for dashboard widgets
router.get('/dashboard', async (req, res) => {
  try {
    const [summaryRows, countries] = await Promise.all([
      query(
        `SELECT
           COUNT(*) AS total_aircraft_produced,
           SUM(CASE WHEN delivery_date IS NOT NULL OR build_status = 'delivered' THEN 1 ELSE 0 END) AS delivered_aircraft,
           SUM(CASE WHEN build_status IN ('maintenance', 'in_service', 'delivered') THEN 1 ELSE 0 END) AS active_in_service_aircraft
         FROM fleet_aircraft`
      ),
      query(
        `SELECT COALESCE(country_name, 'Unknown') AS country, COUNT(*) AS aircraft_count
         FROM fleet_aircraft
         GROUP BY COALESCE(country_name, 'Unknown')
         ORDER BY aircraft_count DESC, country ASC`
      ),
    ]);

    res.json({
      total_aircraft_produced: Number(summaryRows[0]?.total_aircraft_produced) || 0,
      delivered_aircraft: Number(summaryRows[0]?.delivered_aircraft) || 0,
      active_in_service_aircraft: Number(summaryRows[0]?.active_in_service_aircraft) || 0,
      aircraft_by_country: normalizeBigInt(countries),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/statistics/export/csv?type= — CSV export
router.get('/export/csv', async (req, res) => {
  const { type, from_date, to_date, station_id } = req.query;
  try {
    let rows = [];
    let filename = 'export.csv';

    if (type === 'time') {
      const conditions = ['tl.ended_at IS NOT NULL'];
      const params = [];
      addDateFilter(conditions, params, 'tl.started_at', from_date, to_date);
      if (station_id) { conditions.push('ti.station_id = ?'); params.push(station_id); }
      rows = await query(
        `SELECT s.name AS station, tt.title AS task, tt.estimated_minutes,
                COALESCE(SUM(tl.duration_minutes),0) AS actual_minutes,
                COUNT(DISTINCT ti.airplane_id) AS airplane_count
         FROM time_logs tl
         JOIN task_instances ti ON tl.task_instance_id = ti.id
         JOIN task_templates tt ON ti.template_id = tt.id
         JOIN stations s ON ti.station_id = s.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY tt.id, s.id ORDER BY s.id, tt.order_index`,
        params
      );
      filename = 'time-per-task.csv';
    } else if (type === 'loss') {
      const conditions = ['1=1'];
      const params = [];
      addDateFilter(conditions, params, 'll.logged_at', from_date, to_date);
      if (station_id) { conditions.push('ti.station_id = ?'); params.push(station_id); }
      rows = await query(
        `SELECT s.name AS station, ll.reason, COUNT(*) AS occurrences,
                COALESCE(SUM(ll.duration_minutes),0) AS total_minutes
         FROM loss_logs ll
         JOIN task_instances ti ON ll.task_instance_id = ti.id
         JOIN stations s ON ti.station_id = s.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY ll.reason, s.id ORDER BY total_minutes DESC`,
        params
      );
      filename = 'loss-breakdown.csv';
    } else if (type === 'ncr') {
      const conditions = ['1=1'];
      const params = [];
      addDateFilter(conditions, params, 'ncr.created_at', from_date, to_date);
      if (station_id) { conditions.push('ncr.station_id = ?'); params.push(station_id); }
      rows = await query(
        `SELECT a.serial_number, s.name AS station, ncr.severity, ncr.status,
                ncr.description, u.name AS reporter, ncr.created_at
         FROM nonconformity_reports ncr
         JOIN airplanes a ON ncr.airplane_id = a.id
         JOIN stations s ON ncr.station_id = s.id
         JOIN users u ON ncr.reported_by = u.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ncr.created_at DESC`,
        params
      );
      filename = 'ncr-report.csv';
    } else {
      return res.status(400).json({ error: 'Invalid export type' });
    }

    if (!rows.length) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send('No data');
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      const line = headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',');
      csvLines.push(line);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

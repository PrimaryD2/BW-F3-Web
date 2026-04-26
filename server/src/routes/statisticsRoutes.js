import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";
import { env } from "../config/env.js";

const router = Router();
router.use(requireAuth, requireRole("Admin", "Supervisor"));

router.get("/dashboard", asyncHandler(async (_req, res) => {
  const [airplanes] = await pool.query(`
    SELECT a.id, a.serial_number, a.model, a.status,
      COUNT(ti.id) AS total_tasks,
      SUM(ti.status = 'Double-Signed') AS completed_tasks
    FROM airplanes a
    LEFT JOIN task_instances ti ON ti.airplane_id = a.id
    WHERE a.status NOT IN ('Completed','Archived')
    GROUP BY a.id
    ORDER BY a.updated_at DESC
  `);
  const [stations] = await pool.query(`
    SELECT s.id, s.name,
      SUM(ti.status = 'In Progress') AS in_progress,
      SUM(ncr.status <> 'resolved' AND ncr.severity = 'high') AS blockers
    FROM stations s
    LEFT JOIN task_instances ti ON ti.station_id = s.id
    LEFT JOIN nonconformity_reports ncr ON ncr.station_id = s.id
    GROUP BY s.id
    ORDER BY s.id
  `);
  const [[today]] = await pool.query("SELECT COALESCE(SUM(duration_minutes),0) AS minutes FROM time_logs WHERE DATE(ended_at) = CURDATE()");
  const [recentNcrs] = await pool.query(`
    SELECT ncr.id, ncr.description, ncr.severity, a.serial_number, s.name AS station_name
    FROM nonconformity_reports ncr
    JOIN airplanes a ON a.id = ncr.airplane_id
    JOIN stations s ON s.id = ncr.station_id
    WHERE ncr.status <> 'resolved'
    ORDER BY ncr.severity = 'high' DESC, ncr.created_at DESC
    LIMIT 6
  `);
  const [lossReasons] = await pool.query(`
    SELECT reason, SUM(duration_minutes) AS minutes
    FROM loss_logs
    WHERE logged_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY reason
    ORDER BY minutes DESC
  `);
  res.json({
    airplanes: airplanes.map((row) => ({ ...row, completionPercent: row.total_tasks ? Math.round((row.completed_tasks / row.total_tasks) * 100) : 0 })),
    stations: stations.map((row) => ({ ...row, state: Number(row.blockers) ? "blocked by NCR" : Number(row.in_progress) ? "in progress" : "idle" })),
    today: { minutes: Number(today.minutes || 0), targetMinutes: env.targetHoursPerDay * 60 },
    recentNcrs,
    lossReasons
  });
}));

router.get("/", asyncHandler(async (req, res) => {
  const values = [];
  const filters = [];
  if (req.query.from) {
    filters.push("DATE(tl.ended_at) >= ?");
    values.push(req.query.from);
  }
  if (req.query.to) {
    filters.push("DATE(tl.ended_at) <= ?");
    values.push(req.query.to);
  }
  if (req.query.stationId) {
    filters.push("ti.station_id = ?");
    values.push(req.query.stationId);
  }
  if (req.query.airplaneId) {
    filters.push("ti.airplane_id = ?");
    values.push(req.query.airplaneId);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [timeByTask] = await pool.query(`
    SELECT s.name AS station, ti.title, SUM(tl.duration_minutes) AS actual_minutes, MAX(ti.estimated_minutes) AS estimated_minutes
    FROM time_logs tl
    JOIN task_instances ti ON ti.id = tl.task_instance_id
    JOIN stations s ON s.id = ti.station_id
    ${where}
    GROUP BY s.name, ti.title
    ORDER BY s.name, ti.title
  `, values);
  const [ncrByStation] = await pool.query(`
    SELECT s.name AS station, ncr.severity, COUNT(*) AS count
    FROM nonconformity_reports ncr
    JOIN stations s ON s.id = ncr.station_id
    GROUP BY s.name, ncr.severity
  `);
  const [ncrOverTime] = await pool.query(`
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM nonconformity_reports
    GROUP BY DATE(created_at)
    ORDER BY day
  `);
  const [lossBreakdown] = await pool.query(`
    SELECT ll.reason, SUM(ll.duration_minutes) AS minutes
    FROM loss_logs ll
    JOIN task_instances ti ON ti.id = ll.task_instance_id
    ${req.query.stationId ? "WHERE ti.station_id = ?" : ""}
    GROUP BY ll.reason
    ORDER BY minutes DESC
  `, req.query.stationId ? [req.query.stationId] : []);
  const [throughputWeek] = await pool.query(`
    SELECT YEARWEEK(completed_at, 1) AS period, COUNT(*) AS count
    FROM airplanes
    WHERE completed_at IS NOT NULL
    GROUP BY YEARWEEK(completed_at, 1)
    ORDER BY period
  `);
  const [throughputMonth] = await pool.query(`
    SELECT DATE_FORMAT(completed_at, '%Y-%m') AS period, COUNT(*) AS count
    FROM airplanes
    WHERE completed_at IS NOT NULL
    GROUP BY DATE_FORMAT(completed_at, '%Y-%m')
    ORDER BY period
  `);
  res.json({ timeByTask, ncrByStation, ncrOverTime, lossBreakdown, throughputWeek, throughputMonth });
}));

router.get("/csv", asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT s.name AS station, ti.title, COALESCE(SUM(tl.duration_minutes),0) AS actual_minutes, ti.estimated_minutes
    FROM task_instances ti
    JOIN stations s ON s.id = ti.station_id
    LEFT JOIN time_logs tl ON tl.task_instance_id = ti.id
    GROUP BY s.name, ti.title, ti.estimated_minutes
    ORDER BY s.name, ti.title
  `);
  const csv = ["station,title,actual_minutes,estimated_minutes"]
    .concat(rows.map((row) => [row.station, row.title, row.actual_minutes, row.estimated_minutes].map(csvValue).join(",")))
    .join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=f3-statistics.csv");
  res.send(csv);
}));

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default router;

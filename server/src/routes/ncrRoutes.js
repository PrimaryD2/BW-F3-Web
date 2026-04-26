import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler, AppError } from "../utils/errors.js";
import { requireFields, assertEnum } from "../utils/validation.js";
import { audit } from "../services/auditService.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const filters = [];
  const values = [];
  if (req.query.status) {
    filters.push("ncr.status = ?");
    values.push(req.query.status);
  }
  if (req.query.severity) {
    filters.push("ncr.severity = ?");
    values.push(req.query.severity);
  }
  if (req.query.stationId) {
    filters.push("ncr.station_id = ?");
    values.push(req.query.stationId);
  }
  if (req.query.serialNumber) {
    filters.push("a.serial_number LIKE ?");
    values.push(`%${req.query.serialNumber}%`);
  }
  if (req.query.from) {
    filters.push("DATE(ncr.created_at) >= ?");
    values.push(req.query.from);
  }
  if (req.query.to) {
    filters.push("DATE(ncr.created_at) <= ?");
    values.push(req.query.to);
  }

  const [ncrs] = await pool.query(`
    SELECT ncr.*, a.serial_number, s.name AS station_name, ti.title AS task_title, u.name AS reported_by_name
    FROM nonconformity_reports ncr
    JOIN airplanes a ON a.id = ncr.airplane_id
    JOIN stations s ON s.id = ncr.station_id
    LEFT JOIN task_instances ti ON ti.id = ncr.task_instance_id
    JOIN users u ON u.id = ncr.reported_by
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY ncr.created_at DESC
  `, values);
  res.json({ ncrs });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const [[ncr]] = await pool.query(`
    SELECT ncr.*, a.serial_number, s.name AS station_name, ti.title AS task_title, u.name AS reported_by_name
    FROM nonconformity_reports ncr
    JOIN airplanes a ON a.id = ncr.airplane_id
    JOIN stations s ON s.id = ncr.station_id
    LEFT JOIN task_instances ti ON ti.id = ncr.task_instance_id
    JOIN users u ON u.id = ncr.reported_by
    WHERE ncr.id = ?
  `, [req.params.id]);
  if (!ncr) throw new AppError("NCR not found", 404);
  const [approvals] = await pool.query(`
    SELECT na.*, u.name AS approved_by_name
    FROM ncr_approvals na
    JOIN users u ON u.id = na.approved_by
    WHERE na.ncr_id = ?
    ORDER BY na.approved_at
  `, [req.params.id]);
  res.json({ ncr, approvals });
}));

router.post("/", asyncHandler(async (req, res) => {
  requireFields(req.body, ["airplaneId", "stationId", "description", "severity"]);
  assertEnum(req.body.severity, ["low", "medium", "high"], "severity");
  const [result] = await pool.query(
    `INSERT INTO nonconformity_reports
      (airplane_id, task_instance_id, station_id, reported_by, description, severity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.body.airplaneId, req.body.taskInstanceId || null, req.body.stationId, req.user.id, req.body.description, req.body.severity]
  );
  await audit(req.user.id, "ncr", result.insertId, "ncr_created", { severity: req.body.severity });
  res.status(201).json({ id: result.insertId });
}));

router.patch("/:id/review", requireRole("Admin", "Supervisor"), asyncHandler(async (req, res) => {
  assertEnum(req.body.status, ["open", "under_review", "resolved"], "status");
  const resolvedAt = req.body.status === "resolved" ? new Date() : null;
  await pool.query(
    "UPDATE nonconformity_reports SET status = ?, resolution_notes = COALESCE(?, resolution_notes), resolved_at = COALESCE(?, resolved_at) WHERE id = ?",
    [req.body.status, req.body.resolutionNotes || null, resolvedAt, req.params.id]
  );
  await pool.query(
    "INSERT INTO ncr_approvals (ncr_id, approved_by, action, notes) VALUES (?, ?, ?, ?)",
    [req.params.id, req.user.id, req.body.status, req.body.notes || req.body.resolutionNotes || null]
  );
  await audit(req.user.id, "ncr", req.params.id, "ncr_reviewed", { status: req.body.status });
  res.json({ message: "NCR updated" });
}));

export default router;

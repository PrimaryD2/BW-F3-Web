import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler, AppError } from "../utils/errors.js";
import { requireFields, assertEnum } from "../utils/validation.js";
import { audit } from "../services/auditService.js";
import {
  airplaneStatuses,
  createAirplane,
  completeTask,
  getAirplaneDetail,
  listAirplanes,
  lossReasons,
  signTask,
  startTask,
  startTimer,
  stopTimer,
  updateAirplaneStatus
} from "../services/factoryService.js";

const router = Router();
router.use(requireAuth);

router.get("/stations", asyncHandler(async (_req, res) => {
  const [stations] = await pool.query("SELECT * FROM stations ORDER BY id");
  res.json({ stations });
}));

router.get("/airplanes", asyncHandler(async (req, res) => {
  res.json({ airplanes: await listAirplanes(req.query.filter || "active") });
}));

router.post("/airplanes", requireRole("Admin", "Supervisor"), asyncHandler(async (req, res) => {
  requireFields(req.body, ["serialNumber"]);
  const id = await createAirplane(req.user, req.body);
  res.status(201).json({ id });
}));

router.get("/airplanes/:id", asyncHandler(async (req, res) => {
  res.json(await getAirplaneDetail(req.params.id));
}));

router.patch("/airplanes/:id/status", requireRole("Admin", "Supervisor"), asyncHandler(async (req, res) => {
  assertEnum(req.body.status, airplaneStatuses, "status");
  await updateAirplaneStatus(req.user, req.params.id, req.body.status);
  res.json({ message: "Airplane status updated" });
}));

router.get("/task-templates", requireRole("Admin", "Supervisor"), asyncHandler(async (_req, res) => {
  const [templates] = await pool.query(`
    SELECT tt.*, s.name AS station_name
    FROM task_templates tt
    JOIN stations s ON s.id = tt.station_id
    ORDER BY s.id, tt.order_index
  `);
  res.json({ templates });
}));

router.post("/task-templates", requireRole("Admin"), asyncHandler(async (req, res) => {
  requireFields(req.body, ["stationId", "title", "estimatedMinutes", "orderIndex"]);
  const [result] = await pool.query(
    `INSERT INTO task_templates (station_id, title, description, estimated_minutes, order_index, active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.body.stationId, req.body.title, req.body.description || null, Number(req.body.estimatedMinutes), Number(req.body.orderIndex), req.body.active !== false]
  );
  await audit(req.user.id, "task_template", result.insertId, "template_created", { title: req.body.title });
  res.status(201).json({ id: result.insertId });
}));

router.put("/task-templates/:id", requireRole("Admin"), asyncHandler(async (req, res) => {
  requireFields(req.body, ["stationId", "title", "estimatedMinutes", "orderIndex"]);
  await pool.query(
    `UPDATE task_templates SET station_id = ?, title = ?, description = ?, estimated_minutes = ?, order_index = ?, active = ? WHERE id = ?`,
    [req.body.stationId, req.body.title, req.body.description || null, Number(req.body.estimatedMinutes), Number(req.body.orderIndex), Boolean(req.body.active), req.params.id]
  );
  await audit(req.user.id, "task_template", req.params.id, "template_updated", { title: req.body.title });
  res.json({ message: "Template updated" });
}));

router.post("/task-instances/:id/start", asyncHandler(async (req, res) => {
  await startTask(req.user, req.params.id);
  res.json({ message: "Task started" });
}));

router.post("/task-instances/:id/complete", asyncHandler(async (req, res) => {
  await completeTask(req.user, req.params.id, req.body.notes);
  res.json({ message: "Task moved to pending sign-off" });
}));

router.post("/task-instances/:id/signoffs", asyncHandler(async (req, res) => {
  requireFields(req.body, ["password", "signatureType"]);
  await signTask(req.user, req.params.id, req.body.password, req.body.signatureType);
  res.status(201).json({ message: "Sign-off saved" });
}));

router.post("/task-instances/:id/timers/start", asyncHandler(async (req, res) => {
  const id = await startTimer(req.user, req.params.id);
  res.status(201).json({ id });
}));

router.post("/task-instances/:id/timers/stop", asyncHandler(async (req, res) => {
  if (req.body.loss?.reason) assertEnum(req.body.loss.reason, lossReasons, "loss reason");
  const id = await stopTimer(req.user, req.params.id, req.body.loss);
  res.json({ id });
}));

router.post("/task-instances/:id/losses", asyncHandler(async (req, res) => {
  requireFields(req.body, ["reason", "durationMinutes"]);
  assertEnum(req.body.reason, lossReasons, "reason");
  const [result] = await pool.query(
    "INSERT INTO loss_logs (task_instance_id, user_id, reason, duration_minutes, notes) VALUES (?, ?, ?, ?, ?)",
    [req.params.id, req.user.id, req.body.reason, Number(req.body.durationMinutes), req.body.notes || null]
  );
  await audit(req.user.id, "loss_log", result.insertId, "loss_logged", { taskId: req.params.id, reason: req.body.reason });
  res.status(201).json({ id: result.insertId });
}));

router.get("/my-active-timers", asyncHandler(async (req, res) => {
  const [timers] = await pool.query(`
    SELECT tl.*, ti.title, a.serial_number, s.name AS station_name
    FROM time_logs tl
    JOIN task_instances ti ON ti.id = tl.task_instance_id
    JOIN airplanes a ON a.id = ti.airplane_id
    JOIN stations s ON s.id = ti.station_id
    WHERE tl.user_id = ? AND tl.ended_at IS NULL
  `, [req.user.id]);
  res.json({ timers });
}));

export default router;

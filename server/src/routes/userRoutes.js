import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";
import { requireFields, assertEnum } from "../utils/validation.js";
import { audit } from "../services/auditService.js";

const router = Router();
router.use(requireAuth, requireRole("Admin"));

router.get("/", asyncHandler(async (_req, res) => {
  const [users] = await pool.query("SELECT id, name, username, role, active, must_change_password AS mustChangePassword, created_at FROM users ORDER BY active DESC, name");
  res.json({ users });
}));

router.post("/", asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "username", "password", "role"]);
  assertEnum(req.body.role, ["Admin", "Supervisor", "Worker"], "role");
  const hash = await bcrypt.hash(req.body.password, 12);
  const [result] = await pool.query(
    "INSERT INTO users (name, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, TRUE)",
    [req.body.name, req.body.username, hash, req.body.role]
  );
  await audit(req.user.id, "user", result.insertId, "user_created", { username: req.body.username, role: req.body.role });
  res.status(201).json({ id: result.insertId });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "role"]);
  assertEnum(req.body.role, ["Admin", "Supervisor", "Worker"], "role");
  await pool.query(
    "UPDATE users SET name = ?, role = ?, active = ?, must_change_password = ? WHERE id = ?",
    [req.body.name, req.body.role, Boolean(req.body.active), Boolean(req.body.mustChangePassword), req.params.id]
  );
  await audit(req.user.id, "user", req.params.id, "user_updated", { role: req.body.role, active: Boolean(req.body.active) });
  res.json({ message: "User updated" });
}));

router.post("/:id/reset-password", asyncHandler(async (req, res) => {
  requireFields(req.body, ["password"]);
  const hash = await bcrypt.hash(req.body.password, 12);
  await pool.query("UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE id = ?", [hash, req.params.id]);
  await audit(req.user.id, "user", req.params.id, "password_reset", {});
  res.json({ message: "Password reset" });
}));

export default router;

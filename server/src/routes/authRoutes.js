import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { asyncHandler, AppError } from "../utils/errors.js";
import { requireFields } from "../utils/validation.js";
import { audit } from "../services/auditService.js";

const router = Router();

router.post("/login", asyncHandler(async (req, res) => {
  requireFields(req.body, ["username", "password"]);
  const [[user]] = await pool.query("SELECT * FROM users WHERE username = ?", [req.body.username]);
  if (!user || !user.active || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    throw new AppError("Invalid username or password", 401);
  }
  await audit(user.id, "auth", user.id, "login", {});
  res.json({
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      mustChangePassword: Boolean(user.must_change_password)
    }
  });
}));

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  requireFields(req.body, ["currentPassword", "newPassword"]);
  if (req.body.newPassword.length < 8) throw new AppError("New password must be at least 8 characters", 400);
  const [[user]] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
  if (!(await bcrypt.compare(req.body.currentPassword, user.password_hash))) {
    throw new AppError("Current password is incorrect", 401);
  }
  const hash = await bcrypt.hash(req.body.newPassword, 12);
  await pool.query("UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?", [hash, req.user.id]);
  await audit(req.user.id, "user", req.user.id, "password_changed", {});
  res.json({ message: "Password changed" });
}));

export default router;

import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";

const router = Router();
router.use(requireAuth, requireRole("Admin"));

router.get("/", asyncHandler(async (req, res) => {
  const filters = [];
  const values = [];
  if (req.query.userId) {
    filters.push("al.user_id = ?");
    values.push(req.query.userId);
  }
  if (req.query.action) {
    filters.push("al.action LIKE ?");
    values.push(`%${req.query.action}%`);
  }
  if (req.query.from) {
    filters.push("DATE(al.created_at) >= ?");
    values.push(req.query.from);
  }
  if (req.query.to) {
    filters.push("DATE(al.created_at) <= ?");
    values.push(req.query.to);
  }
  const [logs] = await pool.query(`
    SELECT al.*, u.name AS user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY al.created_at DESC
    LIMIT 300
  `, values);
  res.json({ logs });
}));

export default router;

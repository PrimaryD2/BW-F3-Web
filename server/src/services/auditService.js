import { pool } from "../db/pool.js";

export async function audit(userId, entityType, entityId, action, details = {}) {
  await pool.query(
    "INSERT INTO audit_logs (user_id, entity_type, entity_id, action, details) VALUES (?, ?, ?, ?, ?)",
    [userId || null, entityType, entityId || null, action, JSON.stringify(details)]
  );
}

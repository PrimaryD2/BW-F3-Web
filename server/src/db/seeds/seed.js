import bcrypt from "bcryptjs";
import { pool } from "../pool.js";

const stations = ["F3-Prep", "F3-S1", "F3-S2", "F3-S3a", "F3-S3B", "F3-S4"];

const templates = {
  "F3-Prep": [
    ["Material kit verification", "Confirm carbon cloth, resin batch, core material, and traveler.", 25, 1],
    ["Mold surface preparation", "Clean, inspect, and release-coat the mold surface.", 40, 2],
    ["Layup tool readiness", "Verify vacuum lines, bagging supplies, and calibrated tools.", 20, 3]
  ],
  "F3-S1": [
    ["Primary carbon layup", "Lay first structural plies according to the traveler.", 90, 1],
    ["Core placement", "Fit and record core placement before closure plies.", 60, 2],
    ["Vacuum bag leak check", "Bag part and document vacuum hold before cure.", 45, 3]
  ],
  "F3-S2": [
    ["Post-cure trim inspection", "Inspect trim lines and mark any defects.", 35, 1],
    ["Bond prep", "Prepare bonding surface and record surface condition.", 50, 2]
  ]
};

export async function seedDatabase() {
  for (const station of stations) {
    await pool.query("INSERT IGNORE INTO stations (name) VALUES (?)", [station]);
  }

  const [[admin]] = await pool.query("SELECT id FROM users WHERE username = 'admin'");
  if (!admin) {
    const hash = await bcrypt.hash("admin123", 12);
    await pool.query(
      `INSERT INTO users (name, username, password_hash, role, active, must_change_password)
       VALUES ('Factory Admin', 'admin', ?, 'Admin', TRUE, TRUE)`,
      [hash]
    );
  }

  const [[templateCount]] = await pool.query("SELECT COUNT(*) AS count FROM task_templates");
  if (templateCount.count === 0) {
    for (const [stationName, stationTemplates] of Object.entries(templates)) {
      const [[station]] = await pool.query("SELECT id FROM stations WHERE name = ?", [stationName]);
      for (const [title, description, estimatedMinutes, orderIndex] of stationTemplates) {
        await pool.query(
          `INSERT INTO task_templates (station_id, title, description, estimated_minutes, order_index)
           VALUES (?, ?, ?, ?, ?)`,
          [station.id, title, description, estimatedMinutes, orderIndex]
        );
      }
    }
  }
}

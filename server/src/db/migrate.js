import { pool } from "./pool.js";
import { up as initialSchema } from "./migrations/001_initial_schema.js";

const migrations = [
  ["001_initial_schema", initialSchema]
];

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const [name, up] of migrations) {
    const [[existing]] = await pool.query("SELECT id FROM migrations WHERE name = ?", [name]);
    if (existing) continue;
    await up(pool);
    await pool.query("INSERT INTO migrations (name) VALUES (?)", [name]);
  }
}

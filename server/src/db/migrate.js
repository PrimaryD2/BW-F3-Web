require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { pool } = require('../config/db');

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','supervisor','worker') NOT NULL DEFAULT 'worker',
  force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS airplanes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  serial_number VARCHAR(50) NOT NULL UNIQUE,
  model VARCHAR(100) NOT NULL,
  status ENUM('draft','in_progress','qc_review','completed') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  station_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  estimated_minutes INT NOT NULL DEFAULT 60,
  order_index INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS task_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  airplane_id INT NOT NULL,
  template_id INT NOT NULL,
  station_id INT NOT NULL,
  status ENUM('not_started','in_progress','pending_signoff','signed','double_signed') NOT NULL DEFAULT 'not_started',
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  notes TEXT,
  FOREIGN KEY (airplane_id) REFERENCES airplanes(id),
  FOREIGN KEY (template_id) REFERENCES task_templates(id),
  FOREIGN KEY (station_id) REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS task_signoffs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_instance_id INT NOT NULL,
  signed_by_user_id INT NOT NULL,
  signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  signature_type ENUM('primary','double') NOT NULL,
  FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  FOREIGN KEY (signed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS time_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_instance_id INT NOT NULL,
  user_id INT NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  duration_minutes DECIMAL(10,2) NULL,
  FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS loss_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_instance_id INT NOT NULL,
  user_id INT NOT NULL,
  reason ENUM('walked_to_warehouse','fix_issue','missing_tools','waiting_for_material','machine_downtime','other') NOT NULL,
  duration_minutes DECIMAL(10,2) NOT NULL,
  notes TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS nonconformity_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  airplane_id INT NOT NULL,
  task_instance_id INT NULL,
  station_id INT NOT NULL,
  reported_by INT NOT NULL,
  description TEXT NOT NULL,
  severity ENUM('low','medium','high') NOT NULL,
  status ENUM('open','under_review','resolved') NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (airplane_id) REFERENCES airplanes(id),
  FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (reported_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ncr_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ncr_id INT NOT NULL,
  approved_by INT NOT NULL,
  approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(100) NOT NULL,
  notes TEXT,
  FOREIGN KEY (ncr_id) REFERENCES nonconformity_reports(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);
`;

// Additive column additions — safe to re-run on an existing database.
// MariaDB 10.0+ supports ADD COLUMN IF NOT EXISTS.
const ALTER_STMTS = [
  // Task template enrichment fields
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS op_number VARCHAR(20) NULL`,
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS is_section_header BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS kits_required TEXT NULL`,
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS drawing_reference VARCHAR(200) NULL`,
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS instructions TEXT NULL`,
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS requires_serial_number BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS image_urls TEXT NULL`,
  // Installed part traceability on task instances
  `ALTER TABLE task_instances ADD COLUMN IF NOT EXISTS installed_part_serial VARCHAR(100) NULL`,
];

async function migrate() {
  let conn;
  try {
    conn = await pool.getConnection();
    // Base schema — idempotent CREATE TABLE IF NOT EXISTS
    const statements = SQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    // Additive columns — safe to run on existing schema
    for (const stmt of ALTER_STMTS) {
      await conn.query(stmt);
    }
    console.log('✅ Migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

migrate();

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

-- ─── F5 Service / Fleet ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fleet_aircraft (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fleet_number INT NOT NULL UNIQUE,
  bw_serial VARCHAR(50) NOT NULL,
  aircraft_number VARCHAR(50) NULL,
  model VARCHAR(100) NOT NULL,
  build_status ENUM('in_production','completed','delivered','in_service','stored','for_sale','written_off') NOT NULL DEFAULT 'in_production',
  registration VARCHAR(20) NULL,
  country_code CHAR(2) NULL,
  country_name VARCHAR(100) NULL,
  -- Weight & Balance
  empty_weight_kg DECIMAL(8,2) NULL,
  useful_load_kg DECIMAL(8,2) NULL,
  -- Airworthiness
  airworthiness_status ENUM('active','expired','pending','unknown') NULL,
  airworthiness_authority VARCHAR(100) NULL,
  airworthiness_expiry DATE NULL,
  -- Configuration
  config_engine VARCHAR(200) NULL,
  config_prop VARCHAR(200) NULL,
  config_avionics TEXT NULL,
  config_interior TEXT NULL,
  config_paint VARCHAR(200) NULL,
  -- Hours
  total_hours_tsn DECIMAL(8,2) NULL,
  engine_hours DECIMAL(8,2) NULL,
  prop_hours DECIMAL(8,2) NULL,
  -- Next inspection
  next_inspection_date DATE NULL,
  next_inspection_hours DECIMAL(8,2) NULL,
  -- Owner / Customer
  customer_name VARCHAR(200) NULL,
  -- Key dates
  first_flight_date DATE NULL,
  delivery_date DATE NULL,
  -- Flags
  financing_flag BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fleet_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  role VARCHAR(100) NULL,
  email VARCHAR(200) NULL,
  phone VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fleet_serial_numbers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id INT NOT NULL,
  component VARCHAR(100) NOT NULL,
  serial_number VARCHAR(200) NOT NULL,
  notes VARCHAR(300) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fleet_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id INT NOT NULL,
  event_date DATE NOT NULL,
  event_type ENUM('service','inspection','upgrade','incident','repaint','avionics_update','delivery','first_flight','other') NOT NULL DEFAULT 'other',
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  hours_at_event DECIMAL(8,2) NULL,
  logged_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fleet_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id INT NOT NULL,
  filename VARCHAR(300) NOT NULL,
  caption VARCHAR(200) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
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
  // NCR enrichment fields
  `ALTER TABLE nonconformity_reports ADD COLUMN IF NOT EXISTS full_name VARCHAR(100) NULL`,
  `ALTER TABLE nonconformity_reports ADD COLUMN IF NOT EXISTS part_assembly_number VARCHAR(100) NULL`,
  `ALTER TABLE nonconformity_reports ADD COLUMN IF NOT EXISTS drawing_number VARCHAR(100) NULL`,
  `ALTER TABLE nonconformity_reports ADD COLUMN IF NOT EXISTS is_safety_concern BOOLEAN NOT NULL DEFAULT FALSE`,
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

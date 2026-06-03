require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { pool } = require('../config/db');
const { DEFAULT_ROLE_PERMISSIONS, ROLES } = require('../config/permissions');

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
  component_type VARCHAR(120) NULL,
  component_name VARCHAR(180) NULL,
  serial_number VARCHAR(200) NOT NULL,
  date_installed DATE NULL,
  expiry_date DATE NULL,
  repack_date DATE NULL,
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
  category VARCHAR(100) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  uploaded_by INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_permission (role, permission_key)
);

CREATE TABLE IF NOT EXISTS fleet_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fleet_model_name (name)
);

CREATE TABLE IF NOT EXISTS fleet_config_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fleet_aircraft_config (
  aircraft_id INT NOT NULL,
  option_id   INT NOT NULL,
  PRIMARY KEY (aircraft_id, option_id),
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id)   REFERENCES fleet_config_options(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fleet_service_templates (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  category        VARCHAR(50)  NOT NULL DEFAULT 'General',
  title           VARCHAR(200) NOT NULL,
  interval_hours  INT          NULL,
  interval_months INT          NULL,
  description     TEXT         NULL,
  sort_order      INT          NOT NULL DEFAULT 0,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fleet_service_records (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id          INT          NOT NULL,
  template_id          INT          NOT NULL,
  completed_date       DATE         NOT NULL,
  hours_at_completion  DECIMAL(8,2) NULL,
  signed_by            VARCHAR(100) NOT NULL,
  notes                TEXT         NULL,
  logged_by            INT          NULL,
  created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES fleet_service_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by)   REFERENCES users(id)           ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fleet_planned_maintenance (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id          INT          NOT NULL,
  template_id          INT          NOT NULL,
  planned_date         DATE         NOT NULL,
  planned_comments     TEXT         NULL,
  status               ENUM('planned','completed') NOT NULL DEFAULT 'planned',
  completed_date       DATE         NULL,
  labor_hours          DECIMAL(8,2) NULL,
  additional_work      TEXT         NULL,
  signoff_notes        TEXT         NULL,
  signed_off_by        VARCHAR(100) NULL,
  signed_off_at        TIMESTAMP    NULL,
  planned_by           INT          NULL,
  completed_record_id  INT          NULL,
  created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id)         REFERENCES fleet_aircraft(id)         ON DELETE CASCADE,
  FOREIGN KEY (template_id)         REFERENCES fleet_service_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (planned_by)          REFERENCES users(id)                  ON DELETE SET NULL,
  FOREIGN KEY (completed_record_id) REFERENCES fleet_service_records(id)  ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fleet_event_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'badge-ghost',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fleet_paperwork (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id   INT          NOT NULL,
  filename      VARCHAR(300) NOT NULL,
  original_name VARCHAR(300) NOT NULL,
  mimetype      VARCHAR(100) NOT NULL DEFAULT '',
  size_bytes    INT          NOT NULL DEFAULT 0,
  title         VARCHAR(200) NULL,
  category      VARCHAR(100) NULL,
  uploaded_by   INT          NULL,
  uploaded_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fleet_bulletins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  component_type VARCHAR(120) NULL,
  component_name VARCHAR(180) NULL,
  serial_prefix VARCHAR(120) NOT NULL,
  details TEXT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_by INT NULL,
  closed_by INT NULL,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fleet_bulletin_aircraft (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bulletin_id INT NOT NULL,
  aircraft_id INT NOT NULL,
  serial_id INT NULL,
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  resolution_notes TEXT NULL,
  resolved_extra_work TEXT NULL,
  labor_hours DECIMAL(8,2) NULL,
  signed_off_by VARCHAR(120) NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bulletin_id) REFERENCES fleet_bulletins(id) ON DELETE CASCADE,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (serial_id) REFERENCES fleet_serial_numbers(id) ON DELETE SET NULL,
  UNIQUE KEY uq_bulletin_aircraft (bulletin_id, aircraft_id, serial_id)
);

CREATE TABLE IF NOT EXISTS fleet_part_replacements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id INT NOT NULL,
  component_serial_id INT NULL,
  component_type VARCHAR(120) NULL,
  component_name VARCHAR(180) NULL,
  old_part_serial VARCHAR(120) NOT NULL,
  new_part_serial VARCHAR(120) NOT NULL,
  reason TEXT NULL,
  replacement_date DATE NOT NULL,
  flight_hours DECIMAL(8,2) NULL,
  technician VARCHAR(120) NULL,
  notes TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE,
  FOREIGN KEY (component_serial_id) REFERENCES fleet_serial_numbers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── Paint codes per aircraft (multiple paints per aircraft) ────────────────
CREATE TABLE IF NOT EXISTS fleet_paints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  aircraft_id INT NOT NULL,
  color_name VARCHAR(120) NOT NULL,
  paint_code VARCHAR(120) NULL,
  area VARCHAR(120) NULL,
  notes VARCHAR(300) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (aircraft_id) REFERENCES fleet_aircraft(id) ON DELETE CASCADE
);

-- ─── Service Bulletin → affected config options (parts that aircraft has) ───
CREATE TABLE IF NOT EXISTS fleet_bulletin_config_options (
  bulletin_id INT NOT NULL,
  option_id INT NOT NULL,
  PRIMARY KEY (bulletin_id, option_id),
  FOREIGN KEY (bulletin_id) REFERENCES fleet_bulletins(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id)   REFERENCES fleet_config_options(id) ON DELETE CASCADE
);

-- ─── Planned-maintenance items (multiple per planned-maintenance entry) ─────
CREATE TABLE IF NOT EXISTS fleet_planned_maintenance_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  planned_id INT NOT NULL,
  template_id INT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  signed_off BOOLEAN NOT NULL DEFAULT FALSE,
  signed_off_by VARCHAR(120) NULL,
  signed_off_at TIMESTAMP NULL,
  signed_off_record_id INT NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planned_id) REFERENCES fleet_planned_maintenance(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES fleet_service_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (signed_off_record_id) REFERENCES fleet_service_records(id) ON DELETE SET NULL
);

-- ─── Maintenance item photos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_maintenance_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  caption VARCHAR(300) NULL,
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES fleet_planned_maintenance_items(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── CRM: Customers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  preferred_language VARCHAR(50) NULL,
  source ENUM('website','email','phone','instagram','facebook','aero','dealer','existing_customer','referral','other') DEFAULT 'other',
  interested_aircraft VARCHAR(255) NULL,
  customer_type ENUM('new_buyer','existing_owner','dealer','service_customer','other') DEFAULT 'new_buyer',
  status ENUM('new','contacted','waiting_reply','active_discussion','quote_sent','test_flight_planned','problem_support','closed_won','closed_lost','future_prospect') DEFAULT 'new',
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  assigned_employee_id INT NULL,
  general_notes TEXT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  last_contact_date DATETIME NULL,
  next_followup_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_employee_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─── CRM: Aircraft configuration quotes (buying process) ─────────────────────
CREATE TABLE IF NOT EXISTS customer_quotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  model_id INT NULL,
  model_name VARCHAR(120) NULL,
  title VARCHAR(200) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES fleet_models(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_quote_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quote_id INT NOT NULL,
  option_id INT NULL,
  option_label VARCHAR(200) NOT NULL,
  option_category VARCHAR(100) NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES customer_quotes(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES fleet_config_options(id) ON DELETE SET NULL
);

-- ─── CRM: Customer communication logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  date_time DATETIME NOT NULL,
  employee_id INT NULL,
  employee_name VARCHAR(255) NULL,
  contact_type ENUM('email','phone_call','whatsapp','sms','instagram','facebook','meeting','event','internal_note','other') DEFAULT 'other',
  category ENUM('sales','support','service','problem','delivery','warranty','general_question','other') DEFAULT 'other',
  title VARCHAR(255) NOT NULL,
  detailed_notes TEXT NULL,
  customer_question TEXT NULL,
  blackwing_answer TEXT NULL,
  follow_up_needed BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_date DATE NULL,
  follow_up_responsible VARCHAR(255) NULL,
  entry_status ENUM('open','waiting_customer','waiting_blackwing','solved','closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE SET NULL
);
`;

// Additive column additions — safe to re-run on an existing database.
// MariaDB 10.0+ supports ADD COLUMN IF NOT EXISTS.
const ALTER_STMTS = [
  `ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'worker'`,
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
  // Fleet W&B wheel weights
  `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS nose_wheel_weight DECIMAL(8,2) NULL`,
  `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS left_wheel_weight  DECIMAL(8,2) NULL`,
  `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS right_wheel_weight DECIMAL(8,2) NULL`,
  // Fleet event type column widening
  `ALTER TABLE fleet_events MODIFY COLUMN event_type VARCHAR(100) NOT NULL DEFAULT 'other'`,
  // Cover image flag for aircraft gallery
  `ALTER TABLE fleet_images ADD COLUMN IF NOT EXISTS is_cover BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE fleet_images ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS component_type VARCHAR(120) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS component_name VARCHAR(180) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS date_installed DATE NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS expiry_date DATE NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS repack_date DATE NULL`,
  // Components — extra fields
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS software_version VARCHAR(120) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS system_id VARCHAR(120) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS password VARCHAR(255) NULL`,
  // Components — uninstall tracking (replaces fleet_part_replacements concept)
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS uninstalled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS uninstalled_at DATE NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS uninstall_reason TEXT NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS uninstall_tsn DECIMAL(8,2) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS uninstall_technician VARCHAR(120) NULL`,
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS uninstall_notes TEXT NULL`,
  // Aircraft — "we service this one" flag
  `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS serviced_by_us BOOLEAN NOT NULL DEFAULT FALSE`,
  // Service bulletins — new fields (existing schema kept compatible)
  `ALTER TABLE fleet_bulletins ADD COLUMN IF NOT EXISTS category ENUM('mandatory','obligatory','recommended','optional') NOT NULL DEFAULT 'optional'`,
  `ALTER TABLE fleet_bulletins ADD COLUMN IF NOT EXISTS reason TEXT NULL`,
  `ALTER TABLE fleet_bulletins ADD COLUMN IF NOT EXISTS what_to_do TEXT NULL`,
  `ALTER TABLE fleet_bulletins MODIFY COLUMN serial_prefix VARCHAR(120) NULL`,
  // Planned maintenance — multi-item support
  `ALTER TABLE fleet_planned_maintenance MODIFY COLUMN template_id INT NULL`,
  `ALTER TABLE fleet_planned_maintenance ADD COLUMN IF NOT EXISTS planned_arrival_date DATE NULL`,
  `ALTER TABLE fleet_planned_maintenance ADD COLUMN IF NOT EXISTS assigned_technician_id INT NULL`,
  // Aircraft models — configurator visibility + base price
  `ALTER TABLE fleet_models ADD COLUMN IF NOT EXISTS show_in_configurator BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE fleet_models ADD COLUMN IF NOT EXISTS base_price DECIMAL(12,2) NULL`,
  // Config options — standard (pre-selected) flag + price + configurator visibility
  `ALTER TABLE fleet_config_options ADD COLUMN IF NOT EXISTS is_standard BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE fleet_config_options ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) NULL`,
  // Default TRUE so all existing options stay visible; admins can hide legacy/retired ones
  `ALTER TABLE fleet_config_options ADD COLUMN IF NOT EXISTS show_in_configurator BOOLEAN NOT NULL DEFAULT TRUE`,
  // Customer quotes — VAT rate
  `ALTER TABLE customer_quotes ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00`,
  // Customer quote options — price snapshot captured at time of saving
  `ALTER TABLE customer_quote_options ADD COLUMN IF NOT EXISTS option_price DECIMAL(10,2) NULL`,
  // Planned maintenance — link to CRM customer
  `ALTER TABLE fleet_planned_maintenance ADD COLUMN IF NOT EXISTS customer_id INT NULL`,
  // Planned maintenance items — individual completion date
  `ALTER TABLE fleet_planned_maintenance_items ADD COLUMN IF NOT EXISTS completed_date DATE NULL`,
  // Service templates — one-time milestone flag (25h initial, 200h, 600h, etc.)
  // These fire ONCE at a specific TSN value (±10h tolerance) instead of every
  // N hours, and supersede the recurring 100h-or-12mo check when active.
  `ALTER TABLE fleet_service_templates ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN NOT NULL DEFAULT FALSE`,
  // Auto-flag common one-time inspections so existing data behaves correctly
  // without requiring the user to flip the flag manually. Only flips false→true,
  // so it's idempotent and won't unflag templates the user intentionally toggled.
  `UPDATE fleet_service_templates SET is_one_time = TRUE WHERE interval_hours IN (25, 200, 600) AND is_one_time = FALSE`,
  // Component types lookup table (managed in Admin Panel)
  `CREATE TABLE IF NOT EXISTS fleet_component_types (
     id INT AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(120) NOT NULL UNIQUE,
     sort_order INT NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  // Per-item assigned technician
  `ALTER TABLE fleet_planned_maintenance_items ADD COLUMN IF NOT EXISTS assigned_technician_id INT NULL`,
  // Component manufacturing / overhaul date
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS manufacturing_date DATE NULL`,
  // Toe-in measurements (degrees) for left/right main gear
  `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS toe_in_left DECIMAL(5,2) NULL`,
  `ALTER TABLE fleet_aircraft ADD COLUMN IF NOT EXISTS toe_in_right DECIMAL(5,2) NULL`,
  // Type-specific extra fields for components (JSON: propeller blades/hub/spinner, governor details, etc.)
  `ALTER TABLE fleet_serial_numbers ADD COLUMN IF NOT EXISTS extra_data TEXT NULL`,
  // Key-value settings store (admin-editable thresholds etc.)
  `CREATE TABLE IF NOT EXISTS fleet_settings (
     setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
     setting_value VARCHAR(255) NULL,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   )`,
  // Seed default toe-in thresholds (INSERT IGNORE keeps admin overrides on re-run)
  `INSERT IGNORE INTO fleet_settings (setting_key, setting_value) VALUES
     ('toe_in_wheel_min', '0'),
     ('toe_in_wheel_max', '1'),
     ('toe_in_total_min', '0.4'),
     ('toe_in_total_max', '2')`,
  // serial_number was originally NOT NULL but is optional (some components have no serial)
  `ALTER TABLE fleet_serial_numbers MODIFY COLUMN serial_number VARCHAR(200) NULL`,
  // Admin-managed component name list (per type), used as dropdown when adding components
  `CREATE TABLE IF NOT EXISTS fleet_component_names (
     id INT AUTO_INCREMENT PRIMARY KEY,
     component_type VARCHAR(120) NOT NULL,
     name VARCHAR(180) NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  // Software version change log per component serial
  `CREATE TABLE IF NOT EXISTS fleet_serial_version_logs (
     id INT AUTO_INCREMENT PRIMARY KEY,
     serial_id INT NOT NULL,
     old_version VARCHAR(120) NULL,
     new_version VARCHAR(120) NULL,
     updated_by_name VARCHAR(120) NULL,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (serial_id) REFERENCES fleet_serial_numbers(id) ON DELETE CASCADE
   )`,
  // Bulletin serial criteria (match by component type + serial number range/exact)
  `CREATE TABLE IF NOT EXISTS fleet_bulletin_serial_criteria (
     id INT AUTO_INCREMENT PRIMARY KEY,
     bulletin_id INT NOT NULL,
     component_type VARCHAR(120) NOT NULL,
     component_name VARCHAR(180) NULL,
     serial_from VARCHAR(120) NULL,
     serial_to   VARCHAR(120) NULL,
     exact_serial VARCHAR(120) NULL,
     FOREIGN KEY (bulletin_id) REFERENCES fleet_bulletins(id) ON DELETE CASCADE
   )`,
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

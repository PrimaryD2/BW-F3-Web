export async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('Admin','Supervisor','Worker') NOT NULL DEFAULT 'Worker',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS airplanes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      serial_number VARCHAR(80) NOT NULL UNIQUE,
      model VARCHAR(120) NOT NULL DEFAULT 'F3 Carbon 2-Seater',
      status ENUM('Draft','In Progress','QC Review','Completed','Archived') NOT NULL DEFAULT 'Draft',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      archived_at DATETIME NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      station_id INT NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NULL,
      estimated_minutes INT NOT NULL DEFAULT 0,
      order_index INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS task_instances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      airplane_id INT NOT NULL,
      template_id INT NULL,
      station_id INT NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NULL,
      estimated_minutes INT NOT NULL DEFAULT 0,
      order_index INT NOT NULL DEFAULT 0,
      status ENUM('Not Started','In Progress','Pending Sign-off','Signed','Double-Signed') NOT NULL DEFAULT 'Not Started',
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (airplane_id) REFERENCES airplanes(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS task_signoffs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_instance_id INT NOT NULL,
      signed_by_user_id INT NOT NULL,
      signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      signature_type ENUM('primary','double') NOT NULL,
      UNIQUE KEY unique_signature (task_instance_id, signature_type),
      FOREIGN KEY (task_instance_id) REFERENCES task_instances(id) ON DELETE CASCADE,
      FOREIGN KEY (signed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS time_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_instance_id INT NOT NULL,
      user_id INT NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME NULL,
      duration_minutes INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_instance_id) REFERENCES task_instances(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX active_timer (task_instance_id, user_id, ended_at)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS loss_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_instance_id INT NOT NULL,
      user_id INT NOT NULL,
      reason ENUM('walked_to_warehouse','fix_issue','missing_tools','waiting_for_material','machine_downtime','other') NOT NULL,
      duration_minutes INT NOT NULL,
      notes TEXT NULL,
      logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_instance_id) REFERENCES task_instances(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS nonconformity_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      airplane_id INT NOT NULL,
      task_instance_id INT NULL,
      station_id INT NOT NULL,
      reported_by INT NOT NULL,
      description TEXT NOT NULL,
      severity ENUM('low','medium','high') NOT NULL,
      status ENUM('open','under_review','resolved') NOT NULL DEFAULT 'open',
      resolution_notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      FOREIGN KEY (airplane_id) REFERENCES airplanes(id) ON DELETE CASCADE,
      FOREIGN KEY (task_instance_id) REFERENCES task_instances(id) ON DELETE SET NULL,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ncr_approvals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ncr_id INT NOT NULL,
      approved_by INT NOT NULL,
      approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action VARCHAR(80) NOT NULL,
      notes TEXT NULL,
      FOREIGN KEY (ncr_id) REFERENCES nonconformity_reports(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id INT NULL,
      action VARCHAR(80) NOT NULL,
      details JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

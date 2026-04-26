import bcrypt from "bcryptjs";
import { pool, withTransaction } from "../db/pool.js";
import { AppError } from "../utils/errors.js";
import { audit } from "./auditService.js";

export const airplaneStatuses = ["Draft", "In Progress", "QC Review", "Completed", "Archived"];
export const taskStatuses = ["Not Started", "In Progress", "Pending Sign-off", "Signed", "Double-Signed"];
export const lossReasons = ["walked_to_warehouse", "fix_issue", "missing_tools", "waiting_for_material", "machine_downtime", "other"];

export async function listAirplanes(filter = "active") {
  let where = "WHERE a.status <> 'Archived'";
  if (filter === "completed") where = "WHERE a.status = 'Completed'";
  if (filter === "archived") where = "WHERE a.status = 'Archived'";
  if (filter === "all") where = "";

  const [rows] = await pool.query(`
    SELECT a.*,
      COUNT(ti.id) AS total_tasks,
      SUM(ti.status = 'Double-Signed') AS completed_tasks
    FROM airplanes a
    LEFT JOIN task_instances ti ON ti.airplane_id = a.id
    ${where}
    GROUP BY a.id
    ORDER BY a.updated_at DESC
  `);
  return rows.map((row) => ({ ...row, completionPercent: percent(row.completed_tasks, row.total_tasks) }));
}

export async function createAirplane(user, data) {
  return withTransaction(async (db) => {
    const [result] = await db.query(
      "INSERT INTO airplanes (serial_number, model, status) VALUES (?, ?, ?)",
      [data.serialNumber, data.model || "F3 Carbon 2-Seater", data.status || "Draft"]
    );
    const airplaneId = result.insertId;
    const [templates] = await db.query(`
      SELECT id, station_id, title, description, estimated_minutes, order_index
      FROM task_templates
      WHERE active = TRUE
      ORDER BY station_id, order_index
    `);

    for (const template of templates) {
      await db.query(
        `INSERT INTO task_instances
          (airplane_id, template_id, station_id, title, description, estimated_minutes, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          airplaneId,
          template.id,
          template.station_id,
          template.title,
          template.description,
          template.estimated_minutes,
          template.order_index
        ]
      );
    }

    await audit(user.id, "airplane", airplaneId, "airplane_created", { serialNumber: data.serialNumber });
    return airplaneId;
  });
}

export async function getAirplaneDetail(id) {
  const [[airplane]] = await pool.query("SELECT * FROM airplanes WHERE id = ?", [id]);
  if (!airplane) throw new AppError("Airplane not found", 404);

  const [stations] = await pool.query("SELECT * FROM stations ORDER BY id");
  const [tasks] = await pool.query(`
    SELECT ti.*,
      s.name AS station_name,
      COALESCE(SUM(tl.duration_minutes), 0) AS actual_minutes,
      SUM(ncr.status <> 'resolved' AND ncr.severity = 'high') AS blocking_ncrs
    FROM task_instances ti
    JOIN stations s ON s.id = ti.station_id
    LEFT JOIN time_logs tl ON tl.task_instance_id = ti.id AND tl.ended_at IS NOT NULL
    LEFT JOIN nonconformity_reports ncr ON ncr.task_instance_id = ti.id
    WHERE ti.airplane_id = ?
    GROUP BY ti.id
    ORDER BY s.id, ti.order_index
  `, [id]);
  const [signoffs] = await pool.query(`
    SELECT ts.*, u.name AS signed_by_name
    FROM task_signoffs ts
    JOIN users u ON u.id = ts.signed_by_user_id
    WHERE ts.task_instance_id IN (SELECT id FROM task_instances WHERE airplane_id = ?)
  `, [id]);
  const [ncrs] = await pool.query(`
    SELECT ncr.*, s.name AS station_name, u.name AS reported_by_name
    FROM nonconformity_reports ncr
    JOIN stations s ON s.id = ncr.station_id
    JOIN users u ON u.id = ncr.reported_by
    WHERE ncr.airplane_id = ?
    ORDER BY ncr.created_at DESC
  `, [id]);

  const signoffsByTask = signoffs.reduce((acc, signoff) => {
    acc[signoff.task_instance_id] ||= {};
    acc[signoff.task_instance_id][signoff.signature_type] = signoff;
    return acc;
  }, {});
  const tasksByStation = stations.map((station) => {
    const stationTasks = tasks
      .filter((task) => task.station_id === station.id)
      .map((task) => ({ ...task, signoffs: signoffsByTask[task.id] || {} }));
    return {
      ...station,
      tasks: stationTasks,
      completionPercent: percent(stationTasks.filter((task) => task.status === "Double-Signed").length, stationTasks.length)
    };
  });

  return { airplane, stations: tasksByStation, ncrs };
}

export async function updateAirplaneStatus(user, id, status) {
  if (!airplaneStatuses.includes(status)) throw new AppError("Invalid airplane status", 400);
  const completedAt = status === "Completed" ? new Date() : null;
  const archivedAt = status === "Archived" ? new Date() : null;
  await pool.query("UPDATE airplanes SET status = ?, completed_at = COALESCE(?, completed_at), archived_at = COALESCE(?, archived_at) WHERE id = ?", [status, completedAt, archivedAt, id]);
  await audit(user.id, "airplane", id, "airplane_status_changed", { status });
}

export async function assertTaskCanStart(taskId) {
  const [[task]] = await pool.query("SELECT * FROM task_instances WHERE id = ?", [taskId]);
  if (!task) throw new AppError("Task not found", 404);
  const [[previousOpen]] = await pool.query(`
    SELECT id FROM task_instances
    WHERE airplane_id = ? AND station_id = ? AND order_index < ? AND status <> 'Double-Signed'
    LIMIT 1
  `, [task.airplane_id, task.station_id, task.order_index]);
  if (previousOpen) throw new AppError("Previous task in this station must be double-signed first", 409);
  return task;
}

export async function startTask(user, taskId) {
  const task = await assertTaskCanStart(taskId);
  if (task.status === "Not Started") {
    await pool.query("UPDATE task_instances SET status = 'In Progress', started_at = COALESCE(started_at, NOW()) WHERE id = ?", [taskId]);
    await audit(user.id, "task_instance", taskId, "task_status_changed", { status: "In Progress" });
  }
}

export async function completeTask(user, taskId, notes) {
  const [[task]] = await pool.query("SELECT * FROM task_instances WHERE id = ?", [taskId]);
  if (!task) throw new AppError("Task not found", 404);
  if (task.status !== "In Progress") throw new AppError("Only in-progress tasks can be completed", 409);
  await pool.query(
    "UPDATE task_instances SET status = 'Pending Sign-off', completed_at = NOW(), notes = COALESCE(?, notes) WHERE id = ?",
    [notes || null, taskId]
  );
  await audit(user.id, "task_instance", taskId, "task_status_changed", { status: "Pending Sign-off" });
}

export async function startTimer(user, taskId) {
  await assertTaskCanStart(taskId);
  const [[active]] = await pool.query(
    "SELECT id FROM time_logs WHERE task_instance_id = ? AND user_id = ? AND ended_at IS NULL",
    [taskId, user.id]
  );
  if (active) throw new AppError("You already have an active timer on this task", 409);
  await startTask(user, taskId);
  const [result] = await pool.query(
    "INSERT INTO time_logs (task_instance_id, user_id, started_at) VALUES (?, ?, NOW())",
    [taskId, user.id]
  );
  await audit(user.id, "time_log", result.insertId, "timer_started", { taskId });
  return result.insertId;
}

export async function stopTimer(user, taskId, loss) {
  return withTransaction(async (db) => {
    const [[timer]] = await db.query(
      "SELECT * FROM time_logs WHERE task_instance_id = ? AND user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      [taskId, user.id]
    );
    if (!timer) throw new AppError("No active timer found", 404);
    await db.query(
      "UPDATE time_logs SET ended_at = NOW(), duration_minutes = GREATEST(1, TIMESTAMPDIFF(MINUTE, started_at, NOW())) WHERE id = ?",
      [timer.id]
    );
    if (loss?.reason && Number(loss.durationMinutes) > 0) {
      await db.query(
        "INSERT INTO loss_logs (task_instance_id, user_id, reason, duration_minutes, notes) VALUES (?, ?, ?, ?, ?)",
        [taskId, user.id, loss.reason, Number(loss.durationMinutes), loss.notes || null]
      );
    }
    await audit(user.id, "time_log", timer.id, "timer_stopped", { taskId, lossReason: loss?.reason || null });
    return timer.id;
  });
}

export async function signTask(user, taskId, password, signatureType) {
  if (!["primary", "double"].includes(signatureType)) throw new AppError("Invalid signature type", 400);
  const [[authUser]] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [user.id]);
  const matches = await bcrypt.compare(password || "", authUser.password_hash);
  if (!matches) throw new AppError("Password confirmation failed", 401);

  return withTransaction(async (db) => {
    const [[task]] = await db.query("SELECT * FROM task_instances WHERE id = ?", [taskId]);
    if (!task) throw new AppError("Task not found", 404);
    const [[blocker]] = await db.query(
      "SELECT id FROM nonconformity_reports WHERE task_instance_id = ? AND severity = 'high' AND status <> 'resolved' LIMIT 1",
      [taskId]
    );
    if (blocker) throw new AppError("High severity NCR must be resolved before sign-off", 409);

    const [existing] = await db.query("SELECT * FROM task_signoffs WHERE task_instance_id = ?", [taskId]);
    if (signatureType === "primary" && task.status !== "Pending Sign-off") throw new AppError("Task must be pending sign-off", 409);
    if (signatureType === "double") {
      const primary = existing.find((row) => row.signature_type === "primary");
      if (!primary) throw new AppError("Primary sign-off is required first", 409);
      if (primary.signed_by_user_id === user.id && user.role !== "Supervisor") {
        throw new AppError("Double sign-off must be completed by a different user", 409);
      }
    }

    await db.query(
      "INSERT INTO task_signoffs (task_instance_id, signed_by_user_id, signature_type) VALUES (?, ?, ?)",
      [taskId, user.id, signatureType]
    );
    await db.query(
      "UPDATE task_instances SET status = ? WHERE id = ?",
      [signatureType === "primary" ? "Signed" : "Double-Signed", taskId]
    );
    await audit(user.id, "task_instance", taskId, signatureType === "primary" ? "task_signed" : "task_double_signed", {});
  });
}

function percent(done, total) {
  if (!Number(total)) return 0;
  return Math.round((Number(done || 0) / Number(total)) * 100);
}

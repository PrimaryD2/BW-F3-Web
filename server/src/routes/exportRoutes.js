import { Router } from "express";
import PDFDocument from "pdfkit";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, AppError } from "../utils/errors.js";

const router = Router();
router.use(requireAuth);

router.get("/airplanes/:airplaneId/stations/:stationId/task-sheet.pdf", asyncHandler(async (req, res) => {
  const [[airplane]] = await pool.query("SELECT * FROM airplanes WHERE id = ?", [req.params.airplaneId]);
  const [[station]] = await pool.query("SELECT * FROM stations WHERE id = ?", [req.params.stationId]);
  if (!airplane || !station) throw new AppError("Airplane or station not found", 404);

  const [tasks] = await pool.query(`
    SELECT ti.*,
      COALESCE(SUM(tl.duration_minutes),0) AS actual_minutes
    FROM task_instances ti
    LEFT JOIN time_logs tl ON tl.task_instance_id = ti.id
    WHERE ti.airplane_id = ? AND ti.station_id = ?
    GROUP BY ti.id
    ORDER BY ti.order_index
  `, [req.params.airplaneId, req.params.stationId]);
  const [signoffs] = await pool.query(`
    SELECT ts.*, u.name
    FROM task_signoffs ts
    JOIN users u ON u.id = ts.signed_by_user_id
    WHERE ts.task_instance_id IN (SELECT id FROM task_instances WHERE airplane_id = ? AND station_id = ?)
  `, [req.params.airplaneId, req.params.stationId]);
  const byTask = signoffs.reduce((acc, row) => {
    acc[row.task_instance_id] ||= {};
    acc[row.task_instance_id][row.signature_type] = row;
    return acc;
  }, {});

  const doc = makePdf(res, `task-sheet-${airplane.serial_number}-${station.name}.pdf`);
  doc.fontSize(18).text(`Task Sheet: ${airplane.serial_number} / ${station.name}`);
  doc.moveDown();
  doc.fontSize(10).text(`Model: ${airplane.model}`);
  doc.text(`Status: ${airplane.status}`);
  doc.moveDown();
  let totalEstimated = 0;
  let totalActual = 0;
  tasks.forEach((task) => {
    totalEstimated += Number(task.estimated_minutes || 0);
    totalActual += Number(task.actual_minutes || 0);
    doc.fontSize(12).text(`${task.order_index}. ${task.title} - ${task.status}`, { underline: true });
    doc.fontSize(9).text(task.description || "");
    doc.text(`Estimated: ${task.estimated_minutes} min | Actual: ${task.actual_minutes} min`);
    doc.text(`Notes: ${task.notes || ""}`);
    doc.text(`Primary: ${formatSignoff(byTask[task.id]?.primary)}`);
    doc.text(`Double: ${formatSignoff(byTask[task.id]?.double)}`);
    doc.moveDown();
  });
  doc.fontSize(12).text(`Total estimated: ${totalEstimated} min`);
  doc.text(`Total actual: ${totalActual} min`);
  doc.end();
}));

router.get("/ncrs/:id.pdf", asyncHandler(async (req, res) => {
  const [[ncr]] = await pool.query(`
    SELECT ncr.*, a.serial_number, s.name AS station_name, ti.title AS task_title, u.name AS reporter
    FROM nonconformity_reports ncr
    JOIN airplanes a ON a.id = ncr.airplane_id
    JOIN stations s ON s.id = ncr.station_id
    LEFT JOIN task_instances ti ON ti.id = ncr.task_instance_id
    JOIN users u ON u.id = ncr.reported_by
    WHERE ncr.id = ?
  `, [req.params.id]);
  if (!ncr) throw new AppError("NCR not found", 404);
  const [approvals] = await pool.query(`
    SELECT na.*, u.name
    FROM ncr_approvals na
    JOIN users u ON u.id = na.approved_by
    WHERE na.ncr_id = ?
    ORDER BY na.approved_at
  `, [req.params.id]);
  const doc = makePdf(res, `ncr-${ncr.id}.pdf`);
  doc.fontSize(18).text(`NCR ${ncr.id}: ${ncr.serial_number}`);
  doc.moveDown();
  doc.fontSize(10).text(`Station: ${ncr.station_name}`);
  doc.text(`Task: ${ncr.task_title || "Station-level"}`);
  doc.text(`Severity: ${ncr.severity}`);
  doc.text(`Status: ${ncr.status}`);
  doc.text(`Reporter: ${ncr.reporter}`);
  doc.text(`Created: ${ncr.created_at}`);
  doc.moveDown();
  doc.fontSize(12).text("Description");
  doc.fontSize(10).text(ncr.description);
  doc.moveDown();
  doc.fontSize(12).text("Resolution Notes");
  doc.fontSize(10).text(ncr.resolution_notes || "");
  doc.moveDown();
  doc.fontSize(12).text("Approval History");
  approvals.forEach((approval) => {
    doc.fontSize(10).text(`${approval.approved_at} - ${approval.action} by ${approval.name}: ${approval.notes || ""}`);
  });
  doc.end();
}));

function makePdf(res, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${filename}`);
  const doc = new PDFDocument({ margin: 42 });
  doc.pipe(res);
  return doc;
}

function formatSignoff(signoff) {
  return signoff ? `${signoff.name} at ${signoff.signed_at}` : "Not signed";
}

export default router;

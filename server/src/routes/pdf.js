const express = require('express');
const PDFDocument = require('pdfkit');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

// GET /api/pdf/task-sheet/:airplaneId/:stationId
router.get('/task-sheet/:airplaneId/:stationId', async (req, res) => {
  const { airplaneId, stationId } = req.params;
  try {
    const planes = await query('SELECT * FROM airplanes WHERE id = ?', [airplaneId]);
    const stations = await query('SELECT * FROM stations WHERE id = ?', [stationId]);
    if (!planes.length || !stations.length) return res.status(404).json({ error: 'Not found' });
    const airplane = planes[0];
    const station = stations[0];

    const tasks = await query(
      `SELECT ti.*, tt.title, tt.description, tt.estimated_minutes, tt.order_index
       FROM task_instances ti
       JOIN task_templates tt ON ti.template_id = tt.id
       WHERE ti.airplane_id = ? AND ti.station_id = ?
       ORDER BY tt.order_index`,
      [airplaneId, stationId]
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="task-sheet-${airplane.serial_number}-${station.name}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('F3 PRODUCTION MANAGEMENT', { align: 'center' });
    doc.fontSize(14).font('Helvetica').text('Task Sheet', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Aircraft info
    doc.fontSize(11).font('Helvetica-Bold').text(`Aircraft Serial: ${airplane.serial_number}   |   Model: ${airplane.model}`);
    doc.font('Helvetica').text(`Station: ${station.name}   |   Status: ${airplane.status.toUpperCase()}`);
    doc.text(`Generated: ${formatDate(new Date())}`);
    doc.moveDown();

    for (const task of tasks) {
      const signoffs = await query(
        `SELECT ts.*, u.name AS signed_by_name FROM task_signoffs ts
         JOIN users u ON ts.signed_by_user_id = u.id
         WHERE ts.task_instance_id = ? ORDER BY ts.signed_at`,
        [task.id]
      );
      const timeLogs = await query(
        `SELECT tl.*, u.name AS user_name FROM time_logs tl
         JOIN users u ON tl.user_id = u.id
         WHERE tl.task_instance_id = ? AND tl.ended_at IS NOT NULL`,
        [task.id]
      );
      const totalMinutes = timeLogs.reduce((s, l) => s + parseFloat(l.duration_minutes || 0), 0);

      // Task box
      if (doc.y > 680) doc.addPage();
      const startY = doc.y;
      doc.rect(50, startY, 495, 14).fill('#1a1a2e').stroke();
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
        .text(`${task.order_index}. ${task.title}`, 55, startY + 2, { width: 480 });
      doc.fillColor('black');
      doc.moveDown(0.3);

      doc.fontSize(9).font('Helvetica').text(task.description || '', 55, doc.y, { width: 480 });
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text(
        `Estimated: ${task.estimated_minutes} min   |   Actual: ${Math.round(totalMinutes)} min   |   Status: ${task.status.replace(/_/g, ' ').toUpperCase()}`,
        55, doc.y
      );

      if (task.notes) {
        doc.moveDown(0.2);
        doc.font('Helvetica').fillColor('#444').text(`Notes: ${task.notes}`, 55, doc.y, { width: 480 });
        doc.fillColor('black');
      }

      doc.moveDown(0.3);
      const primary = signoffs.find(s => s.signature_type === 'primary');
      const dbl = signoffs.find(s => s.signature_type === 'double');
      doc.font('Helvetica').fontSize(9)
        .text(`Primary Sign-off: ${primary ? `${primary.signed_by_name} — ${formatDate(primary.signed_at)}` : '__________________________'}`, 55, doc.y);
      doc.text(`Double Sign-off:  ${dbl ? `${dbl.signed_by_name} — ${formatDate(dbl.signed_at)}` : '__________________________'}`, 55, doc.y);
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).dash(3, { space: 3 }).stroke();
      doc.undash().moveDown(0.5);
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' });
  }
});

// GET /api/pdf/ncr/:id
router.get('/ncr/:id', async (req, res) => {
  try {
    const ncr = await query(
      `SELECT ncr.*, u.name AS reporter_name, a.serial_number, a.model,
              s.name AS station_name
       FROM nonconformity_reports ncr
       JOIN users u ON ncr.reported_by = u.id
       JOIN airplanes a ON ncr.airplane_id = a.id
       JOIN stations s ON ncr.station_id = s.id
       WHERE ncr.id = ?`,
      [req.params.id]
    );
    if (!ncr.length) return res.status(404).json({ error: 'NCR not found' });
    const n = ncr[0];

    const approvals = await query(
      `SELECT na.*, u.name AS approver_name FROM ncr_approvals na
       JOIN users u ON na.approved_by = u.id
       WHERE na.ncr_id = ? ORDER BY na.approved_at`,
      [req.params.id]
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="NCR-${n.id}-${n.serial_number}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('NONCONFORMITY REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    const sevColors = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
    doc.fontSize(11).font('Helvetica-Bold').text(`NCR #${n.id}`);
    doc.font('Helvetica').text(`Aircraft: ${n.serial_number} (${n.model})`);
    doc.text(`Station: ${n.station_name}`);
    doc.text(`Reported By: ${n.reporter_name}`);
    doc.text(`Reported At: ${formatDate(n.created_at)}`);
    doc.text(`Severity: ${n.severity.toUpperCase()}`, { continued: false });
    doc.text(`Status: ${n.status.replace(/_/g, ' ').toUpperCase()}`);
    if (n.resolved_at) doc.text(`Resolved At: ${formatDate(n.resolved_at)}`);
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Description:');
    doc.font('Helvetica').text(n.description, { width: 495 });
    doc.moveDown();

    if (n.resolution_notes) {
      doc.font('Helvetica-Bold').text('Resolution Notes:');
      doc.font('Helvetica').text(n.resolution_notes, { width: 495 });
      doc.moveDown();
    }

    if (approvals.length > 0) {
      doc.font('Helvetica-Bold').text('Approval / Action History:');
      doc.moveDown(0.3);
      for (const a of approvals) {
        doc.font('Helvetica').fontSize(10)
          .text(`• ${formatDate(a.approved_at)} — ${a.approver_name}: ${a.action}`);
        if (a.notes) doc.text(`  Notes: ${a.notes}`, { indent: 15 });
      }
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;

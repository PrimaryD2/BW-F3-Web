// Shared constants — used by both server (CommonJS require) and client (Vite bundler handles CJS)

const STATIONS = ['F3-Prep', 'F3-S1', 'F3-S2', 'F3-S3a', 'F3-S3B', 'F3-S4'];

const LOSS_REASONS = {
  walked_to_warehouse: 'Walked to Warehouse',
  fix_issue: 'Fix Issue',
  missing_tools: 'Missing Tools',
  waiting_for_material: 'Waiting for Material',
  machine_downtime: 'Machine Downtime',
  other: 'Other',
};

const TASK_STATUS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  pending_signoff: 'Pending Sign-off',
  signed: 'Signed',
  double_signed: 'Double Signed',
};

const AIRPLANE_STATUS = {
  draft: 'Draft',
  in_progress: 'In Progress',
  qc_review: 'QC Review',
  completed: 'Completed',
};

const NCR_SEVERITY = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const NCR_STATUS = {
  open: 'Open',
  under_review: 'Under Review',
  resolved: 'Resolved',
};

const ROLES = {
  admin: 'admin',
  supervisor: 'supervisor',
  worker: 'worker',
};

module.exports = {
  STATIONS,
  LOSS_REASONS,
  TASK_STATUS,
  AIRPLANE_STATUS,
  NCR_SEVERITY,
  NCR_STATUS,
  ROLES,
};

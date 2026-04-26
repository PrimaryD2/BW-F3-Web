export const taskStatuses = ["Not Started", "In Progress", "Pending Sign-off", "Signed", "Double-Signed"];
export const airplaneStatuses = ["Draft", "In Progress", "QC Review", "Completed", "Archived"];
export const lossReasons = [
  "walked_to_warehouse",
  "fix_issue",
  "missing_tools",
  "waiting_for_material",
  "machine_downtime",
  "other"
];

export function label(value) {
  return String(value || "").replaceAll("_", " ");
}

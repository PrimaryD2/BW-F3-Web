const ROLES = ['admin', 'supervisor', 'worker', 'dealer', 'viewer', 'customer'];

const PERMISSION_DEFINITIONS = [
  { key: 'dashboard.view', label: 'View dashboard', category: 'Dashboard' },
  { key: 'fleet.view', label: 'View aircraft registry', category: 'Fleet' },
  { key: 'fleet.edit', label: 'Edit aircraft details', category: 'Fleet' },
  { key: 'fleet.create', label: 'Create aircraft', category: 'Fleet' },
  { key: 'components.edit', label: 'Edit components', category: 'Components' },
  { key: 'events.edit', label: 'Edit events', category: 'Events' },
  { key: 'gallery.edit', label: 'Upload and edit gallery', category: 'Gallery' },
  { key: 'planned_maintenance.edit', label: 'Edit planned maintenance', category: 'Maintenance' },
  { key: 'part_replacements.edit', label: 'Edit replacement history', category: 'Maintenance' },
  { key: 'bulletins.manage', label: 'Create and resolve bulletins', category: 'Bulletins' },
  { key: 'admin.view', label: 'Open admin section', category: 'Admin' },
  { key: 'users.manage', label: 'Manage users', category: 'Admin' },
  { key: 'roles.manage', label: 'Manage role permissions', category: 'Admin' },
  { key: 'models.manage', label: 'Manage aircraft models', category: 'Admin' },
  { key: 'service_templates.manage', label: 'Manage service templates', category: 'Admin' },
  { key: 'event_types.manage', label: 'Manage event types', category: 'Admin' },
  { key: 'config.manage', label: 'Manage configuration options', category: 'Admin' },
];

const DEFAULT_ROLE_PERMISSIONS = {
  admin: PERMISSION_DEFINITIONS.map((item) => item.key),
  supervisor: [
    'dashboard.view',
    'fleet.view',
    'fleet.edit',
    'fleet.create',
    'components.edit',
    'events.edit',
    'gallery.edit',
    'planned_maintenance.edit',
    'part_replacements.edit',
    'bulletins.manage',
  ],
  worker: [
    'dashboard.view',
    'fleet.view',
  ],
  dealer: [
    'dashboard.view',
    'fleet.view',
    'gallery.edit',
  ],
  viewer: [
    'dashboard.view',
    'fleet.view',
  ],
  customer: [
    'fleet.view',
  ],
};

module.exports = {
  ROLES,
  PERMISSION_DEFINITIONS,
  DEFAULT_ROLE_PERMISSIONS,
};

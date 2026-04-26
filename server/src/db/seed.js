require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const STATIONS = ['F3-Prep', 'F3-S1', 'F3-S2', 'F3-S3a', 'F3-S3B', 'F3-S4'];

const TASK_TEMPLATES = {
  'F3-Prep': [
    { title: 'Retrieve material kit', description: 'Collect all carbon fiber materials and consumables from warehouse.', estimated_minutes: 30, order_index: 1 },
    { title: 'Inspect raw materials', description: 'Visual and dimensional inspection of all incoming materials per spec sheet.', estimated_minutes: 45, order_index: 2 },
    { title: 'Prepare work surfaces', description: 'Clean and tape mold surfaces. Apply release agent.', estimated_minutes: 60, order_index: 3 },
    { title: 'Cut carbon fiber plies', description: 'Cut carbon fiber sheets to template dimensions. Label each ply.', estimated_minutes: 90, order_index: 4 },
    { title: 'Pre-stage tooling', description: 'Stage all required tooling at the station. Verify calibration dates.', estimated_minutes: 20, order_index: 5 },
  ],
  'F3-S1': [
    { title: 'Layup — fuselage lower shell (Layer 1)', description: 'Lay first carbon fiber ply into mold, ensuring zero wrinkles.', estimated_minutes: 120, order_index: 1 },
    { title: 'Layup — fuselage lower shell (Layer 2)', description: 'Apply second ply with 45° orientation. Compact with roller.', estimated_minutes: 120, order_index: 2 },
    { title: 'Layup — fuselage lower shell (Layer 3)', description: 'Apply third ply and peel ply. Check for air pockets.', estimated_minutes: 120, order_index: 3 },
    { title: 'Vacuum bag setup', description: 'Apply breather cloth, vacuum bag, seal edges. Connect vacuum line.', estimated_minutes: 60, order_index: 4 },
    { title: 'Vacuum integrity check', description: 'Hold vacuum at -0.9 bar for 15 min. Record pressure drop.', estimated_minutes: 20, order_index: 5 },
    { title: 'Cure cycle initiation', description: 'Start oven cure cycle per process sheet F3-S1-CURE-001.', estimated_minutes: 480, order_index: 6 },
    { title: 'Post-cure inspection', description: 'Tap test and visual inspection of cured part. Mark any defects.', estimated_minutes: 45, order_index: 7 },
  ],
  'F3-S2': [
    { title: 'Layup — fuselage upper shell', description: 'Repeat layup procedure for upper fuselage shell.', estimated_minutes: 360, order_index: 1 },
    { title: 'Core material installation', description: 'Bond foam core sections per drawing F3-S2-DRAW-002.', estimated_minutes: 90, order_index: 2 },
    { title: 'Vacuum bag & cure — upper shell', description: 'Bag and cure upper shell per process sheet.', estimated_minutes: 500, order_index: 3 },
    { title: 'Trim excess material', description: 'Trim cured parts to final dimensions using template.', estimated_minutes: 60, order_index: 4 },
    { title: 'Fit check — upper to lower shell', description: 'Dry-fit upper and lower shells. Check gap and alignment.', estimated_minutes: 45, order_index: 5 },
  ],
  'F3-S3a': [
    { title: 'Wing spar layup', description: 'Layup main wing spar per drawing F3-S3a-DRAW-001.', estimated_minutes: 180, order_index: 1 },
    { title: 'Wing rib installation', description: 'Bond pre-cured wing ribs at specified stations.', estimated_minutes: 120, order_index: 2 },
    { title: 'Wing skin layup — lower', description: 'Layup lower wing skin over assembled ribs and spar.', estimated_minutes: 240, order_index: 3 },
    { title: 'Wing skin layup — upper', description: 'Layup upper wing skin. Install inspection access panels.', estimated_minutes: 240, order_index: 4 },
    { title: 'Wing cure & post-cure inspection', description: 'Cure assembled wing. Inspect for delamination.', estimated_minutes: 540, order_index: 5 },
  ],
  'F3-S3B': [
    { title: 'Control surface fabrication — ailerons', description: 'Layup and cure aileron panels.', estimated_minutes: 200, order_index: 1 },
    { title: 'Control surface fabrication — flaps', description: 'Layup and cure flap panels.', estimated_minutes: 200, order_index: 2 },
    { title: 'Hinge fitting installation', description: 'Bond hinge fittings. Verify alignment with jig.', estimated_minutes: 90, order_index: 3 },
    { title: 'Control surface fit check', description: 'Fit ailerons and flaps to wing. Check deflection range.', estimated_minutes: 60, order_index: 4 },
  ],
  'F3-S4': [
    { title: 'Fuselage join — upper/lower shells', description: 'Bond upper to lower fuselage shells. Torque all fasteners.', estimated_minutes: 180, order_index: 1 },
    { title: 'Wing-to-fuselage attachment', description: 'Install wing-fuselage attachment bolts. Torque to spec.', estimated_minutes: 120, order_index: 2 },
    { title: 'Systems installation — avionics bay', description: 'Install avionics mounting tray and connectors.', estimated_minutes: 90, order_index: 3 },
    { title: 'Control linkage installation', description: 'Install and rig all primary control linkages.', estimated_minutes: 150, order_index: 4 },
    { title: 'Final structural inspection', description: 'Full visual and tactile inspection of all bonded joints.', estimated_minutes: 120, order_index: 5 },
    { title: 'Weight & balance check', description: 'Weigh aircraft and calculate CG. Record on data sheet.', estimated_minutes: 60, order_index: 6 },
  ],
};

async function seed() {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Seed stations
    console.log('Seeding stations...');
    for (const name of STATIONS) {
      await conn.query(
        'INSERT INTO stations (name) VALUES (?) ON DUPLICATE KEY UPDATE name = name',
        [name]
      );
    }

    // 2. Seed admin user
    console.log('Seeding admin user...');
    const hash = await bcrypt.hash('admin123', 12);
    await conn.query(
      `INSERT INTO users (name, username, password_hash, role, force_password_change)
       VALUES (?, ?, ?, 'admin', TRUE)
       ON DUPLICATE KEY UPDATE name = name`,
      ['Administrator', 'admin', hash]
    );

    // 3. Seed task templates
    console.log('Seeding task templates...');
    for (const [stationName, templates] of Object.entries(TASK_TEMPLATES)) {
      const stationRows = await conn.query('SELECT id FROM stations WHERE name = ?', [stationName]);
      if (!stationRows || stationRows.length === 0) continue;
      const stationId = stationRows[0].id;

      for (const t of templates) {
        // Only insert if no templates exist for this station yet
        const existing = await conn.query(
          'SELECT id FROM task_templates WHERE station_id = ? AND title = ?',
          [stationId, t.title]
        );
        if (!existing || existing.length === 0) {
          await conn.query(
            'INSERT INTO task_templates (station_id, title, description, estimated_minutes, order_index) VALUES (?,?,?,?,?)',
            [stationId, t.title, t.description, t.estimated_minutes, t.order_index]
          );
        }
      }
    }

    console.log('✅ Seed completed successfully.');
    console.log('   Default admin credentials: username=admin  password=admin123');
    console.log('   ⚠  You will be required to change the password on first login.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

seed();

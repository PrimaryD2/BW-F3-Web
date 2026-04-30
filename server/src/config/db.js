require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'f3_production',

  // Keep the pool small — a factory app has at most ~20 concurrent users.
  connectionLimit: 10,
  acquireTimeout:  30000,

  // Evict connections that have been idle for 30 min so they don't
  // accumulate as stale entries in MariaDB's process list.
  idleTimeout: 1800000,

  // Ping idle connections every 3 minutes. This (a) resets MariaDB's
  // wait_timeout timer so it never kills pool connections with
  // "Got timeout reading communication packets", and (b) detects dead
  // connections early so the pool replaces them before the next request.
  pingInterval: 180000,

  timezone: 'local',
});

async function query(sql, params) {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(sql, params);
    return result;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { pool, query };

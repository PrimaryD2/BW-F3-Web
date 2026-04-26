require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'f3_production',
  connectionLimit: 20,
  acquireTimeout: 30000,
  idleTimeout: 60000,
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

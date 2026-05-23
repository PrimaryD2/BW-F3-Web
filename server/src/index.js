require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes      = require('./routes/auth');
const airplaneRoutes  = require('./routes/airplanes');
const stationRoutes   = require('./routes/stations');
const taskRoutes      = require('./routes/tasks');
const timeLogRoutes   = require('./routes/timeLogs');
const ncrRoutes       = require('./routes/ncr');
const adminRoutes     = require('./routes/admin');
const statisticsRoutes = require('./routes/statistics');
const pdfRoutes       = require('./routes/pdf');
const fleetRoutes     = require('./routes/fleet');
const customerRoutes  = require('./routes/customers');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

// ─── Health check (used by Docker healthcheck) ───────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/airplanes',   airplaneRoutes);
app.use('/api/stations',    stationRoutes);
app.use('/api/tasks',       taskRoutes);
app.use('/api/time-logs',   timeLogRoutes);
app.use('/api/ncr',         ncrRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/statistics',  statisticsRoutes);
app.use('/api/pdf',         pdfRoutes);
app.use('/api/fleet',       fleetRoutes);
app.use('/api/customers',   customerRoutes);

// Serve uploaded fleet images
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// ─── Serve React app in production ───────────────────────────────────────────
const clientDist = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ─── 404 for unmatched API routes ─────────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`✈  F3 Production Server running on port ${PORT}  [${process.env.NODE_ENV || 'development'}]`);
});

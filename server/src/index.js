require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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
const portalRoutes    = require('./routes/portal');
const demoRoutes      = require('./routes/demos');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
// Security headers. CSP disabled because the SPA uses inline styles and data: URIs.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

// ─── Health check (used by Docker healthcheck) ───────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Brute-force protection on auth ───────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,         // 15 minutes
  max: 20,                          // 20 login/password attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-password', authLimiter);
// The customer-portal login is an equally attractive brute-force target — limit it too.
app.use('/api/portal/login', authLimiter);

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
app.use('/api/portal',      portalRoutes);
app.use('/api/demos',       demoRoutes);

// On-demand thumbnails — generated once, cached on disk. Falls back to the
// original image if sharp is unavailable or generation fails (never breaks images).
const fs = require('fs');
let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('sharp not available — thumbnails disabled, serving full images'); }
const UPLOADS_DIR = path.join(__dirname, '../uploads');

app.get('/uploads/thumb/:sub/:file', async (req, res) => {
  const sub  = String(req.params.sub).replace(/[^a-zA-Z0-9_-]/g, '');
  const file = String(req.params.file).replace(/[^a-zA-Z0-9._-]/g, '');
  const orig = path.join(UPLOADS_DIR, sub, file);
  if (!fs.existsSync(orig)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  if (!sharp) return res.sendFile(orig);
  try {
    const thumbDir = path.join(UPLOADS_DIR, sub, '_thumbs');
    const thumb = path.join(thumbDir, file + '.webp');
    if (!fs.existsSync(thumb)) {
      fs.mkdirSync(thumbDir, { recursive: true });
      await sharp(orig).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toFile(thumb);
    }
    return res.sendFile(thumb);
  } catch {
    return res.sendFile(orig);
  }
});

// Serve uploaded fleet images — uploads have unique filenames and never change,
// so cache them aggressively in the browser (fixes images re-downloading every visit).
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '30d',
  immutable: true,
}));

// ─── Serve React app in production ───────────────────────────────────────────
const clientDist = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
  // Hashed asset filenames are safe to cache long-term; keep index.html fresh.
  app.use(express.static(clientDist, {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
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

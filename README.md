# F3 Production Management System

Production management web app for Station F3 of a carbon fiber 2-seater airplane factory.

Sub-stations: **F3-Prep · F3-S1 · F3-S2 · F3-S3a · F3-S3B · F3-S4**

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| MariaDB | 10.6+ |

---

## 1. MariaDB Setup

### Create the database and user

```sql
CREATE DATABASE f3_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'f3user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON f3_production.* TO 'f3user'@'localhost';
FLUSH PRIVILEGES;
```

> You can also use the root account during development.

---

## 2. Configure Environment

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=f3user
DB_PASS=your_secure_password
DB_NAME=f3_production
JWT_SECRET=change-this-to-a-long-random-string
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

---

## 3. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

---

## 4. Run Database Migration

Creates all tables (idempotent — safe to re-run):

```bash
cd server
npm run migrate
```

---

## 5. Seed the Database

Creates the 6 stations, a default admin user, and sample task templates:

```bash
cd server
npm run seed
```

**Default admin credentials:**

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> ⚠ You will be prompted to change this password on first login.

---

## 6. Start the Application

### Development mode (recommended — hot reload on both server and client)

**Terminal 1 — API server:**
```bash
cd server
npm run dev
```

**Terminal 2 — React client (Vite):**
```bash
cd client
npm run dev
```

Open: **http://localhost:5173**

---

### Production mode

```bash
# Build the React client
cd client
npm run build

# Start the server (serves the built client)
cd ../server
NODE_ENV=production npm start
```

Open: **http://localhost:3001**

---

## 7. Multi-User / Networked Setup

All factory PCs connect to the same MariaDB server. The Node.js server runs on one machine (or a dedicated server PC):

```
Factory PCs (browsers)  ──→  Node.js Server (port 3001)  ──→  MariaDB (port 3306)
```

1. Set `DB_HOST` in `.env` to the IP of the MariaDB machine.
2. Allow MariaDB to accept remote connections:
   ```sql
   CREATE USER 'f3user'@'%' IDENTIFIED BY 'password';
   GRANT ALL PRIVILEGES ON f3_production.* TO 'f3user'@'%';
   ```
3. Workers access the app from their browser: `http://<server-ip>:3001`

---

## Project Structure

```
/
├── server/
│   ├── src/
│   │   ├── index.js              ← Express entry point
│   │   ├── config/db.js          ← MariaDB connection pool
│   │   ├── middleware/auth.js    ← JWT middleware + role guard
│   │   ├── db/
│   │   │   ├── migrate.js        ← Creates all tables
│   │   │   └── seed.js           ← Seeds stations, admin, templates
│   │   └── routes/
│   │       ├── auth.js           ← Login, change password, verify password
│   │       ├── airplanes.js      ← Airplane project CRUD + progress
│   │       ├── stations.js       ← Station list
│   │       ├── tasks.js          ← Task instances + sign-offs
│   │       ├── timeLogs.js       ← Timer start/stop + loss logs
│   │       ├── ncr.js            ← NCR CRUD + status updates
│   │       ├── admin.js          ← Users, task templates, audit log
│   │       ├── statistics.js     ← Charts data + CSV export
│   │       └── pdf.js            ← PDF task sheet + NCR report
│   ├── .env.example
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── api/index.js          ← All API call functions
│   │   ├── context/
│   │   │   ├── AuthContext.jsx   ← JWT auth + 8h auto-logout
│   │   │   └── ToastContext.jsx  ← Toast notification system
│   │   ├── components/
│   │   │   ├── Layout.jsx        ← Sidebar nav + main content
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── SignOffModal.jsx  ← Password re-entry sign-off
│   │   │   ├── LossLogModal.jsx  ← Post-timer loss entry
│   │   │   └── NCRModal.jsx      ← File nonconformity report
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── ChangePassword.jsx
│   │       ├── Dashboard.jsx     ← Live overview + charts
│   │       ├── AirplaneList.jsx
│   │       ├── AirplaneDetail.jsx
│   │       ├── StationView.jsx   ← Task sheet + timers + sign-offs
│   │       ├── NCRList.jsx
│   │       ├── NCRDetail.jsx
│   │       ├── Statistics.jsx    ← Charts: time, NCR, loss, throughput
│   │       └── AdminPanel.jsx    ← Users + templates + audit log
│   ├── vite.config.js
│   └── package.json
│
├── shared/constants.js           ← Shared enums (server-side)
└── README.md
```

---

## API Overview

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT |
| GET  | `/api/auth/me` | Current user info |
| POST | `/api/auth/change-password` | Change own password |
| POST | `/api/auth/verify-password` | Verify password (for sign-off) |
| GET  | `/api/airplanes` | List airplanes |
| POST | `/api/airplanes` | Create airplane |
| GET  | `/api/airplanes/:id/progress` | Station progress for one plane |
| GET  | `/api/tasks/airplane/:id/station/:id` | Get (or init) task instances |
| PUT  | `/api/tasks/:id` | Update task status/notes |
| POST | `/api/tasks/:id/signoff` | Primary or double sign-off |
| POST | `/api/time-logs/start` | Start timer |
| PUT  | `/api/time-logs/:id/stop` | Stop timer |
| POST | `/api/time-logs/loss` | Log a loss entry |
| GET  | `/api/ncr` | List NCRs (filterable) |
| POST | `/api/ncr` | File new NCR |
| PUT  | `/api/ncr/:id` | Update NCR status (supervisor+) |
| GET  | `/api/statistics/*` | Chart data endpoints |
| GET  | `/api/statistics/export/csv` | CSV export |
| GET  | `/api/pdf/task-sheet/:aid/:sid` | PDF task sheet |
| GET  | `/api/pdf/ncr/:id` | PDF NCR report |
| *    | `/api/admin/*` | Admin endpoints (admin role only) |

---

## Roles

| Role | Capabilities |
|---|---|
| **Worker** | Log time, sign off own tasks, file NCRs, view dashboards |
| **Supervisor** | All worker actions + update NCR status, create/edit airplanes |
| **Admin** | All supervisor actions + manage users, task templates, view full audit log |

---

## Sign-off Rules

1. Worker completes work, stops timer, submits task for sign-off (`pending_signoff`)
2. Any worker performs **primary sign-off** with password re-entry → status: `signed`
3. A **different** worker (or any supervisor/admin) performs **double sign-off** → status: `double_signed`
4. A task with a **high-severity unresolved NCR** is blocked from sign-off until a supervisor resolves the NCR
5. Tasks within a station must be completed **in order** (sequential by `order_index`)

---

## Notes

- Template changes do **not** affect in-progress airplanes — only newly created projects pick up template changes.
- Timers are stored server-side; closing the browser does not lose the timer.
- Sessions expire after **8 hours of inactivity** (JWT + localStorage timestamp).
- PDF export uses server-side PDFKit — no client-side libraries needed.

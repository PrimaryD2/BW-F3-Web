# F3 Factory Production Management

Production management web application for the F3 station of a carbon fiber 2-seater airplane factory.

The app is built as a practical factory-floor MVP with real backend logic, MariaDB persistence, JWT authentication, role-based access, task flow control, sign-offs, time/loss tracking, NCR handling, statistics, PDF exports, and admin tools.

## Stack

- Backend: Node.js + Express
- Database: MariaDB
- Frontend: React + Vite
- Auth: JWT with username/password, stored in browser `localStorage`
- Roles: `Admin`, `Supervisor`, `Worker`
- Runtime: Docker Compose

## Folder Structure

```text
/
  docker-compose.yml
  .env.example
  README.md
  /server
    src/
      app.js
      server.js
      config/
      db/
        migrations/
        seeds/
      middleware/
      routes/
      services/
      scripts/
      utils/
    Dockerfile
    package.json
    .env.example
  /client
    src/
      app/
      components/
      context/
      hooks/
      pages/
      services/
      utils/
    Dockerfile
    package.json
    .env.example
  /shared
    constants/
```

## Run With Docker

```bash
docker-compose up --build
```

Open the frontend:

```text
http://localhost:5173
```

From another computer on the same local network:

```text
http://YOUR_SERVER_IP:5173
```

The frontend calls the API on the same host at port `4000`, which works for local network clients.

## Default Login

```text
username: admin
password: admin123
```

The default admin user has `must_change_password = true`. On first login, the UI forces a password change before the rest of the app is available.

## Environment

Copy examples if you want local overrides:

```bash
cp .env.example .env
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `DB_HOST` | Database host. In Docker this is `db`. |
| `DB_NAME` | MariaDB database name. |
| `DB_USER` / `DB_PASSWORD` | Application database credentials. |
| `MARIADB_ROOT_PASSWORD` | MariaDB root password for the container. |
| `JWT_SECRET` | Secret used to sign JWTs. Change before real use. |
| `JWT_EXPIRES_IN` | Token lifetime. Default is `8h`. |
| `CLIENT_ORIGIN` | CORS origin. Default `*` is practical for a local factory LAN. |
| `TARGET_HOURS_PER_DAY` | Dashboard target hours. |
| `VITE_API_URL` | Optional frontend API override. Leave empty for LAN auto-detect. |

## Migrations And Seeds

The server waits for MariaDB, runs migrations, and applies seed data on startup.

Manual commands:

```bash
docker-compose run --rm server npm run migrate
docker-compose run --rm server npm run seed
```

Seed data includes:

- Stations: `F3-Prep`, `F3-S1`, `F3-S2`, `F3-S3a`, `F3-S3B`, `F3-S4`
- Default admin user
- Example task templates for `F3-Prep`, `F3-S1`, and `F3-S2`

## Workflow Summary

Airplanes:
- Admin/Supervisor creates an airplane by serial number.
- The system creates task instances from currently active task templates.
- Later template edits only affect future airplanes, not existing task instances.
- Status flow: `Draft` → `In Progress` → `QC Review` → `Completed` → optional `Archived`.

Tasks:
- Tasks are grouped by F3 sub-station.
- Tasks must be completed sequentially within each station.
- A later task cannot start until previous station tasks are double-signed.
- Flow: `Not Started` → `In Progress` → `Pending Sign-off` → `Signed` → `Double-Signed`.

Sign-offs:
- Password re-entry is required.
- Primary and double sign-offs are stored separately.
- Workers cannot double-sign their own primary sign-off.
- Supervisors are allowed to perform either sign-off.
- Open high-severity NCRs linked to a task block sign-off.

Time and losses:
- Multiple workers can run timers on the same task.
- A worker cannot start a duplicate active timer on the same task.
- Stopping a timer can also log a production loss reason and minutes.

NCRs:
- Any user can submit an NCR from a station or task.
- NCR flow: `open` → `under_review` → `resolved`.
- Admin/Supervisor can review and resolve NCRs.
- Reviews are stored in `ncr_approvals` and `audit_logs`.

Exports:
- Task sheet PDF per airplane/station.
- NCR detail PDF.
- Statistics CSV export.

## API Areas

- `/api/auth`
- `/api/users`
- `/api/airplanes`
- `/api/stations`
- `/api/task-templates`
- `/api/task-instances`
- `/api/ncrs`
- `/api/statistics`
- `/api/exports`
- `/api/audit-logs`

## Docker And MariaDB Troubleshooting

If Docker reports that the engine pipe is unavailable or returns a 500 error, restart Docker Desktop and rerun:

```bash
docker-compose up --build
```

If the database volume contains old schema data and you want a clean reset:

```bash
docker-compose down -v
docker-compose up --build
```

If another MariaDB is already using port `3306`, change the published port in `docker-compose.yml`. The server still connects to the Docker service name `db` internally.

If another Vite app is using `5173`, change the client port mapping and open that new port from the browser.

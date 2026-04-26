import { waitForDatabase } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";

await waitForDatabase();
await runMigrations();
console.log("Migrations complete");
process.exit(0);

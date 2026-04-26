import { waitForDatabase } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";
import { seedDatabase } from "../db/seeds/seed.js";

await waitForDatabase();
await runMigrations();
await seedDatabase();
console.log("Seeds complete");
process.exit(0);

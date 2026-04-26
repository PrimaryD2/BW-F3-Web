import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { waitForDatabase } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { seedDatabase } from "./db/seeds/seed.js";

await waitForDatabase();
await runMigrations();
await seedDatabase();

createApp().listen(env.port, "0.0.0.0", () => {
  console.log(`F3 production server listening on ${env.port}`);
});

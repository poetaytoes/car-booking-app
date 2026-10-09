import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./database/connection.js";
import { runMigrations } from "./database/migrate.js";
import { seedReferenceData } from "./database/seed.js";

runMigrations();
seedReferenceData();

const server = createApp().listen(env.PORT, env.HOST, () => {
  console.log(`CarBooking listening on ${env.HOST}:${env.PORT}`);
});

function shutdown(): void {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import fs from "node:fs";
import { env } from "../config/env.js";
import { closeDatabase } from "./connection.js";
import { runMigrations } from "./migrate.js";
import { seedReferenceData } from "./seed.js";

closeDatabase();
for (const suffix of ["", "-shm", "-wal"]) {
  const filename = `${env.DATABASE_PATH}${suffix}`;
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
}
runMigrations();
seedReferenceData();
closeDatabase();
console.log(`Database reset: ${env.DATABASE_PATH}`);

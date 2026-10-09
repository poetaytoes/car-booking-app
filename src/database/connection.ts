import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env.js";

let database: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (!database) {
    fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });
    database = new DatabaseSync(env.DATABASE_PATH);
    database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }

  return database;
}

export function closeDatabase(): void {
  database?.close();
  database = undefined;
}

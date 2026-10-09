import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_PATH: z.string().min(1).default("./data/car_booking.sqlite"),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().min(1).default("1d"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

function secretFor(databasePath: string, configured?: string): string {
  const examples = new Set(["school-project-change-me", "replace-this-with-a-long-random-secret"]);
  if (configured && !examples.has(configured)) {
    if (configured.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
    return configured;
  }

  const file = path.join(path.dirname(databasePath), ".jwt-secret");
  if (fs.existsSync(file)) {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (saved.length < 32) throw new Error("Saved JWT secret is too short");
    return saved;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const generated = randomBytes(48).toString("base64url");
  try {
    fs.writeFileSync(file, `${generated}\n`, { flag: "wx", mode: 0o600 });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const saved = fs.readFileSync(file, "utf8").trim();
    if (saved.length < 32) throw new Error("Saved JWT secret is too short");
    return saved;
  }
}

const databasePath = path.resolve(parsed.data.DATABASE_PATH);
export const env = {
  ...parsed.data,
  DATABASE_PATH: databasePath,
  JWT_SECRET: secretFor(databasePath, parsed.data.JWT_SECRET)
};

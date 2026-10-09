import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: "CUSTOMER" | "ADMIN";
  created_at: string;
};

export class AuthRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  findByEmail(email: string): UserRecord | undefined {
    return this.database.prepare("SELECT * FROM users WHERE email = ?").get(email) as
      | UserRecord
      | undefined;
  }

  findById(id: string): UserRecord | undefined {
    return this.database.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | UserRecord
      | undefined;
  }

  create(user: UserRecord): UserRecord {
    this.database
      .prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        user.id,
        user.name,
        user.email,
        user.phone,
        user.password_hash,
        user.role,
        user.created_at
      );
    return user;
  }
}

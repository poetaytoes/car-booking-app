import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";

export type DriverStatus = "AVAILABLE" | "ON_TRIP" | "OFF_DUTY" | "SUSPENDED";

export type Driver = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  password_hash: string | null;
  license_number: string;
  status: DriverStatus;
  active: number;
  created_at: string;
  updated_at: string;
};

export class DriverRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  list(): Driver[] {
    return this.database.prepare("SELECT * FROM drivers ORDER BY active DESC, name")
      .all() as unknown as Driver[];
  }

  findById(id: string): Driver | undefined {
    return this.database.prepare("SELECT * FROM drivers WHERE id = ?").get(id) as Driver | undefined;
  }

  findByEmail(email: string): Driver | undefined {
    return this.database.prepare("SELECT * FROM drivers WHERE email = ?").get(email) as Driver | undefined;
  }

  findDuplicate(email: string | null, licenseNumber: string): Driver | undefined {
    return this.database.prepare(
      "SELECT * FROM drivers WHERE license_number = ? OR (? IS NOT NULL AND email = ?) LIMIT 1"
    ).get(licenseNumber, email, email) as Driver | undefined;
  }

  create(driver: Driver): Driver {
    this.database.prepare(`
      INSERT INTO drivers
        (id, name, phone, email, password_hash, license_number, status, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      driver.id, driver.name, driver.phone, driver.email, driver.password_hash, driver.license_number,
      driver.status, driver.active, driver.created_at, driver.updated_at
    );
    return driver;
  }

  setPassword(id: string, passwordHash: string): void {
    this.database.prepare("UPDATE drivers SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, new Date().toISOString(), id);
  }

  hasActiveTask(id: string): boolean {
    return Boolean(this.database.prepare(`
      SELECT 1 FROM bookings WHERE driver_id = ? AND status IN ('CONFIRMED', 'IN_PROGRESS')
      UNION ALL SELECT 1 FROM deliveries WHERE driver_id = ? AND status IN ('PENDING', 'ACCEPTED', 'PICKED_UP') LIMIT 1
    `).get(id, id));
  }

  update(id: string, changes: Partial<Pick<Driver, "name" | "phone" | "email" | "license_number" | "status" | "active">>): Driver | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    const updated = { ...current, ...changes, updated_at: new Date().toISOString() };
    this.database.prepare(`
      UPDATE drivers SET name = ?, phone = ?, email = ?, license_number = ?,
        status = ?, active = ?, updated_at = ? WHERE id = ?
    `).run(
      updated.name, updated.phone, updated.email, updated.license_number,
      updated.status, updated.active, updated.updated_at, id
    );
    return this.findById(id);
  }
}

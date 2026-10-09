import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import { ApiError } from "../../shared/api-error.js";

export class AvailabilityRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  list(vehicleId: string) {
    return this.db.prepare(`
      SELECT * FROM vehicle_availability WHERE vehicle_id = ? ORDER BY available_from
    `).all(vehicleId);
  }

  block(vehicleId: string, from: string, to: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const vehicle = this.db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
      if (!vehicle) throw new ApiError(404, "Vehicle not found");
      const booked = this.db.prepare(`
        SELECT 1 FROM bookings WHERE vehicle_id = ? AND status IN ('CONFIRMED', 'IN_PROGRESS')
          AND pickup_time < ? AND return_time > ? LIMIT 1
      `).get(vehicleId, to, from);
      if (booked) throw new ApiError(409, "A booking already uses this interval");
      const id = randomUUID();
      this.db.prepare(`
        INSERT INTO vehicle_availability (id, vehicle_id, available_from, available_to, status)
        VALUES (?, ?, ?, ?, 'UNAVAILABLE')
      `).run(id, vehicleId, from, to);
      this.db.exec("COMMIT");
      return this.db.prepare("SELECT * FROM vehicle_availability WHERE id = ?").get(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  release(id: string) {
    const result = this.db.prepare(`
      UPDATE vehicle_availability SET status = 'AVAILABLE' WHERE id = ?
    `).run(id);
    if (!result.changes) throw new ApiError(404, "Availability window not found");
    return this.db.prepare("SELECT * FROM vehicle_availability WHERE id = ?").get(id);
  }
}

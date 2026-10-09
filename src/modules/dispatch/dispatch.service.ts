import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";

type WaitingJob = { id: string; kind: "BOOKING" | "DELIVERY" };
type AvailableDriver = { id: string };

/** Assign each free, on-duty driver to the oldest unassigned customer request. */
export function dispatchWaitingJobs(database: DatabaseSync = getDatabase()): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const drivers = database.prepare(`
      SELECT d.id FROM drivers d
      WHERE d.active = 1 AND d.status = 'AVAILABLE' AND d.password_hash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.driver_id = d.id AND b.booking_mode = 'RIDE' AND b.status IN ('CONFIRMED', 'IN_PROGRESS'))
        AND NOT EXISTS (SELECT 1 FROM deliveries dl WHERE dl.driver_id = d.id AND dl.status IN ('PENDING', 'ACCEPTED', 'PICKED_UP'))
      ORDER BY d.updated_at, d.id
    `).all() as unknown as AvailableDriver[];
    for (const driver of drivers) {
      const job = database.prepare(`
        SELECT id, kind FROM (
          SELECT id, 'BOOKING' AS kind, created_at FROM bookings WHERE driver_id IS NULL AND booking_mode = 'RIDE' AND status = 'CONFIRMED'
          UNION ALL
          SELECT id, 'DELIVERY' AS kind, created_at FROM deliveries WHERE driver_id IS NULL AND status = 'PENDING'
        ) ORDER BY created_at, id LIMIT 1
      `).get() as WaitingJob | undefined;
      if (!job) break;
      const table = job.kind === "BOOKING" ? "bookings" : "deliveries";
      database.prepare(`UPDATE ${table} SET driver_id = ? WHERE id = ? AND driver_id IS NULL`)
        .run(driver.id, job.id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

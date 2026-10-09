import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import { ApiError } from "../../shared/api-error.js";
import { dispatchWaitingJobs } from "../dispatch/dispatch.service.js";

export class DriverTasks {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  updateLocation(driverId: string, latitude: number, longitude: number) {
    this.database.prepare(`
      UPDATE drivers SET latitude = ?, longitude = ?, updated_at = ?
      WHERE id = ? AND active = 1 AND status != 'SUSPENDED'
    `).run(latitude, longitude, new Date().toISOString(), driverId);
    return { latitude, longitude };
  }

  list(driverId: string) {
    const bookings = this.database.prepare(`
      SELECT b.id, 'BOOKING' AS kind, b.status, b.pickup_address, b.dropoff_address,
        b.pickup_time AS scheduled_at, b.return_time, b.passenger_count,
        u.name AS customer_name, u.phone AS customer_phone, v.name AS vehicle_name
      FROM bookings b JOIN users u ON u.id = b.user_id JOIN vehicles v ON v.id = b.vehicle_id
      WHERE b.driver_id = ? AND b.booking_mode = 'RIDE' AND b.status IN ('CONFIRMED', 'IN_PROGRESS')
    `).all(driverId);
    const deliveries = this.database.prepare(`
      SELECT dl.id, 'DELIVERY' AS kind, dl.status, dl.pickup_address, dl.dropoff_address,
        dl.scheduled_at, dl.category, dl.description,
        u.name AS customer_name, u.phone AS customer_phone,
        dl.recipient_name, dl.recipient_phone
      FROM deliveries dl JOIN users u ON u.id = dl.user_id
      WHERE dl.driver_id = ? AND dl.status IN ('PENDING', 'ACCEPTED', 'PICKED_UP')
    `).all(driverId);
    return [...bookings, ...deliveries].sort((a, b) =>
      String((a as { scheduled_at: string }).scheduled_at).localeCompare(String((b as { scheduled_at: string }).scheduled_at)));
  }

  setAvailability(driverId: string, status: "AVAILABLE" | "OFF_DUTY") {
    const active = this.database.prepare(`
      SELECT 1 FROM bookings WHERE driver_id = ? AND booking_mode = 'RIDE' AND status IN ('CONFIRMED', 'IN_PROGRESS')
      UNION ALL SELECT 1 FROM deliveries WHERE driver_id = ? AND status IN ('PENDING', 'ACCEPTED', 'PICKED_UP') LIMIT 1
    `).get(driverId, driverId);
    if (active && status === "OFF_DUTY") throw new ApiError(409, "Finish your assigned task before going off duty");
    const driver = this.database.prepare("SELECT active, status FROM drivers WHERE id = ?").get(driverId) as
      | { active: number; status: string } | undefined;
    if (!driver || !driver.active || driver.status === "SUSPENDED") throw new ApiError(403, "Driver account is unavailable");
    this.database.prepare("UPDATE drivers SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), driverId);
    if (status === "AVAILABLE") dispatchWaitingJobs(this.database);
    return { status };
  }

  advance(driverId: string, kind: "BOOKING" | "DELIVERY", id: string, action: "CONFIRM" | "PICKED_UP" | "COMPLETE") {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const table = kind === "BOOKING" ? "bookings" : "deliveries";
      const job = this.database.prepare(`SELECT status FROM ${table} WHERE id = ? AND driver_id = ?`)
        .get(id, driverId) as { status: string } | undefined;
      if (!job) throw new ApiError(404, "Assigned task not found");
      const transitions: Record<string, Partial<Record<typeof action, string>>> = kind === "BOOKING"
        ? { CONFIRMED: { CONFIRM: "IN_PROGRESS" }, IN_PROGRESS: { COMPLETE: "COMPLETED" } }
        : { PENDING: { CONFIRM: "ACCEPTED" }, ACCEPTED: { PICKED_UP: "PICKED_UP" }, PICKED_UP: { COMPLETE: "DELIVERED" } };
      const next = transitions[job.status]?.[action];
      if (!next) throw new ApiError(409, "This action is not valid for the current task status");
      const driver = this.database.prepare("SELECT status, active FROM drivers WHERE id = ?").get(driverId) as
        { status: string; active: number } | undefined;
      if (!driver?.active || driver.status === "SUSPENDED" || driver.status === "OFF_DUTY") {
        throw new ApiError(409, "Driver must be on duty to update a task");
      }
      this.database.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).run(next, id);
      const driverStatus = action === "COMPLETE" ? "AVAILABLE" : "ON_TRIP";
      this.database.prepare("UPDATE drivers SET status = ?, updated_at = ? WHERE id = ?")
        .run(driverStatus, new Date().toISOString(), driverId);
      this.database.exec("COMMIT");
      if (action === "COMPLETE") dispatchWaitingJobs(this.database);
      return { id, kind, status: next };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

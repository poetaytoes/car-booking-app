import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import { ApiError } from "../../shared/api-error.js";

export class ReviewRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  listForVehicle(vehicleId: string) {
    return this.db.prepare(`
      SELECT r.id, r.vehicle_id, r.rating, r.comment, r.created_at, u.name AS customer_name
      FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.vehicle_id = ? ORDER BY r.created_at DESC
    `).all(vehicleId);
  }

  submit(userId: string, bookingId: string, rating: number, comment: string) {
    const booking = this.db.prepare(`
      SELECT id, vehicle_id, status, rental_state FROM bookings WHERE id = ? AND user_id = ?
    `).get(bookingId, userId) as
      | { id: string; vehicle_id: string; status: string; rental_state: string | null } | undefined;
    if (!booking) throw new ApiError(404, "Booking not found");
    if (booking.status !== "COMPLETED" ||
      (booking.rental_state && booking.rental_state !== "BOOKING_CLOSED")) {
      throw new ApiError(409, "A review requires a completed ride or closed rental");
    }
    const existing = this.db.prepare("SELECT id FROM reviews WHERE booking_id = ?").get(bookingId);
    if (existing) throw new ApiError(409, "This booking already has a review");
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO reviews (id, user_id, vehicle_id, booking_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, booking.vehicle_id, bookingId, rating, comment, new Date().toISOString());
    return this.db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
  }
}

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import { ApiError } from "../../shared/api-error.js";

export type RentalState =
  | "BOOKING_PENDING" | "PAYMENT_PROCESSING" | "PAYMENT_FAILED"
  | "BOOKING_CONFIRMED" | "CAR_PICKED_UP" | "RENTAL_ACTIVE"
  | "CAR_RETURNED" | "BOOKING_CLOSED" | "BOOKING_CANCELLED";

export type Rental = {
  id: string; user_id: string; vehicle_id: string; driver_id: null;
  booking_mode: "RENTAL"; rental_state: RentalState;
  status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  pickup_address: string; dropoff_address: string;
  pickup_time: string; return_time: string; total_price: number;
  payment_status: string; payment_method: string;
  vehicle_name: string; plate_number: string;
};

export type LocationInput = {
  name: string; address: string; city: string;
  latitude?: number; longitude?: number;
};

const selectRental = `
  SELECT b.*, v.name AS vehicle_name, v.plate_number,
    p.status AS payment_status, p.method AS payment_method
  FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
  JOIN payments p ON p.booking_id = b.id
  WHERE b.booking_mode = 'RENTAL'
`;

export class RentalRepository {
  constructor(private readonly db: DatabaseSync = getDatabase()) {}

  create(input: {
    userId: string; vehicleId: string; pickup: LocationInput; dropoff: LocationInput;
    startAt: string; endAt: string; basePrice: number; discount: number;
    total: number; paymentMethod: string;
  }): Rental {
    const id = randomUUID();
    const pickupId = randomUUID();
    const dropoffId = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const conflict = this.db.prepare(`
        SELECT 1 FROM bookings WHERE vehicle_id = ?
          AND status IN ('CONFIRMED', 'IN_PROGRESS')
          AND pickup_time < ? AND return_time > ? LIMIT 1
      `).get(input.vehicleId, input.endAt, input.startAt);
      const blocked = this.db.prepare(`
        SELECT 1 FROM vehicle_availability WHERE vehicle_id = ? AND status = 'UNAVAILABLE'
          AND available_from < ? AND available_to > ? LIMIT 1
      `).get(input.vehicleId, input.endAt, input.startAt);
      if (conflict || blocked) throw new ApiError(409, "Vehicle is not available for the selected time");
      const locationStmt = this.db.prepare(`
        INSERT INTO locations (id, name, address, city, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      locationStmt.run(pickupId, input.pickup.name, input.pickup.address, input.pickup.city,
        input.pickup.latitude ?? null, input.pickup.longitude ?? null);
      locationStmt.run(dropoffId, input.dropoff.name, input.dropoff.address, input.dropoff.city,
        input.dropoff.latitude ?? null, input.dropoff.longitude ?? null);
      this.db.prepare(`
        INSERT INTO bookings (
          id, user_id, vehicle_id, passenger_count, pickup_address, dropoff_address,
          pickup_time, return_time, notes, status, total_price, base_price,
          discount_amount, created_at, booking_mode, rental_state,
          pickup_location_id, dropoff_location_id
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, 'CONFIRMED', ?, ?, ?, ?,
          'RENTAL', 'BOOKING_PENDING', ?, ?)
      `).run(id, input.userId, input.vehicleId, input.pickup.address, input.dropoff.address,
        input.startAt, input.endAt, input.total, input.basePrice, input.discount,
        new Date().toISOString(), pickupId, dropoffId);
      this.db.prepare(`
        INSERT INTO payments (id, booking_id, amount, method, status, paid_at)
        VALUES (?, ?, ?, ?, 'PENDING', NULL)
      `).run(randomUUID(), id, input.total, input.paymentMethod);
      this.notify(input.userId, `Rental ${id} is waiting for demo payment.`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.findById(id)!;
  }

  findById(id: string): Rental | undefined {
    return this.db.prepare(`${selectRental} AND b.id = ?`).get(id) as Rental | undefined;
  }

  listForUser(userId: string): Rental[] {
    return this.db.prepare(`${selectRental} AND b.user_id = ? ORDER BY b.created_at DESC`)
      .all(userId) as unknown as Rental[];
  }

  listAll(): Rental[] {
    return this.db.prepare(`${selectRental} ORDER BY b.created_at DESC`).all() as unknown as Rental[];
  }

  processPayment(id: string, outcome: "SUCCEED" | "FAIL"): Rental {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.findById(id);
      if (!current) throw new ApiError(404, "Rental not found");
      if (!["BOOKING_PENDING", "PAYMENT_FAILED"].includes(current.rental_state)) {
        throw new ApiError(409, "Rental is not waiting for payment");
      }
      this.db.prepare("UPDATE bookings SET rental_state = 'PAYMENT_PROCESSING' WHERE id = ?").run(id);
      const next = outcome === "SUCCEED" ? "BOOKING_CONFIRMED" : "PAYMENT_FAILED";
      const payment = outcome === "SUCCEED" ? "PAID" : "FAILED";
      this.db.prepare("UPDATE bookings SET rental_state = ? WHERE id = ?").run(next, id);
      this.db.prepare(`
        UPDATE payments SET status = ?, paid_at = CASE WHEN ? = 'PAID' THEN ? ELSE paid_at END
        WHERE booking_id = ?
      `).run(payment, payment, new Date().toISOString(), id);
      this.notify(current.user_id, `Rental ${id} is now ${next.replaceAll("_", " ").toLowerCase()}.`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.findById(id)!;
  }

  transition(id: string, expected: RentalState[], next: RentalState,
    paymentStatus?: "PAID" | "FAILED" | "REFUNDED"): Rental {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.findById(id);
      if (!current) throw new ApiError(404, "Rental not found");
      if (!expected.includes(current.rental_state)) throw new ApiError(409, "Invalid rental state transition");
      const status = next === "BOOKING_CANCELLED" ? "CANCELLED"
        : next === "BOOKING_CLOSED" ? "COMPLETED"
        : ["CAR_PICKED_UP", "RENTAL_ACTIVE", "CAR_RETURNED"].includes(next) ? "IN_PROGRESS" : "CONFIRMED";
      this.db.prepare(`
        UPDATE bookings SET rental_state = ?, status = ?,
          closed_at = CASE WHEN ? = 'BOOKING_CLOSED' THEN ? ELSE closed_at END
        WHERE id = ? AND booking_mode = 'RENTAL'
      `).run(next, status, next, new Date().toISOString(), id);
      if (paymentStatus) {
        this.db.prepare(`
          UPDATE payments SET status = ?, paid_at = CASE WHEN ? = 'PAID' THEN ? ELSE paid_at END
          WHERE booking_id = ?
        `).run(paymentStatus, paymentStatus, new Date().toISOString(), id);
      }
      this.notify(current.user_id, `Rental ${id} is now ${next.replaceAll("_", " ").toLowerCase()}.`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.findById(id)!;
  }

  private notify(userId: string, message: string): void {
    this.db.prepare("INSERT INTO notifications (id, user_id, message, sent_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), userId, message, new Date().toISOString());
  }
}

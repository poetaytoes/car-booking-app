import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import { ApiError } from "../../shared/api-error.js";

export type Booking = {
  id: string;
  user_id: string;
  vehicle_id: string;
  driver_id: string | null;
  passenger_count: number;
  pickup_address: string;
  dropoff_address: string;
  pickup_time: string;
  return_time: string;
  notes: string | null;
  status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  booking_mode?: "RIDE" | "RENTAL";
  total_price: number;
  base_price: number;
  discount_amount: number;
  created_at: string;
  vehicle_name?: string;
  plate_number?: string;
  seat_capacity?: number;
  driver_name?: string | null;
  driver_phone?: string | null;
};

type NewBooking = Omit<Booking, "vehicle_name" | "plate_number" | "seat_capacity" | "driver_name" | "driver_phone">;

const bookingSelect = `
  SELECT b.*, v.name AS vehicle_name, v.plate_number, v.seat_capacity,
    d.name AS driver_name, d.phone AS driver_phone
  FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
  LEFT JOIN drivers d ON d.id = b.driver_id
`;

export class BookingRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  create(booking: NewBooking): Booking {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const conflict = this.database.prepare(`
        SELECT id FROM bookings
        WHERE vehicle_id = ?
          AND status IN ('CONFIRMED', 'IN_PROGRESS')
          AND pickup_time < ? AND return_time > ?
        LIMIT 1
      `).get(booking.vehicle_id, booking.return_time, booking.pickup_time);

      if (conflict) throw new ApiError(409, "Vehicle is not available for the selected time");
      const blocked = this.database.prepare(`
        SELECT id FROM vehicle_availability
        WHERE vehicle_id = ? AND status = 'UNAVAILABLE'
          AND available_from < ? AND available_to > ? LIMIT 1
      `).get(booking.vehicle_id, booking.return_time, booking.pickup_time);
      if (blocked) throw new ApiError(409, "Vehicle is unavailable for the selected time");

      this.database.prepare(`
        INSERT INTO bookings (
          id, user_id, vehicle_id, driver_id, passenger_count, pickup_address, dropoff_address,
          pickup_time, return_time, notes, status, total_price, base_price, discount_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        booking.id,
        booking.user_id,
        booking.vehicle_id,
        booking.driver_id,
        booking.passenger_count,
        booking.pickup_address,
        booking.dropoff_address,
        booking.pickup_time,
        booking.return_time,
        booking.notes,
        booking.status,
        booking.total_price,
        booking.base_price,
        booking.discount_amount,
        booking.created_at
      );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return this.findById(booking.id)!;
  }

  findById(id: string): Booking | undefined {
    return this.database.prepare(`${bookingSelect} WHERE b.id = ?`).get(id) as Booking | undefined;
  }

  listForUser(userId: string): Booking[] {
    return this.database.prepare(`${bookingSelect} WHERE b.user_id = ? AND b.booking_mode = 'RIDE' ORDER BY b.created_at DESC`)
      .all(userId) as unknown as Booking[];
  }

  cancel(id: string): Booking {
    this.database.prepare(`
      UPDATE bookings SET status = 'CANCELLED'
      WHERE id = ? AND booking_mode = 'RIDE' AND status = 'CONFIRMED'
    `).run(id);
    return this.findById(id)!;
  }
}

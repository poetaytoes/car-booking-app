import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";

export type Vehicle = {
  id: string;
  name: string;
  plate_number: string;
  seat_capacity: 4 | 7;
  service_class: "SAVER" | "STANDARD" | "LUXURY";
  price_per_hour: number;
  daily_rate: number | null;
  make: string | null;
  model: string | null;
  model_year: number | null;
  active: number;
  created_at: string;
};

export class VehicleRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  findById(id: string): Vehicle | undefined {
    return this.database.prepare("SELECT * FROM vehicles WHERE id = ? AND active = 1").get(id) as
      | Vehicle
      | undefined;
  }

  listAvailable(filters: {
    seats?: 4 | 7;
    serviceClass?: "SAVER" | "STANDARD" | "LUXURY";
    pickupTime?: string;
    returnTime?: string;
  }): Vehicle[] {
    const where = ["v.active = 1"];
    const parameters: Array<string | number> = [];

    if (filters.seats) {
      where.push("v.seat_capacity = ?");
      parameters.push(filters.seats);
    }

    if (filters.serviceClass) {
      where.push("v.service_class = ?");
      parameters.push(filters.serviceClass);
    }

    if (filters.pickupTime && filters.returnTime) {
      where.push(`NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.vehicle_id = v.id
          AND b.status IN ('CONFIRMED', 'IN_PROGRESS')
          AND b.pickup_time < ? AND b.return_time > ?
      )`);
      parameters.push(filters.returnTime, filters.pickupTime);
      where.push(`NOT EXISTS (
        SELECT 1 FROM vehicle_availability a
        WHERE a.vehicle_id = v.id AND a.status = 'UNAVAILABLE'
          AND a.available_from < ? AND a.available_to > ?
      )`);
      parameters.push(filters.returnTime, filters.pickupTime);
    }

    return this.database
      .prepare(`SELECT v.* FROM vehicles v WHERE ${where.join(" AND ")} ORDER BY v.seat_capacity, v.price_per_hour`)
      .all(...parameters) as unknown as Vehicle[];
  }
}

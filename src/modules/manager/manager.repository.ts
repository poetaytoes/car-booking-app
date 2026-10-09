import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";
import type { Vehicle } from "../vehicles/vehicle.repository.js";

type CountRow = { count: number };

export class ManagerRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  dashboard() {
    const count = (sql: string) => (this.database.prepare(sql).get() as CountRow).count;
    return {
      customers: count("SELECT COUNT(*) AS count FROM users WHERE role = 'CUSTOMER'"),
      activeDrivers: count("SELECT COUNT(*) AS count FROM drivers WHERE active = 1"),
      activeVehicles: count("SELECT COUNT(*) AS count FROM vehicles WHERE active = 1"),
      openBookings: count("SELECT COUNT(*) AS count FROM bookings WHERE booking_mode = 'RIDE' AND status IN ('CONFIRMED', 'IN_PROGRESS')"),
      openRentals: count("SELECT COUNT(*) AS count FROM bookings WHERE booking_mode = 'RENTAL' AND status IN ('CONFIRMED', 'IN_PROGRESS')"),
      openDeliveries: count("SELECT COUNT(*) AS count FROM deliveries WHERE status IN ('PENDING', 'ACCEPTED', 'PICKED_UP')")
    };
  }

  monthlyRentalReport(month: string) {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN b.rental_state IN ('BOOKING_PENDING', 'PAYMENT_PROCESSING', 'PAYMENT_FAILED') THEN 1 ELSE 0 END) AS awaiting_payment,
        SUM(CASE WHEN b.rental_state = 'BOOKING_CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN b.rental_state IN ('CAR_PICKED_UP', 'RENTAL_ACTIVE', 'CAR_RETURNED') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN b.rental_state = 'BOOKING_CLOSED' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN b.rental_state = 'BOOKING_CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN p.status = 'PAID' THEN p.amount ELSE 0 END) AS demo_paid_amount,
        SUM(CASE WHEN p.status = 'REFUNDED' THEN p.amount ELSE 0 END) AS demo_refunded_amount
      FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.booking_mode = 'RENTAL' AND substr(b.pickup_time, 1, 7) = ?
    `).get(month) as Record<string, number | null>;
    return {
      month,
      total: row.total ?? 0,
      awaitingPayment: row.awaiting_payment ?? 0,
      confirmed: row.confirmed ?? 0,
      inProgress: row.in_progress ?? 0,
      closed: row.closed ?? 0,
      cancelled: row.cancelled ?? 0,
      demoPaidAmount: row.demo_paid_amount ?? 0,
      demoRefundedAmount: row.demo_refunded_amount ?? 0
    };
  }

  listCustomers() {
    return this.database.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
        COALESCE(um.plan_code, 'BASIC') AS membership_plan,
        COALESCE(um.status, 'ACTIVE') AS membership_status,
        um.expires_at
      FROM users u LEFT JOIN user_memberships um ON um.user_id = u.id
      WHERE u.role = 'CUSTOMER' ORDER BY u.created_at DESC
    `).all();
  }

  customerExists(id: string): boolean {
    return Boolean(this.database.prepare(
      "SELECT id FROM users WHERE id = ? AND role = 'CUSTOMER'"
    ).get(id));
  }

  listVehicles(): Vehicle[] {
    return this.database.prepare("SELECT * FROM vehicles ORDER BY active DESC, service_class, seat_capacity")
      .all() as unknown as Vehicle[];
  }

  createVehicle(input: {
    name: string; plateNumber: string; seatCapacity: 4 | 7;
    serviceClass: "SAVER" | "STANDARD" | "LUXURY"; pricePerHour: number;
  }): Vehicle {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO vehicles
        (id, name, plate_number, seat_capacity, service_class, price_per_hour, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id, input.name, input.plateNumber, input.seatCapacity,
      input.serviceClass, input.pricePerHour, new Date().toISOString()
    );
    return this.database.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Vehicle;
  }

  updateVehicle(id: string, input: {
    name?: string; pricePerHour?: number; serviceClass?: string; active?: boolean;
  }): Vehicle | undefined {
    const current = this.database.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Vehicle | undefined;
    if (!current) return undefined;
    this.database.prepare(`
      UPDATE vehicles SET name = ?, price_per_hour = ?, service_class = ?, active = ? WHERE id = ?
    `).run(
      input.name ?? current.name,
      input.pricePerHour ?? current.price_per_hour,
      input.serviceClass ?? current.service_class,
      input.active === undefined ? current.active : input.active ? 1 : 0,
      id
    );
    return this.database.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Vehicle;
  }

  listBookings() {
    return this.database.prepare(`
      SELECT b.*, u.name AS customer_name, u.phone AS customer_phone,
        v.name AS vehicle_name, v.plate_number, d.name AS driver_name
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      JOIN vehicles v ON v.id = b.vehicle_id
      LEFT JOIN drivers d ON d.id = b.driver_id
      WHERE b.booking_mode = 'RIDE'
      ORDER BY b.created_at DESC
    `).all();
  }

  listDeliveries() {
    return this.database.prepare(`
      SELECT dl.*, u.name AS customer_name, u.phone AS customer_phone, d.name AS driver_name
      FROM deliveries dl JOIN users u ON u.id = dl.user_id
      LEFT JOIN drivers d ON d.id = dl.driver_id
      ORDER BY dl.created_at DESC
    `).all();
  }

  getBooking(id: string) {
    return this.database.prepare("SELECT id, status, driver_id FROM bookings WHERE id = ? AND booking_mode = 'RIDE'")
      .get(id) as { id: string; status: string; driver_id: string | null } | undefined;
  }

  getDelivery(id: string) {
    return this.database.prepare("SELECT id, status, driver_id FROM deliveries WHERE id = ?")
      .get(id) as { id: string; status: string; driver_id: string | null } | undefined;
  }

  driverHasActiveTask(id: string) {
    return Boolean(this.database.prepare(`
      SELECT 1 FROM bookings WHERE driver_id = ? AND booking_mode = 'RIDE' AND status IN ('CONFIRMED', 'IN_PROGRESS')
      UNION ALL SELECT 1 FROM deliveries WHERE driver_id = ? AND status IN ('PENDING', 'ACCEPTED', 'PICKED_UP') LIMIT 1
    `).get(id, id));
  }

  setDriverStatus(id: string, status: "AVAILABLE" | "ON_TRIP") {
    this.database.prepare("UPDATE drivers SET status = ?, updated_at = ? WHERE id = ? AND status != 'SUSPENDED'")
      .run(status, new Date().toISOString(), id);
  }

  updateBooking(id: string, status: string, driverId: string | null | undefined) {
    const current = this.database.prepare("SELECT * FROM bookings WHERE id = ? AND booking_mode = 'RIDE'").get(id) as
      | { driver_id: string | null }
      | undefined;
    if (!current) return undefined;
    const result = this.database.prepare(
      "UPDATE bookings SET status = ?, driver_id = ? WHERE id = ? AND booking_mode = 'RIDE'"
    ).run(status, driverId === undefined ? current.driver_id : driverId, id);
    if (result.changes === 0) return undefined;
    return this.database.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
  }

  updateDelivery(id: string, status: string, driverId: string | null | undefined) {
    const current = this.database.prepare("SELECT * FROM deliveries WHERE id = ?").get(id) as
      | { driver_id: string | null }
      | undefined;
    if (!current) return undefined;
    const result = this.database.prepare(
      "UPDATE deliveries SET status = ?, driver_id = ? WHERE id = ?"
    ).run(status, driverId === undefined ? current.driver_id : driverId, id);
    if (result.changes === 0) return undefined;
    return this.database.prepare("SELECT * FROM deliveries WHERE id = ?").get(id);
  }
}

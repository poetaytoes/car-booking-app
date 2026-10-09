import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";

export type Delivery = {
  id: string;
  user_id: string;
  driver_id: string | null;
  category: "FOOD" | "ITEM";
  description: string;
  pickup_address: string;
  dropoff_address: string;
  scheduled_at: string;
  recipient_name: string;
  recipient_phone: string;
  status: "PENDING" | "ACCEPTED" | "PICKED_UP" | "DELIVERED" | "CANCELLED";
  created_at: string;
  driver_name?: string | null;
  driver_phone?: string | null;
};

export class DeliveryRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  create(delivery: Delivery): Delivery {
    this.database.prepare(`
      INSERT INTO deliveries (
        id, user_id, category, description, pickup_address, dropoff_address,
        scheduled_at, recipient_name, recipient_phone, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      delivery.id,
      delivery.user_id,
      delivery.category,
      delivery.description,
      delivery.pickup_address,
      delivery.dropoff_address,
      delivery.scheduled_at,
      delivery.recipient_name,
      delivery.recipient_phone,
      delivery.status,
      delivery.created_at
    );
    return delivery;
  }

  findById(id: string): Delivery | undefined {
    return this.database.prepare(`SELECT dl.*, d.name AS driver_name, d.phone AS driver_phone
      FROM deliveries dl LEFT JOIN drivers d ON d.id = dl.driver_id WHERE dl.id = ?`).get(id) as
      | Delivery
      | undefined;
  }

  listForUser(userId: string): Delivery[] {
    return this.database.prepare(
      `SELECT dl.*, d.name AS driver_name, d.phone AS driver_phone FROM deliveries dl
        LEFT JOIN drivers d ON d.id = dl.driver_id WHERE dl.user_id = ? ORDER BY dl.created_at DESC`
    ).all(userId) as unknown as Delivery[];
  }

  cancel(id: string): Delivery {
    this.database.prepare(
      "UPDATE deliveries SET status = 'CANCELLED' WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')"
    ).run(id);
    return this.findById(id)!;
  }
}

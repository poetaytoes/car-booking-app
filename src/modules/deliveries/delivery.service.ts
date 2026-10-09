import { randomUUID } from "node:crypto";
import { ApiError } from "../../shared/api-error.js";
import { DeliveryRepository } from "./delivery.repository.js";
import { dispatchWaitingJobs } from "../dispatch/dispatch.service.js";
import { getDatabase } from "../../database/connection.js";

export type CreateDeliveryInput = {
  category: "FOOD" | "ITEM";
  description: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  recipientName: string;
  recipientPhone: string;
  confirmLegalContents: true;
};

export class DeliveryService {
  constructor(private readonly deliveries = new DeliveryRepository()) {}

  create(userId: string, input: CreateDeliveryInput) {
    const delivery = this.deliveries.create({
      id: randomUUID(),
      user_id: userId,
      driver_id: null,
      category: input.category,
      description: input.description,
      pickup_address: input.pickupAddress,
      dropoff_address: input.dropoffAddress,
      scheduled_at: input.scheduledAt,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      status: "PENDING",
      created_at: new Date().toISOString()
    });
    dispatchWaitingJobs();
    return this.deliveries.findById(delivery.id)!;
  }

  list(userId: string) {
    return this.deliveries.listForUser(userId);
  }

  get(userId: string, id: string) {
    const delivery = this.deliveries.findById(id);
    if (!delivery || delivery.user_id !== userId) throw new ApiError(404, "Delivery not found");
    return delivery;
  }

  cancel(userId: string, id: string) {
    const delivery = this.get(userId, id);
    if (!["PENDING", "ACCEPTED"].includes(delivery.status)) {
      throw new ApiError(409, "This delivery can no longer be cancelled");
    }
    const cancelled = this.deliveries.cancel(id);
    if (delivery.driver_id) {
      getDatabase().prepare("UPDATE drivers SET status = 'AVAILABLE', updated_at = ? WHERE id = ? AND status = 'ON_TRIP'")
        .run(new Date().toISOString(), delivery.driver_id);
    }
    dispatchWaitingJobs();
    return cancelled;
  }
}

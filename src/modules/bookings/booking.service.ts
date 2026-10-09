import { randomUUID } from "node:crypto";
import { ApiError } from "../../shared/api-error.js";
import { VehicleRepository } from "../vehicles/vehicle.repository.js";
import { MembershipService } from "../memberships/membership.service.js";
import { BookingRepository } from "./booking.repository.js";
import { dispatchWaitingJobs } from "../dispatch/dispatch.service.js";

export type CreateBookingInput = {
  vehicleId: string;
  passengerCount: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  returnTime: string;
  notes?: string;
};

export class BookingService {
  constructor(
    private readonly bookings = new BookingRepository(),
    private readonly vehicles = new VehicleRepository(),
    private readonly memberships = new MembershipService()
  ) {}

  create(userId: string, input: CreateBookingInput) {
    const vehicle = this.vehicles.findById(input.vehicleId);
    if (!vehicle) throw new ApiError(404, "Vehicle not found");
    if (input.passengerCount > vehicle.seat_capacity) {
      throw new ApiError(400, `This vehicle allows at most ${vehicle.seat_capacity} passengers`);
    }

    const durationHours = (Date.parse(input.returnTime) - Date.parse(input.pickupTime)) / 3_600_000;
    const basePrice = Math.round(Math.max(1, durationHours) * vehicle.price_per_hour);
    const discountPercent = this.memberships.getDiscountPercent(userId);
    const discountAmount = Math.round(basePrice * discountPercent / 100);
    const totalPrice = basePrice - discountAmount;

    const booking = this.bookings.create({
      id: randomUUID(),
      user_id: userId,
      vehicle_id: input.vehicleId,
      driver_id: null,
      passenger_count: input.passengerCount,
      pickup_address: input.pickupAddress,
      dropoff_address: input.dropoffAddress,
      pickup_time: input.pickupTime,
      return_time: input.returnTime,
      notes: input.notes ?? null,
      status: "CONFIRMED",
      total_price: totalPrice,
      base_price: basePrice,
      discount_amount: discountAmount,
      created_at: new Date().toISOString()
    });
    dispatchWaitingJobs();
    return this.bookings.findById(booking.id)!;
  }

  list(userId: string) {
    return this.bookings.listForUser(userId);
  }

  get(userId: string, id: string) {
    const booking = this.bookings.findById(id);
    if (!booking || booking.user_id !== userId || booking.booking_mode !== "RIDE") throw new ApiError(404, "Booking not found");
    return booking;
  }

  cancel(userId: string, id: string) {
    const booking = this.get(userId, id);
    if (booking.status !== "CONFIRMED") {
      throw new ApiError(409, "Only confirmed bookings can be cancelled");
    }
    if (Date.parse(booking.pickup_time) <= Date.now()) {
      throw new ApiError(409, "A booking cannot be cancelled after its pickup time");
    }
    const cancelled = this.bookings.cancel(id);
    dispatchWaitingJobs();
    return cancelled;
  }
}

import { ApiError } from "../../shared/api-error.js";
import { MembershipService } from "../memberships/membership.service.js";
import { VehicleRepository } from "../vehicles/vehicle.repository.js";
import { RentalRepository, type LocationInput, type RentalState } from "./rental.repository.js";

export type CreateRentalInput = {
  vehicleId: string; pickup: LocationInput; dropoff: LocationInput;
  startAt: string; endAt: string; paymentMethod: "DEMO";
};

export class RentalService {
  constructor(
    private readonly rentals = new RentalRepository(),
    private readonly vehicles = new VehicleRepository(),
    private readonly memberships = new MembershipService()
  ) {}

  create(userId: string, input: CreateRentalInput) {
    const vehicle = this.vehicles.findById(input.vehicleId);
    if (!vehicle) throw new ApiError(404, "Vehicle not found");
    const days = Math.max(1, Math.ceil((Date.parse(input.endAt) - Date.parse(input.startAt)) / 86_400_000));
    const basePrice = Math.round(days * (vehicle.daily_rate ?? vehicle.price_per_hour * 24));
    const discount = Math.round(basePrice * this.memberships.getDiscountPercent(userId) / 100);
    return this.rentals.create({
      userId, vehicleId: input.vehicleId, pickup: input.pickup, dropoff: input.dropoff,
      startAt: input.startAt, endAt: input.endAt, basePrice, discount,
      total: basePrice - discount, paymentMethod: input.paymentMethod
    });
  }

  list(userId: string) { return this.rentals.listForUser(userId); }
  listAll() { return this.rentals.listAll(); }

  get(userId: string, id: string) {
    const rental = this.rentals.findById(id);
    if (!rental || rental.user_id !== userId) throw new ApiError(404, "Rental not found");
    return rental;
  }

  pay(userId: string, id: string, outcome: "SUCCEED" | "FAIL") {
    this.get(userId, id);
    return this.rentals.processPayment(id, outcome);
  }

  cancel(userId: string, id: string) {
    const rental = this.get(userId, id);
    if (Date.parse(rental.pickup_time) <= Date.now()) throw new ApiError(409, "Pickup time has passed");
    const cancellable: RentalState[] = ["BOOKING_PENDING", "PAYMENT_FAILED", "BOOKING_CONFIRMED"];
    return this.rentals.transition(id, cancellable, "BOOKING_CANCELLED",
      rental.payment_status === "PAID" ? "REFUNDED" : undefined);
  }

  handover(id: string, action: "PICKUP" | "START" | "RETURN" | "CLOSE") {
    const transitions: Record<typeof action, [RentalState[], RentalState]> = {
      PICKUP: [["BOOKING_CONFIRMED"], "CAR_PICKED_UP"],
      START: [["CAR_PICKED_UP"], "RENTAL_ACTIVE"],
      RETURN: [["RENTAL_ACTIVE"], "CAR_RETURNED"],
      CLOSE: [["CAR_RETURNED"], "BOOKING_CLOSED"]
    };
    const [expected, next] = transitions[action];
    return this.rentals.transition(id, expected, next);
  }
}

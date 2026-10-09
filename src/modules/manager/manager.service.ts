import { ApiError } from "../../shared/api-error.js";
import { DriverService } from "../drivers/driver.service.js";
import { MembershipService } from "../memberships/membership.service.js";
import { ManagerRepository } from "./manager.repository.js";
import { dispatchWaitingJobs } from "../dispatch/dispatch.service.js";

export class ManagerService {
  constructor(
    private readonly manager = new ManagerRepository(),
    private readonly drivers = new DriverService(),
    private readonly memberships = new MembershipService()
  ) {}

  dashboard() { return this.manager.dashboard(); }
  monthlyRentalReport(month: string) { return this.manager.monthlyRentalReport(month); }
  listCustomers() { return this.manager.listCustomers(); }
  listVehicles() { return this.manager.listVehicles(); }
  listBookings() { return this.manager.listBookings(); }
  listDeliveries() { return this.manager.listDeliveries(); }

  setMembership(userId: string, planCode: "BASIC" | "SILVER" | "GOLD", months: number) {
    if (!this.manager.customerExists(userId)) throw new ApiError(404, "Customer not found");
    return this.memberships.activate(userId, planCode, months);
  }

  createVehicle(input: {
    name: string; plateNumber: string; seatCapacity: 4 | 7;
    serviceClass: "SAVER" | "STANDARD" | "LUXURY"; pricePerHour: number;
  }) {
    return this.manager.createVehicle(input);
  }

  updateVehicle(id: string, input: {
    name?: string; pricePerHour?: number;
    serviceClass?: "SAVER" | "STANDARD" | "LUXURY"; active?: boolean;
  }) {
    const vehicle = this.manager.updateVehicle(id, input);
    if (!vehicle) throw new ApiError(404, "Vehicle not found");
    return vehicle;
  }

  updateBooking(
    id: string,
    input: {
      status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
      driverId?: string | null;
    }
  ) {
    const current = this.manager.getBooking(id);
    if (!current) throw new ApiError(404, "Booking not found");
    if (["CANCELLED", "COMPLETED"].includes(current.status) && input.status !== current.status) {
      throw new ApiError(409, "A finished booking cannot be reopened");
    }
    const bookingTransitions: Record<string, string[]> = {
      CONFIRMED: ["CONFIRMED", "IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
      COMPLETED: ["COMPLETED"], CANCELLED: ["CANCELLED"]
    };
    if (!bookingTransitions[current.status]?.includes(input.status)) {
      throw new ApiError(409, "Invalid booking status transition");
    }
    const effectiveDriverId = input.driverId === undefined ? current.driver_id : input.driverId;
    this.validateDriver(input.driverId, current.driver_id);
    if (input.status === "IN_PROGRESS" && !effectiveDriverId) {
      throw new ApiError(409, "Assign a driver before starting the booking");
    }
    const booking = this.manager.updateBooking(id, input.status, input.driverId);
    if (!booking) throw new ApiError(404, "Booking not found");
    if (current.driver_id && current.driver_id !== effectiveDriverId) {
      this.manager.setDriverStatus(current.driver_id, "AVAILABLE");
      dispatchWaitingJobs();
    }
    if (input.status === "IN_PROGRESS" && effectiveDriverId) {
      this.manager.setDriverStatus(effectiveDriverId, "ON_TRIP");
    }
    if (["COMPLETED", "CANCELLED"].includes(input.status)) {
      const driverId = effectiveDriverId;
      if (driverId) this.manager.setDriverStatus(driverId, "AVAILABLE");
      dispatchWaitingJobs();
    }
    return booking;
  }

  updateDelivery(
    id: string,
    input: {
      status: "PENDING" | "ACCEPTED" | "PICKED_UP" | "DELIVERED" | "CANCELLED";
      driverId?: string | null;
    }
  ) {
    const current = this.manager.getDelivery(id);
    if (!current) throw new ApiError(404, "Delivery not found");
    if (["DELIVERED", "CANCELLED"].includes(current.status) && input.status !== current.status) {
      throw new ApiError(409, "A finished delivery cannot be reopened");
    }
    const deliveryTransitions: Record<string, string[]> = {
      PENDING: ["PENDING", "ACCEPTED", "CANCELLED"],
      ACCEPTED: ["ACCEPTED", "PICKED_UP", "CANCELLED"],
      PICKED_UP: ["PICKED_UP", "DELIVERED", "CANCELLED"],
      DELIVERED: ["DELIVERED"], CANCELLED: ["CANCELLED"]
    };
    if (!deliveryTransitions[current.status]?.includes(input.status)) {
      throw new ApiError(409, "Invalid delivery status transition");
    }
    const effectiveDriverId = input.driverId === undefined ? current.driver_id : input.driverId;
    this.validateDriver(input.driverId, current.driver_id);
    if (["ACCEPTED", "PICKED_UP", "DELIVERED"].includes(input.status) && !effectiveDriverId) {
      throw new ApiError(409, "Assign a driver before accepting the delivery");
    }
    const delivery = this.manager.updateDelivery(id, input.status, input.driverId);
    if (!delivery) throw new ApiError(404, "Delivery not found");
    if (current.driver_id && current.driver_id !== effectiveDriverId) {
      this.manager.setDriverStatus(current.driver_id, "AVAILABLE");
      dispatchWaitingJobs();
    }
    if (["ACCEPTED", "PICKED_UP"].includes(input.status) && effectiveDriverId) {
      this.manager.setDriverStatus(effectiveDriverId, "ON_TRIP");
    }
    if (["DELIVERED", "CANCELLED"].includes(input.status)) {
      const driverId = effectiveDriverId;
      if (driverId) this.manager.setDriverStatus(driverId, "AVAILABLE");
      dispatchWaitingJobs();
    }
    return delivery;
  }

  private validateDriver(driverId: string | null | undefined, currentDriverId: string | null): void {
    if (!driverId) return;
    const driver = this.drivers.get(driverId);
    if (!driver.active || ["SUSPENDED", "OFF_DUTY"].includes(driver.status) ||
      (driverId !== currentDriverId && this.manager.driverHasActiveTask(driverId))) {
      throw new ApiError(409, "This driver cannot be assigned");
    }
  }
}

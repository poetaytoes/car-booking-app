import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireManager } from "../../middleware/manager.js";
import { DriverService } from "../drivers/driver.service.js";
import { ManagerService } from "./manager.service.js";
import { asyncHandler } from "../../shared/async-handler.js";

const router = Router();
const manager = new ManagerService();
const drivers = new DriverService();

const driverCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(20),
  email: z.email().optional().nullable(),
  licenseNumber: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(100).optional()
});
const driverUpdateSchema = driverCreateSchema.partial().extend({
  status: z.enum(["AVAILABLE", "ON_TRIP", "OFF_DUTY", "SUSPENDED"]).optional(),
  active: z.boolean().optional()
});
const vehicleCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  plateNumber: z.string().trim().min(2).max(30),
  seatCapacity: z.union([z.literal(4), z.literal(7)]),
  serviceClass: z.enum(["SAVER", "STANDARD", "LUXURY"]),
  pricePerHour: z.number().int().positive().max(10_000_000)
});
const vehicleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  serviceClass: z.enum(["SAVER", "STANDARD", "LUXURY"]).optional(),
  pricePerHour: z.number().int().positive().max(10_000_000).optional(),
  active: z.boolean().optional()
});
const membershipSchema = z.object({
  planCode: z.enum(["BASIC", "SILVER", "GOLD"]),
  months: z.number().int().min(1).max(24).default(1)
});
const bookingUpdateSchema = z.object({
  status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  driverId: z.uuid().nullable().optional()
});
const deliveryUpdateSchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "PICKED_UP", "DELIVERED", "CANCELLED"]),
  driverId: z.uuid().nullable().optional()
});

router.use(requireAuth, requireManager);

router.get("/dashboard", (_request, response) => response.json({ data: manager.dashboard() }));
router.get("/reports/monthly-rentals", (request, response) => {
  const { month } = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
    .parse({ month: request.query.month ?? new Date().toISOString().slice(0, 7) });
  response.json({ data: manager.monthlyRentalReport(month) });
});
router.get("/customers", (_request, response) => response.json({ data: manager.listCustomers() }));
router.patch("/customers/:id/membership", (request, response) => {
  const input = membershipSchema.parse(request.body);
  response.json({ data: manager.setMembership(request.params.id!, input.planCode, input.months) });
});

router.get("/drivers", (_request, response) => response.json({ data: drivers.list() }));
router.post("/drivers", asyncHandler(async (request, response) => {
  response.status(201).json({ data: await drivers.create(driverCreateSchema.parse(request.body)) });
}));
router.patch("/drivers/:id", asyncHandler(async (request, response) => {
  response.json({ data: await drivers.update(String(request.params.id), driverUpdateSchema.parse(request.body)) });
}));

router.get("/vehicles", (_request, response) => response.json({ data: manager.listVehicles() }));
router.post("/vehicles", (request, response) => {
  response.status(201).json({ data: manager.createVehicle(vehicleCreateSchema.parse(request.body)) });
});
router.patch("/vehicles/:id", (request, response) => {
  response.json({ data: manager.updateVehicle(request.params.id!, vehicleUpdateSchema.parse(request.body)) });
});

router.get("/bookings", (_request, response) => response.json({ data: manager.listBookings() }));
router.patch("/bookings/:id", (request, response) => {
  response.json({ data: manager.updateBooking(request.params.id!, bookingUpdateSchema.parse(request.body)) });
});
router.get("/deliveries", (_request, response) => response.json({ data: manager.listDeliveries() }));
router.patch("/deliveries/:id", (request, response) => {
  response.json({ data: manager.updateDelivery(request.params.id!, deliveryUpdateSchema.parse(request.body)) });
});

export const managerRouter = router;

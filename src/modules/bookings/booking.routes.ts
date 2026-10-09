import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { BookingService } from "./booking.service.js";

const router = Router();
const service = new BookingService();

const createSchema = z.object({
  vehicleId: z.uuid(),
  passengerCount: z.number().int().min(1).max(7),
  pickupAddress: z.string().trim().min(5).max(300),
  dropoffAddress: z.string().trim().min(5).max(300),
  pickupTime: z.iso.datetime(),
  returnTime: z.iso.datetime(),
  notes: z.string().trim().max(500).optional()
}).refine((value) => value.returnTime > value.pickupTime, {
  message: "returnTime must be after pickupTime",
  path: ["returnTime"]
}).refine((value) => Date.parse(value.pickupTime) > Date.now(), {
  message: "pickupTime must be in the future",
  path: ["pickupTime"]
});

router.use(requireAuth, requireCustomer);

router.post("/", (request, response) => {
  const booking = service.create(request.user!.id, createSchema.parse(request.body));
  response.status(201).json({ data: booking });
});

router.get("/", (request, response) => {
  response.json({ data: service.list(request.user!.id) });
});

router.get("/:id", (request, response) => {
  response.json({ data: service.get(request.user!.id, request.params.id!) });
});

router.patch("/:id/cancel", (request, response) => {
  response.json({ data: service.cancel(request.user!.id, request.params.id!) });
});

export const bookingRouter = router;

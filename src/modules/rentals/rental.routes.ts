import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { requireManager } from "../../middleware/manager.js";
import { RentalService } from "./rental.service.js";

const router = Router();
const service = new RentalService();
const location = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional()
});
const create = z.object({
  vehicleId: z.uuid(), pickup: location, dropoff: location,
  startAt: z.iso.datetime(), endAt: z.iso.datetime(),
  paymentMethod: z.literal("DEMO").default("DEMO")
}).refine((value) => value.endAt > value.startAt, {
  message: "endAt must be after startAt", path: ["endAt"]
}).refine((value) => Date.parse(value.startAt) > Date.now(), {
  message: "startAt must be in the future", path: ["startAt"]
});

router.use(requireAuth);
router.get("/manager", requireManager, (_request, response) => {
  response.json({ data: service.listAll() });
});
router.patch("/manager/:id/:action", requireManager, (request, response) => {
  const action = z.enum(["PICKUP", "START", "RETURN", "CLOSE"]).parse(String(request.params.action).toUpperCase());
  response.json({ data: service.handover(String(request.params.id), action) });
});
router.use(requireCustomer);
router.post("/", (request, response) => {
  response.status(201).json({ data: service.create(request.user!.id, create.parse(request.body)) });
});
router.get("/", (request, response) => response.json({ data: service.list(request.user!.id) }));
router.get("/:id", (request, response) => response.json({ data: service.get(request.user!.id, request.params.id!) }));
router.post("/:id/demo-payment", (request, response) => {
  const { outcome } = z.object({ outcome: z.enum(["SUCCEED", "FAIL"]) }).parse(request.body);
  response.json({ data: service.pay(request.user!.id, request.params.id!, outcome) });
});
router.patch("/:id/cancel", (request, response) => {
  response.json({ data: service.cancel(request.user!.id, request.params.id!) });
});

export const rentalRouter = router;

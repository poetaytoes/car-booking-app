import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { DeliveryService } from "./delivery.service.js";

const router = Router();
const service = new DeliveryService();

const createSchema = z.object({
  category: z.enum(["FOOD", "ITEM"]),
  description: z.string().trim().min(2).max(500),
  pickupAddress: z.string().trim().min(5).max(300),
  dropoffAddress: z.string().trim().min(5).max(300),
  scheduledAt: z.iso.datetime(),
  recipientName: z.string().trim().min(2).max(100),
  recipientPhone: z.string().trim().min(7).max(20),
  confirmLegalContents: z.literal(true)
}).refine((value) => Date.parse(value.scheduledAt) > Date.now(), {
  message: "scheduledAt must be in the future",
  path: ["scheduledAt"]
});

router.use(requireAuth, requireCustomer);

router.post("/", (request, response) => {
  const delivery = service.create(request.user!.id, createSchema.parse(request.body));
  response.status(201).json({ data: delivery });
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

export const deliveryRouter = router;

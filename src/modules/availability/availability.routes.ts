import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireManager } from "../../middleware/manager.js";
import { AvailabilityRepository } from "./availability.repository.js";

const router = Router();
const repository = new AvailabilityRepository();
const blockSchema = z.object({
  vehicleId: z.uuid(), availableFrom: z.iso.datetime(), availableTo: z.iso.datetime()
}).refine((value) => value.availableTo > value.availableFrom, {
  path: ["availableTo"], message: "availableTo must be after availableFrom"
});

router.get("/vehicles/:id", (request, response) => {
  response.json({ data: repository.list(String(request.params.id)) });
});
router.post("/", requireAuth, requireManager, (request, response) => {
  const input = blockSchema.parse(request.body);
  response.status(201).json({ data: repository.block(input.vehicleId, input.availableFrom, input.availableTo) });
});
router.patch("/:id/release", requireAuth, requireManager, (request, response) => {
  response.json({ data: repository.release(String(request.params.id)) });
});

export const availabilityRouter = router;

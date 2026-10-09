import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../../shared/api-error.js";
import { VehicleRepository } from "./vehicle.repository.js";

const router = Router();
const repository = new VehicleRepository();

const querySchema = z.object({
  seats: z.coerce.number().pipe(z.union([z.literal(4), z.literal(7)])).optional(),
  serviceClass: z.enum(["SAVER", "STANDARD", "LUXURY"]).optional(),
  pickupTime: z.iso.datetime().optional(),
  returnTime: z.iso.datetime().optional()
}).refine(
  (value) => Boolean(value.pickupTime) === Boolean(value.returnTime),
  { message: "pickupTime and returnTime must be provided together" }
).refine(
  (value) => !value.pickupTime || !value.returnTime || value.returnTime > value.pickupTime,
  { message: "returnTime must be after pickupTime" }
);

router.get("/", (request, response) => {
  const filters = querySchema.parse(request.query);
  response.json({ data: repository.listAvailable(filters) });
});

router.get("/:id", (request, response) => {
  const vehicle = repository.findById(request.params.id!);
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  response.json({ data: vehicle });
});

export const vehicleRouter = router;

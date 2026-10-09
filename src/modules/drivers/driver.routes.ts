import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireDriver } from "../../middleware/auth.js";
import { DriverTasks } from "./driver.tasks.js";

const router = Router();
const tasks = new DriverTasks();
const actionSchema = z.object({ action: z.enum(["CONFIRM", "PICKED_UP", "COMPLETE"]) });
const availabilitySchema = z.object({ status: z.enum(["AVAILABLE", "OFF_DUTY"]) });
const locationSchema = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180)
});

router.use(requireAuth, requireDriver);
router.get("/tasks", (request, response) => {
  response.json({ data: tasks.list(request.user!.id) });
});
router.patch("/availability", (request, response) => {
  response.json({ data: tasks.setAvailability(request.user!.id, availabilitySchema.parse(request.body).status) });
});
router.patch("/location", (request, response) => {
  const location = locationSchema.parse(request.body);
  response.json({ data: tasks.updateLocation(request.user!.id, location.latitude, location.longitude) });
});
router.patch("/tasks/:kind/:id", (request, response) => {
  const kind = z.enum(["BOOKING", "DELIVERY"]).parse(request.params.kind);
  const id = z.uuid().parse(request.params.id);
  const { action } = actionSchema.parse(request.body);
  response.json({ data: tasks.advance(request.user!.id, kind, id, action) });
});

export const driverRouter = router;

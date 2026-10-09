import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { MembershipService } from "./membership.service.js";

const router = Router();
const service = new MembershipService();

const activationSchema = z.object({
  planCode: z.enum(["BASIC", "SILVER", "GOLD"]),
  months: z.number().int().min(1).max(12).default(1)
});

router.get("/plans", (_request, response) => {
  response.json({ data: service.listPlans() });
});

router.get("/me", requireAuth, requireCustomer, (request, response) => {
  response.json({ data: service.getForUser(request.user!.id) });
});

// Demonstration activation. A real deployment should call this only after payment succeeds.
router.put("/me", requireAuth, requireCustomer, (request, response) => {
  const input = activationSchema.parse(request.body);
  response.json({ data: service.activate(request.user!.id, input.planCode, input.months) });
});

export const membershipRouter = router;

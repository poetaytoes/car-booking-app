import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { ReviewRepository } from "./review.repository.js";

const router = Router();
const repository = new ReviewRepository();
const create = z.object({
  bookingId: z.uuid(), rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(2).max(1000)
});

router.get("/vehicles/:id", (request, response) => {
  response.json({ data: repository.listForVehicle(String(request.params.id)) });
});
router.post("/", requireAuth, requireCustomer, (request, response) => {
  const input = create.parse(request.body);
  response.status(201).json({ data: repository.submit(request.user!.id, input.bookingId,
    input.rating, input.comment) });
});

export const reviewRouter = router;

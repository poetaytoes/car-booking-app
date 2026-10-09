import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { AuthService } from "./auth.service.js";

const router = Router();
const service = new AuthService();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  phone: z.string().trim().min(7).max(20),
  password: z.string().min(8).max(100)
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

router.post("/register", asyncHandler(async (request, response) => {
  const result = await service.register(registerSchema.parse(request.body));
  response.status(201).json({ data: result });
}));

router.post("/login", asyncHandler(async (request, response) => {
  const result = await service.login(loginSchema.parse(request.body));
  response.json({ data: result });
}));

router.get("/me", requireAuth, (request, response) => {
  response.json({ data: service.getProfile(request.user!.id, request.user!.role) });
});

export const authRouter = router;

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../shared/api-error.js";
import { getDatabase } from "../database/connection.js";

type TokenPayload = {
  sub: string;
  email: string;
  role: "CUSTOMER" | "ADMIN" | "DRIVER";
};

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  const [scheme, token] = request.headers.authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    request.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

export function requireCustomer(request: Request, _response: Response, next: NextFunction): void {
  if (request.user?.role !== "CUSTOMER") {
    next(new ApiError(403, "Customer account required"));
    return;
  }
  next();
}

export function requireDriver(request: Request, _response: Response, next: NextFunction): void {
  if (request.user?.role !== "DRIVER") {
    next(new ApiError(403, "Driver account required"));
    return;
  }
  const driver = getDatabase().prepare("SELECT active, status FROM drivers WHERE id = ?")
    .get(request.user.id) as { active: number; status: string } | undefined;
  if (!driver?.active || driver.status === "SUSPENDED") {
    next(new ApiError(403, "Driver account is unavailable"));
    return;
  }
  next();
}

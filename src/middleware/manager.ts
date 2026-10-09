import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../shared/api-error.js";

export function requireManager(request: Request, _response: Response, next: NextFunction): void {
  if (request.user?.role !== "ADMIN") {
    next(new ApiError(403, "Company manager access required"));
    return;
  }
  next();
}

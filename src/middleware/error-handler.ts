import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../shared/api-error.js";

export const notFound: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, `Route not found: ${request.method} ${request.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { message: "Validation failed", details: error.flatten() }
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: { message: error.message, details: error.details }
    });
    return;
  }

  if (env.NODE_ENV !== "test") console.error(error);
  response.status(500).json({ error: { message: "Internal server error" } });
};

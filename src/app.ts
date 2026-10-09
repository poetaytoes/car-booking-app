import cors from "cors";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { bookingRouter } from "./modules/bookings/booking.routes.js";
import { deliveryRouter } from "./modules/deliveries/delivery.routes.js";
import { vehicleRouter } from "./modules/vehicles/vehicle.routes.js";
import { membershipRouter } from "./modules/memberships/membership.routes.js";
import { managerRouter } from "./modules/manager/manager.routes.js";
import { driverRouter } from "./modules/drivers/driver.routes.js";
import { rentalRouter } from "./modules/rentals/rental.routes.js";
import { availabilityRouter } from "./modules/availability/availability.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim());
  app.use(cors({ origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || (env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error("Origin is not allowed"));
    }
  } }));
  app.use(express.json({ limit: "100kb" }));
  const viteFrontend = path.resolve(process.cwd(), "CarBooking-Frontend", "carbooking-frontend", "dist");
  const staticFrontend = fs.existsSync(viteFrontend)
    ? viteFrontend
    : path.resolve(process.cwd(), "public");
  app.use(express.static(staticFrontend));

  app.get("/api/health", (_request, response) => {
    response.json({ data: { status: "ok", timestamp: new Date().toISOString() } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/vehicles", vehicleRouter);
  app.use("/api/memberships", membershipRouter);
  app.use("/api/manager", managerRouter);
  app.use("/api/driver", driverRouter);
  app.use("/api/bookings", bookingRouter);
  app.use("/api/rentals", rentalRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/reviews", reviewRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/deliveries", deliveryRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

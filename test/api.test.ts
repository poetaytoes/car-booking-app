import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = "./data/test.sqlite";
process.env.JWT_SECRET = "test-secret-at-least-sixteen-characters";

const testDatabasePath = path.resolve(process.env.DATABASE_PATH);
for (const suffix of ["", "-shm", "-wal"]) {
  const filename = `${testDatabasePath}${suffix}`;
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
}

const { createApp } = await import("../src/app.js");
const { closeDatabase } = await import("../src/database/connection.js");
const { runMigrations } = await import("../src/database/migrate.js");
const { seedReferenceData } = await import("../src/database/seed.js");
const { env } = await import("../src/config/env.js");
const { AuthRepository } = await import("../src/modules/auth/auth.repository.js");
const { hashPassword } = await import("../src/shared/password.js");

const app = createApp();
let token = "";
let vehicleId = "";
let bookingId = "";
let managerToken = "";
let deliveryId = "";

before(() => {
  runMigrations();
  seedReferenceData();
});

after(() => {
  closeDatabase();
  for (const suffix of ["", "-shm", "-wal"]) {
    const filename = `${env.DATABASE_PATH}${suffix}`;
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
});

test("health check works", async () => {
  const response = await request(app).get("/api/health").expect(200);
  assert.equal(response.body.data.status, "ok");
});

test("web interface is served", async () => {
  const response = await request(app).get("/").expect(200);
  assert.match(response.text, /RideWise|CarBooking/);
  assert.match(response.text, /js\/app\.js|src\/main\.js|assets\//);
});

test("a user can register and log in", async () => {
  const registration = await request(app).post("/api/auth/register").send({
    name: "School Tester",
    email: "tester@example.com",
    phone: "0812345678",
    password: "password123"
  }).expect(201);

  assert.equal(registration.body.data.user.email, "tester@example.com");
  assert.equal(registration.body.data.user.password_hash, undefined);

  const login = await request(app).post("/api/auth/login").send({
    email: "tester@example.com",
    password: "password123"
  }).expect(200);

  token = login.body.data.token;
  assert.ok(token);
});

test("vehicles can be filtered by seat count", async () => {
  const response = await request(app).get("/api/vehicles?seats=7").expect(200);
  assert.equal(response.body.data.length, 4);
  assert.ok(response.body.data.every((vehicle: { seat_capacity: number }) => vehicle.seat_capacity === 7));
  vehicleId = response.body.data[0].id;

  const luxury = await request(app).get("/api/vehicles?serviceClass=LUXURY").expect(200);
  assert.equal(luxury.body.data.length, 2);
  assert.ok(luxury.body.data.every(
    (vehicle: { service_class: string }) => vehicle.service_class === "LUXURY"
  ));

  const allVehicles = await request(app).get("/api/vehicles").expect(200);
  assert.ok(allVehicles.body.data.every(
    (vehicle: { price_per_hour: number }) => Number.isInteger(vehicle.price_per_hour) && vehicle.price_per_hour >= 90_000
  ));
  const plans = await request(app).get("/api/memberships/plans").expect(200);
  assert.equal(plans.body.data.find((plan: { code: string }) => plan.code === "SILVER").monthly_fee, 199_000);
});

test("a user can activate a membership", async () => {
  const response = await request(app).put("/api/memberships/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ planCode: "SILVER", months: 3 })
    .expect(200);
  assert.equal(response.body.data.plan_code, "SILVER");
  assert.equal(response.body.data.discount_percent, 5);
});

test("booking prevents an overlapping reservation", async () => {
  const pickupTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const returnTime = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString();
  const body = {
    vehicleId,
    passengerCount: 6,
    pickupAddress: "School main entrance",
    dropoffAddress: "City science museum",
    pickupTime,
    returnTime
  };

  const booking = await request(app).post("/api/bookings")
    .set("Authorization", `Bearer ${token}`).send(body).expect(201);
  assert.equal(booking.body.data.status, "CONFIRMED");
  assert.ok(booking.body.data.total_price > 0);
  assert.ok(booking.body.data.discount_amount > 0);
  assert.equal(booking.body.data.base_price - booking.body.data.discount_amount, booking.body.data.total_price);
  assert.ok(Number.isInteger(booking.body.data.total_price));
  bookingId = booking.body.data.id;

  const conflict = await request(app).post("/api/bookings")
    .set("Authorization", `Bearer ${token}`).send(body).expect(409);
  assert.match(conflict.body.error.message, /not available/i);
});

test("a user can request an allowed delivery", async () => {
  const response = await request(app).post("/api/deliveries")
    .set("Authorization", `Bearer ${token}`)
    .send({
      category: "FOOD",
      description: "Two packed lunches",
      pickupAddress: "School cafeteria building",
      dropoffAddress: "Student activity building",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      recipientName: "Example Student",
      recipientPhone: "0899999999",
      confirmLegalContents: true
    })
    .expect(201);

  assert.equal(response.body.data.status, "PENDING");
  deliveryId = response.body.data.id;
});

test("company manager can manage drivers and assign a booking", async () => {
  await request(app).get("/api/manager/dashboard")
    .set("Authorization", `Bearer ${token}`).expect(403);

  const authRepository = new AuthRepository();
  authRepository.create({
    id: randomUUID(),
    name: "Test Manager",
    email: "manager@example.com",
    phone: "0800000000",
    password_hash: await hashPassword("manager-password"),
    role: "ADMIN",
    created_at: new Date().toISOString()
  });
  const login = await request(app).post("/api/auth/login").send({
    email: "manager@example.com",
    password: "manager-password"
  }).expect(200);
  managerToken = login.body.data.token;

  const pricedVehicle = await request(app).get("/api/vehicles?serviceClass=LUXURY").expect(200);
  const luxuryVehicle = pricedVehicle.body.data[0];
  const rateUpdate = await request(app).patch(`/api/manager/vehicles/${luxuryVehicle.id}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ pricePerHour: 475_000 }).expect(200);
  assert.equal(rateUpdate.body.data.price_per_hour, 475_000);
  await request(app).patch(`/api/manager/vehicles/${luxuryVehicle.id}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ pricePerHour: luxuryVehicle.price_per_hour }).expect(200);

  const driver = await request(app).post("/api/manager/drivers")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      name: "Driver One",
      phone: "0822222222",
      email: "driver@example.com",
      licenseNumber: "DL-TEST-001"
    }).expect(201);

  const assignment = await request(app).patch(`/api/manager/bookings/${bookingId}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ status: "IN_PROGRESS", driverId: driver.body.data.id })
    .expect(200);
  assert.equal(assignment.body.data.driver_id, driver.body.data.id);

  const upgradedDriver = await request(app).patch(`/api/manager/drivers/${driver.body.data.id}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ password: "driver-one-password" }).expect(200);
  assert.equal(upgradedDriver.body.data.hasLogin, true);
  assert.equal(upgradedDriver.body.data.password_hash, undefined);
  const driverLogin = await request(app).post("/api/auth/login")
    .send({ email: "driver@example.com", password: "driver-one-password" }).expect(200);
  assert.equal(driverLogin.body.data.user.role, "DRIVER");

  const dashboard = await request(app).get("/api/manager/dashboard")
    .set("Authorization", `Bearer ${managerToken}`).expect(200);
  assert.equal(dashboard.body.data.activeDrivers, 1);
  assert.equal(dashboard.body.data.customers, 1);
});

test("driver app accepts and completes assigned work, then receives queued work", async () => {
  const driver = await request(app).post("/api/manager/drivers")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ name: "Driver Two", phone: "0833333333", email: "driver2@example.com",
      licenseNumber: "DL-TEST-002", password: "driver-password" }).expect(201);
  assert.equal(driver.body.data.password_hash, undefined);

  const login = await request(app).post("/api/auth/login")
    .send({ email: "driver2@example.com", password: "driver-password" }).expect(200);
  assert.equal(login.body.data.user.role, "DRIVER");
  const driverToken = login.body.data.token;
  const location = await request(app).patch("/api/driver/location")
    .set("Authorization", `Bearer ${driverToken}`)
    .send({ latitude: 13.7563, longitude: 100.5018 }).expect(200);
  assert.equal(location.body.data.latitude, 13.7563);

  const tasks = await request(app).get("/api/driver/tasks")
    .set("Authorization", `Bearer ${driverToken}`).expect(200);
  assert.equal(tasks.body.data.length, 1);
  assert.equal(tasks.body.data[0].id, deliveryId);
  await request(app).get("/api/driver/tasks")
    .set("Authorization", `Bearer ${token}`).expect(403);

  const vehicles = await request(app).get("/api/vehicles?seats=4").expect(200);
  const booking = await request(app).post("/api/bookings")
    .set("Authorization", `Bearer ${token}`)
    .send({ vehicleId: vehicles.body.data[0].id, passengerCount: 2,
      pickupAddress: "School north gate", dropoffAddress: "City library entrance",
      pickupTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      returnTime: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString() }).expect(201);
  assert.equal(booking.body.data.driver_id, null);

  for (const action of ["CONFIRM", "PICKED_UP", "COMPLETE"]) {
    await request(app).patch(`/api/driver/tasks/DELIVERY/${deliveryId}`)
      .set("Authorization", `Bearer ${driverToken}`).send({ action }).expect(200);
  }
  const nextTasks = await request(app).get("/api/driver/tasks")
    .set("Authorization", `Bearer ${driverToken}`).expect(200);
  assert.equal(nextTasks.body.data.length, 1);
  assert.equal(nextTasks.body.data[0].id, booking.body.data.id);
  assert.equal(nextTasks.body.data[0].kind, "BOOKING");

  await request(app).patch("/api/driver/availability")
    .set("Authorization", `Bearer ${driverToken}`).send({ status: "OFF_DUTY" }).expect(409);
  await request(app).patch(`/api/driver/tasks/BOOKING/${booking.body.data.id}`)
    .set("Authorization", `Bearer ${driverToken}`).send({ action: "CONFIRM" }).expect(200);
  await request(app).patch(`/api/driver/tasks/BOOKING/${booking.body.data.id}`)
    .set("Authorization", `Bearer ${driverToken}`).send({ action: "COMPLETE" }).expect(200);
  await request(app).patch("/api/driver/availability")
    .set("Authorization", `Bearer ${driverToken}`).send({ status: "OFF_DUTY" }).expect(200);
});

test("UML rental lifecycle uses demo payment and preserves ride dispatch", async () => {
  const vehicles = await request(app).get("/api/vehicles?seats=4").expect(200);
  const rentalVehicleId = vehicles.body.data[0].id;
  const startAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const endAt = new Date(Date.now() + 9 * 86_400_000).toISOString();
  const rental = await request(app).post("/api/rentals")
    .set("Authorization", `Bearer ${token}`)
    .send({ vehicleId: rentalVehicleId, startAt, endAt,
      pickup: { name: "School office", address: "School main entrance", city: "Bangkok", latitude: 13.7563, longitude: 100.5018 },
      dropoff: { name: "School office", address: "School main entrance", city: "Bangkok", latitude: 13.7563, longitude: 100.5018 },
      paymentMethod: "DEMO" }).expect(201);
  const id = rental.body.data.id;
  assert.equal(rental.body.data.rental_state, "BOOKING_PENDING");
  assert.equal(rental.body.data.payment_status, "PENDING");
  assert.equal(rental.body.data.driver_id, null);
  assert.ok(rental.body.data.total_price > 0);
  const { LocationService } = await import("../src/modules/locations/location.service.js");
  assert.equal(new LocationService().distanceTo(rental.body.data.pickup_location_id,
    rental.body.data.dropoff_location_id), 0);
  await request(app).get(`/api/bookings/${id}`)
    .set("Authorization", `Bearer ${token}`).expect(404);
  await request(app).patch(`/api/bookings/${id}/cancel`)
    .set("Authorization", `Bearer ${token}`).expect(404);
  await request(app).patch(`/api/manager/bookings/${id}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ status: "CANCELLED" }).expect(404);

  await request(app).post("/api/rentals")
    .set("Authorization", `Bearer ${token}`)
    .send({ vehicleId: rentalVehicleId, startAt, endAt,
      pickup: { name: "School office", address: "School main entrance", city: "Bangkok" },
      dropoff: { name: "School office", address: "School main entrance", city: "Bangkok" } })
    .expect(409);
  const failed = await request(app).post(`/api/rentals/${id}/demo-payment`)
    .set("Authorization", `Bearer ${token}`).send({ outcome: "FAIL" }).expect(200);
  assert.equal(failed.body.data.rental_state, "PAYMENT_FAILED");
  const paid = await request(app).post(`/api/rentals/${id}/demo-payment`)
    .set("Authorization", `Bearer ${token}`).send({ outcome: "SUCCEED" }).expect(200);
  assert.equal(paid.body.data.payment_status, "PAID");
  assert.equal(paid.body.data.rental_state, "BOOKING_CONFIRMED");

  for (const [action, state] of [
    ["pickup", "CAR_PICKED_UP"], ["start", "RENTAL_ACTIVE"],
    ["return", "CAR_RETURNED"], ["close", "BOOKING_CLOSED"]
  ]) {
    const update = await request(app).patch(`/api/rentals/manager/${id}/${action}`)
      .set("Authorization", `Bearer ${managerToken}`).expect(200);
    assert.equal(update.body.data.rental_state, state);
  }
  const reportMonth = startAt.slice(0, 7);
  await request(app).get(`/api/manager/reports/monthly-rentals?month=${reportMonth}`)
    .set("Authorization", `Bearer ${token}`).expect(403);
  const report = await request(app).get(`/api/manager/reports/monthly-rentals?month=${reportMonth}`)
    .set("Authorization", `Bearer ${managerToken}`).expect(200);
  assert.ok(report.body.data.total >= 1);
  assert.ok(report.body.data.closed >= 1);
  assert.ok(report.body.data.demoPaidAmount >= rental.body.data.total_price);
  await request(app).patch(`/api/rentals/manager/${id}/pickup`)
    .set("Authorization", `Bearer ${token}`).expect(403);
  const review = await request(app).post("/api/reviews")
    .set("Authorization", `Bearer ${token}`)
    .send({ bookingId: id, rating: 5, comment: "Clean vehicle" }).expect(201);
  assert.equal(review.body.data.vehicle_id, rentalVehicleId);
  const notifications = await request(app).get("/api/notifications")
    .set("Authorization", `Bearer ${token}`).expect(200);
  assert.ok(notifications.body.data.length >= 1);
  assert.ok(notifications.body.data.some((item: { message: string }) => item.message.includes(id)));
});

test("manager availability window blocks a rental and can be released", async () => {
  const vehicles = await request(app).get("/api/vehicles?seats=4").expect(200);
  const vehicleId = vehicles.body.data[1].id;
  const from = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 15 * 86_400_000).toISOString();
  const window = await request(app).post("/api/availability")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ vehicleId, availableFrom: from, availableTo: to }).expect(201);
  const search = await request(app).get(`/api/vehicles?pickupTime=${encodeURIComponent(from)}&returnTime=${encodeURIComponent(to)}`)
    .expect(200);
  assert.ok(!search.body.data.some((item: { id: string }) => item.id === vehicleId));
  await request(app).patch(`/api/availability/${window.body.data.id}/release`)
    .set("Authorization", `Bearer ${managerToken}`).expect(200);
  const available = await request(app).get(`/api/vehicles?pickupTime=${encodeURIComponent(from)}&returnTime=${encodeURIComponent(to)}`)
    .expect(200);
  assert.ok(available.body.data.some((item: { id: string }) => item.id === vehicleId));
});

import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection.js";

const vehicles = [
  { name: "Saver Hatchback", plate: "SCH-4001", seats: 4, serviceClass: "SAVER", price: 90_000 },
  { name: "Saver Compact", plate: "SCH-4002", seats: 4, serviceClass: "SAVER", price: 105_000 },
  { name: "City Sedan", plate: "SCH-4003", seats: 4, serviceClass: "STANDARD", price: 120_000 },
  { name: "Compact SUV", plate: "SCH-4004", seats: 4, serviceClass: "STANDARD", price: 150_000 },
  { name: "Executive Sedan", plate: "SCH-4005", seats: 4, serviceClass: "LUXURY", price: 320_000 },
  { name: "Saver Family MPV", plate: "SCH-7001", seats: 7, serviceClass: "SAVER", price: 180_000 },
  { name: "Family MPV", plate: "SCH-7002", seats: 7, serviceClass: "STANDARD", price: 220_000 },
  { name: "Passenger Van", plate: "SCH-7003", seats: 7, serviceClass: "STANDARD", price: 250_000 },
  { name: "Luxury SUV", plate: "SCH-7004", seats: 7, serviceClass: "LUXURY", price: 450_000 }
] as const;

const membershipPlans = [
  { code: "BASIC", name: "Basic", fee: 0, discount: 0 },
  { code: "SILVER", name: "Silver", fee: 199_000, discount: 5 },
  { code: "GOLD", name: "Gold", fee: 399_000, discount: 10 }
] as const;

// Upgrade only an untouched copy of the original school-demo price catalog.
// Existing customer records remain in place; historical demo totals change units
// with the catalog so reports and booking history remain internally consistent.
function upgradeLegacyDemoPrices(): void {
  const database = getDatabase();
  const existingVehicles = database.prepare(
    "SELECT plate_number, price_per_hour, daily_rate FROM vehicles"
  ).all() as unknown as Array<{ plate_number: string; price_per_hour: number; daily_rate: number | null }>;
  const existingPlans = database.prepare(
    "SELECT code, monthly_fee FROM membership_plans"
  ).all() as unknown as Array<{ code: string; monthly_fee: number }>;
  const unchangedVehicles = existingVehicles.length === vehicles.length && vehicles.every((vehicle) =>
    existingVehicles.some((row) => row.plate_number === vehicle.plate &&
      row.price_per_hour === vehicle.price / 1000 && row.daily_rate === null));
  const unchangedPlans = existingPlans.length === membershipPlans.length && membershipPlans.every((plan) =>
    existingPlans.some((row) => row.code === plan.code && row.monthly_fee === plan.fee / 1000));
  if (!unchangedVehicles || !unchangedPlans) return;

  database.exec("BEGIN IMMEDIATE");
  try {
    const updateVehicle = database.prepare("UPDATE vehicles SET price_per_hour = ? WHERE plate_number = ?");
    for (const vehicle of vehicles) updateVehicle.run(vehicle.price, vehicle.plate);
    const updatePlan = database.prepare("UPDATE membership_plans SET monthly_fee = ? WHERE code = ?");
    for (const plan of membershipPlans) updatePlan.run(plan.fee, plan.code);
    database.exec(`
      UPDATE bookings SET total_price = total_price * 1000,
        base_price = base_price * 1000, discount_amount = discount_amount * 1000;
      UPDATE payments SET amount = amount * 1000;
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function seedReferenceData(): void {
  const database = getDatabase();
  upgradeLegacyDemoPrices();
  const vehicleStatement = database.prepare(`
    INSERT OR IGNORE INTO vehicles
      (id, name, plate_number, seat_capacity, service_class, price_per_hour, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const now = new Date().toISOString();

  for (const vehicle of vehicles) {
    vehicleStatement.run(
      randomUUID(), vehicle.name, vehicle.plate, vehicle.seats,
      vehicle.serviceClass, vehicle.price, now
    );
  }

  const planStatement = database.prepare(`
    INSERT INTO membership_plans (code, name, monthly_fee, discount_percent, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(code) DO NOTHING
  `);
  for (const plan of membershipPlans) {
    planStatement.run(plan.code, plan.name, plan.fee, plan.discount);
  }
}

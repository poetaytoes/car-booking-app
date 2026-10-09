import { randomUUID } from "node:crypto";
import { ApiError } from "../../shared/api-error.js";
import { DriverRepository, type DriverStatus } from "./driver.repository.js";
import { dispatchWaitingJobs } from "../dispatch/dispatch.service.js";
import { hashPassword } from "../../shared/password.js";
import { AuthRepository } from "../auth/auth.repository.js";

export type DriverInput = {
  name: string;
  phone: string;
  email?: string | null;
  licenseNumber: string;
  password?: string;
};

export class DriverService {
  constructor(private readonly drivers = new DriverRepository()) {}

  private publicDriver(driver: ReturnType<DriverRepository["findById"]>) {
    if (!driver) return undefined;
    const { password_hash: _passwordHash, ...safe } = driver;
    return { ...safe, hasLogin: Boolean(driver.password_hash && driver.email) };
  }

  list() {
    return this.drivers.list().map((driver) => this.publicDriver(driver));
  }

  get(id: string) {
    const driver = this.drivers.findById(id);
    if (!driver) throw new ApiError(404, "Driver not found");
    return this.publicDriver(driver)!;
  }

  async create(input: DriverInput) {
    const email = input.email?.toLowerCase() ?? null;
    if (input.password && !email) throw new ApiError(400, "An email is required for driver login");
    if (email && new AuthRepository().findByEmail(email)) throw new ApiError(409, "Email is already registered");
    if (this.drivers.findDuplicate(email, input.licenseNumber)) {
      throw new ApiError(409, "A driver with this email or license number already exists");
    }
    const now = new Date().toISOString();
    const created = this.drivers.create({
      id: randomUUID(),
      name: input.name,
      phone: input.phone,
      email,
      password_hash: input.password ? await hashPassword(input.password) : null,
      license_number: input.licenseNumber,
      status: "AVAILABLE",
      active: 1,
      created_at: now,
      updated_at: now
    });
    dispatchWaitingJobs();
    return this.publicDriver(created)!;
  }

  async update(id: string, input: {
    name?: string;
    phone?: string;
    email?: string | null;
    licenseNumber?: string;
    status?: DriverStatus;
    active?: boolean;
    password?: string;
  }) {
    const current = this.get(id);
    const email = input.email === undefined ? current.email : input.email?.toLowerCase() ?? null;
    if ((input.password || current.email) && !email) {
      throw new ApiError(400, "An email is required for driver login");
    }
    if (email && email !== current.email &&
      (new AuthRepository().findByEmail(email) || this.drivers.findByEmail(email))) {
      throw new ApiError(409, "Email is already registered");
    }
    if (input.licenseNumber && input.licenseNumber !== current.license_number) {
      const duplicate = this.drivers.findDuplicate(null, input.licenseNumber);
      if (duplicate && duplicate.id !== id) throw new ApiError(409, "License number is already registered");
    }
    if ((input.status === "OFF_DUTY" || input.status === "SUSPENDED" || input.active === false) &&
      this.drivers.hasActiveTask(id)) {
      throw new ApiError(409, "Finish or reassign the driver's active task first");
    }
    const updated = this.drivers.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email?.toLowerCase() ?? null }),
      ...(input.licenseNumber !== undefined && { license_number: input.licenseNumber }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.active !== undefined && { active: input.active ? 1 : 0 })
    });
    if (input.password) {
      if (!updated?.email) throw new ApiError(400, "An email is required for driver login");
      this.drivers.setPassword(id, await hashPassword(input.password));
    }
    dispatchWaitingJobs();
    return this.publicDriver(this.drivers.findById(id))!;
  }
}

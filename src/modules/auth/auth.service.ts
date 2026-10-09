import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { ApiError } from "../../shared/api-error.js";
import { hashPassword, verifyPassword } from "../../shared/password.js";
import { AuthRepository, type UserRecord } from "./auth.repository.js";
import { DriverRepository, type Driver } from "../drivers/driver.repository.js";

type PublicUser = Omit<UserRecord, "password_hash">;

function withoutPassword(user: UserRecord): PublicUser {
  const { password_hash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export class AuthService {
  constructor(
    private readonly repository = new AuthRepository(),
    private readonly drivers = new DriverRepository()
  ) {}

  async register(input: { name: string; email: string; phone: string; password: string }) {
    const email = input.email.toLowerCase();
    if (this.repository.findByEmail(email) || this.drivers.findByEmail(email)) {
      throw new ApiError(409, "Email is already registered");
    }

    const user = this.repository.create({
      id: randomUUID(),
      name: input.name,
      email,
      phone: input.phone,
      password_hash: await hashPassword(input.password),
      role: "CUSTOMER",
      created_at: new Date().toISOString()
    });

    return { user: withoutPassword(user), token: this.createToken(user) };
  }

  async login(input: { email: string; password: string }) {
    const user = this.repository.findByEmail(input.email.toLowerCase());
    if (user && await verifyPassword(input.password, user.password_hash)) {
      return { user: withoutPassword(user), token: this.createToken(user) };
    }
    const driver = this.drivers.findByEmail(input.email.toLowerCase());
    if (!driver || !driver.active || driver.status === "SUSPENDED" || !driver.password_hash ||
      !(await verifyPassword(input.password, driver.password_hash))) {
      throw new ApiError(401, "Invalid email or password");
    }
    return { user: this.publicDriver(driver), token: this.createToken({ ...driver, email: driver.email!, role: "DRIVER" }) };
  }

  getProfile(userId: string, role: "CUSTOMER" | "ADMIN" | "DRIVER"): PublicUser | ReturnType<AuthService["publicDriver"]> {
    if (role === "DRIVER") {
      const driver = this.drivers.findById(userId);
      if (!driver || !driver.active || driver.status === "SUSPENDED") throw new ApiError(401, "Driver account is unavailable");
      return this.publicDriver(driver);
    }
    const user = this.repository.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    return withoutPassword(user);
  }

  private publicDriver(driver: Driver) {
    return { id: driver.id, name: driver.name, email: driver.email, phone: driver.phone,
      role: "DRIVER" as const, status: driver.status, active: driver.active };
  }

  private createToken(user: Pick<UserRecord, "id" | "email"> & { role: "CUSTOMER" | "ADMIN" | "DRIVER" }): string {
    return jwt.sign(
      { email: user.email, role: user.role },
      env.JWT_SECRET,
      { subject: user.id, expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] }
    );
  }
}

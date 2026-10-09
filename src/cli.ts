import { randomUUID } from "node:crypto";
import { closeDatabase } from "./database/connection.js";
import { runMigrations } from "./database/migrate.js";
import { seedReferenceData } from "./database/seed.js";
import { AuthRepository } from "./modules/auth/auth.repository.js";
import { DriverService } from "./modules/drivers/driver.service.js";
import { ManagerService } from "./modules/manager/manager.service.js";
import { hashPassword } from "./shared/password.js";

const [command = "help", ...args] = process.argv.slice(2);

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function usage(): void {
  console.log(`Company management CLI (no graphical UI required)

Commands:
  npm run cli -- help
  npm run cli -- dashboard
  npm run cli -- vehicles
  npm run cli -- drivers
  npm run cli -- customers
  npm run cli -- add-driver "Name" "Phone" "License" [email] [password]
  npm run cli -- create-manager "email" "password" [name] [phone]

The create-manager command is the only way to bootstrap a company manager account.`);
}

async function main(): Promise<void> {
  runMigrations();
  seedReferenceData();
  const manager = new ManagerService();
  const drivers = new DriverService();

  switch (command) {
    case "dashboard":
      print(manager.dashboard());
      break;
    case "vehicles":
      print(manager.listVehicles());
      break;
    case "drivers":
      print(drivers.list());
      break;
    case "customers":
      print(manager.listCustomers());
      break;
    case "add-driver": {
      const [name, phone, licenseNumber, email, password] = args;
      if (!name || !phone || !licenseNumber) throw new Error("Name, phone and license are required");
      print(await drivers.create({ name, phone, licenseNumber, email, password }));
      break;
    }
    case "create-manager": {
      const [email, password, name = "Company Manager", phone = "0000000000"] = args;
      if (!email || !password || password.length < 8) {
        throw new Error("Email and a password of at least 8 characters are required");
      }
      const repository = new AuthRepository();
      if (repository.findByEmail(email)) throw new Error("That email is already registered");
      const now = new Date().toISOString();
      const user = repository.create({
        id: randomUUID(), name, email: email.toLowerCase(), phone,
        password_hash: await hashPassword(password), role: "ADMIN", created_at: now
      });
      print({ id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at });
      break;
    }
    case "help":
      usage();
      break;
    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);

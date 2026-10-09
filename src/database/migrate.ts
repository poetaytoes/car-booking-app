import { getDatabase } from "./connection.js";

function hasColumn(table: string, column: string): boolean {
  const columns = getDatabase().prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

export function runMigrations(): void {
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plate_number TEXT NOT NULL UNIQUE,
      seat_capacity INTEGER NOT NULL CHECK (seat_capacity IN (4, 7)),
      service_class TEXT NOT NULL DEFAULT 'STANDARD'
        CHECK (service_class IN ('SAVER', 'STANDARD', 'LUXURY')),
      price_per_hour REAL NOT NULL CHECK (price_per_hour >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      license_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'SUSPENDED')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS membership_plans (
      code TEXT PRIMARY KEY CHECK (code IN ('BASIC', 'SILVER', 'GOLD')),
      name TEXT NOT NULL,
      monthly_fee REAL NOT NULL CHECK (monthly_fee >= 0),
      discount_percent REAL NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS user_memberships (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL REFERENCES membership_plans(code),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
      started_at TEXT NOT NULL,
      expires_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      driver_id TEXT REFERENCES drivers(id),
      passenger_count INTEGER NOT NULL CHECK (passenger_count > 0),
      pickup_address TEXT NOT NULL,
      dropoff_address TEXT NOT NULL,
      pickup_time TEXT NOT NULL,
      return_time TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'CONFIRMED'
        CHECK (status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      total_price REAL NOT NULL CHECK (total_price >= 0),
      base_price REAL NOT NULL DEFAULT 0 CHECK (base_price >= 0),
      discount_amount REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      created_at TEXT NOT NULL,
      CHECK (return_time > pickup_time)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_times
      ON bookings(vehicle_id, pickup_time, return_time, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, created_at);

    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      driver_id TEXT REFERENCES drivers(id),
      category TEXT NOT NULL CHECK (category IN ('FOOD', 'ITEM')),
      description TEXT NOT NULL,
      pickup_address TEXT NOT NULL,
      dropoff_address TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'CANCELLED')),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_user ON deliveries(user_id, created_at);
  `);

  // Safe upgrades for database files created by the first project version.
  if (!hasColumn("vehicles", "service_class")) {
    database.exec("ALTER TABLE vehicles ADD COLUMN service_class TEXT NOT NULL DEFAULT 'STANDARD'");
  }
  if (!hasColumn("bookings", "driver_id")) {
    database.exec("ALTER TABLE bookings ADD COLUMN driver_id TEXT REFERENCES drivers(id)");
  }
  if (!hasColumn("bookings", "base_price")) {
    database.exec("ALTER TABLE bookings ADD COLUMN base_price REAL NOT NULL DEFAULT 0");
    database.exec("UPDATE bookings SET base_price = total_price WHERE base_price = 0");
  }
  if (!hasColumn("bookings", "discount_amount")) {
    database.exec("ALTER TABLE bookings ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0");
  }
  if (!hasColumn("deliveries", "driver_id")) {
    database.exec("ALTER TABLE deliveries ADD COLUMN driver_id TEXT REFERENCES drivers(id)");
  }
  if (!hasColumn("drivers", "password_hash")) {
    database.exec("ALTER TABLE drivers ADD COLUMN password_hash TEXT");
  }
  // The rental model extends the existing ride schema without rewriting customer data.
  if (!hasColumn("bookings", "booking_mode")) {
    database.exec("ALTER TABLE bookings ADD COLUMN booking_mode TEXT NOT NULL DEFAULT 'RIDE'");
  }
  if (!hasColumn("bookings", "rental_state")) {
    database.exec("ALTER TABLE bookings ADD COLUMN rental_state TEXT");
  }
  if (!hasColumn("bookings", "pickup_location_id")) {
    database.exec("ALTER TABLE bookings ADD COLUMN pickup_location_id TEXT REFERENCES locations(id)");
  }
  if (!hasColumn("bookings", "dropoff_location_id")) {
    database.exec("ALTER TABLE bookings ADD COLUMN dropoff_location_id TEXT REFERENCES locations(id)");
  }
  if (!hasColumn("bookings", "closed_at")) {
    database.exec("ALTER TABLE bookings ADD COLUMN closed_at TEXT");
  }
  if (!hasColumn("vehicles", "make")) database.exec("ALTER TABLE vehicles ADD COLUMN make TEXT");
  if (!hasColumn("vehicles", "model")) database.exec("ALTER TABLE vehicles ADD COLUMN model TEXT");
  if (!hasColumn("vehicles", "model_year")) database.exec("ALTER TABLE vehicles ADD COLUMN model_year INTEGER");
  if (!hasColumn("vehicles", "daily_rate")) database.exec("ALTER TABLE vehicles ADD COLUMN daily_rate REAL");
  if (!hasColumn("drivers", "rating")) database.exec("ALTER TABLE drivers ADD COLUMN rating REAL");
  if (!hasColumn("drivers", "latitude")) database.exec("ALTER TABLE drivers ADD COLUMN latitude REAL");
  if (!hasColumn("drivers", "longitude")) database.exec("ALTER TABLE drivers ADD COLUMN longitude REAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
      city TEXT NOT NULL, latitude REAL, longitude REAL
    );
    CREATE TABLE IF NOT EXISTS vehicle_availability (
      id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      available_from TEXT NOT NULL, available_to TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
      CHECK (available_to > available_from)
    );
    CREATE INDEX IF NOT EXISTS idx_vehicle_availability_interval
      ON vehicle_availability(vehicle_id, available_from, available_to);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount >= 0), method TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
      paid_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL, sent_at TEXT NOT NULL, read_at TEXT
    );
  `);
  database.exec("CREATE INDEX IF NOT EXISTS idx_bookings_driver_status ON bookings(driver_id, status)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_deliveries_driver_status ON deliveries(driver_id, status)");
}

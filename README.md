# CarBooking

CarBooking is a school-project web app for driver-led rides, self-drive rentals, and food/item delivery. Customers and company managers use the main page; drivers use a separate mobile-friendly page. A Node.js/Express API stores shared data in SQLite on the host PC. This is a browser-based app, not a native Android/iOS package.

## What the source currently supports

| Area | Behavior |
| --- | --- |
| Accounts | Customers register in the UI. A company manager (`ADMIN`) is bootstrapped from the CLI and creates driver accounts. Login returns a JWT. |
| Rides | Customers choose a 4- or 7-seat vehicle in Saver, Standard, or Luxury class, enter a route and future time, and see a VND price and status. The server checks seat limits and time conflicts. |
| Dispatch | Ride/delivery requests are assigned to an active, available driver with credentials and no active task. Waiting requests are handled oldest first when dispatch is triggered. Drivers confirm and complete tasks in `/driver.html`. |
| Rentals | A separate self-drive flow reserves a vehicle, simulates payment, then lets a manager record pickup, start, return, and closure. Rentals are not dispatched. |
| Deliveries | Customers request `FOOD` or `ITEM` delivery after acknowledging allowed contents. Drivers accept, pick up, and complete deliveries. |
| Memberships | Basic, Silver, and Gold plans are in SQLite. Active Silver/Gold plans discount future rides and rentals. Activation is a demonstration only. |
| Company operations | The manager page shows dispatch, drivers, requests, rental handover, and a monthly rental report. The API also supports customer membership changes, vehicle/rate management, and vehicle-unavailable windows. |
| Reviews/notifications | Customers can review an owned completed ride or closed rental. The API stores customer rental notifications. |

Prices are nominal **Vietnamese dong (VND)**, rounded to whole dong. Seeded prices are example values, not live market rates. There is no real payment gateway, delivery pricing, map, GPS navigation, or distance-based driver matching. Pages poll for updates; there is no push-notification service. The server must be running for new requests or dispatch to be processed.

## Requirements and source layout

Use Node.js **22.5 or later** and npm. Check with `node -v` and `npm -v`.

```text
src/
  app.ts, server.ts        Express app and startup
  cli.ts                   terminal management commands
  config/                  environment settings
  database/                SQLite connection, migrations, seed, reset
  middleware/              authentication and error handling
  modules/                 auth, vehicles, bookings, rentals, availability,
                           reviews, notifications, deliveries, memberships,
                           drivers, manager, locations
  shared/                  common helpers
CarBooking-Frontend/carbooking-frontend/
  index.html               customer and manager page
  driver.html              driver page
  src/main.js              customer and manager interactions
  src/driver.js            driver interactions
  src/style.css            main-page styling
  src/driver.css           driver-page styling
public/                    older fallback page if the Vite build is absent
scripts/enable-tailnet.mjs private Tailscale Serve setup
test/                      API integration tests
data/                      generated SQLite database and JWT secret (private)
```

Backend features separate HTTP routes, business services, and database repositories. The frontend calls JSON `/api/*` endpoints, so its UI can later be replaced without directly changing database code. The source-only repository should not contain `node_modules`, build output, the live database, secrets, or the separate report/document folders.

## First-time setup

From the repository root in Windows Command Prompt:

```cmd
npm install
npm --prefix CarBooking-Frontend/carbooking-frontend install
copy .env.example .env
npm start
```

In PowerShell, `Copy-Item .env.example .env` is equivalent; on macOS/Linux use `cp .env.example .env`. `npm start` builds both frontend and backend, starts the combined server at `http://localhost:4000`, runs migrations, and seeds nine example vehicles plus three membership plans on first start. `npm run dev` currently does the same build-and-run sequence; it is **not** a hot-reload watcher. Stop with Ctrl+C. Check [`http://localhost:4000/api/health`](http://localhost:4000/api/health) if the page does not load.

The default `.env.example` binds to `127.0.0.1:4000` and stores SQLite at `data/car_booking.sqlite`. With a blank `JWT_SECRET`, startup generates a persistent random secret in `data/.jwt-secret`. Keep `.env`, the database, and this secret private; a fresh clone has **no customer, manager, or driver accounts**. Back up database and secret together if you need to retain data and login sessions.

### Create accounts and demo a ride

Keep the server running and open a **second** terminal in the repository root:

```cmd
npm run cli -- create-manager "manager@example.com" "ChangeThisPassword123" "School Manager" "0800000000"
```

Use your own password of at least eight characters. Public registration creates customers only. A fresh clone has no supplied test-account password.

1. At [`http://localhost:4000`](http://localhost:4000), register a customer and sign in. Use different browser profiles or devices for simultaneous customer, manager, and driver sessions.
2. Sign in as manager on the same page. Under **Manager**, create an active driver with email and password. A driver without login credentials cannot receive automatic assignments.
3. Sign in as driver at [`http://localhost:4000/driver.html`](http://localhost:4000/driver.html). Set availability to **Available** if needed.
4. As customer, select a vehicle, enter pickup/drop-off addresses and **future** pickup/return times, then submit a ride. It starts `CONFIRMED`. The server attempts assignment; it waits unassigned if no eligible driver is available.
5. On the driver page, refresh or wait for polling (about eight seconds), **Confirm** the ride, then **Complete** it. The customer/manager active screens poll about every twelve seconds.

For delivery, create a `FOOD` or `ITEM` request; the assigned driver confirms, picks it up, and completes it. For a self-drive rental, create a request in **Rentals**, run the **demo payment**, then use manager **Rental operations** to record pickup, start, return, and close. Rentals do not need a driver. Membership activation does not collect money.

The manager web page is not a complete database editor. The manager API supports broader fleet/rate, customer-membership, and availability edits. Do not directly edit the live SQLite file without understanding its WAL behavior.

## CLI, tests, and build commands

```cmd
npm run cli -- help
npm run cli -- dashboard
npm run cli -- vehicles
npm run cli -- drivers
npm run cli -- customers
npm run cli -- add-driver "Example Driver" "0811111111" "DL-0001" "driver@example.com" "DriverPassword123"
npm run typecheck
npm test
npm run build
```

`npm test` runs backend API integration tests without a graphical UI. The CLI accesses the same SQLite database. `npm run db:reset` **deletes local application records** and re-seeds reference data; only use it when that loss is intended.

## API quick reference

Successful JSON responses use `{ "data": ... }`; errors use `{ "error": { "message": "...", "details": ... } }`. Protected requests need `Authorization: Bearer <token>`. Times must be ISO 8601 strings **with a timezone** and booking times must be in the future. Choose demo dates relative to the day you test.

| Purpose | Routes |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Vehicles/availability | `GET /api/vehicles`, `GET /api/vehicles/:id`, `GET /api/availability/vehicles/:id` |
| Customer rides | `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/:id`, `PATCH /api/bookings/:id/cancel` |
| Deliveries | `POST /api/deliveries`, `GET /api/deliveries`, `GET /api/deliveries/:id`, `PATCH /api/deliveries/:id/cancel` |
| Self-drive rentals | `POST /api/rentals`, `GET /api/rentals`, `GET /api/rentals/:id`, `POST /api/rentals/:id/demo-payment`, `PATCH /api/rentals/:id/cancel` |
| Memberships | `GET /api/memberships/plans`, `GET /api/memberships/me`, `PUT /api/memberships/me` |
| Reviews/notifications | `GET /api/reviews/vehicles/:id`, `POST /api/reviews`, `GET /api/notifications`, `PATCH /api/notifications/:id/read` |
| Driver tasks | `GET /api/driver/tasks`, `PATCH /api/driver/availability`, `PATCH /api/driver/tasks/:kind/:id`, `PATCH /api/driver/location` |
| Manager operations | `GET /api/manager/dashboard`, `/api/manager/customers`, `/api/manager/drivers`, `/api/manager/vehicles`, `/api/manager/bookings`, `/api/manager/deliveries`, `/api/manager/reports/monthly-rentals` (see route files for write methods) |
| Manager rentals/fleet blocks | `GET /api/rentals/manager`, `PATCH /api/rentals/manager/:id/:action`, `POST /api/availability`, `PATCH /api/availability/:id/release` |

Vehicle filters include `seats=4|7`, `serviceClass=SAVER|STANDARD|LUXURY`, and paired `pickupTime`/`returnTime`. Rides use the vehicle hourly rate with a one-hour minimum; rentals use whole days and the daily rate (or a 24-hour fallback). Active membership discounts apply before rounding to whole VND. Delivery pricing is not implemented.

Register with `POST /api/auth/register`:

```json
{ "name": "Student Name", "email": "student@example.com", "phone": "0812345678", "password": "password123" }
```

Create a ride with `POST /api/bookings` (replace the ID and times):

```json
{
  "vehicleId": "vehicle-id-from-GET-api-vehicles",
  "passengerCount": 4,
  "pickupAddress": "School main entrance",
  "dropoffAddress": "City science museum",
  "pickupTime": "2030-10-01T08:00:00.000Z",
  "returnTime": "2030-10-01T12:00:00.000Z"
}
```

Create a delivery with `POST /api/deliveries`:

```json
{
  "category": "FOOD",
  "description": "Two sealed lunch boxes",
  "pickupAddress": "School cafeteria",
  "dropoffAddress": "Student activity building",
  "scheduledAt": "2030-10-01T11:30:00.000Z",
  "recipientName": "Student Name",
  "recipientPhone": "0812345678",
  "confirmLegalContents": true
}
```

Create a rental with `POST /api/rentals` (replace the ID and times):

```json
{
  "vehicleId": "vehicle-id-from-GET-api-vehicles",
  "pickup": { "name": "School office", "address": "1 University Road", "city": "Ho Chi Minh City" },
  "dropoff": { "name": "School office", "address": "1 University Road", "city": "Ho Chi Minh City" },
  "startAt": "2030-10-02T08:00:00.000Z",
  "endAt": "2030-10-04T08:00:00.000Z",
  "paymentMethod": "DEMO"
}
```

Demo payment at `POST /api/rentals/:id/demo-payment` accepts `{ "outcome": "SUCCEED" }` or `{ "outcome": "FAIL" }`; no money moves. Manager rental actions at `PATCH /api/rentals/manager/:id/:action` are `pickup`, `start`, `return`, `close` in that order. A customer may cancel an eligible pre-pickup rental; a successful demo payment is marked refunded without a real transaction.

For API-only management, a manager bearer token can read `GET /api/manager/customers`, `/drivers`, `/vehicles`, `/bookings`, and `/deliveries`. It can use `POST /api/manager/drivers` or `/vehicles` to add records; `PATCH /api/manager/drivers/:id`, `/vehicles/:id`, `/bookings/:id`, `/deliveries/:id`, or `/customers/:id/membership` to update them. For example, vehicle creation needs `name`, `plateNumber`, `seatCapacity` (4 or 7), `serviceClass`, and an integer VND `pricePerHour`. For exact request validation and workflow rules, consult the corresponding `src/modules/*/*.routes.ts` and service files. `GET /api/manager/reports/monthly-rentals?month=YYYY-MM` returns the monthly rental report.

## Private access from another device

The home PC can serve this same web app to a laptop or trusted driver device with **Tailscale Serve**. Install/sign in to Tailscale on both devices, leave the PC online, and keep the Node server running. In `.env`, keep `HOST=127.0.0.1` and `PORT=4000`, and add the exact HTTPS Serve origin to comma-separated `FRONTEND_ORIGIN`:

```dotenv
FRONTEND_ORIGIN=http://localhost:5173,https://your-pc.your-tailnet.ts.net
```

Restart the app after changing `.env`, verify `http://localhost:4000/api/health` locally, then run:

```cmd
npm run remote:enable
```

The helper checks the local binding and starts private `tailscale serve --bg 4000`, printing the tailnet URL. Tailscale may ask to enable HTTPS/Serve first; follow its prompt and rerun the helper. On the other device, connect to the authorized tailnet and open the printed HTTPS URL (append `/driver.html` for drivers). Do **not** use router port forwarding or `tailscale funnel` for this demo. Tailnet access and app sign-in are separate controls; give each person their own account and authorized tailnet access. If the remote page is blank, first verify the local page/API, exact `FRONTEND_ORIGIN`, and that `npm start` completed the frontend build.

## Limits and next improvements

This is a school demonstration, not a production transport/payment system. The driver UI is a web page with no native package or map navigation. Dispatch is event-triggered while the server runs, not a background worker. The legal-contents checkbox is an acknowledgement, not real screening. Future work includes real payments/refunds, delivery pricing, map/route services, account recovery, rate limiting, audit logs, migration versioning, and scheduled backups.

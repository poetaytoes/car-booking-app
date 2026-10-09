# CarBooking web frontend

This Vite/vanilla-JavaScript module supplies the customer/manager page (`index.html`) and separate driver page (`driver.html`) for the backend in the repository root. Read the [root README](../../README.md) for full setup, accounts, demo steps, API behavior, and remote access.

## Normal way to run it

From the repository root, install dependencies in **both** packages and start the combined server:

```cmd
npm install
npm --prefix CarBooking-Frontend/carbooking-frontend install
copy .env.example .env
npm start
```

Open `http://localhost:4000` for customers/managers or `http://localhost:4000/driver.html` for drivers. The root `start` script builds frontend and TypeScript backend before serving both on port 4000. The manager account is created with the root CLI; drivers need manager-created credentials.

## Optional Vite-only development server

To edit UI code with Vite hot reload, run the backend on port 4000 in one terminal (`npm start` in the repository root). In a second Command Prompt terminal, use:

```cmd
cd CarBooking-Frontend\carbooking-frontend
set VITE_API_URL=http://127.0.0.1:4000/api
npm run dev
```

In PowerShell, set `$env:VITE_API_URL='http://127.0.0.1:4000/api'`; on macOS/Linux use `VITE_API_URL=http://127.0.0.1:4000/api npm run dev`. Open the URL Vite prints (usually port 5173). `vite.config.js` has **no `/api` proxy**: without `VITE_API_URL`, same-origin `/api` works when served by the backend on port 4000, but not on the separate Vite port. The backend `FRONTEND_ORIGIN` must allow the Vite origin; the default includes `http://localhost:5173`. For a simple demo, just use the combined server.

## Source map and limits

- `src/main.js` and `src/style.css`: customer registration/login, ride search/booking, rentals, delivery, memberships, reviews, and manager screens.
- `src/driver.js` and `src/driver.css`: driver login, availability, assigned tasks, and task actions. The API supports explicitly storing driver coordinates; it has no map.
- Both pages use `import.meta.env.VITE_API_URL || '/api'` and browser-local login tokens. Shared records live in the backend SQLite database, not the browser.

The manager page is an operational dashboard, not a full database editor. Fleet/rate and customer-membership edits are available via manager API routes. Rental payment and membership activation are demonstrations. There is no live GPS navigation, real payment, or native-app package.

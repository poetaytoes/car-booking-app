import { api, request, session } from "./api.js";

const app = document.querySelector("#app");
const nav = document.querySelector("#main-nav");
const accountActions = document.querySelector("#account-actions");
let activePage = "vehicles";
let selectedVehicle = null;

const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(value);

const formatDate = (value) => new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short"
}).format(new Date(value));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
}[character]));

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.querySelector("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 4500);
}

function toIso(value) {
  return new Date(value).toISOString();
}

function defaultDate(hoursFromNow) {
  const value = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  value.setMinutes(0, 0, 0);
  const timezoneOffset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function setNav() {
  const user = session.user;
  if (!user) {
    nav.innerHTML = "";
    accountActions.innerHTML = "";
    return;
  }
  const items = [
    ["vehicles", "Book a ride"], ["bookings", "My bookings"],
    ["delivery", "Deliveries"], ["membership", "Membership"]
  ];
  if (user.role === "ADMIN") items.push(["manager", "Company"]);
  nav.innerHTML = items.map(([page, label]) => `
    <button class="nav-link ${activePage === page ? "is-active" : ""}" data-page="${page}" type="button">${label}</button>
  `).join("");
  accountActions.innerHTML = `
    <span class="account-name">${escapeHtml(user.name)}</span>
    <button class="button button-quiet" id="logout-button" type="button">Sign out</button>
  `;
  nav.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    activePage = button.dataset.page;
    selectedVehicle = null;
    render();
  }));
  document.querySelector("#logout-button").addEventListener("click", () => {
    session.clear();
    activePage = "vehicles";
    showToast("You have signed out.");
    render();
  });
}

function renderAuth(mode = "login") {
  const template = document.querySelector("#auth-template");
  app.replaceChildren(template.content.cloneNode(true));
  const slot = document.querySelector("#auth-form-slot");
  const paint = (currentMode) => {
    document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.authTab === currentMode);
    });
    slot.innerHTML = currentMode === "login" ? `
      <h2 id="auth-title">Welcome back</h2>
      <p class="muted">Sign in to manage your travel.</p>
      <form id="login-form" class="form-stack">
        <label>Email<input name="email" type="email" autocomplete="email" required /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button class="button button-primary" type="submit">Sign in</button>
      </form>
    ` : `
      <h2 id="auth-title">Create your account</h2>
      <p class="muted">Start with a free Basic membership.</p>
      <form id="register-form" class="form-stack">
        <label>Full name<input name="name" autocomplete="name" minlength="2" required /></label>
        <label>Email<input name="email" type="email" autocomplete="email" required /></label>
        <label>Phone<input name="phone" type="tel" autocomplete="tel" minlength="7" required /></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
        <button class="button button-primary" type="submit">Create account</button>
      </form>
    `;
    slot.querySelector("form").addEventListener("submit", submitAuth);
  };
  document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.addEventListener("click", () => paint(tab.dataset.authTab)));
  paint(mode);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  const isRegister = form.id === "register-form";
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const result = await request(`/auth/${isRegister ? "register" : "login"}`, "POST", payload);
    session.save(result);
    selectedVehicle = null;
    activePage = "vehicles";
    showToast(isRegister ? "Account created. Welcome to RideWise!" : "Welcome back!");
    render();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function pageFrame(title, subtitle, content) {
  return `
    <section class="page-heading"><div><p class="eyebrow">RideWise</p><h1>${title}</h1><p>${subtitle}</p></div></section>
    ${content}
  `;
}

async function renderVehicles() {
  app.innerHTML = pageFrame("Find the right ride", "Filter the fleet, then choose a vehicle to start a booking.", `
    <section class="card filters"><form id="vehicle-filter" class="filter-form">
      <label>Service class<select name="serviceClass"><option value="">All classes</option><option>SAVER</option><option>STANDARD</option><option>LUXURY</option></select></label>
      <label>Seats<select name="seats"><option value="">Any</option><option value="4">4 seats</option><option value="7">7 seats</option></select></label>
      <label>Pickup<input name="pickupTime" type="datetime-local" value="${defaultDate(24)}" /></label>
      <label>Return<input name="returnTime" type="datetime-local" value="${defaultDate(28)}" /></label>
      <button class="button button-primary" type="submit">Check availability</button>
    </form></section>
    <section id="vehicle-results" class="vehicle-grid" aria-live="polite"><div class="loading">Loading available vehicles…</div></section>
    <section id="booking-slot"></section>
  `);
  const filter = document.querySelector("#vehicle-filter");
  filter.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadVehicles(new FormData(filter));
  });
  await loadVehicles(new FormData(filter));
}

async function loadVehicles(formData) {
  const results = document.querySelector("#vehicle-results");
  const query = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (!value) continue;
    query.set(key, key.endsWith("Time") ? toIso(value) : value);
  }
  results.innerHTML = '<div class="loading">Checking availability…</div>';
  try {
    const vehicles = await api(`/vehicles?${query}`);
    results.innerHTML = vehicles.length ? vehicles.map((vehicle) => `
      <article class="vehicle-card card">
        <div class="vehicle-visual vehicle-${vehicle.service_class.toLowerCase()}"><span>${vehicle.service_class}</span><strong>${vehicle.seat_capacity}</strong><small>seats</small></div>
        <div class="vehicle-info"><p class="eyebrow">${vehicle.service_class}</p><h2>${escapeHtml(vehicle.name)}</h2><p>${vehicle.seat_capacity} seats · ${escapeHtml(vehicle.plate_number)}</p>
          <div class="vehicle-footer"><strong>${money(vehicle.price_per_hour)}<small>/hour</small></strong><button class="button button-secondary" data-vehicle-id="${vehicle.id}" type="button">Choose</button></div>
        </div>
      </article>
    `).join("") : '<div class="empty-state">No vehicles match this time and filter. Try another option.</div>';
    results.querySelectorAll("[data-vehicle-id]").forEach((button) => button.addEventListener("click", () => {
      selectedVehicle = vehicles.find((vehicle) => vehicle.id === button.dataset.vehicleId);
      renderBookingForm();
    }));
  } catch (error) {
    results.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`;
  }
}

function renderBookingForm() {
  const slot = document.querySelector("#booking-slot");
  const filter = new FormData(document.querySelector("#vehicle-filter"));
  slot.innerHTML = `
    <section class="card booking-card" aria-labelledby="booking-title">
      <div><p class="eyebrow">Selected vehicle</p><h2 id="booking-title">${escapeHtml(selectedVehicle.name)}</h2><p>${selectedVehicle.seat_capacity} seats · ${money(selectedVehicle.price_per_hour)}/hour</p></div>
      <form id="booking-form" class="form-grid">
        <label>Passengers<input name="passengerCount" type="number" min="1" max="${selectedVehicle.seat_capacity}" value="1" required /></label>
        <label>Pickup<input name="pickupAddress" minlength="5" placeholder="School main entrance" required /></label>
        <label>Destination<input name="dropoffAddress" minlength="5" placeholder="City science museum" required /></label>
        <label>Pickup time<input name="pickupTime" type="datetime-local" value="${filter.get("pickupTime") || defaultDate(24)}" required /></label>
        <label>Return time<input name="returnTime" type="datetime-local" value="${filter.get("returnTime") || defaultDate(28)}" required /></label>
        <label class="form-wide">Notes (optional)<textarea name="notes" rows="2" maxlength="500" placeholder="Any useful information for the driver"></textarea></label>
        <div class="form-wide form-action"><button class="button button-primary" type="submit">Confirm booking</button></div>
      </form>
    </section>
  `;
  slot.querySelector("#booking-form").addEventListener("submit", submitBooking);
  slot.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function submitBooking(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const booking = await request("/bookings", "POST", {
      vehicleId: selectedVehicle.id,
      passengerCount: Number(values.passengerCount),
      pickupAddress: values.pickupAddress,
      dropoffAddress: values.dropoffAddress,
      pickupTime: toIso(values.pickupTime),
      returnTime: toIso(values.returnTime),
      notes: values.notes || undefined
    });
    showToast(`Booking confirmed — total ${money(booking.total_price)}.`);
    activePage = "bookings";
    render();
  } catch (error) {
    showToast(error.message, "error");
  } finally { button.disabled = false; }
}

async function renderBookings() {
  app.innerHTML = pageFrame("My bookings", "Your upcoming and past car reservations.", '<section id="bookings-list" class="list-stack"><div class="loading">Loading bookings…</div></section>');
  const list = document.querySelector("#bookings-list");
  try {
    const bookings = await api("/bookings");
    list.innerHTML = bookings.length ? bookings.map((booking) => `
      <article class="card list-card"><div><p class="eyebrow">${booking.status}</p><h2>${escapeHtml(booking.vehicle_name)}</h2><p>${formatDate(booking.pickup_time)} → ${formatDate(booking.return_time)}</p><p>${escapeHtml(booking.pickup_address)} → ${escapeHtml(booking.dropoff_address)}</p></div>
        <div class="list-card-side"><strong>${money(booking.total_price)}</strong>${booking.discount_amount ? `<small>Saved ${money(booking.discount_amount)}</small>` : ""}${booking.status === "CONFIRMED" ? `<button class="text-button" data-cancel-booking="${booking.id}">Cancel booking</button>` : ""}</div>
      </article>
    `).join("") : '<div class="empty-state">No bookings yet. Choose a vehicle to get started.</div>';
    list.querySelectorAll("[data-cancel-booking]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Cancel this booking?")) return;
      try { await request(`/bookings/${button.dataset.cancelBooking}/cancel`, "PATCH"); showToast("Booking cancelled."); renderBookings(); }
      catch (error) { showToast(error.message, "error"); }
    }));
  } catch (error) { list.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`; }
}

async function renderDelivery() {
  app.innerHTML = pageFrame("Send a delivery", "Arrange a food or permitted-item delivery.", `
    <section class="two-column"><form id="delivery-form" class="card form-grid">
      <label>Delivery type<select name="category"><option value="FOOD">Food</option><option value="ITEM">Item</option></select></label>
      <label>Scheduled time<input name="scheduledAt" type="datetime-local" value="${defaultDate(2)}" required /></label>
      <label class="form-wide">What is being delivered?<input name="description" minlength="2" maxlength="500" placeholder="Two sealed lunch boxes" required /></label>
      <label>Pickup address<input name="pickupAddress" minlength="5" required /></label>
      <label>Dropoff address<input name="dropoffAddress" minlength="5" required /></label>
      <label>Recipient name<input name="recipientName" minlength="2" required /></label>
      <label>Recipient phone<input name="recipientPhone" type="tel" minlength="7" required /></label>
      <label class="checkbox-line form-wide"><input name="confirmLegalContents" type="checkbox" required /> I confirm the delivery contains only legal, safe items.</label>
      <div class="form-wide form-action"><button class="button button-primary" type="submit">Request delivery</button></div>
    </form>
    <section class="card aside-card"><p class="eyebrow">Allowed items</p><h2>Clear and safe deliveries</h2><p>Food and ordinary items are accepted. Dangerous, illegal, and prohibited goods are not allowed.</p><button class="text-button" id="show-deliveries" type="button">View my delivery requests</button></section></section>
    <section id="delivery-list" class="list-stack"></section>
  `);
  document.querySelector("#delivery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await request("/deliveries", "POST", { ...values, scheduledAt: toIso(values.scheduledAt), confirmLegalContents: true });
      showToast("Delivery request created."); event.currentTarget.reset(); loadDeliveries();
    } catch (error) { showToast(error.message, "error"); }
  });
  document.querySelector("#show-deliveries").addEventListener("click", loadDeliveries);
  await loadDeliveries();
}

async function loadDeliveries() {
  const list = document.querySelector("#delivery-list");
  try {
    const deliveries = await api("/deliveries");
    list.innerHTML = deliveries.length ? `<h2>Your delivery requests</h2>${deliveries.map((delivery) => `
      <article class="card list-card"><div><p class="eyebrow">${delivery.category} · ${delivery.status}</p><h3>${escapeHtml(delivery.description)}</h3><p>${formatDate(delivery.scheduled_at)} · To ${escapeHtml(delivery.recipient_name)}</p></div>${["PENDING", "ACCEPTED"].includes(delivery.status) ? `<button class="text-button" data-cancel-delivery="${delivery.id}">Cancel</button>` : ""}</article>
    `).join("")}` : '<div class="empty-state">No delivery requests yet.</div>';
    list.querySelectorAll("[data-cancel-delivery]").forEach((button) => button.addEventListener("click", async () => {
      try { await request(`/deliveries/${button.dataset.cancelDelivery}/cancel`, "PATCH"); showToast("Delivery cancelled."); loadDeliveries(); }
      catch (error) { showToast(error.message, "error"); }
    }));
  } catch (error) { list.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`; }
}

async function renderMembership() {
  app.innerHTML = pageFrame("Your membership", "Choose a plan to receive booking discounts.", '<section id="membership-content" class="membership-grid"><div class="loading">Loading plans…</div></section>');
  const content = document.querySelector("#membership-content");
  try {
    const [plans, current] = await Promise.all([api("/memberships/plans"), api("/memberships/me")]);
    content.innerHTML = plans.map((plan) => `
      <article class="card plan-card ${current.plan_code === plan.code ? "is-current" : ""}"><p class="eyebrow">${plan.code}</p><h2>${escapeHtml(plan.name)}</h2><strong>${money(plan.monthly_fee)}<small>/month</small></strong><p>${plan.discount_percent}% discount on car bookings</p>${current.plan_code === plan.code ? '<span class="status-pill">Current plan</span>' : `<button class="button button-secondary" data-plan="${plan.code}">Choose ${escapeHtml(plan.name)}</button>`}</article>
    `).join("");
    content.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", async () => {
      try { await request("/memberships/me", "PUT", { planCode: button.dataset.plan, months: 1 }); showToast("Membership updated for this school demonstration."); renderMembership(); }
      catch (error) { showToast(error.message, "error"); }
    }));
  } catch (error) { content.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`; }
}

async function renderManager() {
  app.innerHTML = pageFrame("Company dashboard", "A lightweight control panel for drivers and operations.", `
    <section id="manager-stats" class="stats-grid"><div class="loading">Loading operational information…</div></section>
    <section class="two-column manager-sections"><article class="card"><p class="eyebrow">Driver management</p><h2>Add a driver</h2><form id="driver-form" class="form-stack compact-form"><label>Name<input name="name" minlength="2" required /></label><label>Phone<input name="phone" minlength="7" required /></label><label>License number<input name="licenseNumber" minlength="3" required /></label><label>Email (optional)<input name="email" type="email" /></label><button class="button button-primary" type="submit">Add driver</button></form></article>
      <article class="card"><p class="eyebrow">Current team</p><h2>Drivers</h2><div id="driver-list" class="mini-list"></div></article></section>
    <section class="card"><p class="eyebrow">Operations</p><h2>Recent bookings</h2><div id="manager-bookings" class="mini-list"></div></section>
  `);
  const refresh = async () => {
    const [dashboard, drivers, bookings] = await Promise.all([api("/manager/dashboard"), api("/manager/drivers"), api("/manager/bookings")]);
    document.querySelector("#manager-stats").innerHTML = Object.entries(dashboard).map(([label, value]) => `<article class="stat-card card"><strong>${value}</strong><span>${label.replace(/([A-Z])/g, " $1")}</span></article>`).join("");
    document.querySelector("#driver-list").innerHTML = drivers.length ? drivers.map((driver) => `<div class="mini-row"><span><strong>${escapeHtml(driver.name)}</strong><small>${escapeHtml(driver.license_number)}</small></span><span class="status-pill">${driver.status}</span></div>`).join("") : "<p class=\"muted\">No drivers added.</p>";
    document.querySelector("#manager-bookings").innerHTML = bookings.length ? bookings.slice(0, 6).map((booking) => `<div class="mini-row"><span><strong>${escapeHtml(booking.customer_name)}</strong><small>${escapeHtml(booking.vehicle_name)} · ${booking.status}</small></span><span>${booking.driver_name ? escapeHtml(booking.driver_name) : "Unassigned"}</span></div>`).join("") : "<p class=\"muted\">No bookings yet.</p>";
  };
  document.querySelector("#driver-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.email) delete values.email;
    try { await request("/manager/drivers", "POST", values); showToast("Driver added."); event.currentTarget.reset(); refresh(); }
    catch (error) { showToast(error.message, "error"); }
  });
  try { await refresh(); } catch (error) { showToast(error.message, "error"); }
}

async function render() {
  setNav();
  if (!session.user) { renderAuth(); return; }
  const pages = { vehicles: renderVehicles, bookings: renderBookings, delivery: renderDelivery, membership: renderMembership, manager: renderManager };
  if (!pages[activePage] || (activePage === "manager" && session.user.role !== "ADMIN")) activePage = "vehicles";
  await pages[activePage]();
  app.focus();
}

render();

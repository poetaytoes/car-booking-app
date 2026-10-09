import './style.css';

const API = import.meta.env.VITE_API_URL || '/api';
const app = document.querySelector('#app');
const state = { token: localStorage.getItem('cb_token') || '', user: null, offline: false, page: 'home', vehicles: [], bookings: [], rentals: [], rentalVehicles: [], deliveries: [], plans: [], membership: null, dashboard: null, drivers: [], managerBookings: [], managerDeliveries: [], managerRentals: [], managerRentalReport: null, reportMonth: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 7), selectedVehicle: null, reviewVehicle: null, vehicleReviews: [], filters: { seats: '', serviceClass: '' } };
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(v) || 0);
const dateTime = v => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const statusText = v => String(v || '').replaceAll('_', ' ');
const localTime = hours => { const d = new Date(Date.now() + hours * 3600000); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = v => new Date(v).toISOString();

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers } });
  } catch { throw new Error('Could not reach the server. Check that it is running and this device is on the same network.'); }
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && state.token) { state.token = ''; state.user = null; state.offline = false; localStorage.removeItem('cb_token'); state.page = 'login'; render(); }
  if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`);
  return body.data;
}
function toast(message, error = false) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div'); node.className = `toast ${error ? 'toast-error' : ''}`; node.role = 'status'; node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 4800);
}
async function loadPage(page = state.page, force = false) {
  try {
    if (page === 'home') { const q = new URLSearchParams(); if (state.filters.seats) q.set('seats', state.filters.seats); if (state.filters.serviceClass) q.set('serviceClass', state.filters.serviceClass); state.vehicles = await request(`/vehicles${q.size ? `?${q}` : ''}`); }
    if (page === 'bookings') state.bookings = await request('/bookings');
    if (page === 'rentals') [state.rentals, state.rentalVehicles] = await Promise.all([request('/rentals'), request('/vehicles')]);
    if (page === 'delivery') state.deliveries = await request('/deliveries');
    if (page === 'membership') [state.plans, state.membership] = await Promise.all([request('/memberships/plans'), request('/memberships/me')]);
    if (page === 'manager') [state.dashboard, state.drivers, state.managerBookings, state.managerDeliveries] = await Promise.all([request('/manager/dashboard'), request('/manager/drivers'), request('/manager/bookings'), request('/manager/deliveries')]);
    if (page === 'rentalops') [state.managerRentals, state.managerRentalReport] = await Promise.all([request('/rentals/manager'), request(`/manager/reports/monthly-rentals?month=${encodeURIComponent(state.reportMonth)}`)]);
    if (page === state.page && (force || !document.activeElement?.closest('form'))) render();
  } catch (error) { toast(error.message, true); }
}
function go(page) { if (['manager', 'rentalops'].includes(page) && state.user?.role !== 'ADMIN') return; state.page = page; state.selectedVehicle = null; state.reviewVehicle = null; render(); window.scrollTo(0, 0); if (state.token && !['login', 'register', 'profile'].includes(page)) loadPage(page); }
const brand = () => '<div class="brand"><span class="brandmark">C</span><span class="brandname">Car<span>Booking</span></span></div>';
const offlinePage = () => `<div class="offline-screen"><div class="panel">${brand()}<h1>Server unavailable</h1><p>The app cannot reach the PC hosting your bookings. Check its connection and try again.</p><button class="btn primary" id="retry-connect">Try again</button></div></div>`;
function navigation() {
  const items = [['home', '⌂', 'Book a car'], ['bookings', '▤', 'My trips'], ...(state.user?.role === 'CUSTOMER' ? [['rentals', '🚙', 'Self-drive rental']] : []), ['delivery', '▣', 'Deliveries'], ['membership', '◇', 'Membership'], ['profile', '◉', 'Account']];
  if (state.user?.role === 'ADMIN') items.push(['manager', '▦', 'Manager'], ['rentalops', '🚙', 'Rental operations']);
  return `<aside class="sidebar">${brand()}<span class="navlabel">MENU</span><nav>${items.map(([page, icon, label]) => `<button type="button" class="navitem ${state.page === page ? 'active' : ''}" data-page="${page}" aria-label="${label}" title="${label}"><span>${icon}</span><span class="nav-text">${label}</span></button>`).join('')}</nav><div class="sidebottom"><div class="miniuser"><span class="avatar">${esc((state.user?.name || 'U')[0].toUpperCase())}</span><div><b>${esc(state.user?.name || 'User')}</b><small>${esc(state.user?.email || '')}</small></div></div><button type="button" class="navitem" id="logout"><span>↪</span><span class="nav-text">Sign out</span></button></div></aside>`;
}
const shell = (title, content) => `<div class="layout">${navigation()}<main class="main"><header class="topbar"><div><span class="eyebrow">CARBOOKING</span><h1>${title}</h1></div><span class="top-user">${esc(state.user?.name || '')}</span></header>${content}</main></div>`;
function authPage(register = false) {
  return `<div class="authscreen"><div class="authleft">${brand()}<div class="hero-copy"><span class="pill">CARBOOKING</span><h1>Every journey starts with a simple booking.</h1><p>Choose a car, request a delivery, and follow your trip from one account.</p><div class="hero-points"><span>✓ 4 and 7 seat vehicles</span><span>✓ Saver, Standard, and Luxury</span><span>✓ One account across your devices</span></div></div><div class="auth-footer">© 2026 CarBooking</div></div><div class="authright"><div class="authcard"><div class="auth-icon">↗</div><h2>${register ? 'Create your account' : 'Welcome back'}</h2><p class="muted">${register ? 'Enter your details to book your first trip.' : 'Sign in to manage your trips and deliveries.'}</p><form id="${register ? 'register-form' : 'login-form'}">${register ? '<label>Full name<input name="name" autocomplete="name" required minlength="2" placeholder="Your name"></label>' : ''}<label>Email<input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>${register ? '<label>Phone number<input name="phone" type="tel" autocomplete="tel" required minlength="7" placeholder="Your phone number"></label>' : ''}<label>Password<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required ${register ? 'minlength="8"' : ''} placeholder="${register ? 'At least 8 characters' : 'Your password'}"></label><button class="btn primary full" type="submit">${register ? 'Create account' : 'Sign in'} →</button></form><div class="or"><span>or</span></div><button class="btn outline full" type="button" data-page="${register ? 'login' : 'register'}">${register ? 'Back to sign in' : 'Create a customer account'}</button><p class="auth-note">Drivers sign in through the <a href="/driver.html">Driver app</a>.</p></div></div></div>`;
}
const vehicleCard = v => `<article class="vehicle-card"><div class="car-art"><span class="car-tag">${esc(v.service_class)}</span><span class="car-emoji">🚘</span></div><div class="vehicle-info"><div class="vehicle-title"><h3>${esc(v.name)}</h3><span class="seats">${v.seat_capacity} seats</span></div><p class="muted">Plate ${esc(v.plate_number)}</p><button class="textbutton" type="button" data-view-reviews="${esc(v.id)}">Read vehicle reviews</button><div class="vehicle-bottom"><div><strong>${money(v.price_per_hour)}</strong><small> / hour</small></div><button class="btn primary small" type="button" data-book="${esc(v.id)}">Book this car</button></div></div></article>`;
function home() {
  return shell('Book a car', `<section class="welcome-banner"><div><span class="banner-kicker">YOUR NEXT JOURNEY</span><h2>Where are you going?</h2><p>Choose an available vehicle and reserve it in a few steps.</p><button class="btn white" type="button" data-scroll="vehicles">Explore cars →</button></div><div class="banner-illustration" aria-hidden="true">🚙</div></section><section class="quick-grid"><button class="quick-card" data-page="bookings"><span class="quick-icon blue">▤</span><b>My trips</b><small>View bookings and driver assignment</small></button><button class="quick-card" data-page="delivery"><span class="quick-icon orange">▣</span><b>Delivery</b><small>Send food or permitted items</small></button><button class="quick-card" data-page="membership"><span class="quick-icon purple">◇</span><b>Membership</b><small>Manage your booking discount</small></button></section><section id="vehicles" class="section"><div class="section-heading"><div><span class="eyebrow">VEHICLE SELECTION</span><h2>Available cars</h2><p class="muted">Filter by capacity and service class.</p></div><button class="textbutton" id="refresh-vehicles">Refresh</button></div><div class="filters"><label>Service class<select id="filter-class"><option value="">All classes</option>${['SAVER', 'STANDARD', 'LUXURY'].map(x => `<option ${state.filters.serviceClass === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Seats<select id="filter-seats"><option value="">All sizes</option><option value="4" ${state.filters.seats === '4' ? 'selected' : ''}>4 seats</option><option value="7" ${state.filters.seats === '7' ? 'selected' : ''}>7 seats</option></select></label><button class="btn outline" id="apply-filter">Apply filters</button></div><div class="vehicle-grid">${state.vehicles.length ? state.vehicles.map(vehicleCard).join('') : '<div class="empty wide"><h3>No cars match these filters</h3><p>Try another service class or seat count.</p></div>'}</div></section>`);
}
function bookingModal() {
  const v = state.selectedVehicle; if (!v) return '';
  return `<div class="modal-backdrop" id="booking-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="booking-title"><button class="modal-close" type="button" id="close-modal" aria-label="Close">×</button><span class="eyebrow">NEW CAR BOOKING</span><h2 id="booking-title">Plan your trip</h2><p class="muted">${esc(v.name)} · ${v.seat_capacity} seats · ${money(v.price_per_hour)} per hour</p><form id="booking-form"><label>Pickup address<input name="pickupAddress" required minlength="5" placeholder="Where should the driver meet you?"></label><label>Destination<input name="dropoffAddress" required minlength="5" placeholder="Where are you going?"></label><div class="form-row"><label>Passengers<input name="passengerCount" type="number" min="1" max="${v.seat_capacity}" value="1" required></label><label>Pickup time<input name="pickupTime" type="datetime-local" value="${localTime(24)}" required></label></div><label>Return or end time<input name="returnTime" type="datetime-local" value="${localTime(28)}" required></label><label>Notes (optional)<textarea name="notes" rows="2" placeholder="Anything the driver should know?"></textarea></label><button class="btn primary full" type="submit">Confirm booking →</button></form></div></div>`;
}
function bookings() {
  return shell('My trips', `<section class="section"><div class="section-heading"><div><span class="eyebrow">BOOKING HISTORY</span><h2>Your car bookings</h2><p class="muted">Assignments update automatically when a driver is available.</p></div><button class="btn primary" data-page="home">Book another car</button></div>${state.bookings.length ? `<div class="table-wrap"><table><thead><tr><th>Trip</th><th>Journey</th><th>Pickup</th><th>Driver</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${state.bookings.map(b => `<tr><td><b>${esc(b.id.slice(0, 8))}</b><small>${esc(b.vehicle_name || '')}</small></td><td class="route-cell">${esc(b.pickup_address)} → ${esc(b.dropoff_address)}</td><td>${dateTime(b.pickup_time)}</td><td>${b.driver_name ? `<b>${esc(b.driver_name)}</b>${b.driver_phone ? `<small>${esc(b.driver_phone)}</small>` : ''}` : 'Waiting'}</td><td>${money(b.total_price)}</td><td><span class="badge">${statusText(b.status)}</span></td><td>${b.status === 'CONFIRMED' ? `<button class="textbutton" data-cancel-booking="${esc(b.id)}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h3>No trips yet</h3><p>Your reservations will appear here.</p><button class="btn primary" data-page="home">Explore cars</button></div>'}</section>`);
}
function rentals() {
  const options = state.rentalVehicles.map(v => `<option value="${esc(v.id)}">${esc(v.name)} · ${esc(v.service_class)} · ${money(v.daily_rate ?? v.price_per_hour * 24)}/day</option>`).join('');
  const rows = state.rentals.map(r => `<div class="delivery-item"><div><b>${esc(r.vehicle_name)} · ${esc(r.id.slice(0, 8))}</b><p>${esc(r.pickup_address)} → ${esc(r.dropoff_address)}</p><small>${dateTime(r.pickup_time)} to ${dateTime(r.return_time)} · ${money(r.total_price)}</small><div><span class="badge">${statusText(r.rental_state)}</span> <span class="badge">Demo payment: ${statusText(r.payment_status)}</span> ${['BOOKING_PENDING', 'PAYMENT_FAILED'].includes(r.rental_state) ? `<button class="textbutton" data-pay-rental="${esc(r.id)}">Try demo payment</button>` : ''} ${['BOOKING_PENDING', 'PAYMENT_FAILED', 'BOOKING_CONFIRMED'].includes(r.rental_state) ? `<button class="textbutton" data-cancel-rental="${esc(r.id)}">Cancel</button>` : ''} ${r.rental_state === 'BOOKING_CLOSED' ? `<button class="textbutton" data-review-rental="${esc(r.id)}">Review</button>` : ''}</div></div></div>`).join('');
  return shell('Self-drive rental', `<section class="section"><div class="section-heading"><div><span class="eyebrow">RENT A VEHICLE</span><h2>Drive yourself</h2><p class="muted">This mode has no assigned driver. Payment is a simulation for the school project.</p></div></div><div class="delivery-layout"><div class="panel"><h3>New rental</h3><form id="rental-form"><label>Vehicle<select name="vehicleId" required>${options}</select></label><label>Pickup location name<input name="pickupName" required minlength="2" placeholder="School office"></label><label>Pickup address<input name="pickupAddress" required minlength="5"></label><label>Pickup city<input name="pickupCity" required minlength="2"></label><label>Return location name<input name="dropoffName" required minlength="2" placeholder="School office"></label><label>Return address<input name="dropoffAddress" required minlength="5"></label><label>Return city<input name="dropoffCity" required minlength="2"></label><div class="form-row"><label>Start time<input name="startAt" type="datetime-local" value="${localTime(48)}" required></label><label>End time<input name="endAt" type="datetime-local" value="${localTime(96)}" required></label></div><button class="btn primary full" type="submit">Create rental request</button></form><p class="helper">A manager confirms vehicle pickup and return. No real charge is made.</p></div><div class="panel"><h3>My rentals</h3>${rows || '<div class="empty compact"><p>No rentals yet.</p></div>'}</div></div></section>`);
}
function delivery() {
  return shell('Delivery', `<section class="section"><div class="section-heading"><div><span class="eyebrow">FOOD AND PERMITTED ITEMS</span><h2>Request a delivery</h2><p class="muted">An available driver will be assigned automatically.</p></div></div><div class="delivery-layout"><div class="panel"><h3>Delivery details</h3><form id="delivery-form"><label>Category<select name="category"><option value="FOOD">Food</option><option value="ITEM">Item</option></select></label><label>Description<textarea name="description" rows="2" required minlength="2" placeholder="What are you sending?"></textarea></label><label>Pickup address<input name="pickupAddress" required minlength="5" placeholder="Pickup location"></label><label>Drop-off address<input name="dropoffAddress" required minlength="5" placeholder="Delivery destination"></label><div class="form-row"><label>Recipient name<input name="recipientName" required minlength="2"></label><label>Recipient phone<input name="recipientPhone" required minlength="7"></label></div><label>Scheduled time<input name="scheduledAt" type="datetime-local" value="${localTime(2)}" required></label><label class="checkline"><input name="confirmLegalContents" type="checkbox" required><span>I confirm the contents are legal, safe, and permitted for delivery.</span></label><button class="btn primary full" type="submit">Request delivery →</button></form></div><div class="panel"><h3>Recent requests</h3>${state.deliveries.length ? state.deliveries.map(d => `<div class="delivery-item"><div><b>${esc(d.description)}</b><p>${esc(d.pickup_address)} → ${esc(d.dropoff_address)}</p><small>${dateTime(d.scheduled_at)} · ${d.driver_name ? `Driver: ${esc(d.driver_name)}${d.driver_phone ? ` (${esc(d.driver_phone)})` : ''}` : 'Waiting for driver'}</small><div><span class="badge">${statusText(d.status)}</span> ${['PENDING', 'ACCEPTED'].includes(d.status) ? `<button class="textbutton" data-cancel-delivery="${esc(d.id)}">Cancel</button>` : ''}</div></div></div>`).join('') : '<div class="empty compact"><p>No delivery requests yet.</p></div>'}</div></div></section>`);
}
function membership() {
  const current = state.membership?.plan_code || 'BASIC';
  return shell('Membership', `<section class="section"><div class="section-heading"><div><span class="eyebrow">BOOKING BENEFITS</span><h2>Choose a membership</h2><p class="muted">Discounts are calculated by the server for each booking.</p></div></div><div class="member-current"><span class="quick-icon purple">◇</span><div><small>CURRENT PLAN</small><h3>${esc(current)}</h3><p class="muted">${state.membership?.expires_at ? `Ends ${dateTime(state.membership.expires_at)}` : 'No expiration date'}</p></div></div><div class="plans-grid">${state.plans.map(p => `<article class="plan-card"><span class="badge">${esc(p.code)}</span><h3>${esc(p.name)}</h3><div class="discount">${Number(p.discount_percent)}% <small>booking discount</small></div><p>${money(p.monthly_fee)} per month</p><button class="btn ${p.code === current ? 'outline' : 'primary'} full" data-plan="${esc(p.code)}">${p.code === current ? 'Renew plan' : 'Activate plan'}</button></article>`).join('')}</div><p class="helper">This school demo does not process payments. Plan fees are sample data.</p></section>`);
}
function profile() {
  return shell('Account', `<section class="section"><div class="panel profile-panel"><div class="profile-head"><span class="avatar big">${esc((state.user?.name || 'U')[0])}</span><div><h3>${esc(state.user?.name || '')}</h3><p class="muted">${esc(state.user?.email || '')}</p></div></div><div class="profile-details"><div><small>PHONE</small><b>${esc(state.user?.phone || '—')}</b></div><div><small>ACCOUNT TYPE</small><b>${state.user?.role === 'ADMIN' ? 'Manager' : 'Customer'}</b></div></div><button class="btn outline" id="reload-profile">Refresh account</button> <button class="btn outline" id="profile-logout">Sign out</button></div></section>`);
}
function managerActions(kind, j) {
  if (kind === 'booking' && j.status === 'CONFIRMED') return `${j.driver_id ? `<button class="textbutton" data-manager-action="booking:${j.id}:IN_PROGRESS">Start</button>` : 'Waiting for driver'} <button class="textbutton" data-manager-action="booking:${j.id}:CANCELLED">Cancel</button>`;
  if (kind === 'booking' && j.status === 'IN_PROGRESS') return `<button class="textbutton" data-manager-action="booking:${j.id}:COMPLETED">Complete</button>`;
  if (kind === 'delivery' && j.status === 'PENDING') return `${j.driver_id ? `<button class="textbutton" data-manager-action="delivery:${j.id}:ACCEPTED">Accept</button>` : 'Waiting for driver'} <button class="textbutton" data-manager-action="delivery:${j.id}:CANCELLED">Cancel</button>`;
  if (kind === 'delivery' && j.status === 'ACCEPTED') return `<button class="textbutton" data-manager-action="delivery:${j.id}:PICKED_UP">Picked up</button>`;
  if (kind === 'delivery' && j.status === 'PICKED_UP') return `<button class="textbutton" data-manager-action="delivery:${j.id}:DELIVERED">Delivered</button>`;
  return '—';
}
function managerTable(kind, jobs) {
  if (!jobs.length) return '<div class="empty compact"><p>No requests yet.</p></div>';
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Request</th><th>Status</th><th>Driver</th><th>Action</th></tr></thead><tbody>${jobs.slice(0, 30).map(j => `<tr><td><b>${esc(j.customer_name)}</b><small>${esc(j.customer_phone || '')}</small></td><td class="route-cell">${esc(kind === 'booking' ? j.vehicle_name : j.description)}<small>${esc(j.pickup_address)} → ${esc(j.dropoff_address)}</small></td><td><span class="badge">${statusText(j.status)}</span></td><td>${esc(j.driver_name || 'Waiting for an available driver')}</td><td>${managerActions(kind, j)}</td></tr>`).join('')}</tbody></table></div>`;
}
function driverCard(d) {
  return `<div class="delivery-item driver-item"><div><b>${esc(d.name)}</b><p>${esc(d.email || 'No login email')} · ${esc(d.phone)}</p><span class="badge">${statusText(d.status)}</span>${!d.hasLogin ? '<small>Driver app login not configured — add an email and password below.</small>' : ''}<details><summary>Edit driver</summary><form class="driver-update-form" data-driver-update="${esc(d.id)}"><label>Name<input name="name" value="${esc(d.name)}" required minlength="2"></label><label>Phone<input name="phone" value="${esc(d.phone)}" required minlength="7"></label><label>Email<input name="email" type="email" value="${esc(d.email || '')}" placeholder="Driver login email"></label><label>License number<input name="licenseNumber" value="${esc(d.license_number)}" required minlength="3"></label><label>New password<input name="password" type="password" minlength="8" placeholder="Leave blank to keep current password"></label><label>Status<select name="status"><option value="AVAILABLE" ${d.status === 'AVAILABLE' ? 'selected' : ''}>Available</option><option value="OFF_DUTY" ${d.status === 'OFF_DUTY' ? 'selected' : ''}>Off duty</option><option value="SUSPENDED" ${d.status === 'SUSPENDED' ? 'selected' : ''}>Suspended</option>${d.status === 'ON_TRIP' ? '<option value="ON_TRIP" selected>On trip</option>' : ''}</select></label><button class="btn outline" type="submit">Save driver</button></form></details></div></div>`;
}
function manager() {
  const stats = state.dashboard || {};
  return shell('Manager', `<section class="section"><div class="section-heading"><div><span class="eyebrow">COMPANY OPERATIONS</span><h2>Dispatch overview</h2><p class="muted">Bookings and deliveries appear here for every account.</p></div><button class="textbutton" id="refresh-manager">Refresh</button></div><div class="quick-grid stats-grid">${[['activeDrivers', 'Active drivers'], ['openBookings', 'Open bookings'], ['openDeliveries', 'Open deliveries'], ['activeVehicles', 'Active vehicles']].map(([key, label]) => `<div class="stat"><strong>${Number(stats[key] || 0)}</strong><span>${label}</span></div>`).join('')}</div><div class="delivery-layout"><div class="panel"><h3>Add a driver account</h3><form id="manager-driver-form"><label>Full name<input name="name" minlength="2" required></label><label>Phone<input name="phone" minlength="7" required></label><label>License number<input name="licenseNumber" minlength="3" required></label><label>Email for driver sign-in<input name="email" type="email" required></label><label>Initial password<input name="password" type="password" minlength="8" required></label><button class="btn primary full">Create driver account</button></form></div><div class="panel"><h3>Drivers</h3>${state.drivers.length ? state.drivers.map(driverCard).join('') : '<div class="empty compact"><p>No drivers yet.</p></div>'}</div></div><div class="section-heading manager-bookings-heading"><div><span class="eyebrow">RIDES</span><h2>Car bookings</h2></div></div>${managerTable('booking', state.managerBookings)}<div class="section-heading manager-bookings-heading"><div><span class="eyebrow">DELIVERY</span><h2>Delivery requests</h2></div></div>${managerTable('delivery', state.managerDeliveries)}</section>`);
}
function rentalops() {
  const next = { BOOKING_CONFIRMED: ['PICKUP', 'Confirm pickup'], CAR_PICKED_UP: ['START', 'Start rental'], RENTAL_ACTIVE: ['RETURN', 'Confirm return'], CAR_RETURNED: ['CLOSE', 'Close rental'] };
  const report = state.managerRentalReport || {};
  const reportPanel = `<div class="panel"><h3>Monthly rental report</h3><label>Rental start month<input id="rental-report-month" type="month" value="${esc(state.reportMonth)}"></label><div class="quick-grid stats-grid">${[['total', 'Rentals'], ['closed', 'Closed'], ['cancelled', 'Cancelled'], ['awaitingPayment', 'Awaiting payment']].map(([key, label]) => `<div class="stat"><strong>${Number(report[key] || 0)}</strong><span>${label}</span></div>`).join('')}</div><p class="muted">Demo payments recorded: ${money(report.demoPaidAmount)} · Demo refunds recorded: ${money(report.demoRefundedAmount)}. These are not real financial transactions.</p></div>`;
  const rows = state.managerRentals.map(r => `<div class="delivery-item"><div><b>${esc(r.vehicle_name)} · ${esc(r.id.slice(0, 8))}</b><p>${esc(r.pickup_address)} → ${esc(r.dropoff_address)}</p><small>${dateTime(r.pickup_time)} to ${dateTime(r.return_time)} · ${money(r.total_price)}</small><div><span class="badge">${statusText(r.rental_state)}</span> <span class="badge">${statusText(r.payment_status)}</span> ${next[r.rental_state] ? `<button class="textbutton" data-rental-action="${esc(r.id)}:${next[r.rental_state][0]}">${next[r.rental_state][1]}</button>` : ''}</div></div></div>`).join('');
  return shell('Rental operations', `<section class="section"><div class="section-heading"><div><span class="eyebrow">MANAGER</span><h2>Vehicle handover</h2><p class="muted">Confirm pickup, rental start, return, and closure after checking the car in person.</p></div><button class="textbutton" id="refresh-rentals">Refresh</button></div>${reportPanel}<div class="panel"><h3>Rental requests</h3>${rows || '<div class="empty compact"><p>No rental requests yet.</p></div>'}</div></section>`);
}
function reviewsModal() {
  const vehicle = state.reviewVehicle;
  if (!vehicle) return '';
  const reviews = state.vehicleReviews.map(r => `<div class="delivery-item"><div><b>${'★'.repeat(Number(r.rating))} · ${esc(r.customer_name)}</b><p>${esc(r.comment)}</p><small>${dateTime(r.created_at)}</small></div></div>`).join('');
  return `<div class="modal-backdrop" id="reviews-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="reviews-title"><button class="modal-close" type="button" id="close-reviews" aria-label="Close reviews">×</button><span class="eyebrow">VEHICLE REVIEWS</span><h2 id="reviews-title">${esc(vehicle.name)}</h2>${reviews || '<p class="muted">No reviews yet for this car.</p>'}</div></div>`;
}
function render() {
  app.innerHTML = state.offline ? offlinePage() : !state.token ? authPage(state.page === 'register') : ({ home, bookings, rentals, rentalops, delivery, membership, profile, manager }[state.page] || home)() + bookingModal() + reviewsModal();
  document.querySelector('#retry-connect')?.addEventListener('click', start);
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => go(el.dataset.page)));
  document.querySelectorAll('[data-scroll]').forEach(el => el.addEventListener('click', () => document.getElementById(el.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' })));
  const signOut = () => { state.token = ''; state.user = null; localStorage.removeItem('cb_token'); go('login'); };
  document.querySelector('#logout')?.addEventListener('click', signOut);
  document.querySelector('#profile-logout')?.addEventListener('click', signOut);
  document.querySelector('#login-form')?.addEventListener('submit', login);
  document.querySelector('#register-form')?.addEventListener('submit', register);
  document.querySelector('#apply-filter')?.addEventListener('click', () => { state.filters = { seats: document.querySelector('#filter-seats').value, serviceClass: document.querySelector('#filter-class').value }; loadPage('home'); });
  document.querySelector('#refresh-vehicles')?.addEventListener('click', () => loadPage('home'));
  document.querySelectorAll('[data-book]').forEach(el => el.addEventListener('click', () => { state.selectedVehicle = state.vehicles.find(v => v.id === el.dataset.book); render(); }));
  document.querySelectorAll('[data-view-reviews]').forEach(el => el.addEventListener('click', () => showVehicleReviews(el.dataset.viewReviews)));
  document.querySelector('#close-reviews')?.addEventListener('click', () => { state.reviewVehicle = null; render(); });
  document.querySelector('#reviews-backdrop')?.addEventListener('click', e => { if (e.target.id === 'reviews-backdrop') { state.reviewVehicle = null; render(); } });
  document.querySelector('#close-modal')?.addEventListener('click', () => { state.selectedVehicle = null; render(); });
  document.querySelector('#booking-backdrop')?.addEventListener('click', e => { if (e.target.id === 'booking-backdrop') { state.selectedVehicle = null; render(); } });
  document.querySelector('#booking-form')?.addEventListener('submit', createBooking);
  document.querySelector('#rental-form')?.addEventListener('submit', createRental);
  document.querySelectorAll('[data-pay-rental]').forEach(el => el.addEventListener('click', () => payRental(el.dataset.payRental)));
  document.querySelectorAll('[data-cancel-rental]').forEach(el => el.addEventListener('click', () => cancelJob('rentals', el.dataset.cancelRental)));
  document.querySelectorAll('[data-review-rental]').forEach(el => el.addEventListener('click', () => reviewRental(el.dataset.reviewRental)));
  document.querySelectorAll('[data-rental-action]').forEach(el => el.addEventListener('click', () => rentalAction(el.dataset.rentalAction)));
  document.querySelector('#refresh-rentals')?.addEventListener('click', () => loadPage('rentalops'));
  document.querySelector('#rental-report-month')?.addEventListener('change', e => { state.reportMonth = e.currentTarget.value; loadPage('rentalops'); });
  document.querySelectorAll('[data-cancel-booking]').forEach(el => el.addEventListener('click', () => cancelJob('bookings', el.dataset.cancelBooking)));
  document.querySelectorAll('[data-cancel-delivery]').forEach(el => el.addEventListener('click', () => cancelJob('deliveries', el.dataset.cancelDelivery)));
  document.querySelector('#delivery-form')?.addEventListener('submit', createDelivery);
  document.querySelectorAll('[data-plan]').forEach(el => el.addEventListener('click', () => activatePlan(el.dataset.plan)));
  document.querySelector('#reload-profile')?.addEventListener('click', refreshProfile);
  document.querySelector('#refresh-manager')?.addEventListener('click', () => loadPage('manager'));
  document.querySelector('#manager-driver-form')?.addEventListener('submit', createDriver);
  document.querySelectorAll('[data-driver-update]').forEach(form => form.addEventListener('submit', updateDriver));
  document.querySelectorAll('[data-manager-action]').forEach(el => el.addEventListener('click', () => managerAction(el.dataset.managerAction)));
}
async function login(e) { e.preventDefault(); const f = new FormData(e.currentTarget); try { const r = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) }); state.token = r.token; state.user = r.user; state.offline = false; localStorage.setItem('cb_token', r.token); if (r.user.role === 'DRIVER') { location.href = '/driver.html'; return; } go('home'); } catch (error) { toast(error.message, true); } }
async function register(e) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); try { const r = await request('/auth/register', { method: 'POST', body: JSON.stringify(f) }); state.token = r.token; state.user = r.user; localStorage.setItem('cb_token', r.token); go('home'); } catch (error) { toast(error.message, true); } }
async function refreshProfile() { try { state.user = await request('/auth/me'); render(); toast('Account refreshed.'); } catch (error) { toast(error.message, true); } }
async function showVehicleReviews(id) {
  const vehicle = state.vehicles.find(v => v.id === id);
  if (!vehicle) return;
  try { state.vehicleReviews = await request(`/reviews/vehicles/${encodeURIComponent(id)}`); state.selectedVehicle = null; state.reviewVehicle = vehicle; render(); }
  catch (error) { toast(error.message, true); }
}
async function createBooking(e) {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); if (new Date(f.returnTime) <= new Date(f.pickupTime)) return toast('End time must be after pickup time.', true);
  try { await request('/bookings', { method: 'POST', body: JSON.stringify({ vehicleId: state.selectedVehicle.id, passengerCount: Number(f.passengerCount), pickupAddress: f.pickupAddress, dropoffAddress: f.dropoffAddress, pickupTime: toIso(f.pickupTime), returnTime: toIso(f.returnTime), notes: f.notes || undefined }) }); state.selectedVehicle = null; go('bookings'); toast('Booking created. Driver assignment will appear in your trips.'); } catch (error) { toast(error.message, true); }
}
async function createRental(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.currentTarget));
  if (new Date(f.endAt) <= new Date(f.startAt)) return toast('End time must be after start time.', true);
  const body = {
    vehicleId: f.vehicleId, startAt: toIso(f.startAt), endAt: toIso(f.endAt), paymentMethod: 'DEMO',
    pickup: { name: f.pickupName, address: f.pickupAddress, city: f.pickupCity },
    dropoff: { name: f.dropoffName, address: f.dropoffAddress, city: f.dropoffCity }
  };
  try { await request('/rentals', { method: 'POST', body: JSON.stringify(body) }); await loadPage('rentals', true); toast('Rental request created. Complete the demo payment to confirm it.'); }
  catch (error) { toast(error.message, true); }
}
async function payRental(id) {
  const outcome = confirm('Simulate a successful demo payment? Choose Cancel to simulate failure.') ? 'SUCCEED' : 'FAIL';
  try { await request(`/rentals/${encodeURIComponent(id)}/demo-payment`, { method: 'POST', body: JSON.stringify({ outcome }) }); await loadPage('rentals'); toast(outcome === 'SUCCEED' ? 'Demo payment recorded. No real charge was made.' : 'Demo payment failed; you can retry.'); }
  catch (error) { toast(error.message, true); }
}
async function reviewRental(id) {
  const rating = Number(prompt('Rate this vehicle from 1 to 5', '5'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
  const comment = prompt('Write a short review');
  if (!comment || comment.trim().length < 2) return;
  try { await request('/reviews', { method: 'POST', body: JSON.stringify({ bookingId: id, rating, comment: comment.trim() }) }); toast('Review saved.'); }
  catch (error) { toast(error.message, true); }
}
async function rentalAction(value) {
  const [id, action] = value.split(':');
  if (!confirm(`Confirm ${statusText(action).toLowerCase()} for this rental?`)) return;
  try { await request(`/rentals/manager/${encodeURIComponent(id)}/${action.toLowerCase()}`, { method: 'PATCH' }); await loadPage('rentalops'); toast('Rental state updated.'); }
  catch (error) { toast(error.message, true); }
}
async function cancelJob(path, id) { if (!confirm('Cancel this request?')) return; try { await request(`/${path}/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' }); await loadPage(state.page); toast('Request cancelled.'); } catch (error) { toast(error.message, true); } }
async function createDelivery(e) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); try { await request('/deliveries', { method: 'POST', body: JSON.stringify({ ...f, scheduledAt: toIso(f.scheduledAt), confirmLegalContents: f.confirmLegalContents === 'on' }) }); await loadPage('delivery', true); toast('Delivery request created.'); } catch (error) { toast(error.message, true); } }
async function activatePlan(code) { const months = Number(prompt('How many months?', '1')); if (!Number.isInteger(months) || months < 1 || months > 24) return; try { await request('/memberships/me', { method: 'PUT', body: JSON.stringify({ planCode: code, months }) }); await loadPage('membership'); toast('Membership updated.'); } catch (error) { toast(error.message, true); } }
async function createDriver(e) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); try { await request('/manager/drivers', { method: 'POST', body: JSON.stringify(f) }); await loadPage('manager', true); toast('Driver account created.'); } catch (error) { toast(error.message, true); } }
async function updateDriver(e) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); if (!f.password) delete f.password; if (!f.email) f.email = null; try { await request(`/manager/drivers/${encodeURIComponent(e.currentTarget.dataset.driverUpdate)}`, { method: 'PATCH', body: JSON.stringify(f) }); await loadPage('manager', true); toast('Driver updated.'); } catch (error) { toast(error.message, true); } }
async function managerAction(value) { const [kind, id, status] = value.split(':'); if (!confirm(`Update this ${kind} to ${statusText(status)}?`)) return; try { await request(`/manager/${kind === 'booking' ? 'bookings' : 'deliveries'}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadPage('manager'); toast('Status updated.'); } catch (error) { toast(error.message, true); } }
async function start() {
  if (state.token) { try { state.user = await request('/auth/me'); state.offline = false; if (state.user.role === 'DRIVER') { location.href = '/driver.html'; return; } state.page = 'home'; render(); await loadPage('home'); } catch { if (state.token) state.offline = true; else state.page = 'login'; render(); } }
  else { state.page = 'login'; render(); }
}
setInterval(() => { if (state.token && !document.hidden && !document.activeElement?.closest('form') && !state.selectedVehicle && ['bookings', 'rentals', 'rentalops', 'delivery', 'manager'].includes(state.page)) loadPage(state.page); }, 12000);
start();

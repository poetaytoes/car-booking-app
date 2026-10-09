import './driver.css';

const API = import.meta.env.VITE_API_URL || '/api';
const root = document.querySelector('#app');
const state = { token: localStorage.getItem('cb_token') || '', user: null, tasks: [], busy: false };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatDate = value => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers } });
  } catch { throw new Error('Cannot reach the server. Check the PC and your network connection.'); }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && state.token) {
    state.token = ''; state.user = null; localStorage.removeItem('cb_token'); render();
  }
  if (!response.ok) throw new Error(payload?.error?.message || `Request failed (${response.status})`);
  return payload.data;
}
function notice(message, isError = false) {
  document.querySelector('.driver-notice')?.remove();
  const element = document.createElement('div');
  element.className = `driver-notice ${isError ? 'error' : ''}`;
  element.role = 'status'; element.textContent = message; document.body.append(element);
  setTimeout(() => element.remove(), 5000);
}
const actionFor = task => task.kind === 'BOOKING'
  ? task.status === 'CONFIRMED' ? ['CONFIRM', 'Confirm pickup'] : task.status === 'IN_PROGRESS' ? ['COMPLETE', 'Complete trip'] : null
  : task.status === 'PENDING' ? ['CONFIRM', 'Accept delivery'] : task.status === 'ACCEPTED' ? ['PICKED_UP', 'Mark picked up'] : task.status === 'PICKED_UP' ? ['COMPLETE', 'Complete delivery'] : null;
function taskCard(task) {
  const action = actionFor(task);
  return `<article class="task-card"><div class="task-top"><span class="kind">${task.kind === 'BOOKING' ? 'CAR BOOKING' : 'DELIVERY'}</span><span class="status">${escapeHtml(task.status.replaceAll('_', ' '))}</span></div><h3>${escapeHtml(task.customer_name)}</h3><p class="task-subtitle">${escapeHtml(task.vehicle_name || task.description || task.category)}</p><div class="route"><div><small>PICKUP</small><strong>${escapeHtml(task.pickup_address)}</strong></div><div class="route-line"></div><div><small>DESTINATION</small><strong>${escapeHtml(task.dropoff_address)}</strong></div></div><div class="task-detail"><span>Scheduled: ${formatDate(task.scheduled_at)}</span>${task.passenger_count ? `<span>${task.passenger_count} passengers</span>` : ''}${task.recipient_name ? `<span>Recipient: ${escapeHtml(task.recipient_name)} · ${escapeHtml(task.recipient_phone)}</span>` : ''}</div><div class="task-actions"><a class="button secondary" href="tel:${encodeURIComponent(task.customer_phone || '')}">Call customer</a>${action ? `<button class="button primary" data-task="${escapeHtml(task.kind)}:${escapeHtml(task.id)}:${action[0]}">${action[1]}</button>` : ''}</div></article>`;
}
function render() {
  if (!state.token || state.user?.role !== 'DRIVER') {
    root.innerHTML = `<main class="login-layout"><section class="login-panel"><div class="logo"><span>C</span> CarBooking <b>Driver</b></div><p class="eyebrow">DRIVER APP</p><h1>Ready for your next trip?</h1><p class="muted">Sign in with the account provided by your manager. Your assignments will appear here automatically.</p><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required placeholder="driver@example.com"></label><label>Password<input name="password" type="password" autocomplete="current-password" required placeholder="Your password"></label><button class="button primary full">Sign in</button></form><a class="back-link" href="/">Go to customer app</a></section></main>`;
    document.querySelector('#login-form').addEventListener('submit', login);
    return;
  }
  const currentTask = state.tasks[0];
  root.innerHTML = `<header class="driver-header"><div class="logo"><span>C</span> CarBooking <b>Driver</b></div><button id="sign-out" class="plain-button">Sign out</button></header><main class="driver-main"><section class="welcome"><div><p class="eyebrow">DRIVER DASHBOARD</p><h1>Hello, ${escapeHtml(state.user.name)}</h1><p>Keep this page open to receive new work. Assignments refresh every few seconds.</p></div><button id="refresh" class="button secondary">Refresh</button></section><section class="availability"><div><strong>Availability</strong><p>${state.user.status === 'OFF_DUTY' ? 'Off duty — you will not receive new requests.' : state.tasks.length ? 'You have an assigned task.' : 'On duty — waiting for a request.'}</p></div><button id="toggle-duty" class="button ${state.user.status === 'OFF_DUTY' ? 'primary' : 'secondary'}" ${state.tasks.length ? 'disabled title="Finish your task first"' : ''}>${state.user.status === 'OFF_DUTY' ? 'Go on duty' : 'Go off duty'}</button></section><div class="section-title"><h2>${currentTask ? 'Assigned work' : 'No assigned work'}</h2><span>${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}</span></div>${state.tasks.length ? state.tasks.map(taskCard).join('') : '<div class="empty"><span>✓</span><h3>You are all caught up</h3><p>New car bookings and deliveries will appear here when automatically assigned.</p></div>'}<p class="footer-note">For a school demo: this screen tracks task status. It does not provide live GPS navigation or background push notifications.</p></main>`;
  document.querySelector('#sign-out').addEventListener('click', () => { state.token = ''; state.user = null; localStorage.removeItem('cb_token'); render(); });
  document.querySelector('#refresh').addEventListener('click', refresh);
  document.querySelector('#toggle-duty').addEventListener('click', toggleDuty);
  document.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => advance(button.dataset.task)));
}
async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    if (result.user.role !== 'DRIVER') { notice('This account is not a driver account. Use the customer app.', true); return; }
    state.token = result.token; state.user = result.user; localStorage.setItem('cb_token', result.token);
    render(); await refresh();
  } catch (error) { notice(error.message, true); }
}
async function refresh() {
  if (!state.token || state.busy) return;
  state.busy = true;
  try {
    const [user, tasks] = await Promise.all([api('/auth/me'), api('/driver/tasks')]);
    if (user.role !== 'DRIVER') { location.href = '/'; return; }
    state.user = user; state.tasks = tasks; render();
  } catch (error) { notice(error.message, true); }
  finally { state.busy = false; }
}
async function toggleDuty() {
  try {
    const status = state.user.status === 'OFF_DUTY' ? 'AVAILABLE' : 'OFF_DUTY';
    await api('/driver/availability', { method: 'PATCH', body: JSON.stringify({ status }) });
    await refresh(); notice(status === 'AVAILABLE' ? 'You are on duty.' : 'You are off duty.');
  } catch (error) { notice(error.message, true); }
}
async function advance(value) {
  const [kind, id, action] = value.split(':');
  if (!confirm(`Continue with ${action.toLowerCase().replace('_', ' ')}?`)) return;
  try {
    await api(`/driver/tasks/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    await refresh(); notice('Task updated.');
  } catch (error) { notice(error.message, true); }
}
setInterval(() => { if (state.token && !document.hidden) refresh(); }, 8000);
if (state.token) refresh(); else render();

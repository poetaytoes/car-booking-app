const TOKEN_KEY = "ridewise_token";
const USER_KEY = "ridewise_user";

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  },
  save({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

export async function api(path, options = {}) {
  const headers = { Accept: "application/json", ...options.headers };
  if (options.body) headers["Content-Type"] = "application/json";
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Something went wrong. Please try again.");
    error.details = payload.error?.details;
    throw error;
  }
  return payload.data;
}

export function request(path, method, body) {
  return api(path, { method, body: body ? JSON.stringify(body) : undefined });
}

// API client with the session token and a tiny cache for /api/config.
const KEY = 'greenelb-token';

export const session = {
  get token() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  set token(v) {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch { /* storage blocked */ }
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Can't reach GreenELB. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth && session.token) {
    session.token = null;
    window.dispatchEvent(new CustomEvent('greenelb:signedout'));
  }
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status}).`);
  return data;
}

let config = null;
export async function getConfig() {
  config ||= await api('/api/config', { auth: false });
  return config;
}

// Referral and traffic source from shared links (?ref=CODE&src=whatsapp), kept for sign-up.
export function rememberSource() {
  const q = new URLSearchParams(location.search);
  try {
    if (q.get('ref')) sessionStorage.setItem('greenelb-ref', q.get('ref'));
    if (q.get('src')) sessionStorage.setItem('greenelb-src', q.get('src'));
  } catch { /* ignore */ }
}
export function storedSource() {
  try {
    return { ref: sessionStorage.getItem('greenelb-ref'), src: sessionStorage.getItem('greenelb-src') };
  } catch {
    return { ref: null, src: null };
  }
}

// Small HTTP toolkit: errors, JSON bodies, routing, static files, security headers.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
};

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; '),
};

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

export function sendFile(res, body, type, { cache = 'no-store', filename } = {}) {
  const headers = { 'Content-Type': type, 'Cache-Control': cache, ...SECURITY_HEADERS };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  res.writeHead(200, headers);
  res.end(body);
}

export const KB = 1024;
export const MB = 1024 * KB;

export async function readJson(req, limit = 16 * KB) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new HttpError(415, 'Send the request body as application/json.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

export function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export function sameSecret(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// Fixed-window rate limit for write requests, per client IP.
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now > entry.reset) {
      hits.set(ip, { count: 1, reset: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

// Route table: add('GET', '/api/actions/:id', handler). Handlers receive
// (ctx) and return [status, body], or null if they wrote the response.
export function createRouter() {
  const routes = [];
  const compile = (path) => new RegExp(`^${path.replace(/:(\w+)/g, (_, name) => `(?<${name}>[\\w-]+)`)}$`);
  return {
    add(method, path, handler) {
      routes.push({ method, re: compile(path), handler });
    },
    match(method, pathname) {
      let known = false;
      for (const r of routes) {
        const m = pathname.match(r.re);
        if (!m) continue;
        known = true;
        if (r.method === method) return { handler: r.handler, params: m.groups || {} };
      }
      return { known };
    },
  };
}

// Static files from public/. Paths without a file extension fall back to the
// single-page app shell so /map, /action/abc etc. work on reload.
export function staticServer(publicDir, { spa = 'app.html', admin = 'admin.html' } = {}) {
  const root = resolve(publicDir);
  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'Bad URL.');
    }
    if (!extname(rel)) rel = rel === '/admin' || rel.startsWith('/admin/') ? `/${admin}` : `/${spa}`;
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, 'Not found.');
    let body;
    try {
      body = await readFile(file);
    } catch {
      throw new HttpError(404, 'Not found.');
    }
    const ext = extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

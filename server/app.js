import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { CATS, URG } from '../public/js/config.js';
import { validateApproval, validateReport, validateSignup } from './validate.js';

const MAX_BODY = 10 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
  ].join('; '),
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new HttpError(415, 'Send the request body as application/json.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
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

function sameSecret(a, b) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Fixed-window rate limit for write requests, per client IP.
function rateLimiter({ max, windowMs }) {
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

// Never send private fields (email, cancel token) to the public.
const publicReport = ({ id, unit, cat, status, createdAt, hotspotId }) => ({ id, unit, cat, status, createdAt, hotspotId });

export function createApp({ store, publicDir, adminToken = '', rateLimit = { max: 30, windowMs: 10 * 60 * 1000 } }) {
  const root = resolve(publicDir);
  const allowWrite = rateLimiter(rateLimit);

  function requireAdmin(req) {
    if (!adminToken) throw new HttpError(503, 'Admin is disabled. Set ADMIN_TOKEN on the server to enable it.');
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !sameSecret(token, adminToken)) throw new HttpError(401, 'Admin token is missing or wrong.');
  }

  const routes = [
    ['GET', /^\/api\/health$/, () => [200, { ok: true, mode: 'live' }]],

    ['GET', /^\/api\/stats$/, () => [200, store.stats()]],

    ['GET', /^\/api\/hotspots$/, (req, url) => {
      const cat = url.searchParams.get('cat') || undefined;
      const urg = url.searchParams.get('urg') || undefined;
      if (cat && !Object.hasOwn(CATS, cat)) throw new HttpError(400, 'Unknown category.');
      if (urg && !Object.hasOwn(URG, urg)) throw new HttpError(400, 'Unknown urgency.');
      return [200, { hotspots: store.listHotspots({ cat, urg }) }];
    }],

    ['GET', /^\/api\/hotspots\/([\w-]+)$/, (req, url, [id]) => [200, { hotspot: store.getHotspot(id) }]],

    ['POST', /^\/api\/hotspots\/([\w-]+)\/signups$/, async (req, url, [id]) => {
      const data = validateSignup(await readJson(req));
      const { signup, hotspot } = await store.addSignup(id, data);
      return [201, { signup: { id: signup.id, cancelToken: signup.cancelToken }, hotspot }];
    }],

    ['DELETE', /^\/api\/signups\/([\w-]+)$/, async (req, url, [id]) => {
      const token = url.searchParams.get('token') || '';
      const hotspot = await store.cancelSignup(id, token);
      return [200, { hotspot }];
    }],

    ['POST', /^\/api\/reports$/, async (req) => {
      const report = await store.addReport(validateReport(await readJson(req)));
      return [201, { report: publicReport(report) }];
    }],

    ['GET', /^\/api\/reports\/([\w-]+)$/, (req, url, [id]) => [200, { report: publicReport(store.getReport(id)) }]],

    // Admin: the municipal youth office
    ['GET', /^\/api\/admin\/reports$/, (req, url) => {
      requireAdmin(req);
      return [200, { reports: store.listReports(url.searchParams.get('status') || undefined) }];
    }],

    ['POST', /^\/api\/admin\/reports\/([\w-]+)\/approve$/, async (req, url, [id]) => {
      requireAdmin(req);
      const body = await readJson(req);
      const fields = validateApproval(body, store.getReport(id));
      return [201, await store.approveReport(id, fields)];
    }],

    ['POST', /^\/api\/admin\/reports\/([\w-]+)\/reject$/, async (req, url, [id]) => {
      requireAdmin(req);
      const body = await readJson(req);
      return [200, { report: await store.rejectReport(id, typeof body.reason === 'string' ? body.reason.slice(0, 300) : '') }];
    }],

    ['GET', /^\/api\/admin\/signups$/, (req, url) => {
      requireAdmin(req);
      const signups = store.listSignups(url.searchParams.get('hotspot') || undefined)
        .map(({ cancelToken, ...rest }) => rest);
      return [200, { signups }];
    }],
  ];

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'Bad URL.');
    }
    if (rel === '/') rel = '/index.html';
    if (rel === '/admin') rel = '/admin.html';
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, 'Not found.');
    let body;
    try {
      body = await readFile(file);
    } catch {
      throw new HttpError(404, 'Not found.');
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const match = routes.find(([method, re]) => method === req.method && re.test(url.pathname));
        if (!match) {
          const known = routes.some(([, re]) => re.test(url.pathname));
          throw new HttpError(known ? 405 : 404, known ? 'Method not allowed.' : 'No such API route.');
        }
        if (req.method !== 'GET' && !allowWrite(req.socket.remoteAddress || 'unknown')) {
          throw new HttpError(429, 'Too many requests. Wait a few minutes and try again.');
        }
        const [, re, fn] = match;
        const params = url.pathname.match(re).slice(1);
        const [status, body] = await fn(req, url, params);
        return sendJson(res, status, body);
      }
      await serveStatic(req, res, url.pathname);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
    }
  };
}

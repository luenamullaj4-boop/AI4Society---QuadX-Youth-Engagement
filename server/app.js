import { HttpError, bearer, createRouter, rateLimiter, sendJson, staticServer } from './http.js';
import { hashToken } from './logic.js';
import registerActions from './routes/actions.js';
import registerAdmin from './routes/admin.js';
import registerMe from './routes/me.js';
import registerPublic from './routes/public.js';
import registerReports from './routes/reports.js';

export function createApp({
  db, ai, push = { enabled: false, publicKey: null, send: null }, publicDir, adminToken = '', secret, demo = false,
  rateLimit = { max: 120, windowMs: 10 * 60 * 1000 },
}) {
  if (!secret) throw new Error('createApp needs a secret for QR codes.');
  const router = createRouter();
  const serveStatic = staticServer(publicDir);
  const allowWrite = rateLimiter(rateLimit);

  function optionalAuth(req) {
    const token = bearer(req);
    if (!token) return null;
    const h = hashToken(token);
    return db.find('users', (u) => u.tokenHash === h);
  }

  function auth(req, roles = null) {
    const user = optionalAuth(req);
    if (!user) throw new HttpError(401, 'Please sign in again.');
    if (roles && !roles.includes(user.role)) throw new HttpError(403, "Your account can't do this.");
    return user;
  }

  const ctx = { db, ai, demo, auth, optionalAuth, push: push.send, adminToken, secret };
  registerPublic(router, ctx);
  registerMe(router, ctx);
  registerReports(router, ctx);
  registerActions(router, ctx);
  registerAdmin(router, ctx);
  router.add('GET', '/api/push/key', () => [200, { enabled: push.enabled, publicKey: push.publicKey }]);

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const match = router.match(req.method, url.pathname);
        if (!match.handler) throw new HttpError(match.known ? 405 : 404, match.known ? 'Method not allowed.' : 'No such API route.');
        if (req.method !== 'GET' && !allowWrite(req.socket.remoteAddress || 'unknown')) {
          throw new HttpError(429, 'Too many requests. Wait a few minutes and try again.');
        }
        const result = await match.handler({ req, res, url, params: match.params });
        if (result) sendJson(res, result[0], result[1]);
        return;
      }
      await serveStatic(req, res, url.pathname);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
    }
  };
}

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(root, 'public');
const ADMIN = 'test-admin-token';

let server;
let base;
let dir;
let dataFile;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vepron-'));
  dataFile = join(dir, 'db.json');
  const store = await openStore(dataFile, join(publicDir, 'data', 'hotspots.json'));
  const app = createApp({ store, publicDir, adminToken: ADMIN, rateLimit: { max: 1000, windowMs: 60_000 } });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

const adult = { name: 'Arta', email: 'arta@example.com', ageGroup: '18-29' };

describe('public API', () => {
  test('health reports live mode', async () => {
    const { status, json } = await call('/api/health');
    assert.equal(status, 200);
    assert.deepEqual(json, { ok: true, mode: 'live' });
  });

  test('lists seeded hotspots and filters them', async () => {
    const all = await call('/api/hotspots');
    assert.equal(all.status, 200);
    assert.equal(all.json.hotspots.length, 13);
    const urgent = await call('/api/hotspots?urg=hi');
    assert.ok(urgent.json.hotspots.length > 0);
    assert.ok(urgent.json.hotspots.every((h) => h.urg === 'hi'));
    const bad = await call('/api/hotspots?cat=nope');
    assert.equal(bad.status, 400);
  });

  test('unknown hotspot is a 404', async () => {
    const { status } = await call('/api/hotspots/does-not-exist');
    assert.equal(status, 404);
  });

  test('sign up, reject duplicates, then cancel', async () => {
    const before = (await call('/api/hotspots/h6')).json.hotspot.have;
    const joined = await call('/api/hotspots/h6/signups', { method: 'POST', body: adult });
    assert.equal(joined.status, 201);
    assert.equal(joined.json.hotspot.have, before + 1);
    assert.ok(joined.json.signup.cancelToken);
    assert.equal(joined.json.signup.email, undefined, 'personal data is not echoed back');

    const dup = await call('/api/hotspots/h6/signups', { method: 'POST', body: adult });
    assert.equal(dup.status, 409);

    const wrongToken = await call(`/api/signups/${joined.json.signup.id}?token=nope`, { method: 'DELETE' });
    assert.equal(wrongToken.status, 404);

    const left = await call(`/api/signups/${joined.json.signup.id}?token=${joined.json.signup.cancelToken}`, { method: 'DELETE' });
    assert.equal(left.status, 200);
    assert.equal(left.json.hotspot.have, before);
  });

  test('minors need parental consent', async () => {
    const minor = { name: 'Ilir', email: 'ilir@example.com', ageGroup: '15-17' };
    const refused = await call('/api/hotspots/h1/signups', { method: 'POST', body: minor });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /parent/i);
    const ok = await call('/api/hotspots/h1/signups', { method: 'POST', body: { ...minor, parentConsent: true } });
    assert.equal(ok.status, 201);
  });

  test('validates sign-up fields', async () => {
    const bad = await call('/api/hotspots/h1/signups', { method: 'POST', body: { ...adult, email: 'not-an-email' } });
    assert.equal(bad.status, 400);
    const noJson = await fetch(`${base}/api/hotspots/h1/signups`, { method: 'POST', body: 'name=x' });
    assert.equal(noJson.status, 415);
  });

  test('a full crew refuses new sign-ups', async () => {
    const h = (await call('/api/hotspots/h7')).json.hotspot; // 10 of 12
    for (let i = h.have; i < h.need; i++) {
      const r = await call('/api/hotspots/h7/signups', { method: 'POST', body: { ...adult, email: `v${i}@example.com` } });
      assert.equal(r.status, 201);
    }
    const full = await call('/api/hotspots/h7/signups', { method: 'POST', body: { ...adult, email: 'late@example.com' } });
    assert.equal(full.status, 409);
  });

  test('stats add up', async () => {
    const { json } = await call('/api/stats');
    const { hotspots } = (await call('/api/hotspots')).json;
    assert.equal(json.open, hotspots.length);
    assert.equal(json.signedUp, hotspots.reduce((s, h) => s + h.have, 0));
  });
});

describe('reports and the youth office', () => {
  let reportId;

  test('anyone can file a report and check its status', async () => {
    const created = await call('/api/reports', { method: 'POST', body: { unit: 'Shirgjan', cat: 'spaces', desc: 'Broken glass all over the basketball court.' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.report.status, 'pending');
    reportId = created.json.report.id;

    const status = await call(`/api/reports/${reportId}`);
    assert.equal(status.json.report.status, 'pending');
  });

  test('reports are validated', async () => {
    const badUnit = await call('/api/reports', { method: 'POST', body: { unit: 'Tirana', cat: 'env', desc: 'Something long enough here.' } });
    assert.equal(badUnit.status, 400);
    const short = await call('/api/reports', { method: 'POST', body: { unit: 'Papër', cat: 'env', desc: 'short' } });
    assert.equal(short.status, 400);
  });

  test('admin routes need the token', async () => {
    assert.equal((await call('/api/admin/reports')).status, 401);
    assert.equal((await call('/api/admin/reports', { token: 'wrong' })).status, 401);
    const ok = await call('/api/admin/reports?status=pending', { token: ADMIN });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.reports.some((r) => r.id === reportId));
  });

  test('approving a report publishes a hotspot', async () => {
    const approved = await call(`/api/admin/reports/${reportId}/approve`, {
      method: 'POST',
      token: ADMIN,
      body: { title: 'Court clean-up in Shirgjan', when: 'Sat 17 Oct · 10:00', meet: 'School gate', need: 8, urg: 'mid' },
    });
    assert.equal(approved.status, 201);
    const id = approved.json.hotspot.id;
    const { json } = await call(`/api/hotspots/${id}`);
    assert.equal(json.hotspot.title, 'Court clean-up in Shirgjan');
    assert.equal(json.hotspot.unit, 'Shirgjan');
    assert.equal((await call(`/api/reports/${reportId}`)).json.report.status, 'approved');

    const again = await call(`/api/admin/reports/${reportId}/approve`, { method: 'POST', token: ADMIN, body: { title: 'x', when: 'x', meet: 'x', need: 1, urg: 'lo' } });
    assert.equal(again.status, 409);
  });

  test('rejecting a report', async () => {
    const { json } = await call('/api/reports', { method: 'POST', body: { unit: 'Gracen', cat: 'edu', desc: 'The library needs more shelves.' } });
    const rejected = await call(`/api/admin/reports/${json.report.id}/reject`, { method: 'POST', token: ADMIN, body: { reason: 'Duplicate' } });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.json.report.status, 'rejected');
  });

  test('admin sees sign-ups without cancel tokens', async () => {
    const { json } = await call('/api/admin/signups?hotspot=h1', { token: ADMIN });
    assert.ok(json.signups.length > 0);
    assert.ok(json.signups.every((s) => s.cancelToken === undefined));
  });

  test('data is written to disk', async () => {
    const db = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.ok(db.reports.length >= 2);
    assert.ok(db.signups.length > 0);
  });
});

describe('static files', () => {
  test('serves the landing page and admin page', async () => {
    const home = await call('/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(home.text, /Elbasani Vepron/);
    assert.equal((await call('/admin')).status, 200);
    assert.equal((await call('/js/config.js')).status, 200);
  });

  test('blocks path traversal', async () => {
    const res = await call('/..%2fpackage.json');
    assert.equal(res.status, 404);
  });

  test('unknown API route is a JSON 404', async () => {
    const res = await call('/api/nope');
    assert.equal(res.status, 404);
    assert.ok(res.json.error);
  });
});

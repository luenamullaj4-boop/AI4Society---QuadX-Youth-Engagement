import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { H, tick } from '../server/logic.js';
import { quizMajority, rankLeadersByRules, recommendByRules, scrubText } from '../server/rules.js';
import { seed } from '../server/seed.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const ADMIN = 'test-staff-token';

// Deterministic stand-in for Claude. The description text steers the verdict.
const fakeAi = {
  enabled: true,
  model: 'fake',
  calls: [],
  async checkReport(input) {
    this.calls.push(['checkReport', input]);
    const base = { matches_description: true, category: input.category, waste_types: ['plastic'], size: 'medium', suggested_volunteers: 4, suggested_tools: ['Gloves', 'Bags'], urgency: 'high', site_accessible_and_safe: true, contains_personal_data: false, reason: 'Looks like a real problem.', source: 'fake' };
    if (input.description.includes('face')) return { ...base, contains_personal_data: true, is_environmental_problem: true, confidence: 90 };
    if (input.description.includes('cat')) return { ...base, is_environmental_problem: false, confidence: 95, reason: 'This is a cat.' };
    if (input.description.includes('blurry')) return { ...base, is_environmental_problem: true, confidence: 65 };
    return { ...base, is_environmental_problem: true, confidence: 92 };
  },
  async verifyCleanup() { return { is_clean: true, confidence: 90, est_kg: 12, waste_types: ['plastic'], contains_personal_data: false, reason: 'Clean.', source: 'fake' }; },
  async checkDatacard() { return { valid: true, waste_types: ['plastic'], est_kg: 3, contains_personal_data: false, reason: 'OK', source: 'fake' }; },
  async rankLeaders({ applicants }) { return rankLeadersByRules(applicants); },
  async recommend(input) { return recommendByRules(input); },
  async privacyFilter(t) { return scrubText(t); },
  async summarizeDocument() { return [{ title: 'Card', body: 'Body' }]; },
  async quizType(a) { return quizMajority(a); },
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let photoN = 0;
function photo(lat, lng, extra = {}) {
  photoN += 1;
  const buf = Buffer.concat([PNG, Buffer.from(`#${photoN}`)]);
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, lat, lng, takenAt: new Date().toISOString(), source: 'camera', ahash: randomBytes(8).toString('hex'), ...extra };
}

let server;
let base;
let dir;
let db;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'greenelb-'));
  db = await openDb(join(dir, 'db.json'), seed);
  const app = createApp({ db, ai: fakeAi, publicDir: join(root, 'public'), adminToken: ADMIN, secret: 'test-secret', demo: true, rateLimit: { max: 10000, windowMs: 60000 } });
  server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
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

const answers = (t) => ({ q1: t, q2: t, q3: t, q4: t, q5: t });
let nick = 0;
async function signup(extra = {}) {
  nick += 1;
  const r = await call('/api/auth/signup', { method: 'POST', body: {
    nickname: `tester${nick}`, displayName: `Test Person ${nick}`, ageGroup: '18-24', area: 'City centre', categories: ['waste', 'water'],
    settingPref: 'outdoors', availableTime: 'medium', answers: answers('doer'), ...extra,
  } });
  assert.equal(r.status, 201, r.text);
  return r.json;
}
const staffToken = async () => (await call('/api/auth/staff', { method: 'POST', body: { token: ADMIN } })).json.token;

describe('public', () => {
  test('health, config and demo accounts', async () => {
    assert.equal((await call('/api/health')).json.ok, true);
    const cfg = (await call('/api/config')).json;
    assert.equal(cfg.demo, true);
    assert.ok(cfg.demoUsers.some((u) => u.name === 'Arta K.'));
  });

  test('map, news and impact come from seed data', async () => {
    const map = (await call('/api/map')).json;
    assert.ok(map.hotspots.find((h) => h.title === 'Shkumbin riverbank'));
    assert.ok(map.hotspots.some((h) => h.status === 'cleaned'));
    const news = (await call('/api/news')).json.news;
    assert.ok(news.some((n) => n.title === 'Local Plan 2025–2030 in 5 cards' && n.cards.length === 5));
    assert.ok(!news.some((n) => !n.approved), 'unapproved partner news stays hidden');
    const impact = (await call('/api/impact')).json;
    assert.equal(impact.kgCollected, 18.5);
  });

  test('SPA routes fall back to the app shell and admin to its page', async () => {
    const r = await call('/action/abc');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match((await call('/admin')).text, /admin/i);
    assert.equal((await call('/..%2fpackage.json')).status, 404);
  });
});

describe('accounts and privacy', () => {
  test('16–17 users are private with nickname shown by default', async () => {
    const { user, loginCode } = await signup({ ageGroup: '16-17', showRealName: true });
    assert.equal(user.isPrivate, true);
    assert.equal(user.showRealName, false);
    assert.equal(user.tokenHash, undefined);
    const login = await call('/api/auth/login', { method: 'POST', body: { code: loginCode } });
    assert.equal(login.status, 200);
  });

  test('onboarding validates answers and categories', async () => {
    const r = await call('/api/auth/signup', { method: 'POST', body: { nickname: 'x1', ageGroup: '18-24', area: 'City centre', categories: [], settingPref: 'both', availableTime: 'short', answers: answers('doer') } });
    assert.equal(r.status, 400);
  });

  test('export and delete my account', async () => {
    const { token, user } = await signup();
    const exp = await call('/api/me/export', { token });
    assert.equal(exp.json.profile.id, user.id);
    assert.equal(exp.json.profile.tokenHash, undefined);
    assert.equal((await call('/api/me', { method: 'DELETE', token })).status, 200);
    assert.equal((await call('/api/me', { token })).status, 401);
  });

  test('home feed has recommendations and news', async () => {
    const { token } = await signup({ categories: ['planting'] });
    const home = (await call('/api/me/home', { token })).json;
    assert.ok(home.recommended.length > 0 && home.recommended.length <= 3);
    assert.ok(home.recommended[0].reason);
    assert.ok(home.news.some((n) => n.important));
  });
});

describe('report → verify → lead → volunteers → action day → points', () => {
  const spot = { lat: 41.1255, lng: 20.0955 };
  let reporter;
  let actionId;
  const vols = [];

  test('personal data in the photo means retake, nothing stored', async () => {
    reporter = await signup();
    const before = (await readdir(db.uploadsDir)).length;
    const r = await call('/api/reports', { method: 'POST', token: reporter.token, body: { photo: photo(spot.lat, spot.lng), category: 'waste', problemType: 'illegal_dump', description: 'a face in the photo' } });
    assert.equal(r.json.status, 'retake');
    assert.equal((await readdir(db.uploadsDir)).length, before);
  });

  test('gallery uploads and stale photos are refused', async () => {
    const gallery = await call('/api/reports', { method: 'POST', token: reporter.token, body: { photo: photo(spot.lat, spot.lng, { source: 'gallery' }), category: 'waste', problemType: 'litter', description: 'rubbish here' } });
    assert.equal(gallery.status, 400);
    const old = await call('/api/reports', { method: 'POST', token: reporter.token, body: { photo: photo(spot.lat, spot.lng, { takenAt: new Date(Date.now() - 3600e3).toISOString() }), category: 'waste', problemType: 'litter', description: 'rubbish here' } });
    assert.equal(old.status, 400);
  });

  test('not an environmental problem is rejected with the AI reason', async () => {
    const r = await call('/api/reports', { method: 'POST', token: reporter.token, body: { photo: photo(41.13, 20.1), category: 'waste', problemType: 'other', description: 'my cat' } });
    assert.equal(r.json.status, 'rejected');
    assert.match(r.json.reason, /cat/);
  });

  test('confident report is AI-verified, pays +20 and offers the leader role', async () => {
    const r = await call('/api/reports', { method: 'POST', token: reporter.token, body: { photo: photo(spot.lat, spot.lng), category: 'waste', problemType: 'illegal_dump', description: 'bags dumped by the road, call 069 123 4567' } });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.status, 'ai_verified');
    assert.ok(!r.json.hotspot.description.includes('069'), 'phone number scrubbed');
    actionId = r.json.actionId;
    const me = (await call('/api/me', { token: reporter.token })).json;
    assert.equal(me.user.points, 20);
    const a = (await call(`/api/actions/${actionId}`, { token: reporter.token })).json.action;
    assert.equal(a.status, 'leader_offered');
    assert.equal(a.me.offered, true);
    assert.equal(a.requiredVolunteers, 4);
  });

  test('a second report within 50 m becomes a confirmation', async () => {
    const other = await signup();
    const r = await call('/api/reports', { method: 'POST', token: other.token, body: { photo: photo(spot.lat + 0.0001, spot.lng), category: 'waste', problemType: 'illegal_dump', description: 'same dump' } });
    assert.equal(r.json.status, 'confirmed');
    assert.equal(r.json.points, 5);
  });

  test('reporter accepts, sets dates; volunteers reach the threshold', async () => {
    const accept = await call(`/api/actions/${actionId}/offer`, { method: 'POST', token: reporter.token, body: { accept: true } });
    assert.equal(accept.json.action.status, 'collecting');
    const d1 = new Date(Date.now() + 3 * 24 * H).toISOString();
    const d2 = new Date(Date.now() + 4 * 24 * H).toISOString();
    const opts = await call(`/api/actions/${actionId}/options`, { method: 'POST', token: reporter.token, body: { dates: [d1, d2] } });
    assert.equal(opts.json.action.options.length, 2);
    const optionId = opts.json.action.options[0].id;
    for (let i = 0; i < 4; i++) {
      const v = await signup();
      vols.push(v);
      const j = await call(`/api/actions/${actionId}/join`, { method: 'POST', token: v.token, body: { optionIds: [optionId] } });
      assert.equal(j.status, 200, j.text);
      assert.equal(j.json.action.status, i < 3 ? 'collecting' : 'confirmed');
    }
    const notes = (await call('/api/notifications', { token: vols[0].token })).json.notifications;
    assert.ok(notes.some((n) => n.type === 'action_confirmed'));
  });

  test('safety checklist gates the start; QR check-in checks token and distance', async () => {
    const early = await call(`/api/actions/${actionId}/start`, { method: 'POST', token: reporter.token });
    assert.equal(early.status, 409);
    await call(`/api/actions/${actionId}/safety`, { method: 'POST', token: reporter.token, body: { gloves: true, firstAid: true, briefing: true } });
    assert.equal((await call(`/api/actions/${actionId}/start`, { method: 'POST', token: reporter.token })).json.action.status, 'in_progress');
    const qr = (await call(`/api/actions/${actionId}/qr?kind=checkin`, { token: reporter.token })).json;
    const fake = await call(`/api/actions/${actionId}/scan`, { method: 'POST', token: vols[0].token, body: { payload: qr.payload.replace(/[0-9a-f]{16}$/, '0000000000000000'), ...spot } });
    assert.equal(fake.status, 400);
    const far = await call(`/api/actions/${actionId}/scan`, { method: 'POST', token: vols[0].token, body: { payload: qr.payload, lat: 41.2, lng: 20.2 } });
    assert.equal(far.status, 400);
    for (const v of vols) {
      const s = await call(`/api/actions/${actionId}/scan`, { method: 'POST', token: v.token, body: { payload: qr.payload, ...spot } });
      assert.equal(s.status, 200, s.text);
    }
    const quiz = await call(`/api/actions/${actionId}/quiz`, { method: 'POST', token: vols[0].token, body: { answers: { p1: 'PET (1)' } } });
    assert.equal(quiz.json.points, 5);
  });

  test('photos, check-out, data cards and leader confirmation', async () => {
    const before = await call(`/api/actions/${actionId}/photos`, { method: 'POST', token: reporter.token, body: { kind: 'before', photo: photo(spot.lat, spot.lng) } });
    assert.equal(before.status, 201, before.text);
    const out = (await call(`/api/actions/${actionId}/qr?kind=checkout`, { token: reporter.token })).json;
    for (const v of vols) {
      await call(`/api/actions/${actionId}/scan`, { method: 'POST', token: v.token, body: { payload: out.payload, ...spot } });
      const card = await call(`/api/actions/${actionId}/datacard`, { method: 'POST', token: v.token, body: { bags: 2, photo: photo(spot.lat, spot.lng), items: ['bottles', 'cans'], localConcern: 'Tyres' } });
      assert.equal(card.status, 201, card.text);
      assert.equal(card.json.card.status, 'awaiting_leader');
      const ok = await call(`/api/actions/${actionId}/datacards/${card.json.card.id}/confirm`, { method: 'POST', token: reporter.token, body: { agree: true } });
      assert.equal(ok.json.card.status, 'verified');
    }
  });

  test('finishing verifies the cleanup, creates a pickup, pays everyone', async () => {
    await call(`/api/actions/${actionId}/photos`, { method: 'POST', token: reporter.token, body: { kind: 'after', photo: photo(spot.lat, spot.lng) } });
    await call(`/api/actions/${actionId}/photos`, { method: 'POST', token: reporter.token, body: { kind: 'bags', photo: photo(spot.lat, spot.lng) } });
    const fin = await call(`/api/actions/${actionId}/finish`, { method: 'POST', token: reporter.token, body: { totalBags: 8, kgPlastic: 9.5, kgOther: 4 } });
    assert.equal(fin.status, 200, fin.text);
    assert.equal(fin.json.verified, true);
    assert.equal(fin.json.action.status, 'done');
    assert.equal(fin.json.action.hotspotStatus, 'cleaned');
    const lead = (await call('/api/me', { token: reporter.token })).json;
    assert.equal(lead.user.points, 20 + 100);
    assert.ok(lead.achievements.some((a) => a.kind === 'lead'));
    assert.ok(lead.user.certificates.some((c) => c.kind === 'cert_1'));
    const v = (await call('/api/me', { token: vols[1].token })).json;
    assert.equal(v.user.points, 25, 'short stay (<75% of planned time) earns half points');
    const staff = await staffToken();
    assert.equal((await call('/api/admin/pickups', { token: staff })).json.pickups.length, 1);
    const csv = await call('/api/admin/export/datacards.csv', { token: staff });
    assert.match(csv.text, /kg_plastic/);
    assert.match(csv.text, /9\.5/);
  });
});

describe('municipality leader call', () => {
  test('applications are ranked, leader confirmed, deputy assigned, others told', async () => {
    const staff = await staffToken();
    const created = await call('/api/admin/actions', { method: 'POST', token: staff, body: { title: 'School garden planting', category: 'planting', type: 'planting', description: 'Plant a garden at the school.', areaName: 'Northern city' } });
    assert.equal(created.status, 201, created.text);
    const id = created.json.action.id;
    assert.equal(created.json.action.status, 'leader_wanted');
    const apps = [];
    for (const [i, m] of ['I have led before and I am reliable and ready.', 'I would like to learn how to lead a planting.', 'Happy to help and I live close to the school.'].entries()) {
      const u = await signup({ categories: ['planting'], area: 'Northern city' });
      const a = await call(`/api/actions/${id}/apply`, { method: 'POST', token: u.token, body: { motivation: m, availableDates: [new Date(Date.now() + (5 + i) * 24 * H).toISOString()] } });
      assert.equal(a.status, 201, a.text);
      apps.push(u);
    }
    const ranked = await call(`/api/admin/actions/${id}/rank`, { method: 'POST', token: staff });
    assert.equal(ranked.json.ranking.length, 3);
    const board = (await call('/api/admin/leaders', { token: staff })).json.actions.find((a) => a.id === id);
    assert.ok(board.applications.every((a) => a.aiReason && a.rank));
    const top = board.applications[0];
    const conf = await call(`/api/admin/actions/${id}/confirm-leader`, { method: 'POST', token: staff, body: { applicationId: top.id } });
    assert.equal(conf.json.action.status, 'collecting');
    assert.ok(conf.json.action.deputyName);
    const allNotes = await Promise.all(apps.map((u) => call('/api/notifications', { token: u.token })));
    const types = allNotes.flatMap((n) => n.json.notifications.map((x) => x.type));
    assert.ok(types.includes('selected_leader') && types.includes('selected_deputy') && types.includes('leader_decision'));
  });

  test('youth accounts cannot use admin routes', async () => {
    const { token } = await signup();
    assert.equal((await call('/api/admin/overview', { token })).status, 403);
    assert.equal((await call('/api/admin/overview')).status, 401);
  });
});

describe('timers', () => {
  test('an expired reporter offer turns into a public leader call', async () => {
    const u = await signup();
    const r = await call('/api/reports', { method: 'POST', token: u.token, body: { photo: photo(41.135, 20.07), category: 'waste', problemType: 'litter', description: 'lots of litter' } });
    const a = db.byId('actions', r.json.actionId);
    await tick(db, fakeAi, null, Date.now() + 25 * H);
    assert.equal(a.status, 'leader_wanted');
    assert.ok(a.applicationsCloseAt);
  });
});

describe('peer confirmation and review', () => {
  test('two confirmations within 100 m verify a report', async () => {
    const u = await signup();
    const p = { lat: 41.14, lng: 20.06 };
    const r = await call('/api/reports', { method: 'POST', token: u.token, body: { photo: photo(p.lat, p.lng), category: 'waste', problemType: 'litter', description: 'blurry pile' } });
    assert.equal(r.json.status, 'needs_confirmation');
    const id = r.json.hotspot.id;
    for (let i = 0; i < 2; i++) {
      const c = await signup();
      const res = await call(`/api/hotspots/${id}/confirm`, { method: 'POST', token: c.token, body: { photo: photo(p.lat + 0.0002, p.lng) } });
      assert.equal(res.status, 201, res.text);
      if (i === 1) assert.ok(res.json.actionId);
    }
    assert.equal((await call(`/api/hotspots/${id}`)).json.hotspot.status, 'verified');
  });
});

describe('passport, rewards, surveys, demand', () => {
  test('rewards respect points and the monthly cap', async () => {
    const staff = await staffToken();
    await call('/api/admin/settings', { method: 'PATCH', token: staff, body: { reward_monthly_cap: 1 } });
    const arta = db.find('users', (u) => u.nickname === 'arta.green');
    const token = (await call('/api/auth/demo', { method: 'POST', body: { userId: arta.id } })).json.token;
    const pass = (await call('/api/me/passport', { token })).json;
    const reward = pass.rewards.find((x) => x.costPoints <= arta.points);
    assert.equal((await call(`/api/rewards/${reward.id}/redeem`, { method: 'POST', token })).status, 201);
    assert.equal((await call(`/api/rewards/${reward.id}/redeem`, { method: 'POST', token })).status, 409);
  });

  test('survey answers feed the satisfaction indicator', async () => {
    const { token } = await signup();
    const s = (await call('/api/surveys')).json.surveys[0];
    assert.equal((await call(`/api/surveys/${s.id}/respond`, { method: 'POST', token, body: { answers: { q1: 5, q2: 'Litter' } } })).status, 201);
    const staff = await staffToken();
    const ind = (await call('/api/admin/indicators', { token: staff })).json;
    assert.equal(ind.satisfaction.responses, 6);
  });

  test('demand signal alerts the municipality at the threshold', async () => {
    const staff = await staffToken();
    await call('/api/admin/settings', { method: 'PATCH', token: staff, body: { demand_threshold: 2 } });
    for (let i = 0; i < 2; i++) {
      const { token } = await signup({ area: 'Tregan', categories: ['climate'] });
      await call('/api/me/interest', { method: 'POST', token, body: { category: 'climate' } });
    }
    const notes = (await call('/api/notifications', { token: staff })).json.notifications;
    assert.ok(notes.some((n) => n.type === 'demand' && n.body.includes('Tregan')));
  });

  test('public verify page shows only what the user allowed', async () => {
    const arta = db.find('users', (u) => u.nickname === 'arta.green');
    const v = (await call(`/api/verify/${arta.verifyCode}`)).json.profile;
    assert.equal(v.name, 'Arta K.');
    assert.ok(v.points >= 340);
    assert.equal(v.email, undefined);
  });

  test('partner news is hidden until approved', async () => {
    const staff = await staffToken();
    const { code } = (await call('/api/admin/partners', { method: 'POST', token: staff, body: { org: 'Test NGO' } })).json;
    const partner = (await call('/api/auth/partner', { method: 'POST', body: { code } })).json.token;
    const n = await call('/api/partner/news', { method: 'POST', token: partner, body: { title: 'Beach day', body: 'Come help.' } });
    assert.equal(n.status, 201);
    assert.ok(!(await call('/api/news')).json.news.some((x) => x.title === 'Beach day'));
    await call(`/api/admin/news/${n.json.news.id}/approve`, { method: 'POST', token: staff, body: { approve: true } });
    assert.ok((await call('/api/news')).json.news.some((x) => x.title === 'Beach day'));
  });
});

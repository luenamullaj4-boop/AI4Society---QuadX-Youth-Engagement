import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATEGORIES, PILOT_SCHOOLS, USER_TYPES } from '../../public/js/config.js';
import { HttpError, MIME, sendFile } from '../http.js';
import { actionView, photoUrl, publicName, settings } from '../logic.js';

export function hotspotView(db, h) {
  const action = db.find('actions', (a) => a.hotspotId === h.id);
  return {
    id: h.id, title: h.title, description: h.description, category: h.category, problemType: h.problemType,
    lat: h.lat, lng: h.lng, areaName: h.areaName, source: h.source, status: h.status, priority: h.priority,
    photoUrl: photoUrl(h.photoId), confirmations: db.filter('confirmations', (c) => c.hotspotId === h.id).length,
    aiReason: h.aiCheck?.reason || null, aiConfidence: h.aiCheck?.confidence ?? null, actionId: action?.id || null,
    actionStatus: action?.status || null, createdAt: h.createdAt,
  };
}

export function impactTotals(db) {
  const done = db.filter('actions', (a) => a.status === 'done');
  const seed = db.data.settings.impactBaseline || { kg: 0, trees: 0, actions: 0, youth: 0 };
  const kg = done.reduce((s, a) => s + (a.kgPlastic || 0) + (a.kgOther || 0), 0);
  const items = {};
  db.filter('dataCards', (c) => c.status === 'verified').forEach((c) => (c.items || []).forEach((i) => { items[i] = (items[i] || 0) + 1; }));
  const youth = new Set(db.filter('attendance', (a) => a.checkinAt).map((a) => a.userId));
  return {
    kgCollected: Math.round((seed.kg + kg) * 10) / 10,
    kgPlastic: Math.round(done.reduce((s, a) => s + (a.kgPlastic || 0), 0) * 10) / 10,
    treesPlanted: seed.trees + done.reduce((s, a) => s + (a.treesPlanted || 0), 0),
    actions: seed.actions + done.length,
    youthEngaged: seed.youth + youth.size,
    topItems: Object.entries({ ...(seed.items || {}), ...items }).sort((a, b) => b[1] - a[1]).slice(0, 5),
    cleanedSites: db.filter('hotspots', (h) => h.status === 'cleaned').map((h) => hotspotView(db, h)),
  };
}

export default function register(r, { db, ai, demo }) {
  r.add('GET', '/api/health', () => [200, { ok: true, ai: ai.enabled, demo }]);

  r.add('GET', '/api/config', () => {
    const s = settings(db);
    const demoUsers = demo ? db.filter('users', (u) => u.demo).map((u) => ({ id: u.id, name: publicName(u), role: u.role, blurb: u.demoBlurb })) : [];
    return [200, { ai: ai.enabled, demo, demoUsers, leaderMinAge: s.leader_min_age, requiredVolunteers: s.required_volunteers }];
  });

  // Photos are only stored after the AI privacy check, under random ids.
  r.add('GET', '/api/photos/:id', async ({ params, res }) => {
    const p = db.byId('photos', params.id);
    if (!p) throw new HttpError(404, 'No such photo.');
    let body;
    try {
      body = await readFile(join(db.uploadsDir, `${p.id}.${p.ext}`));
    } catch {
      throw new HttpError(404, 'No such photo.');
    }
    sendFile(res, body, MIME[`.${p.ext}`] || 'image/jpeg', { cache: 'private, max-age=86400' });
    return null;
  });

  r.add('GET', '/api/map', () => {
    const hotspots = db.filter('hotspots', (h) => h.status !== 'rejected').map((h) => hotspotView(db, h));
    return [200, { hotspots }];
  });

  r.add('GET', '/api/hotspots/:id', ({ params }) => {
    const h = db.byId('hotspots', params.id);
    if (!h || h.status === 'rejected') throw new HttpError(404, 'No such hotspot.');
    return [200, { hotspot: hotspotView(db, h) }];
  });

  r.add('GET', '/api/news', ({ url }) => {
    const cat = url.searchParams.get('category');
    const news = db.filter('news', (n) => n.approved && (!cat || !n.category || n.category === cat))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return [200, { news }];
  });

  r.add('GET', '/api/actions', ({ url }) => {
    const cat = url.searchParams.get('category');
    const open = db.filter('actions', (a) => a.status !== 'done' && (!cat || a.category === cat))
      .map((a) => actionView(db, a));
    return [200, { actions: open }];
  });

  r.add('GET', '/api/impact', () => [200, impactTotals(db)]);

  r.add('GET', '/api/schools', () => {
    const rows = PILOT_SCHOOLS.map((school) => {
      const seed = db.find('schoolPoints', (s) => s.school === school)?.points || 0;
      const live = db.filter('users', (u) => u.school === school).reduce((s, u) => s + (u.seedPoints ? 0 : u.lifetimePoints), 0);
      return { school, points: seed + live, students: db.filter('users', (u) => u.school === school).length };
    });
    return [200, { schools: rows.sort((a, b) => b.points - a.points) }];
  });

  // Public verification page: only what the user allowed.
  r.add('GET', '/api/verify/:code', ({ params }) => {
    const code = params.code.toUpperCase();
    const cert = db.find('certificates', (c) => c.verifyCode === code);
    const user = cert ? db.byId('users', cert.userId) : db.find('users', (u) => u.verifyCode === code);
    if (!user) throw new HttpError(404, 'No GreenELB profile or certificate matches this code.');
    const show = user.verifyVisibility || {};
    const out = { name: publicName(user), certificate: cert ? { title: cert.title, phase: cert.phase, issuedAt: cert.createdAt } : null };
    if (show.points) out.points = user.lifetimePoints;
    if (show.actions) out.actions = user.actionsCount;
    if (show.hours) out.hours = user.hours;
    if (show.type && user.userType) out.userType = USER_TYPES[user.userType]?.name;
    if (show.certificates) out.certificates = db.filter('certificates', (c) => c.userId === user.id).map((c) => ({ title: c.title, phase: c.phase, issuedAt: c.createdAt }));
    if (show.categories) out.categories = (user.categories || []).map((c) => CATEGORIES[c].label);
    return [200, { profile: out }];
  });

  r.add('GET', '/api/surveys', () => [200, { surveys: db.filter('surveys', (s) => s.open) }]);
}

import { createHash } from 'node:crypto';
import {
  ACTION_TYPES, AREAS, CATEGORIES, DATA_CARD_ITEMS, DEFAULT_SETTINGS, PILOT_SCHOOLS, PROBLEM_TYPES, SOURCES, areaByName,
} from '../../public/js/config.js';
import { HttpError, KB, MB, readJson, sendFile } from '../http.js';
import {
  actionView, confirmLeader, createAction, hashToken, newCode, notify, openLeaderCall, publicName, rankApplications, settings,
} from '../logic.js';
import { bool, int, num, oneOf, text } from '../validate.js';
import { finishCleanup, payMember, teamCard } from './actions.js';
import { hotspotView, impactTotals } from './public.js';
import { verifyHotspot } from './reports.js';

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function register(r, { db, ai, auth, push }) {
  const staff = (req) => auth(req, ['municipality']);
  const get = (c, id, what) => {
    const x = db.byId(c, id);
    if (!x) throw new HttpError(404, `No such ${what}.`);
    return x;
  };

  r.add('GET', '/api/admin/overview', ({ req }) => {
    staff(req);
    const hotspots = db.filter('hotspots', (h) => h.status !== 'rejected');
    const youthReports = db.filter('hotspots', (h) => h.source === 'youth');
    const autoVerified = youthReports.filter((h) => h.status === 'ai_verified' || (h.status === 'cleaned' && h.aiCheck?.confidence >= settings(db).verify_high)).length;
    const impact = impactTotals(db);
    const bySource = Object.fromEntries(SOURCES.map((s) => [s, db.filter('users', (u) => u.src === s).length]));
    bySource.direct = db.filter('users', (u) => u.role === 'youth' && !u.src).length;
    return [200, {
      kpis: {
        activeHotspots: hotspots.filter((h) => h.status !== 'cleaned').length,
        newSitesByYouth: youthReports.filter((h) => h.status !== 'rejected').length,
        youthEngaged: impact.youthEngaged,
        actionsCompleted: impact.actions,
        aiVerifiedPct: youthReports.length ? Math.round((autoVerified / youthReports.length) * 100) : 0,
        kgCollected: impact.kgCollected,
      },
      byCategory: Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, hotspots.filter((h) => h.category === c).length])),
      bySource,
      hotspots: hotspots.map((h) => hotspotView(db, h)),
      ai: { enabled: ai.enabled, model: ai.model },
    }];
  });

  r.add('GET', '/api/admin/review', ({ req }) => {
    staff(req);
    const withName = (id) => publicName(db.byId('users', id));
    return [200, {
      reports: db.filter('hotspots', (h) => h.status === 'needs_confirmation').map((h) => ({ ...hotspotView(db, h), reporter: withName(h.reportedBy) })),
      cleanups: db.filter('actions', (a) => a.status === 'under_review').map((a) => ({ ...actionView(db, a), cleanup: a.cleanup })),
      dataCards: db.filter('dataCards', (c) => ['disputed', 'flagged'].includes(c.status)).map((c) => ({ ...c, name: withName(c.userId), actionTitle: db.byId('actions', c.actionId)?.title, photoUrl: `/api/photos/${c.photoId}` })),
    }];
  });

  r.add('POST', '/api/admin/hotspots/:id/decision', async ({ req, params }) => {
    staff(req);
    const h = get('hotspots', params.id, 'hotspot');
    const { approve } = await readJson(req);
    if (h.status !== 'needs_confirmation') throw new HttpError(409, 'This report was already decided.');
    let actionId = null;
    if (approve === true) actionId = verifyHotspot(db, h, 'verified', push).id;
    else {
      h.status = 'rejected';
      if (h.reportedBy) notify(db, [h.reportedBy], { type: 'report_rejected', title: 'Report not accepted', body: 'The municipality reviewed your report and could not confirm it.', link: '/report', important: true }, push);
    }
    await db.save();
    return [200, { hotspot: hotspotView(db, h), actionId }];
  });

  r.add('POST', '/api/admin/actions/:id/cleanup-decision', async ({ req, params }) => {
    staff(req);
    const a = get('actions', params.id, 'action');
    if (a.status !== 'under_review') throw new HttpError(409, 'This cleanup is not under review.');
    const { approve } = await readJson(req);
    if (approve === true) finishCleanup(db, a, true, push);
    else {
      a.status = 'in_progress';
      notify(db, [a.leaderId], { type: 'review', title: 'Cleanup not confirmed yet', body: 'The municipality asks for a clearer after photo.', link: `/action/${a.id}/manage`, important: true }, push);
    }
    await db.save();
    return [200, { action: actionView(db, a) }];
  });

  r.add('POST', '/api/admin/datacards/:id/decision', async ({ req, params }) => {
    staff(req);
    const c = get('dataCards', params.id, 'data card');
    const { approve } = await readJson(req);
    c.status = approve === true ? 'verified' : 'rejected';
    c.reviewedByMunicipality = true;
    if (c.status === 'verified') payMember(db, db.byId('actions', c.actionId), c.userId, push);
    await db.save();
    return [200, { card: c }];
  });

  // Leader confirmations (7.1)
  r.add('GET', '/api/admin/leaders', ({ req }) => {
    staff(req);
    const actions = db.filter('actions', (a) => a.status === 'leader_wanted').map((a) => ({
      ...actionView(db, a),
      applications: db.filter('leaderApplications', (x) => x.actionId === a.id)
        .sort((x, y) => (x.rank || 99) - (y.rank || 99))
        .map((x) => {
          const u = db.byId('users', x.userId);
          return { ...x, name: publicName(u), ageGroup: u?.ageGroup, area: u?.area };
        }),
    }));
    return [200, { actions }];
  });

  r.add('POST', '/api/admin/actions/:id/rank', async ({ req, params }) => {
    staff(req);
    const a = get('actions', params.id, 'action');
    const ranking = await rankApplications(db, ai, a);
    if (!ranking.length) throw new HttpError(409, 'No applications to rank yet.');
    await db.save();
    return [200, { ranking }];
  });

  r.add('POST', '/api/admin/actions/:id/confirm-leader', async ({ req, params }) => {
    staff(req);
    const a = get('actions', params.id, 'action');
    if (a.status !== 'leader_wanted') throw new HttpError(409, 'This action already has a leader.');
    const { applicationId } = await readJson(req);
    const leader = confirmLeader(db, a, applicationId, push);
    await db.save();
    return [200, { action: actionView(db, a), leaderApplication: leader }];
  });

  r.add('GET', '/api/admin/demand', ({ req }) => {
    staff(req);
    const groups = {};
    db.data.interestRequests.forEach((x) => {
      const k = `${x.area}|${x.category}`;
      groups[k] ||= { area: x.area, category: x.category, count: 0 };
      groups[k].count += 1;
    });
    return [200, { demand: Object.values(groups).sort((a, b) => b.count - a.count), threshold: settings(db).demand_threshold }];
  });

  r.add('POST', '/api/admin/hotspots', async ({ req }) => {
    const me = staff(req);
    const b = await readJson(req);
    const area = areaByName(b.areaName) || AREAS[0];
    const lat = Number.isFinite(Number(b.lat)) ? Number(b.lat) : area.lat;
    const lng = Number.isFinite(Number(b.lng)) ? Number(b.lng) : area.lng;
    const h = db.insert('hotspots', {
      title: text(b.title, 'Title', { min: 3, max: 100 }),
      description: text(b.description, 'Description', { max: 400, optional: true }),
      category: oneOf(b.category, 'Category', CATEGORIES),
      problemType: oneOf(b.problemType || 'other', 'Problem type', PROBLEM_TYPES),
      lat, lng, areaName: area.name, photoId: null, source: 'municipality', status: 'open',
      priority: oneOf(b.priority || 'medium', 'Priority', ['low', 'medium', 'high']), reportedBy: null, createdBy: me.id,
    });
    await db.save();
    return [201, { hotspot: hotspotView(db, h) }];
  });

  // Municipality creates an action: goes out as "Team leader wanted" (7.1)
  r.add('POST', '/api/admin/actions', async ({ req }) => {
    const me = staff(req);
    const b = await readJson(req);
    const hotspot = b.hotspotId ? get('hotspots', b.hotspotId, 'hotspot') : null;
    const area = areaByName(b.areaName) || (hotspot && areaByName(hotspot.areaName)) || AREAS[0];
    const action = createAction(db, {
      hotspotId: hotspot?.id || null,
      title: text(b.title, 'Title', { min: 3, max: 100 }),
      category: oneOf(b.category, 'Category', CATEGORIES),
      type: oneOf(b.type, 'Type', ACTION_TYPES),
      description: text(b.description, 'Description', { min: 10, max: 800 }),
      lat: hotspot?.lat ?? (Number.isFinite(Number(b.lat)) ? Number(b.lat) : area.lat),
      lng: hotspot?.lng ?? (Number.isFinite(Number(b.lng)) ? Number(b.lng) : area.lng),
      areaName: hotspot?.areaName || area.name,
      requiredVolunteers: int(b.requiredVolunteers ?? settings(db).required_volunteers, 'Required volunteers', 2, 100),
      durationHours: num(b.durationHours ?? 3, 'Duration', 0.5, 12),
      pointsReward: int(b.pointsReward ?? 50, 'Points', 0, 500),
      tools: Array.isArray(b.tools) ? b.tools.slice(0, 8).map((t) => text(t, 'Tool', { max: 40 })) : ['Gloves', 'Bags'],
      createdBy: me.id,
    });
    openLeaderCall(db, action, push);
    await db.save();
    return [201, { action: actionView(db, action) }];
  });

  // News: publish, approve partner proposals, AI summaries of PDFs
  r.add('GET', '/api/admin/news', ({ req }) => {
    staff(req);
    return [200, { news: db.data.news.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) }];
  });

  r.add('POST', '/api/admin/news', async ({ req }) => {
    staff(req);
    const b = await readJson(req, 16 * KB);
    const item = db.insert('news', {
      type: oneOf(b.type || 'info', 'Type', ['initiative', 'opportunity', 'info', 'ai_summary']),
      category: b.category ? oneOf(b.category, 'Category', CATEGORIES) : null,
      title: text(b.title, 'Title', { min: 3, max: 120 }),
      body: text(b.body, 'Text', { min: 3, max: 2000 }),
      cards: Array.isArray(b.cards) ? b.cards.slice(0, 5).map((c) => ({ title: text(c.title, 'Card title', { max: 80 }), body: text(c.body, 'Card text', { max: 300 }) })) : undefined,
      authorOrg: 'Municipality of Elbasan',
      approved: true,
      important: bool(b.important),
    });
    if (item.important) {
      notify(db, db.filter('users', (u) => u.role === 'youth').map((u) => u.id), { type: 'announcement', title: item.title, body: item.body.slice(0, 140), link: '/', important: true }, push);
    }
    await db.save();
    return [201, { news: item }];
  });

  r.add('POST', '/api/admin/news/:id/approve', async ({ req, params }) => {
    staff(req);
    const n = get('news', params.id, 'news item');
    const { approve } = await readJson(req);
    if (approve === true) n.approved = true;
    else db.remove('news', (x) => x.id === n.id);
    await db.save();
    return [200, { ok: true }];
  });

  r.add('POST', '/api/admin/news/summarize', async ({ req }) => {
    staff(req);
    const b = await readJson(req, 12 * MB);
    const m = typeof b.pdf === 'string' ? b.pdf.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/) : null;
    if (!m) throw new HttpError(400, 'Upload a PDF file.');
    const buffer = Buffer.from(m[1], 'base64');
    if (buffer.subarray(0, 4).toString('ascii') !== '%PDF') throw new HttpError(400, 'That file is not a PDF.');
    if (buffer.length > 10 * MB) throw new HttpError(413, 'The PDF is too large (10 MB max).');
    const cards = await ai.summarizeDocument({ pdfBase64: m[1], hash: createHash('sha256').update(buffer).digest('hex') });
    if (!cards) throw new HttpError(503, 'AI summaries need the AI to be switched on (ANTHROPIC_API_KEY).');
    return [200, { cards }];
  });

  r.add('GET', '/api/admin/pickups', ({ req }) => {
    staff(req);
    return [200, { pickups: db.data.pickups.map((p) => ({ ...p, actionTitle: db.byId('actions', p.actionId)?.title })) }];
  });

  r.add('POST', '/api/admin/pickups/:id/status', async ({ req, params }) => {
    staff(req);
    const p = get('pickups', params.id, 'pickup');
    const { status } = await readJson(req);
    p.status = oneOf(status, 'Status', ['requested', 'scheduled', 'collected']);
    await db.save();
    return [200, { pickup: p }];
  });

  // Local Plan 2025–2030 indicators
  r.add('GET', '/api/admin/indicators', ({ req }) => {
    staff(req);
    const all = db.filter('hotspots', (h) => h.status !== 'rejected');
    const cleaned = all.filter((h) => h.status === 'cleaned').length;
    const ratings = [];
    db.filter('surveys', (s) => s.satisfaction).forEach((s) => {
      const q = s.questions.find((x) => x.kind === 'rating');
      db.filter('surveyResponses', (x) => x.surveyId === s.id).forEach((x) => { if (x.answers[q.id]) ratings.push(x.answers[q.id]); });
    });
    return [200, {
      cleanliness: { cleaned, total: all.length, pct: all.length ? Math.round((cleaned / all.length) * 100) : 0 },
      satisfaction: { responses: ratings.length, average: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : null },
      quarterly: settings(db).quarterly_assessment,
    }];
  });

  r.add('GET', '/api/admin/schools', ({ req }) => {
    staff(req);
    const rows = PILOT_SCHOOLS.map((school) => {
      const users = db.filter('users', (u) => u.school === school);
      const seed = db.find('schoolPoints', (s) => s.school === school)?.points || 0;
      return { school, students: users.length, points: seed + users.reduce((s, u) => s + (u.seedPoints ? 0 : u.lifetimePoints), 0) };
    });
    return [200, { schools: rows.sort((a, b) => b.points - a.points) }];
  });

  // Surveys
  r.add('GET', '/api/admin/surveys', ({ req }) => {
    staff(req);
    return [200, {
      surveys: db.data.surveys.map((s) => {
        const responses = db.filter('surveyResponses', (x) => x.surveyId === s.id);
        const results = s.questions.map((q) => {
          const vals = responses.map((x) => x.answers[q.id]).filter((v) => v !== null && v !== '' && v !== undefined);
          if (q.kind === 'rating') return { id: q.id, average: vals.length ? Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10 : null, count: vals.length };
          if (q.kind === 'choice') return { id: q.id, counts: Object.fromEntries(q.options.map((o) => [o, vals.filter((v) => v === o).length])) };
          return { id: q.id, answers: vals.slice(-20) };
        });
        return { ...s, responses: responses.length, results };
      }),
    }];
  });

  r.add('POST', '/api/admin/surveys', async ({ req }) => {
    staff(req);
    const b = await readJson(req, 8 * KB);
    if (!Array.isArray(b.questions) || !b.questions.length || b.questions.length > 10) throw new HttpError(400, 'Add 1 to 10 questions.');
    const survey = db.insert('surveys', {
      title: text(b.title, 'Title', { min: 3, max: 120 }),
      satisfaction: bool(b.satisfaction),
      open: true,
      questions: b.questions.map((q, i) => {
        const kind = oneOf(q.kind, `Question ${i + 1} type`, ['rating', 'choice', 'text']);
        const options = kind === 'choice' ? (Array.isArray(q.options) ? q.options : []).map((o) => text(o, 'Option', { max: 60 })).slice(0, 6) : undefined;
        if (kind === 'choice' && (!options || options.length < 2)) throw new HttpError(400, `Question ${i + 1} needs at least 2 options.`);
        return { id: `q${i + 1}`, kind, text: text(q.text, `Question ${i + 1}`, { min: 3, max: 200 }), options };
      }),
    });
    await db.save();
    return [201, { survey }];
  });

  r.add('POST', '/api/admin/surveys/:id/close', async ({ req, params }) => {
    staff(req);
    get('surveys', params.id, 'survey').open = false;
    await db.save();
    return [200, { ok: true }];
  });

  // Rewards ("Green Fund")
  r.add('GET', '/api/admin/rewards', ({ req }) => {
    staff(req);
    return [200, {
      rewards: db.data.rewards.map((x) => ({ ...x, redeemed: db.filter('redemptions', (y) => y.rewardId === x.id).length })),
      redemptions: db.data.redemptions.slice(-50).reverse().map((x) => ({ ...x, name: publicName(db.byId('users', x.userId)) })),
      monthlyCap: settings(db).reward_monthly_cap,
    }];
  });

  r.add('POST', '/api/admin/rewards', async ({ req }) => {
    staff(req);
    const b = await readJson(req);
    const reward = db.insert('rewards', {
      title: text(b.title, 'Title', { min: 3, max: 80 }),
      description: text(b.description, 'Description', { max: 200, optional: true }),
      costPoints: int(b.costPoints, 'Cost', 10, 10000),
      enabled: bool(b.enabled),
    });
    await db.save();
    return [201, { reward }];
  });

  r.add('PATCH', '/api/admin/rewards/:id', async ({ req, params }) => {
    staff(req);
    const reward = get('rewards', params.id, 'reward');
    const b = await readJson(req);
    if (b.enabled !== undefined) reward.enabled = bool(b.enabled);
    if (b.costPoints !== undefined) reward.costPoints = int(b.costPoints, 'Cost', 10, 10000);
    await db.save();
    return [200, { reward }];
  });

  // CSV export of team data cards (REMEDIES / ICC-style columns)
  r.add('GET', '/api/admin/export/datacards.csv', ({ req, res }) => {
    staff(req);
    const header = ['date', 'action', 'category', 'area', 'lat', 'lng', 'participants', 'bags', 'kg_plastic', 'kg_non_plastic', 'kg_total', 'trees_planted', ...Object.values(DATA_CARD_ITEMS).map((v) => `count_${v.toLowerCase().replace(/\W+/g, '_')}`), 'items_of_local_concern'];
    const rows = db.filter('actions', (a) => a.status === 'done').map((a) => {
      const cards = db.filter('dataCards', (c) => c.actionId === a.id && c.status === 'verified');
      const t = teamCard(db, a);
      const itemCounts = Object.keys(DATA_CARD_ITEMS).map((k) => cards.filter((c) => c.items.includes(k)).length);
      return [(a.completedAt || '').slice(0, 10), a.title, CATEGORIES[a.category].label, a.areaName, a.lat, a.lng, t.participants, a.totalBags, a.kgPlastic, a.kgOther,
        Math.round(((a.kgPlastic || 0) + (a.kgOther || 0)) * 10) / 10, a.treesPlanted || 0, ...itemCounts, t.localConcerns.join('; ')];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    sendFile(res, `﻿${csv}`, 'text/csv; charset=utf-8', { filename: 'greenelb-team-data-cards.csv' });
    return null;
  });

  r.add('GET', '/api/admin/settings', ({ req }) => {
    staff(req);
    return [200, { settings: settings(db), defaults: DEFAULT_SETTINGS }];
  });

  r.add('PATCH', '/api/admin/settings', async ({ req }) => {
    staff(req);
    const b = await readJson(req);
    Object.entries(b).forEach(([k, v]) => {
      if (!(k in DEFAULT_SETTINGS)) return;
      if (typeof DEFAULT_SETTINGS[k] === 'number') db.data.settings[k] = num(v, k, 0, 100000);
      else db.data.settings[k] = text(v, k, { max: 200 });
    });
    if (db.data.settings.leader_min_age !== undefined) db.data.settings.leader_min_age = Math.max(16, Math.min(29, Math.round(db.data.settings.leader_min_age)));
    await db.save();
    return [200, { settings: settings(db) }];
  });

  r.add('POST', '/api/admin/partners', async ({ req }) => {
    staff(req);
    const { org } = await readJson(req);
    const code = newCode(10);
    const user = db.insert('users', { role: 'partner', nickname: text(org, 'Organisation', { min: 2, max: 60 }), org: org.trim(), categories: [], points: 0, lifetimePoints: 0, loginCodeHash: hashToken(code) });
    await db.save();
    return [201, { partner: { id: user.id, org: user.org }, code }];
  });

  // Partners propose news; hidden until the municipality approves.
  r.add('POST', '/api/partner/news', async ({ req }) => {
    const me = auth(req, ['partner']);
    const b = await readJson(req, 8 * KB);
    const item = db.insert('news', {
      type: oneOf(b.type || 'opportunity', 'Type', ['initiative', 'opportunity', 'info']),
      category: b.category ? oneOf(b.category, 'Category', CATEGORIES) : null,
      title: text(b.title, 'Title', { min: 3, max: 120 }),
      body: text(b.body, 'Text', { min: 3, max: 1500 }),
      authorOrg: me.org || me.nickname,
      approved: false,
      important: false,
    });
    notify(db, db.filter('users', (u) => u.role === 'municipality').map((u) => u.id), { type: 'partner_news', title: 'Partner proposal to review', body: item.title, link: '/admin#news' }, push);
    await db.save();
    return [201, { news: item }];
  });
}

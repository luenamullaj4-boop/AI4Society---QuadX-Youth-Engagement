import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AGE_GROUPS, AREAS, AVAILABLE_TIME, CATEGORIES, PHASES, PILOT_SCHOOLS, QUIZ, SETTING_PREFS, SOURCES, USER_TYPES,
  distanceM,
} from '../../public/js/config.js';
import { HttpError, KB, readJson, sameSecret } from '../http.js';
import {
  actionView, hashToken, newCode, newToken, notify, publicName, selfView, settings, trackEvent, userPoint,
} from '../logic.js';
import { bool, oneOf, someOf, text } from '../validate.js';

const DEFAULT_VISIBILITY = { points: true, actions: true, hours: true, certificates: true, type: true, categories: false };

export default function register(r, { db, ai, demo, auth, push, adminToken }) {
  async function issueSession(user) {
    const token = newToken();
    user.tokenHash = hashToken(token);
    await db.save();
    return token;
  }

  // Onboarding (section 6). Everything the user types here is the only personal data we keep.
  r.add('POST', '/api/auth/signup', async ({ req }) => {
    const b = await readJson(req, 8 * KB);
    const ageGroup = oneOf(b.ageGroup, 'Age group', AGE_GROUPS);
    const displayName = text(b.displayName, 'Display name', { max: 40, optional: true });
    const nickname = text(b.nickname, 'Nickname', { min: 2, max: 24 });
    const area = oneOf(b.area, 'Neighbourhood', AREAS.map((a) => a.name));
    const categories = someOf(b.categories, 'Categories', CATEGORIES);
    const schoolRaw = text(b.school, 'School', { max: 80, optional: true });
    const answers = {};
    QUIZ.forEach((q) => { answers[q.id] = oneOf(b.answers?.[q.id], `Answer to "${q.q}"`, q.options); });
    const minor = ageGroup === '16-17';
    const quiz = await ai.quizType(answers);
    const ref = typeof b.ref === 'string' ? db.find('users', (u) => u.referralCode === b.ref.toUpperCase()) : null;
    const loginCode = newCode(10);
    const user = db.insert('users', {
      role: 'youth',
      displayName,
      nickname,
      // 16–17: private profile and nickname by default (section 11).
      showRealName: minor ? false : bool(b.showRealName) && Boolean(displayName),
      isPrivate: minor ? true : bool(b.isPrivate),
      ageGroup,
      school: PILOT_SCHOOLS.includes(schoolRaw) ? schoolRaw : schoolRaw || null,
      area,
      categories,
      interestScores: Object.fromEntries(categories.map((c) => [c, 5])),
      settingPref: oneOf(b.settingPref, 'Preferred setting', SETTING_PREFS),
      availableTime: oneOf(b.availableTime, 'Available time', AVAILABLE_TIME),
      quizAnswers: answers,
      userType: quiz.user_type,
      userTypeLine: quiz.description,
      points: 0,
      lifetimePoints: 0,
      hours: 0,
      actionsCount: 0,
      referralCode: newCode(6),
      referredBy: ref?.id || null,
      src: SOURCES.includes(b.src) ? b.src : null,
      verifyCode: newCode(10),
      verifyVisibility: minor ? { ...DEFAULT_VISIBILITY, points: false, hours: false } : DEFAULT_VISIBILITY,
      loginCodeHash: hashToken(loginCode),
    });
    const token = await issueSession(user);
    return [201, { token, loginCode, user: selfView(db, user) }];
  });

  r.add('POST', '/api/auth/login', async ({ req }) => {
    const { code } = await readJson(req);
    const h = hashToken(String(code || '').trim().toUpperCase());
    const user = db.find('users', (u) => u.loginCodeHash === h);
    if (!user) throw new HttpError(401, 'That code does not match any account. Check it and try again.');
    return [200, { token: await issueSession(user), user: selfView(db, user) }];
  });

  // Municipality staff sign in with the ADMIN_TOKEN configured on the server.
  r.add('POST', '/api/auth/staff', async ({ req }) => {
    if (!adminToken) throw new HttpError(503, 'Staff sign-in is off. Set ADMIN_TOKEN on the server.');
    const { token } = await readJson(req);
    if (!token || !sameSecret(token, adminToken)) throw new HttpError(401, 'Staff token is wrong.');
    const user = db.find('users', (u) => u.role === 'municipality');
    return [200, { token: await issueSession(user), user: selfView(db, user) }];
  });

  r.add('POST', '/api/auth/partner', async ({ req }) => {
    const { code } = await readJson(req);
    const h = hashToken(String(code || '').trim().toUpperCase());
    const user = db.find('users', (u) => u.role === 'partner' && u.loginCodeHash === h);
    if (!user) throw new HttpError(401, 'That partner code is not valid.');
    return [200, { token: await issueSession(user), user: selfView(db, user) }];
  });

  // Demo accounts (made-up people), only when DEMO_MODE=true.
  r.add('POST', '/api/auth/demo', async ({ req }) => {
    if (!demo) throw new HttpError(404, 'Demo sign-in is off.');
    const { userId } = await readJson(req);
    const user = db.find('users', (u) => u.demo && u.id === userId);
    if (!user) throw new HttpError(404, 'No such demo account.');
    return [200, { token: await issueSession(user), user: selfView(db, user) }];
  });

  r.add('POST', '/api/auth/logout', async ({ req }) => {
    const user = auth(req);
    user.tokenHash = null;
    await db.save();
    return [200, { ok: true }];
  });

  r.add('GET', '/api/me', ({ req }) => {
    const user = auth(req);
    return [200, {
      user: selfView(db, user),
      unread: db.filter('notifications', (n) => n.userId === user.id && !n.read).length,
      achievements: db.filter('achievements', (a) => a.userId === user.id && !a.seen),
    }];
  });

  r.add('PATCH', '/api/me', async ({ req }) => {
    const user = auth(req);
    const b = await readJson(req);
    if (b.categories !== undefined) user.categories = someOf(b.categories, 'Categories', CATEGORIES);
    if (b.area !== undefined) user.area = oneOf(b.area, 'Neighbourhood', AREAS.map((a) => a.name));
    if (b.settingPref !== undefined) user.settingPref = oneOf(b.settingPref, 'Preferred setting', SETTING_PREFS);
    if (b.availableTime !== undefined) user.availableTime = oneOf(b.availableTime, 'Available time', AVAILABLE_TIME);
    if (b.nickname !== undefined) user.nickname = text(b.nickname, 'Nickname', { min: 2, max: 24 });
    if (b.displayName !== undefined) user.displayName = text(b.displayName, 'Display name', { max: 40, optional: true });
    if (b.showRealName !== undefined) user.showRealName = bool(b.showRealName) && Boolean(user.displayName);
    if (b.isPrivate !== undefined) user.isPrivate = bool(b.isPrivate);
    if (b.verifyVisibility && typeof b.verifyVisibility === 'object') {
      user.verifyVisibility = Object.fromEntries(Object.keys(DEFAULT_VISIBILITY).map((k) => [k, bool(b.verifyVisibility[k])]));
    }
    await db.save();
    return [200, { user: selfView(db, user) }];
  });

  // Download my data (section 11).
  r.add('GET', '/api/me/export', ({ req }) => {
    const user = auth(req);
    const mine = (c, key = 'userId') => db.filter(c, (x) => x[key] === user.id);
    const { tokenHash, loginCodeHash, ...profile } = user;
    return [200, {
      exportedAt: new Date().toISOString(),
      profile,
      signups: mine('signups'), attendance: mine('attendance'), dataCards: mine('dataCards'),
      reports: db.filter('hotspots', (h) => h.reportedBy === user.id), confirmations: mine('confirmations'),
      leaderApplications: mine('leaderApplications'), pointEvents: mine('pointEvents'), certificates: mine('certificates'),
      redemptions: mine('redemptions'), notifications: mine('notifications'), surveyResponses: mine('surveyResponses'),
      interestEvents: mine('interestEvents'), interestRequests: mine('interestRequests'),
    }];
  });

  // Delete my account: all personal rows and photos go.
  r.add('DELETE', '/api/me', async ({ req }) => {
    const user = auth(req);
    if (user.role !== 'youth') throw new HttpError(400, 'Staff and partner accounts are managed by the municipality.');
    const photoIds = db.filter('photos', (p) => p.ownerId === user.id).map((p) => p);
    await Promise.all(photoIds.map((p) => unlink(join(db.uploadsDir, `${p.id}.${p.ext}`)).catch(() => {})));
    db.remove('photos', (p) => p.ownerId === user.id);
    ['signups', 'attendance', 'dataCards', 'confirmations', 'leaderApplications', 'pointEvents', 'certificates', 'redemptions',
      'notifications', 'surveyResponses', 'interestEvents', 'interestRequests', 'achievements', 'pushSubscriptions', 'messages',
    ].forEach((c) => db.remove(c, (x) => x.userId === user.id));
    db.data.hotspots.forEach((h) => { if (h.reportedBy === user.id) { h.reportedBy = null; h.photoId = null; } });
    db.data.actions.forEach((a) => {
      if (a.leaderId === user.id) a.leaderId = a.deputyId || null;
      if (a.deputyId === user.id) a.deputyId = null;
      if (a.offeredTo === user.id) a.offeredTo = null;
    });
    db.remove('users', (u) => u.id === user.id);
    await db.save();
    return [200, { deleted: true }];
  });

  // Municipality Space: news (my categories first), AI recommendations, map counts, demand signal.
  r.add('GET', '/api/me/home', async ({ req }) => {
    const user = auth(req);
    const here = userPoint(user);
    const hotspots = db.filter('hotspots', (h) => h.status !== 'rejected');
    const near = here ? hotspots.filter((h) => distanceM(here, h) <= 3000).length : 0;
    const open = db.filter('actions', (a) => ['leader_wanted', 'leader_offered', 'collecting', 'confirmed'].includes(a.status));
    const candidates = open.map((a) => ({
      id: a.id, title: a.title, category: a.category, type: a.type, duration_hours: a.durationHours, status: a.status,
      distance_km: here ? Math.round(distanceM(here, a) / 100) / 10 : 5,
    }));
    const rec = candidates.length ? await ai.recommend({
      profile: {
        categories: user.categories, scores: user.interestScores || {}, user_type: user.userType,
        area: user.area, setting: user.settingPref, available_time: user.availableTime,
      },
      actions: candidates,
    }) : { picks: [], source: 'rules' };
    const recommended = rec.picks.map((p) => {
      const a = db.byId('actions', p.action_id);
      return a && { ...actionView(db, a), matchScore: p.match_score, reason: p.reason, reasonSource: rec.source };
    }).filter(Boolean);
    const news = db.filter('news', (n) => n.approved).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const mine = news.filter((n) => n.important || !n.category || user.categories.includes(n.category));
    const more = news.filter((n) => !mine.includes(n));
    const top = user.categories[0];
    const hasLocal = here && open.some((a) => a.category === top && distanceM(here, a) <= 5000);
    const asked = db.find('interestRequests', (x) => x.userId === user.id && x.category === top);
    await db.save();
    return [200, {
      counts: { hotspots: hotspots.length, near },
      recommended,
      news: mine,
      moreNews: more,
      demand: hasLocal ? null : { category: top, asked: Boolean(asked) },
      surveys: db.filter('surveys', (s) => s.open && !db.find('surveyResponses', (x) => x.surveyId === s.id && x.userId === user.id)),
    }];
  });

  r.add('POST', '/api/me/interest', async ({ req }) => {
    const user = auth(req);
    const { category } = await readJson(req);
    oneOf(category, 'Category', CATEGORIES);
    if (!db.find('interestRequests', (x) => x.userId === user.id && x.category === category)) {
      db.insert('interestRequests', { userId: user.id, area: user.area, category });
    }
    const count = db.filter('interestRequests', (x) => x.area === user.area && x.category === category).length;
    const s = settings(db);
    if (count >= s.demand_threshold && !db.find('demandAlerts', (d) => d.area === user.area && d.category === category)) {
      db.insert('demandAlerts', { area: user.area, category, count });
      notify(db, db.filter('users', (u) => u.role === 'municipality').map((u) => u.id), {
        type: 'demand', title: 'Demand signal', body: `${count} young people in ${user.area} want a ${CATEGORIES[category].label} activity.`, link: '/admin#demand', important: true,
      }, push);
    }
    await db.save();
    return [200, { ok: true, count }];
  });

  r.add('POST', '/api/events', async ({ req }) => {
    const user = auth(req);
    const { actionId, event } = await readJson(req);
    const action = db.byId('actions', actionId);
    if (action && ['opened', 'ignored'].includes(event)) {
      trackEvent(db, user.id, { actionId, category: action.category, event });
      await db.save();
    }
    return [200, { ok: true }];
  });

  r.add('GET', '/api/notifications', ({ req }) => {
    const user = auth(req);
    const list = db.filter('notifications', (n) => n.userId === user.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
    return [200, { notifications: list }];
  });

  r.add('POST', '/api/notifications/read', async ({ req }) => {
    const user = auth(req);
    const { ids } = await readJson(req);
    db.filter('notifications', (n) => n.userId === user.id && (!Array.isArray(ids) || ids.includes(n.id))).forEach((n) => { n.read = true; });
    await db.save();
    return [200, { ok: true }];
  });

  r.add('POST', '/api/push/subscribe', async ({ req }) => {
    const user = auth(req);
    const { subscription } = await readJson(req, 4 * KB);
    if (!subscription?.endpoint || !/^https:\/\//.test(subscription.endpoint)) throw new HttpError(400, 'Invalid push subscription.');
    db.remove('pushSubscriptions', (s) => s.subscription.endpoint === subscription.endpoint);
    db.insert('pushSubscriptions', { userId: user.id, subscription });
    await db.save();
    return [201, { ok: true }];
  });

  // Green Passport
  r.add('GET', '/api/me/passport', ({ req }) => {
    const user = auth(req);
    const cards = db.filter('dataCards', (c) => c.userId === user.id).map((c) => {
      const a = db.byId('actions', c.actionId);
      return { ...c, actionTitle: a?.title, category: a?.category };
    });
    const month = new Date().toISOString().slice(0, 7);
    return [200, {
      user: selfView(db, user),
      phases: PHASES,
      userType: USER_TYPES[user.userType] || null,
      dataCards: cards,
      history: db.filter('pointEvents', (e) => e.userId === user.id).slice(-30).reverse(),
      rewards: db.filter('rewards', (x) => x.enabled),
      redemptions: db.filter('redemptions', (x) => x.userId === user.id),
      redeemedThisMonth: db.filter('redemptions', (x) => x.userId === user.id && x.createdAt.startsWith(month)).length,
      monthlyCap: settings(db).reward_monthly_cap,
      publicName: publicName(user),
    }];
  });

  r.add('POST', '/api/rewards/:id/redeem', async ({ req, params }) => {
    const user = auth(req);
    const reward = db.byId('rewards', params.id);
    if (!reward?.enabled) throw new HttpError(404, 'This reward is not available.');
    const month = new Date().toISOString().slice(0, 7);
    const used = db.filter('redemptions', (x) => x.userId === user.id && x.createdAt.startsWith(month)).length;
    if (used >= settings(db).reward_monthly_cap) throw new HttpError(409, `You've reached this month's limit of ${settings(db).reward_monthly_cap} rewards.`);
    if (user.points < reward.costPoints) throw new HttpError(409, `You need ${reward.costPoints - user.points} more points for this reward.`);
    user.points -= reward.costPoints;
    db.insert('pointEvents', { userId: user.id, amount: -reward.costPoints, reason: `Redeemed: ${reward.title}`, refId: reward.id });
    const redemption = db.insert('redemptions', { rewardId: reward.id, userId: user.id, title: reward.title, voucherCode: newCode(8) });
    await db.save();
    return [201, { redemption, points: user.points }];
  });

  r.add('POST', '/api/achievements/:id/seen', async ({ req, params }) => {
    const user = auth(req);
    const a = db.find('achievements', (x) => x.id === params.id && x.userId === user.id);
    if (a) a.seen = true;
    await db.save();
    return [200, { ok: true }];
  });

  r.add('POST', '/api/surveys/:id/respond', async ({ req, params }) => {
    const user = auth(req);
    const survey = db.byId('surveys', params.id);
    if (!survey?.open) throw new HttpError(404, 'This survey is closed.');
    if (db.find('surveyResponses', (x) => x.surveyId === survey.id && x.userId === user.id)) throw new HttpError(409, 'You already answered this survey.');
    const { answers } = await readJson(req);
    const clean = {};
    survey.questions.forEach((q) => {
      const v = answers?.[q.id];
      if (q.kind === 'rating') clean[q.id] = Math.max(1, Math.min(5, Math.round(Number(v) || 0))) || null;
      else if (q.kind === 'choice') clean[q.id] = q.options.includes(v) ? v : null;
      else clean[q.id] = typeof v === 'string' ? v.slice(0, 300) : '';
    });
    db.insert('surveyResponses', { surveyId: survey.id, userId: user.id, area: user.area, answers: clean });
    await db.save();
    return [201, { ok: true }];
  });
}

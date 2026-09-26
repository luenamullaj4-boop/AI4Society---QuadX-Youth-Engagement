import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_CARD_ITEMS, POINTS, distanceM } from '../../public/js/config.js';
import { HttpError, KB, MB, readJson } from '../http.js';
import {
  actionView, addAchievement, ahashDistance, award, checkThreshold, iso, notify, openLeaderCall,
  photoUrl, publicName, qrToken, qrValid, settings, storePhoto, trackEvent, userPoint, audience,
} from '../logic.js';
import { bool, futureDate, int, num, point, someOf, text } from '../validate.js';
import { readPhoto } from './reports.js';

// Plastic types quiz (section 7.4). The answer key stays on the server.
export const PLASTIC_QUIZ = [
  { id: 'p1', q: 'A clear water bottle is usually which plastic?', options: ['PET (1)', 'PVC (3)', 'PS (6)'], answer: 'PET (1)' },
  { id: 'p2', q: 'Which of these should never go in a plastic recycling bag?', options: ['Clean bottle', 'Crushed can', 'Used syringe'], answer: 'Used syringe' },
  { id: 'p3', q: 'Foam food boxes are made of…', options: ['PS (6)', 'PP (5)', 'HDPE (2)'], answer: 'PS (6)' },
];

const ACTIVE = ['collecting', 'confirmed', 'in_progress'];

function members(db, action) {
  const ids = db.filter('signups', (s) => s.actionId === action.id && (!action.confirmedOptionId || s.optionId === action.confirmedOptionId)).map((s) => s.userId);
  return [...new Set([...ids, action.leaderId, action.deputyId].filter(Boolean))];
}

function topItems(cards) {
  const counts = {};
  cards.forEach((c) => (c.items || []).forEach((i) => { counts[i] = (counts[i] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => DATA_CARD_ITEMS[k] || k);
}

export function teamCard(db, action) {
  const cards = db.filter('dataCards', (c) => c.actionId === action.id && c.status === 'verified');
  return {
    participants: db.filter('attendance', (a) => a.actionId === action.id && a.checkinAt).length,
    kgPlastic: action.kgPlastic, kgOther: action.kgOther, totalBags: action.totalBags,
    topItems: topItems(cards),
    photos: cards.map((c) => photoUrl(c.photoId)).filter(Boolean).slice(0, 6),
    localConcerns: cards.map((c) => c.localConcern).filter(Boolean),
  };
}

// Pay a member once their data card is verified and the cleanup is verified.
export function payMember(db, action, userId, push) {
  if (action.status !== 'done') return;
  const card = db.find('dataCards', (c) => c.actionId === action.id && c.userId === userId);
  if (card?.status !== 'verified') return;
  const att = db.find('attendance', (a) => a.actionId === action.id && a.userId === userId);
  const minutes = att?.minutes || 0;
  const planned = action.durationHours * 60;
  const amount = minutes >= 0.75 * planned ? POINTS.attend : Math.round(POINTS.attend / 2);
  const paid = award(db, userId, amount, 'Attended an action', action.id, push);
  if (!paid) return;
  const user = db.byId('users', userId);
  user.hours = Math.round((user.hours + minutes / 60) * 10) / 10;
  user.actionsCount += 1;
  let total = amount;
  if (action.deputyId === userId && award(db, userId, POINTS.deputy, 'Deputy leader', action.id, push)) total += POINTS.deputy;
  addAchievement(db, userId, { title: `${action.title} completed`, points: total, actionId: action.id, kind: 'action' });
  notify(db, [userId], { type: 'points', title: `+${total} points`, body: `${action.title} is verified. Thank you!`, link: `/achievement/${action.id}`, important: true }, push);
  // Referral bonus: every 3 friends who attend through your link.
  if (user.referredBy) {
    const referrer = db.byId('users', user.referredBy);
    if (referrer) {
      const friends = db.filter('users', (u) => u.referredBy === referrer.id && u.actionsCount > 0).length;
      if (friends > 0 && friends % 3 === 0) award(db, referrer.id, POINTS.referral3, '3 friends attended', `referral-${friends}`, push);
    }
  }
}

export function finishCleanup(db, action, approved, push) {
  const hotspot = action.hotspotId ? db.byId('hotspots', action.hotspotId) : null;
  if (!approved) {
    action.status = 'under_review';
    return;
  }
  action.status = 'done';
  action.completedAt = iso();
  if (hotspot) hotspot.status = 'cleaned';
  if (action.leaderId && award(db, action.leaderId, POINTS.lead, 'Led an action', action.id, push)) {
    addAchievement(db, action.leaderId, { title: `You led ${action.title}`, points: POINTS.lead, actionId: action.id, kind: 'lead' });
  }
  members(db, action).forEach((id) => payMember(db, action, id, push));
}

export default function register(r, { db, ai, auth, optionalAuth, push, secret }) {
  const get = (id) => {
    const a = db.byId('actions', id);
    if (!a) throw new HttpError(404, 'No such action.');
    return a;
  };
  const requireLeader = (action, user) => {
    if (action.leaderId !== user.id) throw new HttpError(403, 'Only the team leader can do this.');
  };

  r.add('GET', '/api/actions/:id', async ({ req, params }) => {
    const action = get(params.id);
    const user = optionalAuth(req);
    const view = actionView(db, action, user);
    view.quiz = PLASTIC_QUIZ.map(({ answer, ...q }) => q);
    if (action.status === 'done' || action.status === 'under_review') view.team = teamCard(db, action);
    if (user?.role === 'youth') {
      trackEvent(db, user.id, { actionId: action.id, category: action.category, event: 'opened' });
      const here = userPoint(user);
      const fit = await ai.recommend({
        profile: { categories: user.categories, scores: {}, user_type: user.userType, area: user.area, setting: user.settingPref, available_time: user.availableTime },
        actions: [{ id: action.id, title: action.title, category: action.category, type: action.type, duration_hours: action.durationHours, distance_km: here ? Math.round(distanceM(here, action) / 100) / 10 : 5 }],
      });
      view.whyFits = fit.picks[0]?.reason || null;
      view.whyFitsSource = fit.source;
      await db.save();
    }
    const insider = user && (action.leaderId === user.id || action.deputyId === user.id || user.role === 'municipality');
    if (insider) {
      view.volunteers = db.filter('signups', (s) => s.actionId === action.id).map((s) => ({ userId: s.userId, optionId: s.optionId, name: publicName(db.byId('users', s.userId)) }));
      view.attendance = db.filter('attendance', (a) => a.actionId === action.id).map((a) => ({ ...a, name: publicName(db.byId('users', a.userId)) }));
      view.dataCards = db.filter('dataCards', (c) => c.actionId === action.id).map((c) => ({ ...c, name: publicName(db.byId('users', c.userId)), photoUrl: photoUrl(c.photoId) }));
    }
    return [200, { action: view }];
  });

  // Reporter's leader offer (7.2 step 5)
  r.add('POST', '/api/actions/:id/offer', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const action = get(params.id);
    if (action.status !== 'leader_offered' || action.offeredTo !== user.id) throw new HttpError(409, 'This offer is no longer open.');
    const { accept } = await readJson(req);
    if (accept === true) {
      action.leaderId = user.id;
      action.status = 'collecting';
      action.offeredTo = null;
    } else {
      openLeaderCall(db, action, push);
    }
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  r.add('POST', '/api/actions/:id/apply', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const action = get(params.id);
    if (action.status !== 'leader_wanted') throw new HttpError(409, 'This action is not looking for a leader.');
    if (action.applicationsCloseAt && Date.parse(action.applicationsCloseAt) < Date.now()) throw new HttpError(409, 'Applications for this action have closed.');
    if (db.find('leaderApplications', (a) => a.actionId === action.id && a.userId === user.id)) throw new HttpError(409, "You've already applied.");
    const b = await readJson(req);
    const motivation = await ai.privacyFilter(text(b.motivation, 'Motivation', { min: 20, max: 500 }));
    const optionIds = action.options.map((o) => o.id);
    const availableOptionIds = Array.isArray(b.availableOptionIds) ? b.availableOptionIds.filter((id) => optionIds.includes(id)) : [];
    const availableDates = Array.isArray(b.availableDates) ? b.availableDates.slice(0, 7).map((d, i) => futureDate(d, `Date ${i + 1}`)) : [];
    if (!availableOptionIds.length && !availableDates.length) throw new HttpError(400, 'Pick at least one date you are available.');
    const app = db.insert('leaderApplications', { actionId: action.id, userId: user.id, motivation, availableOptionIds, availableDates, status: 'pending', aiScore: null, aiReason: null, rank: null });
    trackEvent(db, user.id, { actionId: action.id, category: action.category, event: 'applied' });
    await db.save();
    return [201, { application: app }];
  });

  // Leader sets 2–3 date options and publishes the volunteer call (7.3)
  r.add('POST', '/api/actions/:id/options', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    if (action.status !== 'collecting') throw new HttpError(409, 'Dates can only be set while collecting volunteers.');
    const { dates } = await readJson(req);
    if (!Array.isArray(dates) || dates.length < 2 || dates.length > 3) throw new HttpError(400, 'Set 2 or 3 date options.');
    const clean = [...new Set(dates.map((d, i) => futureDate(d, `Date ${i + 1}`)))];
    if (clean.length < 2) throw new HttpError(400, 'The dates must be different.');
    const kept = action.options.filter((o) => clean.includes(o.startsAt));
    action.options = clean.map((startsAt) => kept.find((o) => o.startsAt === startsAt) || { id: db.id(), startsAt });
    db.remove('signups', (s) => s.actionId === action.id && !action.options.some((o) => o.id === s.optionId));
    if (!action.volunteerCallSent) {
      action.volunteerCallSent = true;
      db.insert('news', { type: 'volunteer_call', category: action.category, title: `Volunteers wanted: ${action.title}`, body: `${action.requiredVolunteers} volunteers needed. Pick a date that works for you.`, actionId: action.id, authorOrg: 'GreenELB', approved: true, important: false });
      notify(db, audience(db, { category: action.category, point: action, excludeIds: [user.id] }), { type: 'volunteers_wanted', title: 'Volunteers wanted', body: action.title, link: `/action/${action.id}` }, push);
    }
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  r.add('POST', '/api/actions/:id/join', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const action = get(params.id);
    if (!['collecting', 'confirmed'].includes(action.status)) throw new HttpError(409, 'This action is not taking volunteers right now.');
    if (action.leaderId === user.id) throw new HttpError(409, "You're leading this action.");
    const b = await readJson(req);
    const optionIds = someOf(b.optionIds, 'Dates', action.options.map((o) => o.id));
    if (action.status === 'confirmed' && !optionIds.includes(action.confirmedOptionId)) throw new HttpError(409, 'This action is confirmed for one date. Pick that date to join.');
    db.remove('signups', (s) => s.actionId === action.id && s.userId === user.id);
    optionIds.forEach((optionId) => db.insert('signups', { actionId: action.id, optionId, userId: user.id }));
    trackEvent(db, user.id, { actionId: action.id, category: action.category, event: 'joined' });
    checkThreshold(db, action, push);
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  r.add('DELETE', '/api/actions/:id/join', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const action = get(params.id);
    if (db.find('attendance', (a) => a.actionId === action.id && a.userId === user.id)) throw new HttpError(409, "You've already checked in.");
    db.remove('signups', (s) => s.actionId === action.id && s.userId === user.id);
    trackEvent(db, user.id, { actionId: action.id, category: action.category, event: 'ignored' });
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  r.add('POST', '/api/actions/:id/supervisor', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    const { name } = await readJson(req);
    action.supervisorName = text(name, 'Adult supervisor', { min: 3, max: 60 });
    checkThreshold(db, action, push);
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  // Leader withdraws: the deputy takes over automatically.
  r.add('POST', '/api/actions/:id/withdraw', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    if (!ACTIVE.includes(action.status)) throw new HttpError(409, 'You can no longer withdraw from this action.');
    if (action.deputyId) {
      action.leaderId = action.deputyId;
      action.deputyId = null;
      notify(db, [action.leaderId], { type: 'selected_leader', title: "You're now the team leader", body: `${action.title}: the leader withdrew and you take over.`, link: `/action/${action.id}/manage`, important: true }, push);
    } else {
      action.leaderId = null;
      openLeaderCall(db, action, push);
    }
    await db.save();
    return [200, { ok: true }];
  });

  r.add('GET', '/api/actions/:id/messages', ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    if (!members(db, action).includes(user.id) && user.role !== 'municipality' && !db.find('signups', (s) => s.actionId === action.id && s.userId === user.id)) {
      throw new HttpError(403, 'Join the action to see its messages.');
    }
    const list = db.filter('messages', (m) => m.actionId === action.id).map((m) => ({ ...m, name: publicName(db.byId('users', m.userId)), mine: m.userId === user.id }));
    return [200, { messages: list }];
  });

  r.add('POST', '/api/actions/:id/messages', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    const isMember = members(db, action).includes(user.id) || db.find('signups', (s) => s.actionId === action.id && s.userId === user.id);
    if (!isMember) throw new HttpError(403, 'Join the action to message the group.');
    const { body } = await readJson(req, 2 * KB);
    const msg = db.insert('messages', { actionId: action.id, userId: user.id, body: await ai.privacyFilter(text(body, 'Message', { max: 500 })) });
    if (action.leaderId === user.id) {
      notify(db, members(db, action).filter((id) => id !== user.id), { type: 'group_message', title: `Message from your team leader`, body: msg.body.slice(0, 120), link: `/action/${action.id}` }, push);
    }
    await db.save();
    return [201, { message: msg }];
  });

  r.add('POST', '/api/actions/:id/safety', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    const b = await readJson(req);
    action.safety = { gloves: bool(b.gloves), firstAid: bool(b.firstAid), briefing: bool(b.briefing), supervisor: bool(b.supervisor) };
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  r.add('POST', '/api/actions/:id/start', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    if (action.status !== 'confirmed') throw new HttpError(409, 'The action must be confirmed before it starts.');
    const leader = db.byId('users', action.leaderId);
    const needSupervisor = leader.ageGroup === '16-17';
    const s = action.safety;
    if (!s.gloves || !s.firstAid || !s.briefing || (needSupervisor && !s.supervisor)) throw new HttpError(409, 'Finish the safety checklist first.');
    action.status = 'in_progress';
    action.startedAt = iso();
    if (!db.find('attendance', (a) => a.actionId === action.id && a.userId === user.id)) {
      db.insert('attendance', { actionId: action.id, userId: user.id, checkinAt: iso(), checkoutAt: null, checkinLat: action.lat, checkinLng: action.lng, minutes: 0 });
    }
    await db.save();
    return [200, { action: actionView(db, action, user) }];
  });

  r.add('GET', '/api/actions/:id/qr', ({ req, params, url }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    if (action.status !== 'in_progress') throw new HttpError(409, 'Start the action to show the QR code.');
    const kind = url.searchParams.get('kind') === 'checkout' ? 'checkout' : 'checkin';
    const token = qrToken(secret, action.id, kind);
    return [200, { payload: `GREENELB:${kind}:${action.id}:${token}`, kind, refreshInSeconds: 60 - Math.floor((Date.now() / 1000) % 60) }];
  });

  r.add('POST', '/api/actions/:id/scan', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const action = get(params.id);
    const b = await readJson(req);
    const m = String(b.payload || '').match(/^GREENELB:(checkin|checkout):([\w-]+):([0-9a-f]{16})$/);
    if (!m || m[2] !== action.id) throw new HttpError(400, "That QR code isn't for this action.");
    const [, kind, , token] = m;
    if (!qrValid(secret, action.id, kind, token)) throw new HttpError(400, 'This QR code has expired. Ask the leader to show the current one.');
    if (action.status !== 'in_progress') throw new HttpError(409, 'The action is not running.');
    if (!members(db, action).includes(user.id)) throw new HttpError(403, "You're not signed up for this date.");
    const here = point(b);
    const radius = settings(db).checkin_radius_m;
    if (distanceM(here, action) > radius) throw new HttpError(400, `You need to be within ${radius} m of the action to ${kind === 'checkin' ? 'check in' : 'check out'}.`);
    let att = db.find('attendance', (a) => a.actionId === action.id && a.userId === user.id);
    if (kind === 'checkin') {
      if (!att) att = db.insert('attendance', { actionId: action.id, userId: user.id, checkinAt: iso(), checkoutAt: null, checkinLat: here.lat, checkinLng: here.lng, minutes: 0 });
    } else {
      if (!att) throw new HttpError(409, 'Check in first.');
      att.checkoutAt = iso();
      att.minutes = Math.round((Date.parse(att.checkoutAt) - Date.parse(att.checkinAt)) / 60000);
      notify(db, [user.id], { type: 'datacard', title: 'Fill your data card', body: 'It takes under a minute.', link: `/action/${action.id}/datacard`, important: true }, push);
    }
    await db.save();
    return [200, { attendance: att, kind }];
  });

  // Before / after / bags photos (leader). The AI privacy gate runs before storing.
  r.add('POST', '/api/actions/:id/photos', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    if (action.status !== 'in_progress') throw new HttpError(409, 'Photos can be added while the action is running.');
    const b = await readJson(req, 6 * MB);
    const kind = ['before', 'after', 'bags'].includes(b.kind) ? b.kind : null;
    if (!kind) throw new HttpError(400, 'Photo kind must be before, after or bags.');
    const photo = readPhoto(b.photo, 'Photo');
    const check = await ai.checkDatacard({ photo, category: action.category });
    if (check?.contains_personal_data) return [200, { status: 'retake', reason: 'Faces, plates or documents are visible. Retake the photo without them. It was not saved.' }];
    const stored = await storePhoto(db, photo, { ownerId: user.id, kind: `action-${kind}`, isPublic: true });
    action[`${kind}PhotoId`] = stored.id;
    await db.save();
    return [201, { action: actionView(db, action, user) }];
  });

  // Leader closes the action: totals, pickup request, AI cleanup verification.
  r.add('POST', '/api/actions/:id/finish', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    if (action.status !== 'in_progress') throw new HttpError(409, 'The action is not running.');
    if (!action.beforePhotoId || !action.afterPhotoId) throw new HttpError(409, 'Upload the before and after photos first.');
    const b = await readJson(req);
    action.totalBags = int(b.totalBags, 'Total bags', 0, 500);
    action.kgPlastic = num(b.kgPlastic, 'Plastic (kg)', 0, 5000);
    action.kgOther = num(b.kgOther, 'Non-plastic (kg)', 0, 5000);
    action.treesPlanted = int(b.treesPlanted ?? 0, 'Trees planted', 0, 1000);
    // Leader and anyone who didn't scan out are checked out now.
    db.filter('attendance', (a) => a.actionId === action.id && !a.checkoutAt).forEach((a) => {
      a.checkoutAt = iso();
      a.minutes = Math.round((Date.parse(a.checkoutAt) - Date.parse(a.checkinAt)) / 60000);
    });
    if (action.totalBags > 0) {
      db.insert('pickups', { actionId: action.id, lat: action.lat, lng: action.lng, areaName: action.areaName, bags: action.totalBags, kg: action.kgPlastic + action.kgOther, requestedAt: iso(), status: 'requested' });
    }
    const load = async (id) => {
      const p = db.byId('photos', id);
      if (!p) return null;
      const buffer = await readFile(join(db.uploadsDir, `${p.id}.${p.ext}`));
      return { base64: buffer.toString('base64'), mediaType: p.ext === 'jpg' ? 'image/jpeg' : `image/${p.ext}`, hash: p.hash };
    };
    const check = await ai.verifyCleanup({ before: await load(action.beforePhotoId), after: await load(action.afterPhotoId), bags: await load(action.bagsPhotoId), category: action.category });
    action.cleanup = check;
    const approved = Boolean(check?.is_clean && check.confidence >= settings(db).cleanup_confidence);
    finishCleanup(db, action, approved, push);
    if (!approved) {
      notify(db, db.filter('users', (u) => u.role === 'municipality').map((u) => u.id), { type: 'review', title: 'Cleanup needs review', body: action.title, link: '/admin#review', important: true }, push);
    }
    await db.save();
    return [200, { action: actionView(db, action, user), verified: approved, check }];
  });

  r.add('POST', '/api/actions/:id/quiz', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const action = get(params.id);
    if (!members(db, action).includes(user.id)) throw new HttpError(403, 'Join the action to take the quiz.');
    const { answers } = await readJson(req);
    const correct = PLASTIC_QUIZ.filter((q) => answers?.[q.id] === q.answer).length;
    const paid = award(db, user.id, POINTS.quiz, 'Pre-action quiz', action.id, push);
    await db.save();
    return [200, { correct, total: PLASTIC_QUIZ.length, points: paid ? POINTS.quiz : 0, key: Object.fromEntries(PLASTIC_QUIZ.map((q) => [q.id, q.answer])) }];
  });

  // Personal data card (7.5)
  r.add('POST', '/api/actions/:id/datacard', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    const att = db.find('attendance', (a) => a.actionId === action.id && a.userId === user.id && a.checkinAt);
    if (!att) throw new HttpError(409, 'Check in at the action first.');
    if (db.find('dataCards', (c) => c.actionId === action.id && c.userId === user.id)) throw new HttpError(409, 'You already filled your data card.');
    const b = await readJson(req, 6 * MB);
    const photo = readPhoto(b.photo, 'Photo');
    const bags = int(b.bags, 'Bags filled', 0, 50);
    const items = someOf(b.items || [], 'Items', DATA_CARD_ITEMS, { min: 0, max: 8 });
    const localConcern = await ai.privacyFilter(text(b.localConcern, 'Item of local concern', { max: 120, optional: true }));
    // Place, time and duplicates are checked in code; the AI only looks at the photo.
    const sameSite = (photo.lat !== null && distanceM(photo, action) <= settings(db).checkin_radius_m + 100);
    const sameTime = (photo.takenAt && photo.takenAt >= Date.parse(att.checkinAt) - 30 * 60000);
    const teammates = db.filter('dataCards', (c) => c.actionId === action.id).map((c) => db.byId('photos', c.photoId)).filter(Boolean);
    const duplicate = teammates.some((p) => p.hash === photo.hash || ahashDistance(p.ahash, photo.ahash) <= 5);
    const check = await ai.checkDatacard({ photo, category: action.category });
    if (check?.contains_personal_data) return [200, { status: 'retake', reason: 'Faces, plates or documents are visible. Retake the photo without them. It was not saved.' }];
    const stored = await storePhoto(db, photo, { ownerId: user.id, kind: 'datacard' });
    const flagged = !sameSite || !sameTime || duplicate || (check && !check.valid);
    const card = db.insert('dataCards', {
      actionId: action.id, userId: user.id, bags, photoId: stored.id, items, localConcern,
      auto: { category: action.category, role: action.leaderId === user.id ? 'leader' : action.deputyId === user.id ? 'deputy' : 'volunteer', checkinAt: att.checkinAt, checkoutAt: att.checkoutAt, minutes: att.minutes, areaName: action.areaName },
      aiCheck: { ...(check || {}), same_site: Boolean(sameSite), same_time: Boolean(sameTime), duplicate },
      estWeightKg: check?.est_kg ?? null,
      leaderConfirmed: null,
      status: flagged ? 'flagged' : 'awaiting_leader',
    });
    if (action.leaderId && action.leaderId !== user.id) {
      notify(db, [action.leaderId], { type: 'confirm_card', title: 'Confirm a data card', body: `${publicName(user)} filled their card for ${action.title}.`, link: `/action/${action.id}/manage` }, push);
    }
    if (action.leaderId === user.id && !flagged) {
      card.leaderConfirmed = true;
      card.status = 'verified';
      payMember(db, action, user.id, push);
    }
    await db.save();
    return [201, { card }];
  });

  r.add('POST', '/api/actions/:id/datacards/:cardId/confirm', async ({ req, params }) => {
    const user = auth(req);
    const action = get(params.id);
    requireLeader(action, user);
    const card = db.find('dataCards', (c) => c.id === params.cardId && c.actionId === action.id);
    if (!card) throw new HttpError(404, 'No such data card.');
    const { agree } = await readJson(req);
    card.leaderConfirmed = agree === true;
    if (!card.leaderConfirmed) card.status = 'disputed';
    else if (card.status !== 'flagged') card.status = 'verified';
    if (card.status === 'verified') {
      const est = card.estWeightKg;
      const items = topItems([card]);
      card.impact = est ? `You collected ~${est} kg${items.length ? `, mostly ${items[0].toLowerCase()}` : ''}.` : `You filled ${card.bags} bag${card.bags === 1 ? '' : 's'}.`;
      payMember(db, action, card.userId, push);
    }
    if (card.status === 'disputed' || card.status === 'flagged') {
      notify(db, db.filter('users', (u) => u.role === 'municipality').map((u) => u.id), { type: 'review', title: 'Data card needs review', body: action.title, link: '/admin#review' }, push);
    }
    await db.save();
    return [200, { card }];
  });

  r.add('GET', '/api/me/actions', ({ req }) => {
    const user = auth(req);
    const mine = db.filter('actions', (a) => a.leaderId === user.id || a.deputyId === user.id || a.offeredTo === user.id
      || db.find('signups', (s) => s.actionId === a.id && s.userId === user.id)
      || db.find('leaderApplications', (x) => x.actionId === a.id && x.userId === user.id));
    return [200, { actions: mine.map((a) => actionView(db, a, user)) }];
  });

}

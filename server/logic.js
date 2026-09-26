// Server-side rules: settings, photos, points and phases, notifications,
// and the action state machine. Nothing here can be triggered from the
// browser except through the validated routes.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATEGORIES, DEFAULT_SETTINGS, PHASES, POINTS, areaByName, distanceM } from '../public/js/config.js';
import { HttpError, MB } from './http.js';

export const H = 3600 * 1000;
export const now = () => Date.now();
export const iso = (t = now()) => new Date(t).toISOString();

export function settings(db) {
  return { ...DEFAULT_SETTINGS, ...db.data.settings };
}

export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
export const newToken = () => randomBytes(24).toString('hex');
export const newCode = (n = 8) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n).toUpperCase();

// ---------- people ----------

export function publicName(user) {
  if (!user) return 'Someone';
  return user.showRealName && user.displayName ? user.displayName : (user.nickname || 'Volunteer');
}

export function userPoint(user) {
  const a = areaByName(user?.area);
  return a ? { lat: a.lat, lng: a.lng } : null;
}

// Private fields never leave the server.
export function selfView(db, user) {
  const { tokenHash, loginCodeHash, ...rest } = user;
  const led = db.filter('actions', (a) => a.leaderId === user.id && a.status === 'done').length;
  return { ...rest, actionsLed: led + (user.seedLed || 0), certificates: db.filter('certificates', (c) => c.userId === user.id) };
}

// ---------- photos (in-app camera only; stored only after the AI privacy check) ----------

const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAGIC = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  webp: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};
export const MAX_PHOTO = 4 * MB;

export function parsePhoto(p, field = 'Photo') {
  if (!p || typeof p !== 'object') throw new HttpError(400, `${field} is required. Take it with the in-app camera.`);
  const m = typeof p.dataUrl === 'string' ? p.dataUrl.match(IMAGE) : null;
  if (!m) throw new HttpError(400, `${field} must be a JPEG, PNG or WebP image from the in-app camera.`);
  const [, type, base64] = m;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_PHOTO) throw new HttpError(413, `${field} is too large.`);
  if (!MAGIC[type](buffer)) throw new HttpError(400, `${field} is not a valid image.`);
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const takenAt = Date.parse(p.takenAt);
  return {
    buffer,
    base64,
    mediaType: `image/${type}`,
    ext: type === 'jpeg' ? 'jpg' : type,
    hash: createHash('sha256').update(buffer).digest('hex'),
    ahash: typeof p.ahash === 'string' && /^[0-9a-f]{16}$/.test(p.ahash) ? p.ahash : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    takenAt: Number.isFinite(takenAt) ? takenAt : null,
    fromCamera: p.source === 'camera',
  };
}

export async function storePhoto(db, photo, { ownerId, kind, isPublic = false }) {
  const record = db.insert('photos', {
    ownerId, kind, isPublic, ext: photo.ext, hash: photo.hash, ahash: photo.ahash, lat: photo.lat, lng: photo.lng, takenAt: photo.takenAt ? iso(photo.takenAt) : null,
  });
  await writeFile(join(db.uploadsDir, `${record.id}.${photo.ext}`), photo.buffer);
  return record;
}

export const photoUrl = (id) => (id ? `/api/photos/${id}` : null);

// Hamming distance between two 64-bit average hashes (hex strings).
export function ahashDistance(a, b) {
  if (!a || !b) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// ---------- notifications ----------

function sentToday(db, userId) {
  const since = now() - 24 * H;
  return db.filter('notifications', (n) => n.userId === userId && !n.important && Date.parse(n.createdAt) > since).length;
}

export function notify(db, userIds, { type, title, body, link = null, important = false }, push = null) {
  const cap = settings(db).notification_daily_cap;
  const delivered = [];
  [...new Set(userIds)].filter(Boolean).forEach((userId) => {
    if (!important && sentToday(db, userId) >= cap) return;
    delivered.push(db.insert('notifications', { userId, type, title, body, link, important, read: false }));
  });
  if (push && delivered.length) push(delivered).catch(() => {});
  return delivered;
}

// Youth users interested in a category near a point (category + area targeting).
export function audience(db, { category, point, excludeIds = [] }) {
  const radius = settings(db).notification_radius_km * 1000;
  return db.filter('users', (u) => u.role === 'youth' && !excludeIds.includes(u.id)
    && (!category || u.categories?.includes(category))
    && (!point || !userPoint(u) || distanceM(userPoint(u), point) <= radius)).map((u) => u.id);
}

export function trackEvent(db, userId, { actionId = null, category, event }) {
  if (!userId || !category) return;
  db.insert('interestEvents', { userId, actionId, category, event });
  const user = db.byId('users', userId);
  if (!user) return;
  const delta = { opened: 1, joined: 3, applied: 3, ignored: -1, reported: 2 }[event] || 0;
  user.interestScores ||= {};
  user.interestScores[category] = Math.max(0, (user.interestScores[category] || 0) + delta);
}

// ---------- points, phases, certificates ----------

// Idempotent: the same (user, reason, refId) never pays twice.
export function award(db, userId, amount, reason, refId, push) {
  const user = db.byId('users', userId);
  if (!user || !amount) return null;
  if (db.find('pointEvents', (e) => e.userId === userId && e.reason === reason && e.refId === refId)) return null;
  const event = db.insert('pointEvents', { userId, amount, reason, refId });
  user.points += amount;
  if (amount > 0) user.lifetimePoints += amount;
  checkPhases(db, user, push);
  return event;
}

export function checkPhases(db, user, push) {
  const led = db.filter('actions', (a) => a.leaderId === user.id && a.status === 'done').length + (user.seedLed || 0);
  PHASES.forEach((p) => {
    if (user.lifetimePoints < p.points || (p.needsLead && led < 1)) return;
    if (db.find('certificates', (c) => c.userId === user.id && c.kind === p.key)) return;
    db.insert('certificates', { userId: user.id, kind: p.key, title: p.title, phase: p.phase, verifyCode: newCode(10) });
    notify(db, [user.id], { type: 'certificate', title: `${p.title} unlocked`, body: `${p.phase}. ${p.perk || 'Your certificate is in your Green Passport.'}`, link: '/profile', important: true }, push);
  });
}

export function addAchievement(db, userId, { title, points, actionId = null, kind = 'points' }) {
  return db.insert('achievements', { userId, title, points, actionId, kind, seen: false });
}

// ---------- actions ----------

export function actionView(db, action, viewer = null) {
  const options = action.options.map((o) => ({
    ...o,
    count: db.filter('signups', (s) => s.actionId === action.id && s.optionId === o.id).length,
  }));
  const volunteers = [...new Set(db.filter('signups', (s) => s.actionId === action.id).map((s) => s.userId))];
  const leader = db.byId('users', action.leaderId);
  const deputy = db.byId('users', action.deputyId);
  const hotspot = action.hotspotId ? db.byId('hotspots', action.hotspotId) : null;
  const view = {
    ...action,
    options,
    volunteerCount: volunteers.length,
    leaderName: leader ? publicName(leader) : null,
    deputyName: deputy ? publicName(deputy) : null,
    photoUrl: photoUrl(action.photoId || hotspot?.photoId),
    beforeUrl: photoUrl(action.beforePhotoId),
    afterUrl: photoUrl(action.afterPhotoId),
    bagsUrl: photoUrl(action.bagsPhotoId),
    hotspotStatus: hotspot?.status || null,
    applicationCount: db.filter('leaderApplications', (a) => a.actionId === action.id).length,
  };
  if (viewer) {
    view.me = {
      isLeader: action.leaderId === viewer.id,
      isDeputy: action.deputyId === viewer.id,
      optionIds: db.filter('signups', (s) => s.actionId === action.id && s.userId === viewer.id).map((s) => s.optionId),
      applied: Boolean(db.find('leaderApplications', (a) => a.actionId === action.id && a.userId === viewer.id)),
      offered: action.status === 'leader_offered' && action.offeredTo === viewer.id,
      attendance: db.find('attendance', (a) => a.actionId === action.id && a.userId === viewer.id),
      dataCard: db.find('dataCards', (c) => c.actionId === action.id && c.userId === viewer.id),
      quizDone: Boolean(db.find('pointEvents', (e) => e.userId === viewer.id && e.reason === 'Pre-action quiz' && e.refId === action.id)),
    };
  }
  return view;
}

export function createAction(db, fields) {
  const s = settings(db);
  return db.insert('actions', {
    hotspotId: null,
    type: 'cleanup',
    requiredVolunteers: s.required_volunteers,
    durationHours: 3,
    pointsReward: POINTS.attend,
    status: 'leader_wanted',
    leaderId: null,
    deputyId: null,
    offeredTo: null,
    offerExpiresAt: null,
    applicationsCloseAt: null,
    rankedAt: null,
    autoConfirmAt: null,
    supervisorName: '',
    confirmedOptionId: null,
    options: [],
    safety: { gloves: false, firstAid: false, briefing: false, supervisor: false },
    beforePhotoId: null,
    afterPhotoId: null,
    bagsPhotoId: null,
    totalBags: null,
    kgPlastic: null,
    kgOther: null,
    cleanup: null,
    ...fields,
  });
}

export function openLeaderCall(db, action, push) {
  const s = settings(db);
  action.status = 'leader_wanted';
  action.offeredTo = null;
  action.offerExpiresAt = null;
  action.applicationsCloseAt = iso(now() + s.application_window_h * H);
  const point = { lat: action.lat, lng: action.lng };
  db.insert('news', { type: 'leader_call', category: action.category, title: `Team leader wanted: ${action.title}`, body: `Apply within ${s.application_window_h} hours with a short motivation.`, actionId: action.id, authorOrg: 'GreenELB', approved: true, important: false });
  notify(db, audience(db, { category: action.category, point }), {
    type: 'leader_wanted', title: 'Team leader wanted', body: action.title, link: `/action/${action.id}`,
  }, push);
}

export function offerToReporter(db, action, reporterId, push) {
  const s = settings(db);
  action.status = 'leader_offered';
  action.offeredTo = reporterId;
  action.offerExpiresAt = iso(now() + s.reporter_offer_h * H);
  notify(db, [reporterId], {
    type: 'leader_offer', title: 'Your report was verified!', body: 'Do you want to lead this action?', link: `/action/${action.id}`, important: true,
  }, push);
}

export async function rankApplications(db, ai, action) {
  const apps = db.filter('leaderApplications', (a) => a.actionId === action.id && a.status === 'pending');
  if (!apps.length) return [];
  const optionIds = action.options.map((o) => o.id);
  const applicants = apps.map((app) => {
    const u = db.byId('users', app.userId);
    const signed = db.filter('signups', (s) => s.userId === u.id).length + (u.seedSignedUp || 0);
    const attended = db.filter('attendance', (a) => a.userId === u.id && a.checkoutAt).length + (u.seedAttended || 0);
    const point = userPoint(u);
    return {
      applicant_id: app.id,
      motivation: app.motivation,
      signed_up: signed,
      attended,
      actions_led: db.filter('actions', (a) => a.leaderId === u.id && a.status === 'done').length + (u.seedLed || 0),
      available_dates_matching: optionIds.length ? app.availableOptionIds.filter((id) => optionIds.includes(id)).length : app.availableDates.length,
      available_dates_total: optionIds.length || app.availableDates.length,
      distance_km: point ? Math.round(distanceM(point, { lat: action.lat, lng: action.lng }) / 100) / 10 : null,
      age_group: u.ageGroup,
    };
  });
  const { ranking, source } = await ai.rankLeaders({
    action: { category: action.category, type: action.type, duration_hours: action.durationHours },
    applicants,
  });
  ranking.forEach((r, i) => {
    const app = apps.find((a) => a.id === r.applicant_id);
    Object.assign(app, { aiScore: r.score, aiReason: r.reason, rank: i + 1, aiSource: source });
  });
  action.rankedAt = iso();
  action.autoConfirmAt = iso(now() + settings(db).auto_confirm_h * H);
  return ranking;
}

export function confirmLeader(db, action, appId, push) {
  const apps = db.filter('leaderApplications', (a) => a.actionId === action.id).sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const chosen = apps.find((a) => a.id === appId) || apps[0];
  if (!chosen) throw new HttpError(409, 'There are no applications to confirm.');
  const deputy = apps.find((a) => a.id !== chosen.id);
  action.leaderId = chosen.userId;
  action.deputyId = deputy?.userId || null;
  action.status = 'collecting';
  apps.forEach((a) => {
    a.status = a.id === chosen.id ? 'selected' : a.id === deputy?.id ? 'deputy' : 'not_selected';
  });
  notify(db, [chosen.userId], { type: 'selected_leader', title: 'You were selected as team leader', body: `${action.title}. Set 2–3 date options to recruit volunteers.`, link: `/action/${action.id}/manage`, important: true }, push);
  if (deputy) notify(db, [deputy.userId], { type: 'selected_deputy', title: 'You are the deputy leader', body: `${action.title}. You take over if the leader withdraws.`, link: `/action/${action.id}`, important: true }, push);
  const others = apps.filter((a) => a.status === 'not_selected').map((a) => a.userId);
  notify(db, others, { type: 'leader_decision', title: 'Thanks for applying to lead', body: `Another applicant was a closer fit for ${action.title} this time. Join as a volunteer and you'll build your record for the next one.`, link: `/action/${action.id}`, important: true }, push);
  return chosen;
}

export function checkThreshold(db, action, push) {
  if (action.status !== 'collecting') return;
  const needed = action.requiredVolunteers;
  const option = action.options.find((o) => db.filter('signups', (s) => s.actionId === action.id && s.optionId === o.id).length >= needed);
  if (!option) return;
  const s = settings(db);
  const leader = db.byId('users', action.leaderId);
  if (leader?.ageGroup === '16-17' && s.leader_min_age > 16 && !action.supervisorName) {
    action.waitingForSupervisor = true;
    notify(db, [leader.id], { type: 'supervisor_needed', title: 'Add an adult supervisor', body: 'The volunteer threshold is reached. Add the adult supervisor to confirm the date.', link: `/action/${action.id}/manage`, important: true }, push);
    return;
  }
  action.waitingForSupervisor = false;
  action.status = 'confirmed';
  action.confirmedOptionId = option.id;
  const members = db.filter('signups', (x) => x.actionId === action.id && x.optionId === option.id).map((x) => x.userId);
  notify(db, [...members, action.leaderId, action.deputyId], {
    type: 'action_confirmed', title: 'Action confirmed', body: `${action.title} is on for ${new Date(option.startsAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`, link: `/action/${action.id}`, important: true,
  }, push);
}

// Rotating QR codes for check-in/out: valid for the current and previous 60-second window.
export function qrToken(secret, actionId, kind, t = now()) {
  const win = Math.floor(t / 60000);
  return createHmac('sha256', secret).update(`${actionId}:${kind}:${win}`).digest('hex').slice(0, 16);
}

export function qrValid(secret, actionId, kind, token, t = now()) {
  return [0, 1].some((back) => qrToken(secret, actionId, kind, t - back * 60000) === token);
}

// ---------- scheduled transitions ----------

export async function tick(db, ai, push, t = now()) {
  let changed = false;
  for (const action of db.data.actions) {
    if (action.status === 'leader_offered' && Date.parse(action.offerExpiresAt) <= t) {
      openLeaderCall(db, action, push);
      changed = true;
    } else if (action.status === 'leader_wanted' && action.applicationsCloseAt && Date.parse(action.applicationsCloseAt) <= t && !action.rankedAt) {
      if (db.filter('leaderApplications', (a) => a.actionId === action.id).length) {
        await rankApplications(db, ai, action);
        notify(db, db.filter('users', (u) => u.role === 'municipality').map((u) => u.id), { type: 'leader_ranked', title: 'Leader applicants ranked', body: action.title, link: '/admin#leaders', important: true }, push);
        changed = true;
      }
    } else if (action.status === 'leader_wanted' && action.rankedAt && Date.parse(action.autoConfirmAt) <= t) {
      const top = db.filter('leaderApplications', (a) => a.actionId === action.id).sort((a, b) => a.rank - b.rank)[0];
      if (top) {
        confirmLeader(db, action, top.id, push);
        action.autoConfirmed = true;
        changed = true;
      }
    } else if (action.status === 'confirmed' && !action.reminderSent) {
      const opt = action.options.find((o) => o.id === action.confirmedOptionId);
      const start = Date.parse(opt?.startsAt);
      if (start - t <= 24 * H && start > t) {
        const members = db.filter('signups', (x) => x.actionId === action.id && x.optionId === opt.id).map((x) => x.userId);
        notify(db, [...members, action.leaderId], { type: 'reminder', title: 'Tomorrow: your action', body: `${action.title}. Bring what's on the list and meet on time.`, link: `/action/${action.id}`, important: true }, push);
        action.reminderSent = true;
        changed = true;
      }
    }
  }
  if (changed) await db.save();
  return changed;
}

export function categoryLabel(c) {
  return CATEGORIES[c]?.label || c;
}

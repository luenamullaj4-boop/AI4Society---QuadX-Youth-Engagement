import { AREAS, CATEGORIES, POINTS, PROBLEM_TYPES, distanceM } from '../../public/js/config.js';
import { HttpError, MB, readJson } from '../http.js';
import {
  addAchievement, award, createAction, offerToReporter, parsePhoto, settings, storePhoto, trackEvent,
} from '../logic.js';
import { oneOf, text } from '../validate.js';
import { hotspotView } from './public.js';

const nearestArea = (p) => AREAS.reduce((best, a) => (distanceM(p, a) < distanceM(p, best) ? a : best), AREAS[0]).name;

// Photos must come from the in-app camera with GPS and a fresh timestamp.
export function requireCameraPhoto(photo) {
  if (!photo.fromCamera) throw new HttpError(400, 'Take the photo with the in-app camera. Gallery uploads are not accepted.');
  if (photo.lat === null || photo.lng === null) throw new HttpError(400, 'Location is missing. Allow location access and take the photo again.');
  if (!photo.takenAt || Math.abs(Date.now() - photo.takenAt) > 15 * 60 * 1000) throw new HttpError(400, 'This photo is too old. Take a new one with the in-app camera.');
}

export function readPhoto(p, field) {
  const photo = parsePhoto(p, field);
  requireCameraPhoto(photo);
  return photo;
}

// A hotspot is verified (by AI, peers or the municipality): pay the reporter,
// create the action and offer them the leader role first.
export function verifyHotspot(db, hotspot, status, push) {
  hotspot.status = status;
  hotspot.verifiedAt = new Date().toISOString();
  if (hotspot.reportedBy) {
    award(db, hotspot.reportedBy, POINTS.reportVerified, 'Report verified', hotspot.id, push);
    addAchievement(db, hotspot.reportedBy, { title: 'Report verified', points: POINTS.reportVerified, kind: 'report' });
  }
  const check = hotspot.aiCheck || {};
  const action = createAction(db, {
    hotspotId: hotspot.id,
    title: `${hotspot.title}`,
    category: hotspot.category,
    type: hotspot.category === 'planting' ? 'planting' : 'cleanup',
    description: hotspot.description,
    lat: hotspot.lat,
    lng: hotspot.lng,
    areaName: hotspot.areaName,
    requiredVolunteers: Math.max(3, Math.min(40, check.suggested_volunteers || settings(db).required_volunteers)),
    tools: check.suggested_tools || ['Gloves', 'Bags'],
    durationHours: check.size === 'large' ? 4 : check.size === 'small' ? 1.5 : 3,
    createdBy: 'report',
  });
  if (hotspot.reportedBy) offerToReporter(db, action, hotspot.reportedBy, push);
  else action.status = 'leader_wanted';
  return action;
}

export default function register(r, { db, ai, auth, push }) {
  r.add('POST', '/api/reports', async ({ req }) => {
    const user = auth(req, ['youth']);
    const b = await readJson(req, 6 * MB);
    const photo = readPhoto(b.photo, 'Photo');
    const category = oneOf(b.category, 'Category', CATEGORIES);
    const problemType = oneOf(b.problemType, 'Problem type', PROBLEM_TYPES);
    const description = await ai.privacyFilter(text(b.description, 'Description', { min: 5, max: 400 }));
    const s = settings(db);
    const here = photo.lat !== null ? { lat: photo.lat, lng: photo.lng } : { lat: Number(b.lat), lng: Number(b.lng) };
    if (!Number.isFinite(here.lat)) throw new HttpError(400, 'Location is missing.');
    const areaName = nearestArea(here);

    const check = await ai.checkReport({ photo, category, problemType, description, area: areaName });
    if (check?.contains_personal_data) {
      return [200, { status: 'retake', reason: 'We can see a face, a licence plate or a document. Please take the photo again without people or plates. This photo was not saved.' }];
    }
    trackEvent(db, user.id, { category, event: 'reported' });

    // Within 50 m of a live hotspot: this becomes a confirmation, not a new pin.
    const existing = db.filter('hotspots', (h) => h.status !== 'rejected' && h.status !== 'cleaned')
      .find((h) => distanceM(here, h) <= s.duplicate_radius_m);
    if (existing && (!check || (check.is_environmental_problem && check.confidence >= s.verify_low))) {
      return confirmHotspot(existing, user, photo, here);
    }

    const accepted = check && check.is_environmental_problem && check.confidence >= s.verify_low;
    if (check && !accepted) {
      db.insert('hotspots', { title: PROBLEM_TYPES[problemType], description, category, problemType, lat: here.lat, lng: here.lng, areaName, photoId: null, source: 'youth', status: 'rejected', priority: 'low', reportedBy: user.id, aiCheck: check });
      await db.save();
      return [200, { status: 'rejected', reason: check.reason, confidence: check.confidence }];
    }

    const stored = await storePhoto(db, photo, { ownerId: user.id, kind: 'report', isPublic: true });
    const verified = check && check.confidence >= s.verify_high;
    const hotspot = db.insert('hotspots', {
      title: `${PROBLEM_TYPES[problemType]} · ${areaName}`,
      description,
      category: check && CATEGORIES[check.category] ? check.category : category,
      problemType,
      lat: here.lat,
      lng: here.lng,
      areaName,
      photoId: stored.id,
      source: 'youth',
      status: 'needs_confirmation',
      priority: check?.urgency === 'high' ? 'high' : check?.urgency === 'low' ? 'low' : 'medium',
      reportedBy: user.id,
      aiCheck: check,
    });
    let action = null;
    if (verified) action = verifyHotspot(db, hotspot, 'ai_verified', push);
    await db.save();
    return [201, {
      status: hotspot.status,
      hotspot: hotspotView(db, hotspot),
      actionId: action?.id || null,
      ai: check,
      aiAvailable: Boolean(check),
      reason: check ? check.reason : 'AI verification is unavailable right now. Two nearby confirmations or the municipality can verify it.',
    }];
  });

  async function confirmHotspot(hotspot, user, photo, here) {
    const s = settings(db);
    if (hotspot.reportedBy === user.id) throw new HttpError(409, 'You reported this spot. Someone else needs to confirm it.');
    if (db.find('confirmations', (c) => c.hotspotId === hotspot.id && c.userId === user.id)) {
      throw new HttpError(409, 'You already confirmed this spot.');
    }
    if (distanceM(here, hotspot) > s.confirm_radius_m) throw new HttpError(400, `You need to be within ${s.confirm_radius_m} m of the spot to confirm it.`);
    const stored = await storePhoto(db, photo, { ownerId: user.id, kind: 'confirmation', isPublic: true });
    db.insert('confirmations', { hotspotId: hotspot.id, userId: user.id, photoId: stored.id, lat: here.lat, lng: here.lng });
    award(db, user.id, POINTS.confirmation, 'Confirmed a report', hotspot.id, push);
    let actionId = null;
    const count = db.filter('confirmations', (c) => c.hotspotId === hotspot.id).length;
    if (hotspot.status === 'needs_confirmation' && count >= s.confirmations_needed) {
      actionId = verifyHotspot(db, hotspot, 'verified', push).id;
    }
    await db.save();
    return [201, { status: 'confirmed', hotspot: hotspotView(db, hotspot), actionId, points: POINTS.confirmation }];
  }

  r.add('POST', '/api/hotspots/:id/confirm', async ({ req, params }) => {
    const user = auth(req, ['youth']);
    const hotspot = db.byId('hotspots', params.id);
    if (!hotspot || hotspot.status === 'rejected') throw new HttpError(404, 'No such hotspot.');
    const b = await readJson(req, 6 * MB);
    const photo = readPhoto(b.photo, 'Photo');
    const here = photo.lat !== null ? { lat: photo.lat, lng: photo.lng } : { lat: hotspot.lat, lng: hotspot.lng };
    const check = await ai.checkReport({ photo, category: hotspot.category, problemType: hotspot.problemType, description: hotspot.description, area: hotspot.areaName });
    if (check?.contains_personal_data) {
      return [200, { status: 'retake', reason: 'We can see a face, a licence plate or a document. Please retake the photo without them. It was not saved.' }];
    }
    return confirmHotspot(hotspot, user, photo, here);
  });

  r.add('GET', '/api/reports/mine', ({ req }) => {
    const user = auth(req);
    return [200, { reports: db.filter('hotspots', (h) => h.reportedBy === user.id).map((h) => hotspotView(db, h)) }];
  });

}

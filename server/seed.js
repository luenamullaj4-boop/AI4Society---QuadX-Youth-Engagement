// Seed data for the demo. Every person, organisation and number here is made up.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_SETTINGS, PILOT_SCHOOLS, QUIZ } from '../public/js/config.js';

const H = 3600 * 1000;
const iso = (t) => new Date(t).toISOString();
const code = (n) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n).toUpperCase();

// Simple flat illustrations (no people) used as seed photos.
const SVG = {
  river: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#DCE9EF"/><path d="M0 330 C200 300 400 380 800 320 L800 600 L0 600Z" fill="#8DBBD0"/><path d="M0 250 C200 230 500 290 800 250 L800 330 C400 380 200 300 0 330Z" fill="#C9B98F"/><g fill="#E07A2E"><circle cx="220" cy="285" r="16"/><rect x="300" y="270" width="40" height="22" rx="6"/><circle cx="470" cy="300" r="12"/><rect x="560" y="280" width="30" height="30" rx="4" fill="#9A4312"/></g><g fill="#1E5A3F"><circle cx="120" cy="150" r="60"/><circle cx="660" cy="140" r="70"/></g></svg>`,
  park: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#E3EEE6"/><rect y="420" width="800" height="180" fill="#8FC7A3"/><g fill="#1E5A3F"><circle cx="160" cy="300" r="90"/><circle cx="420" cy="260" r="110"/><circle cx="660" cy="310" r="80"/></g><g fill="#6B5B1E"><rect x="150" y="380" width="20" height="60"/><rect x="410" y="360" width="20" height="80"/><rect x="650" y="380" width="20" height="60"/></g><g fill="#B9B6AA"><circle cx="280" cy="470" r="14"/><circle cx="540" cy="480" r="14"/></g></svg>`,
  dump: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#ECEAE2"/><rect y="400" width="800" height="200" fill="#C9B98F"/><path d="M180 420 C240 300 420 280 560 420Z" fill="#55615A"/><g fill="#E07A2E"><rect x="260" y="340" width="60" height="40" rx="8"/><circle cx="420" cy="360" r="26"/><rect x="480" y="380" width="50" height="30" rx="6"/></g><g fill="#16231C"><rect x="330" y="370" width="30" height="40" rx="4"/></g></svg>`,
  smoke: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#ECEAE2"/><rect y="440" width="800" height="160" fill="#C9B98F"/><g fill="#B9B6AA"><circle cx="400" cy="220" r="90"/><circle cx="330" cy="150" r="70"/><circle cx="470" cy="120" r="60"/></g><path d="M340 440 L400 330 L460 440Z" fill="#E07A2E"/><rect x="300" y="430" width="200" height="20" fill="#55615A"/></svg>`,
  clean: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#F4F2EC"/><rect y="380" width="800" height="220" fill="#8FC7A3"/><rect x="80" y="120" width="640" height="260" fill="#DAD8CF"/><g fill="#B9B6AA"><rect x="80" y="120" width="80" height="40"/><rect x="240" y="120" width="80" height="40"/><rect x="400" y="120" width="80" height="40"/><rect x="560" y="120" width="80" height="40"/></g></svg>`,
};

export async function seed({ data, uploadsDir, id }) {
  const now = Date.now();
  const row = (extra) => ({ id: id(), createdAt: iso(now - 20 * 24 * H), ...extra });

  const photo = async (key) => {
    const p = row({ ownerId: null, kind: 'seed', isPublic: true, ext: 'svg', hash: createHash('sha256').update(SVG[key]).digest('hex'), ahash: null });
    await writeFile(join(uploadsDir, `${p.id}.svg`), SVG[key]);
    data.photos.push(p);
    return p.id;
  };

  const answers = (type) => Object.fromEntries(QUIZ.map((q) => [q.id, type]));
  const person = (extra) => row({
    role: 'youth', showRealName: true, isPrivate: false, settingPref: 'both', availableTime: 'medium',
    interestScores: {}, points: 0, lifetimePoints: 0, hours: 0, actionsCount: 0, referredBy: null, src: null,
    referralCode: code(6), verifyCode: code(10), tokenHash: null, loginCodeHash: null, seedPoints: true,
    verifyVisibility: { points: true, actions: true, hours: true, certificates: true, type: true, categories: true },
    ...extra,
  });

  const staff = row({ role: 'municipality', nickname: 'Municipality of Elbasan', displayName: 'Environment Directorate', showRealName: true, categories: [], points: 0, lifetimePoints: 0, demo: true, demoBlurb: 'Official municipality account', tokenHash: null });
  const arta = person({ displayName: 'Arta K.', nickname: 'arta.green', ageGroup: '18-24', school: PILOT_SCHOOLS[0], area: 'City centre', categories: ['waste', 'planting'], userType: 'organizer', userTypeLine: 'You bring people together and make plans happen.', quizAnswers: answers('organizer'), points: 340, lifetimePoints: 340, hours: 14, actionsCount: 6, seedSignedUp: 7, seedAttended: 6, seedLed: 1, interestScores: { waste: 12, planting: 9 }, demo: true, demoBlurb: '340 points · The Organizer' });
  const beni = person({ displayName: 'Beni', nickname: 'beni', ageGroup: '18-24', school: PILOT_SCHOOLS[1], area: 'Rinia park area', categories: ['planting', 'waste'], userType: 'doer', userTypeLine: 'You roll up your sleeves and get the job done.', quizAnswers: answers('doer'), points: 410, lifetimePoints: 410, hours: 19, actionsCount: 8, seedSignedUp: 8, seedAttended: 8, seedLed: 2, demo: true, demoBlurb: 'Reliable leader · 8 of 8 attended' });
  const genti = person({ displayName: 'Genti', nickname: 'genti16', ageGroup: '16-17', showRealName: false, isPrivate: true, school: PILOT_SCHOOLS[3], area: 'Northern city', categories: ['planting', 'water'], userType: 'storyteller', userTypeLine: 'You make people care by showing them what you see.', quizAnswers: answers('storyteller'), points: 85, lifetimePoints: 85, hours: 4, actionsCount: 2, seedSignedUp: 6, seedAttended: 2, demo: true, demoBlurb: '16–17 · attended 2 of 6 sign-ups' });
  const ersi = person({ displayName: 'Ersi', nickname: 'ersi', ageGroup: '25-29', school: null, area: 'Shkumbin riverside', categories: ['planting', 'climate'], userType: 'innovator', userTypeLine: 'You look for smarter ways to fix old problems.', quizAnswers: answers('innovator'), points: 150, lifetimePoints: 150, hours: 7, actionsCount: 3, seedSignedUp: 3, seedAttended: 3, demo: true, demoBlurb: '25–29 · attended 3 of 3' });
  const fillers = ['Dori', 'Klea', 'Luan', 'Megi', 'Noel', 'Sara', 'Tea'].map((n, i) => person({
    displayName: n, nickname: n.toLowerCase(), ageGroup: i % 3 === 0 ? '16-17' : '18-24', area: 'Shkumbin riverside', categories: ['water', 'waste'], userType: 'doer', quizAnswers: answers('doer'),
  }));
  data.users.push(staff, arta, beni, genti, ersi, ...fillers);
  data.certificates.push(
    row({ userId: arta.id, kind: 'cert_1', title: 'Certificate I', phase: 'Phase 1 · Recognition', verifyCode: code(10) }),
    row({ userId: arta.id, kind: 'cert_2', title: 'Certificate II', phase: 'Phase 1 · Recognition', verifyCode: code(10) }),
    row({ userId: beni.id, kind: 'cert_1', title: 'Certificate I', phase: 'Phase 1 · Recognition', verifyCode: code(10) }),
    row({ userId: beni.id, kind: 'cert_2', title: 'Certificate II', phase: 'Phase 1 · Recognition', verifyCode: code(10) }),
    row({ userId: ersi.id, kind: 'cert_1', title: 'Certificate I', phase: 'Phase 1 · Recognition', verifyCode: code(10) }),
  );
  data.pointEvents.push(
    row({ userId: arta.id, amount: 100, reason: 'Led an action', refId: 'seed-1' }),
    row({ userId: arta.id, amount: 240, reason: 'Earlier actions and reports', refId: 'seed-2' }),
  );

  const action = (extra) => ({
    id: id(), createdAt: iso(now - 5 * 24 * H), hotspotId: null, type: 'cleanup', requiredVolunteers: 10, durationHours: 3, pointsReward: 50,
    status: 'collecting', leaderId: null, deputyId: null, offeredTo: null, offerExpiresAt: null, applicationsCloseAt: null, rankedAt: null, autoConfirmAt: null,
    supervisorName: '', confirmedOptionId: null, options: [], safety: { gloves: false, firstAid: false, briefing: false, supervisor: false },
    beforePhotoId: null, afterPhotoId: null, bagsPhotoId: null, totalBags: null, kgPlastic: null, kgOther: null, cleanup: null, tools: ['Gloves', 'Bags'],
    ...extra,
  });

  // 1. Shkumbin riverbank: municipality hotspot, action at 7/10 with three dates.
  const river = row({ title: 'Shkumbin riverbank', description: 'Plastic bottles and bags collect along the north bank after every high water.', category: 'water', problemType: 'illegal_dump', lat: 41.1003, lng: 20.0786, areaName: 'Shkumbin riverside', photoId: await photo('river'), source: 'municipality', status: 'open', priority: 'high', reportedBy: null });
  const riverAction = action({
    hotspotId: river.id, title: 'Shkumbin riverbank cleanup', category: 'water', description: 'Clean the north bank of the Shkumbin between the two footpaths. Gloves, bags and water provided. Stay on the bank, never in the water.',
    lat: river.lat, lng: river.lng, areaName: river.areaName, leaderId: beni.id, tools: ['Gloves', 'Bags', 'Grabbers'],
    options: [
      { id: id(), startsAt: '2026-10-03T08:00:00.000Z' },
      { id: id(), startsAt: '2026-10-04T07:00:00.000Z' },
      { id: id(), startsAt: '2026-10-10T08:00:00.000Z' },
    ],
    volunteerCallSent: true, createdBy: staff.id,
  });
  fillers.forEach((u) => data.signups.push(row({ actionId: riverAction.id, optionId: riverAction.options[0].id, userId: u.id })));
  data.signups.push(row({ actionId: riverAction.id, optionId: riverAction.options[1].id, userId: fillers[0].id }));

  // 2. Tree planting in Rinia park: leader wanted, three applicants.
  const rinia = row({ title: 'Rinia park: gaps in the tree line', description: 'Twenty trees along the main path were lost to drought. The parks department has saplings ready.', category: 'planting', problemType: 'damaged_green', lat: 41.1160, lng: 20.0781, areaName: 'Rinia park area', photoId: await photo('park'), source: 'municipality', status: 'open', priority: 'medium', reportedBy: null });
  const riniaAction = action({
    hotspotId: rinia.id, title: 'Tree planting in Rinia park', category: 'planting', type: 'planting', status: 'leader_wanted', description: 'Plant 20 saplings along the main path with the parks department. Tools and saplings provided.',
    lat: rinia.lat, lng: rinia.lng, areaName: rinia.areaName, durationHours: 2.5, applicationsCloseAt: iso(now + 30 * H), tools: ['Spades', 'Gloves', 'Watering cans'], createdBy: staff.id,
  });
  const sat = iso(now + 8 * 24 * H);
  const sun = iso(now + 9 * 24 * H);
  data.leaderApplications.push(
    row({ actionId: riniaAction.id, userId: beni.id, motivation: "I've led two cleanups this year and I know Rinia park well. I can bring extra gloves and I'm free both weekend mornings.", availableOptionIds: [], availableDates: [sat, sun], status: 'pending', aiScore: null, aiReason: null, rank: null }),
    row({ actionId: riniaAction.id, userId: genti.id, motivation: 'I love trees and I want to learn how to lead a group. Five friends from my class said they would come if I lead.', availableOptionIds: [], availableDates: [sat], status: 'pending', aiScore: null, aiReason: null, rank: null }),
    row({ actionId: riniaAction.id, userId: ersi.id, motivation: 'I studied agronomy, so I can show everyone how to plant saplings so they survive the summer. I work weekdays but Saturday is fine.', availableOptionIds: [], availableDates: [sat], status: 'pending', aiScore: null, aiReason: null, rank: null }),
  );

  // 3. Youth report waiting for confirmation in Shushicë.
  const shushice = row({ title: 'Illegal dump · Shushicë', description: 'Construction rubble and household bags dumped at the end of the field road.', category: 'waste', problemType: 'illegal_dump', lat: 41.1449, lng: 20.1052, areaName: 'Shushicë', photoId: await photo('dump'), source: 'youth', status: 'needs_confirmation', priority: 'medium', reportedBy: genti.id, aiCheck: { is_environmental_problem: true, confidence: 72, category: 'waste', reason: 'Looks like dumped household waste, but the photo is taken from far away.', source: 'seed' } });

  // 4. Burning waste in Gjergjan: AI-verified, looking for a leader.
  const gjergjan = row({ title: 'Burning waste · Gjergjan', description: 'Household waste is burned in the open next to the school road most evenings.', category: 'climate', problemType: 'burning_waste', lat: 41.0412, lng: 20.0493, areaName: 'Gjergjan', photoId: await photo('smoke'), source: 'youth', status: 'ai_verified', priority: 'high', reportedBy: ersi.id, aiCheck: { is_environmental_problem: true, confidence: 91, category: 'climate', reason: 'Open burning of mixed household waste is clearly visible.', source: 'seed' } });
  const gjergjanAction = action({
    hotspotId: gjergjan.id, title: 'Stop the burning: awareness walk in Gjergjan', category: 'climate', type: 'awareness', status: 'leader_wanted', description: 'Door-to-door talk with neighbours about where to take waste instead of burning it. Leaflets from the municipality provided.',
    lat: gjergjan.lat, lng: gjergjan.lng, areaName: gjergjan.areaName, durationHours: 2, applicationsCloseAt: iso(now + 40 * H), tools: ['Leaflets', 'Clipboard'], createdBy: 'report',
  });

  // 5. A cleaned site with a finished action (feeds the impact page).
  const kala = row({ title: 'Old town wall litter', description: 'Litter along the outside of the castle wall.', category: 'waste', problemType: 'litter', lat: 41.1101, lng: 20.0861, areaName: 'Old town (Kala)', photoId: await photo('dump'), source: 'youth', status: 'cleaned', priority: 'medium', reportedBy: arta.id, aiCheck: { is_environmental_problem: true, confidence: 94, category: 'waste', reason: 'Scattered litter along a wall.', source: 'seed' } });
  const kalaAction = action({
    hotspotId: kala.id, title: 'Old town wall cleanup', category: 'waste', status: 'done', description: 'Litter pick along the castle wall.', lat: kala.lat, lng: kala.lng, areaName: kala.areaName,
    leaderId: arta.id, options: [{ id: id(), startsAt: iso(now - 12 * 24 * H) }], beforePhotoId: await photo('dump'), afterPhotoId: await photo('clean'),
    totalBags: 14, kgPlastic: 11.5, kgOther: 7, completedAt: iso(now - 12 * 24 * H), cleanup: { is_clean: true, confidence: 92, reason: 'The wall base is visibly clear of litter.', source: 'seed' },
  });
  kalaAction.confirmedOptionId = kalaAction.options[0].id;
  [arta, beni, ...fillers.slice(0, 4)].forEach((u) => {
    data.attendance.push(row({ actionId: kalaAction.id, userId: u.id, checkinAt: iso(now - 12 * 24 * H), checkoutAt: iso(now - 12 * 24 * H + 3 * H), minutes: 180, checkinLat: kala.lat, checkinLng: kala.lng }));
    data.dataCards.push(row({ actionId: kalaAction.id, userId: u.id, bags: 2, photoId: kalaAction.afterPhotoId, items: ['bottles', 'cans', 'cigarettes'], localConcern: '', status: 'verified', leaderConfirmed: true, estWeightKg: 3, impact: 'You collected ~3 kg, mostly plastic bottles.' }));
  });

  data.hotspots.push(river, rinia, shushice, gjergjan, kala);
  data.actions.push(riverAction, riniaAction, gjergjanAction, kalaAction);

  // News
  data.news.push(
    row({ type: 'info', category: null, title: 'Bulky waste collection this Saturday', body: 'Leave bulky items next to the green containers on Saturday before 08:00. Do not burn them.', authorOrg: 'Municipality of Elbasan', approved: true, important: true, createdAt: iso(now - 1 * H) }),
    row({ type: 'initiative', category: 'planting', title: '1,000 trees for Elbasan', body: 'This autumn the municipality plants trees in parks and school yards. Join a planting action near you.', actionId: riniaAction.id, authorOrg: 'Municipality of Elbasan', approved: true, important: false, createdAt: iso(now - 30 * H) }),
    row({ type: 'opportunity', category: 'water', title: 'River Watch photographers wanted', body: 'A partner NGO is looking for young people to photograph the Shkumbin once a month. Training included.', authorOrg: 'Shkumbin Friends (partner NGO)', approved: true, important: false, createdAt: iso(now - 50 * H) }),
    row({ type: 'ai_summary', category: 'waste', title: 'Local Plan 2025–2030 in 5 cards', body: 'The waste plan for Elbasan, summarized.', authorOrg: 'Municipality of Elbasan', approved: true, important: false, createdAt: iso(now - 70 * H), cards: [
      { title: 'The problem', body: 'The plan names low education and awareness as one of the main waste problems in Elbasan.' },
      { title: 'No recycling yet', body: 'No recycling or composting is recorded. A three-bin sorting pilot on main streets did not work.' },
      { title: 'A tiny budget', body: 'Only about 200,000 ALL (around €2,000) is set aside for public awareness over two years, mostly for leaflets.' },
      { title: 'Youth are part of the plan', body: 'The plan calls for volunteers and students to join door-to-door campaigns, and for digital platforms and social media.' },
      { title: 'Five pilot schools', body: 'Five schools will pilot waste separation, with incentives and tariff reductions for people who take part.' },
    ] }),
    row({ type: 'leader_call', category: 'planting', title: 'Team leader wanted: Tree planting in Rinia park', body: 'Apply within 48 hours with a short motivation.', actionId: riniaAction.id, authorOrg: 'GreenELB', approved: true, important: false, createdAt: iso(now - 18 * H) }),
    row({ type: 'volunteer_call', category: 'water', title: 'Volunteers wanted: Shkumbin riverbank cleanup', body: '10 volunteers needed. Pick a date that works for you.', actionId: riverAction.id, authorOrg: 'GreenELB', approved: true, important: false, createdAt: iso(now - 40 * H) }),
    row({ type: 'opportunity', category: 'climate', title: 'Energy saving workshop for eco clubs', body: 'A partner school proposes an evening workshop on saving energy at home.', authorOrg: 'Partner school', approved: false, important: false, createdAt: iso(now - 5 * H) }),
  );

  data.schoolPoints.push(...[1240, 980, 860, 610, 540].map((points, i) => row({ school: PILOT_SCHOOLS[i], points })));

  data.rewards.push(
    row({ title: 'Public transport voucher (10 rides)', description: 'Symbolic voucher for city buses.', costPoints: 150, enabled: true }),
    row({ title: 'Cultural event ticket', description: 'One ticket to a municipal cultural event.', costPoints: 120, enabled: true }),
    row({ title: 'Swimming pool entry', description: 'One entry to the city pool.', costPoints: 100, enabled: true }),
    row({ title: 'Family waste tariff discount', description: 'Proposal: discount for families in the sorting pilot.', costPoints: 400, enabled: false }),
    row({ title: 'Micro-grant for your school eco club', description: 'Pooled points unlock a small grant for your club.', costPoints: 1000, enabled: false }),
  );

  const survey = row({ title: 'How clean is your neighbourhood?', satisfaction: true, open: true, questions: [
    { id: 'q1', kind: 'rating', text: 'How clean is your neighbourhood? (1 = very dirty, 5 = very clean)' },
    { id: 'q2', kind: 'choice', text: 'What is the biggest problem?', options: ['Litter', 'Illegal dumps', 'Burning waste', 'Dirty river', 'Too few trees'] },
    { id: 'q3', kind: 'text', text: 'One thing the municipality should fix first' },
  ] });
  data.surveys.push(survey);
  [[2, 'Illegal dumps'], [3, 'Litter'], [2, 'Burning waste'], [3, 'Dirty river'], [4, 'Too few trees']].forEach(([rating, choice], i) => {
    data.surveyResponses.push(row({ surveyId: survey.id, userId: fillers[i].id, area: fillers[i].area, answers: { q1: rating, q2: choice, q3: '' } }));
  });

  data.settings = { ...DEFAULT_SETTINGS };
}

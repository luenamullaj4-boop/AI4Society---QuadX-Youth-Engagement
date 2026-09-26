// Shared constants for the browser app and the Node server.
// Keep this file free of DOM and Node APIs so both sides can import it.

export const APP_NAME = 'GreenELB';
export const CITY = { lat: 41.1125, lng: 20.0822, zoom: 14 };

export const CATEGORIES = {
  water: { label: 'Water', color: '#3E6F84', tint: '#E2ECF0', blurb: 'Rivers, Shkumbin monitoring, water saving' },
  planting: { label: 'Planting', color: '#1E5A3F', tint: '#E3EEE6', blurb: 'Tree planting, parks, school gardens' },
  waste: { label: 'Waste', color: '#9A4312', tint: '#FBE9DC', blurb: 'Cleanups, sorting, recycling, composting' },
  climate: { label: 'Climate & Energy', color: '#6B5B1E', tint: '#F1ECDA', blurb: 'Energy saving, climate awareness, home challenges' },
};

export const ACTION_TYPES = {
  cleanup: 'Cleanup',
  planting: 'Planting',
  recycling: 'Recycling / composting',
  awareness: 'Awareness',
  monitoring: 'Documenting / monitoring',
  home: 'Home challenge',
};

export const PROBLEM_TYPES = {
  illegal_dump: 'Illegal dump',
  litter: 'Litter',
  overflowing_bins: 'Overflowing bins',
  water_pollution: 'Water pollution',
  burning_waste: 'Burning waste',
  damaged_green: 'Damaged trees or green space',
  other: 'Other',
};

export const AGE_GROUPS = { '16-17': '16–17', '18-24': '18–24', '25-29': '25–29' };

export const SETTING_PREFS = { outdoors: 'Outdoors', home: 'From home', both: 'Both' };

export const AVAILABLE_TIME = {
  short: 'Less than 1 hour a week',
  medium: '1–3 hours a week',
  long: 'More than 3 hours a week',
};

export const USER_TYPES = {
  doer: { name: 'The Doer', line: 'You roll up your sleeves and get the job done.' },
  storyteller: { name: 'The Storyteller', line: 'You make people care by showing them what you see.' },
  organizer: { name: 'The Organizer', line: 'You bring people together and make plans happen.' },
  innovator: { name: 'The Innovator', line: 'You look for smarter ways to fix old problems.' },
};

// 5-question quiz. Each option points to one user type; the AI writes the final result.
export const QUIZ = [
  { id: 'q1', q: 'A friend says the riverbank is full of rubbish. What do you do first?', options: {
    doer: 'Grab gloves and go', storyteller: 'Take photos and post them', organizer: 'Start a group chat to plan a cleanup', innovator: 'Ask why it keeps happening' } },
  { id: 'q2', q: 'Your favourite role in a school project?', options: {
    doer: 'Building the thing', storyteller: 'Presenting it', organizer: 'Keeping everyone on track', innovator: 'Coming up with the idea' } },
  { id: 'q3', q: 'Pick a Saturday plan:', options: {
    doer: 'Planting trees in Rinia park', storyteller: 'Making a short video about the Shkumbin', organizer: 'Running a sign-up stand', innovator: 'Designing a better bin for your street' } },
  { id: 'q4', q: 'What makes you proud?', options: {
    doer: 'Seeing a clean place I cleaned', storyteller: 'People sharing my post', organizer: 'A big turnout', innovator: 'An idea others copy' } },
  { id: 'q5', q: 'Your superpower is…', options: {
    doer: 'Energy', storyteller: 'Words and pictures', organizer: 'Getting people to show up', innovator: 'Curiosity' } },
];

// Areas users can pick. Coordinates are approximate area centres, never addresses.
export const AREAS = [
  { name: 'City centre', lat: 41.1125, lng: 20.0822 },
  { name: 'Old town (Kala)', lat: 41.1104, lng: 20.0855 },
  { name: 'Rinia park area', lat: 41.1146, lng: 20.0806 },
  { name: 'Shkumbin riverside', lat: 41.1005, lng: 20.0800 },
  { name: 'Northern city', lat: 41.1225, lng: 20.0870 },
  { name: 'Western city', lat: 41.1090, lng: 20.0660 },
  { name: 'Bradashesh', lat: 41.0990, lng: 20.0250 },
  { name: 'Funarë', lat: 41.2300, lng: 20.2200 },
  { name: 'Gjergjan', lat: 41.0400, lng: 20.0500 },
  { name: 'Gjinar', lat: 41.1700, lng: 19.9800 },
  { name: 'Gracen', lat: 41.0700, lng: 20.2100 },
  { name: 'Labinot-Fushë', lat: 41.1500, lng: 20.1600 },
  { name: 'Labinot-Mal', lat: 41.1950, lng: 20.1600 },
  { name: 'Papër', lat: 41.0500, lng: 19.9800 },
  { name: 'Shalës', lat: 40.9900, lng: 20.1200 },
  { name: 'Shirgjan', lat: 41.0650, lng: 20.0950 },
  { name: 'Shushicë', lat: 41.1450, lng: 20.1050 },
  { name: 'Tregan', lat: 40.9800, lng: 20.0300 },
  { name: 'Zavalinë', lat: 40.9600, lng: 20.1800 },
];

export const PILOT_SCHOOLS = [
  'Dhaskal Todri High School',
  'Kostandin Kristoforidhi High School',
  'Luigj Gurakuqi High School',
  'Qamil Guranjaku School',
  'Sule Harri School',
];

export const DATA_CARD_ITEMS = {
  bottles: 'Plastic bottles', bags: 'Bags', cans: 'Cans', glass: 'Glass', paper: 'Paper',
  cigarettes: 'Cigarette butts', bulky: 'Bulky items', other: 'Other',
};

export const POINTS = {
  reportVerified: 20,
  confirmation: 5,
  attend: 50,
  lead: 100,
  deputy: 20,
  referral3: 30,
  quiz: 5,
};

export const PHASES = [
  { key: 'cert_1', points: 100, title: 'Certificate I', phase: 'Phase 1 · Recognition' },
  { key: 'cert_2', points: 200, title: 'Certificate II', phase: 'Phase 1 · Recognition' },
  { key: 'phase_2', points: 500, title: 'Engagement', phase: 'Phase 2 · Engagement', perk: 'Eligible to join municipal environmental projects and activities.' },
  { key: 'phase_3', points: 1000, title: 'Young Leader', phase: 'Phase 3 · Young Leader', needsLead: true, perk: 'Recommendation letter, Green Ambassador title, a day with the Environment Directorate, internship for eligible candidates.' },
];

export const DEFAULT_SETTINGS = {
  leader_min_age: 18,
  verify_high: 85,
  verify_low: 50,
  cleanup_confidence: 80,
  duplicate_radius_m: 50,
  confirm_radius_m: 100,
  confirmations_needed: 2,
  checkin_radius_m: 200,
  required_volunteers: 10,
  application_window_h: 48,
  auto_confirm_h: 24,
  reporter_offer_h: 24,
  notification_daily_cap: 3,
  notification_radius_km: 5,
  demand_threshold: 10,
  reward_monthly_cap: 2,
  quarterly_assessment: 'Q3 2026 assessment in progress',
};

export const SOURCES = ['instagram', 'tiktok', 'whatsapp', 'school', 'cafe', 'hotspot', 'poster'];

export function areaByName(name) {
  return AREAS.find((a) => a.name === name);
}

export function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function nextPhase(lifetimePoints) {
  return PHASES.find((p) => lifetimePoints < p.points) || null;
}

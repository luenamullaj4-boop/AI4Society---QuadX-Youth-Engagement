// Deterministic fallbacks used when the AI is off or fails, plus the
// privacy regex that always runs before text is stored or sent anywhere.
import { CATEGORIES, USER_TYPES, formatDistance } from '../public/js/config.js';

export function quizMajority(answers) {
  const counts = {};
  Object.values(answers).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  const type = Object.keys(USER_TYPES).sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
  return { user_type: type, description: USER_TYPES[type].line, source: 'rules' };
}

// Removes emails, phone numbers and URLs. Names can't be caught reliably by
// a regex; the AI privacy filter handles those when it is enabled.
export function scrubText(text) {
  return String(text ?? '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email removed]')
    .replace(/(?:\+?355|0)[\s-]?6[789](?:[\s-]?\d){7}/g, '[phone removed]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[phone removed]')
    .replace(/https?:\/\/\S+/g, '[link removed]');
}

export function rankLeadersByRules(applicants) {
  const ranking = applicants.map((a) => {
    const reliability = a.signed_up ? a.attended / a.signed_up : 0.5;
    const availability = a.available_dates_total ? a.available_dates_matching / a.available_dates_total : 0;
    const distance = 1 / (1 + (a.distance_km ?? 5) / 3);
    const motivation = Math.min(1, (a.motivation?.length || 0) / 300);
    const experience = Math.min(1, (a.actions_led * 2 + a.attended) / 10);
    const score = Math.round(100 * (0.3 * reliability + 0.2 * availability + 0.15 * distance + 0.2 * motivation + 0.15 * experience));
    const reason = `Attended ${a.attended} of ${a.signed_up} sign-ups, available on ${a.available_dates_matching} of ${a.available_dates_total} dates, about ${a.distance_km ?? '?'} km away.`;
    return { applicant_id: a.applicant_id, score, reason };
  });
  return { ranking: ranking.sort((x, y) => y.score - x.score), source: 'rules' };
}

export function recommendByRules({ profile, actions }) {
  const picks = actions.map((a) => {
    const interest = profile.categories.includes(a.category) ? 1 : 0.3;
    const learned = (profile.scores[a.category] || 0) / 10;
    const near = 1 / (1 + a.distance_km / 2);
    const shortEnough = profile.available_time === 'short' ? (a.duration_hours <= 2 ? 1 : 0.4) : 1;
    const match = Math.round(100 * Math.min(1, 0.45 * interest + 0.15 * Math.min(1, learned) + 0.25 * near + 0.15 * shortEnough));
    const bits = [];
    if (profile.categories.includes(a.category)) bits.push(`it's ${CATEGORIES[a.category].label.toLowerCase()}, one of your picks`);
    bits.push(`it's ${formatDistance(a.distance_km * 1000)} from your area`);
    if (a.duration_hours <= 2) bits.push(`it only takes ${a.duration_hours} h`);
    return { action_id: a.id, match_score: match, reason: `Because ${bits.slice(0, 2).join(' and ')}.` };
  });
  return { picks: picks.sort((x, y) => y.match_score - x.match_score).slice(0, 3), source: 'rules' };
}

// Shared constants for the browser app and the Node server.
// Keep this file free of DOM and Node APIs so both sides can import it.

export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 600;

export const CATS = {
  env: { en: 'Environment', sq: 'Mjedisi', blurb: 'River and roadside clean-ups, fire prevention, tree planting.' },
  heritage: { en: 'Heritage', sq: 'Trashëgimia', blurb: 'Care for the Kalaja walls, old bazaar streets and village landmarks.' },
  social: { en: 'Neighbours', sq: 'Kujdesi social', blurb: 'Help older residents with harvests, shopping and company.' },
  edu: { en: 'Learning', sq: 'Arsimi', blurb: 'Homework clubs and reading afternoons in village schools.' },
  spaces: { en: 'Public spaces', sq: 'Hapësirat publike', blurb: 'Fix playgrounds, mark trails, audit bus stops and ramps.' },
};

export const URG = { hi: 'Urgent', mid: 'This month', lo: 'Ongoing' };

export const AGE_GROUPS = { '15-17': '15–17', '18-29': '18–29' };

// The 14 administrative units of Elbasan Municipality, placed on a schematic
// 800x600 map. Positions are approximate and not to scale.
export const UNITS = [
  { name: 'Elbasan', x: 410, y: 300, city: true },
  { name: 'Bradashesh', x: 255, y: 262 }, { name: 'Gjinar', x: 185, y: 205 }, { name: 'Shushicë', x: 400, y: 165 },
  { name: 'Labinot-Mal', x: 560, y: 105 }, { name: 'Funarë', x: 685, y: 185 }, { name: 'Labinot-Fushë', x: 640, y: 262 },
  { name: 'Papër', x: 160, y: 345 }, { name: 'Gjergjan', x: 315, y: 430 }, { name: 'Shirgjan', x: 455, y: 420 },
  { name: 'Shalës', x: 470, y: 515 }, { name: 'Tregan', x: 575, y: 390 }, { name: 'Gracen', x: 695, y: 370 },
  { name: 'Zavalinë', x: 610, y: 470 },
];

export const OUTLINE = [[120, 150], [200, 92], [300, 74], [380, 42], [470, 62], [560, 48], [650, 90], [722, 150], [762, 230], [742, 300], [772, 380], [722, 450], [650, 502], [560, 560], [470, 542], [400, 570], [320, 532], [250, 502], [170, 470], [110, 402], [58, 330], [80, 240]];

export const RIVER = [[800, 248], [748, 262], [700, 286], [650, 300], [600, 302], [545, 318], [495, 332], [445, 334], [400, 338], [350, 345], [300, 358], [250, 366], [200, 352], [150, 364], [100, 372], [40, 360], [0, 368]];

export const ROADS = [
  { pts: [[405, 295], [360, 270], [300, 240], [230, 190], [175, 160], [120, 120], [70, 90]], to: '→ Tiranë', lx: 60, ly: 80 },
  { pts: [[440, 300], [520, 305], [600, 292], [680, 275], [760, 250], [800, 238]], to: 'Librazhd →', lx: 720, ly: 228 },
  { pts: [[395, 315], [340, 370], [300, 420], [260, 470], [220, 540], [200, 600]], to: '↓ Cërrik', lx: 212, ly: 588 },
];

export function unitByName(name) {
  return UNITS.find((u) => u.name === name);
}

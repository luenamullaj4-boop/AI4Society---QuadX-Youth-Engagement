// Schematic map of Elbasan Municipality, drawn with d3 (loaded as a global from cdnjs).
import { MAP_HEIGHT as H, MAP_WIDTH as W, OUTLINE, RIVER, ROADS, UNITS, URG, unitByName } from './config.js';

const d3 = window.d3;
const color = (u) => `var(--${u})`;

function riverY(x) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [x0, y0] = RIVER[i];
    const [x1, y1] = RIVER[i + 1];
    if (x <= x0 && x >= x1) return y0 + (y1 - y0) * (x0 - x) / (x0 - x1);
  }
  return 350;
}

// Synthetic terrain: higher in the north-east mountains and south-east hills,
// low along the Shkumbin valley. Decorative, not survey data.
function elevationGrid(gw, gh) {
  const bump = (x, y, cx, cy, r, a) => a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
  const values = new Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * 10 + 5;
      const y = j * 10 + 5;
      let e = bump(x, y, 560, 70, 150, 1.1) + bump(x, y, 700, 170, 120, 0.8) + bump(x, y, 170, 140, 130, 0.8)
        + bump(x, y, 690, 470, 150, 0.85) + bump(x, y, 480, 580, 130, 0.5) + bump(x, y, 260, 520, 110, 0.35);
      e -= 0.55 * Math.exp(-((y - riverY(x)) ** 2) / (2 * 55 * 55));
      e += 0.05 * Math.sin(x / 37) * Math.cos(y / 29) + 0.04 * Math.sin((x + y) / 23);
      values[j * gw + i] = e;
    }
  }
  return values;
}

export function buildMap(svgEl) {
  const svg = d3.select(svgEl);
  const outlinePath = `M${OUTLINE.join('L')}Z`;
  svg.append('defs').append('clipPath').attr('id', 'clipLand').append('path').attr('d', outlinePath);

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'var(--surface-2)');
  svg.append('path').attr('class', 'm-land').attr('d', outlinePath);

  const land = svg.append('g').attr('clip-path', 'url(#clipLand)');

  const gw = 80;
  const gh = 60;
  const contours = d3.contours().size([gw, gh]).thresholds(d3.range(0.1, 1.3, 0.12))(elevationGrid(gw, gh));
  const path = d3.geoPath(d3.geoIdentity().scale(10));
  land.selectAll('.m-hill').data(contours.filter((c, i) => i % 3 === 2)).join('path').attr('class', 'm-hill').attr('d', path);
  land.selectAll('.m-contour').data(contours).join('path').attr('class', 'm-contour').attr('d', path);

  // Administrative unit boundaries: Voronoi cells around each unit centre (schematic).
  const voronoi = d3.Delaunay.from(UNITS, (d) => d.x, (d) => d.y).voronoi([0, 0, W, H]);
  land.append('path').attr('class', 'm-unit').attr('d', voronoi.render());

  const line = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
  land.append('path').attr('class', 'm-river-glow').attr('d', line(RIVER));
  land.append('path').attr('class', 'm-river').attr('d', line(RIVER));

  land.append('path').attr('class', 'm-city')
    .attr('d', 'M372 268 C392 250,440 252,462 266 C482 280,478 312,462 326 C440 336,400 334,382 322 C362 308,358 284,372 268Z');

  const roads = svg.append('g');
  ROADS.forEach((r) => {
    roads.append('path').attr('class', 'm-road').attr('clip-path', 'url(#clipLand)').attr('d', d3.line().curve(d3.curveCatmullRom)(r.pts));
    roads.append('text').attr('class', 'm-small').attr('x', r.lx).attr('y', r.ly).text(r.to);
  });

  svg.append('text').attr('class', 'm-riverlabel').attr('x', 515).attr('y', 350).text('Lumi Shkumbin');
  const labels = svg.append('g');
  UNITS.forEach((u) => {
    labels.append('text')
      .attr('class', `m-label${u.city ? ' city' : ''}`)
      .attr('x', u.x)
      .attr('y', u.city ? u.y - 2 : u.y + (u.name === 'Labinot-Mal' ? -8 : 0))
      .attr('text-anchor', 'middle')
      .text(u.name);
  });

  svg.append('path').attr('d', 'M404 312 h14 v-8 h-3 v3 h-2.5 v-3 h-3 v3 h-2.5 v-3 h-3z').attr('fill', 'var(--ink)');
  svg.append('text').attr('class', 'm-small').attr('x', 422).attr('y', 312).text('Kalaja');

  const compass = svg.append('g').attr('transform', 'translate(752,560)');
  compass.append('path').attr('d', 'M0 -22 L6 0 L0 -5 L-6 0Z').attr('fill', 'var(--ink)');
  compass.append('text').attr('class', 'm-small').attr('x', 0).attr('y', 12).attr('text-anchor', 'middle').text('V');

  const scale = svg.append('g').attr('transform', 'translate(40,560)');
  scale.append('rect').attr('width', 45).attr('height', 5).attr('fill', 'var(--ink)');
  scale.append('rect').attr('x', 45).attr('width', 45).attr('height', 5).attr('fill', 'var(--surface)').attr('stroke', 'var(--ink)');
  scale.append('text').attr('class', 'm-small').attr('y', -6).text('0');
  scale.append('text').attr('class', 'm-small').attr('x', 90).attr('y', -6).attr('text-anchor', 'end').text('≈ 5 km');

  return svg.append('g').attr('id', 'pins').node();
}

export function drawPins(pinsEl, { hotspots, pending, selected, isJoined, onSelect, onHover }) {
  const g = d3.select(pinsEl);
  g.selectAll('*').remove();

  pending.forEach((r) => {
    const u = unitByName(r.unit) || UNITS[0];
    const p = g.append('g').attr('class', 'pin pending').attr('transform', `translate(${u.x + (r.dx || 0)},${u.y + (r.dy || 16)})`);
    p.append('circle').attr('class', 'core').attr('r', 8);
    p.append('title').text(`Your report: ${r.desc || r.unit}`);
  });

  hotspots.forEach((h) => {
    const p = g.append('g')
      .attr('class', `pin${selected === h.id ? ' active' : ''}`)
      .attr('transform', `translate(${h.x},${h.y})`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', `${h.title}, ${h.unit}, ${URG[h.urg]}`);
    if (h.urg === 'hi') p.append('circle').attr('class', 'pulse').attr('r', 9).attr('stroke', color('hi'));
    p.append('circle').attr('class', 'sel').attr('r', 16);
    p.append('circle').attr('class', 'core').attr('r', 9).attr('fill', color(h.urg));
    if (isJoined(h.id)) {
      p.append('path').attr('d', 'M-4 0 l3 3 l5 -6').attr('fill', 'none')
        .attr('stroke', 'var(--surface)').attr('stroke-width', 2.2).attr('stroke-linecap', 'round');
    }
    p.on('click', () => onSelect(h.id))
      .on('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(h.id);
        }
      })
      .on('mouseenter', () => onHover(h))
      .on('focus', () => onHover(h))
      .on('mouseleave', () => onHover(null))
      .on('blur', () => onHover(null));
  });
}

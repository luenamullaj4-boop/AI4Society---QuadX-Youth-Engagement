import { AGE_GROUPS, CATS, MAP_WIDTH, UNITS, URG } from './config.js';
import { connect } from './api.js';
import { buildMap, drawPins } from './map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (u) => `var(--${u})`;

const state = {
  api: null,
  hotspots: [],
  reports: [],
  filterCat: 'all',
  filterUrg: 'all',
  selected: null,
  joining: false, // the join form is open for the selected hotspot
};

let pinsEl;

const visible = () => state.hotspots.filter((h) =>
  (state.filterCat === 'all' || h.cat === state.filterCat) && (state.filterUrg === 'all' || h.urg === state.filterUrg));

function showTip(h) {
  const tip = $('tip');
  if (!h) {
    tip.hidden = true;
    return;
  }
  const box = $('mapbox').getBoundingClientRect();
  const svgBox = $('map').getBoundingClientRect();
  const k = svgBox.width / MAP_WIDTH;
  tip.textContent = h.title;
  tip.style.left = `${h.x * k + (svgBox.left - box.left)}px`;
  tip.style.top = `${h.y * k + (svgBox.top - box.top)}px`;
  tip.hidden = false;
}

function renderPins() {
  drawPins(pinsEl, {
    hotspots: visible(),
    pending: state.reports.filter((r) => r.status === 'pending'),
    selected: state.selected,
    isJoined: state.api.isJoined,
    onSelect: select,
    onHover: showTip,
  });
}

function renderList() {
  const vis = visible();
  $('count').textContent = `Showing ${vis.length} of ${state.hotspots.length}`;
  const ul = $('list');
  ul.innerHTML = '';
  const order = { hi: 0, mid: 1, lo: 2 };
  vis.slice().sort((a, b) => order[a.urg] - order[b.urg]).forEach((h) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'item';
    b.type = 'button';
    if (state.selected === h.id) b.setAttribute('aria-current', 'true');
    b.innerHTML = `<i class="dot" style="background:${color(h.urg)}"></i>
      <span><h3>${esc(h.title)}</h3><div class="meta">${esc(h.unit)} · ${esc(h.when)}</div></span>
      <span class="need">${h.have}/${h.need}${state.api.isJoined(h.id) ? ' ✓' : ''}</span>`;
    b.addEventListener('click', () => select(h.id));
    li.appendChild(b);
    ul.appendChild(li);
  });
  if (!vis.length) {
    ul.innerHTML = '<li class="empty">No hotspots match these filters. Try another cause or set urgency to Any.</li>';
  }
}

function joinForm() {
  const live = state.api.mode === 'live';
  return `
    <form class="joinform" id="joinForm" novalidate>
      <label for="jName">First name<input id="jName" name="name" autocomplete="given-name" required maxlength="60"></label>
      <label for="jEmail">Email<input id="jEmail" name="email" type="email" autocomplete="email" required maxlength="120"></label>
      <label for="jAge">Age
        <select id="jAge" name="ageGroup">${Object.entries(AGE_GROUPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </label>
      <label class="check" id="jConsentRow" for="jConsent"><input id="jConsent" name="parentConsent" type="checkbox"> A parent or guardian knows and agrees</label>
      <p class="formnote">${live ? 'The crew leader uses your email to send the meeting details. Nothing else.' : 'Demo mode: nothing you type here is sent or saved.'}</p>
      <p class="formerror" id="actionError" role="alert" hidden></p>
      <div class="formrow">
        <button class="btn sun" type="submit" id="confirmJoin">Confirm my spot</button>
        <button class="btn ghost small" type="button" id="cancelJoin">Cancel</button>
      </div>
    </form>`;
}

function renderDetail() {
  const d = $('detail');
  const h = state.hotspots.find((x) => x.id === state.selected);
  if (!h) {
    d.hidden = true;
    return;
  }
  const joined = state.api.isJoined(h.id);
  const pct = Math.min(100, Math.round((h.have / h.need) * 100));
  const left = Math.max(0, h.need - h.have);
  let action;
  if (joined) {
    action = `<div class="formrow"><span class="joined-note">You're on the crew. See you there.</span>
      <button class="btn ghost small" type="button" id="leaveBtn">Leave this action</button></div>
      <p class="formerror" id="actionError" role="alert" hidden></p>`;
  } else if (state.joining) {
    action = joinForm();
  } else {
    action = `<button class="btn sun" type="button" id="joinBtn" ${left === 0 ? 'disabled' : ''}>${left === 0 ? 'Crew is full' : 'Join this action'}</button>`;
  }
  d.hidden = false;
  d.innerHTML = `
    <div class="top"><div class="tags"><span class="pill ${h.urg}"><i class="dot" style="background:currentColor"></i>${URG[h.urg]}</span><span class="pill">${CATS[h.cat].en}</span></div>
    <button class="close" type="button" id="closeDetail" aria-label="Close details">Close ✕</button></div>
    <h3>${esc(h.title)}</h3>
    <p>${esc(h.desc)}</p>
    <dl class="kv"><dt>When</dt><dd>${esc(h.when)}</dd><dt>Meet</dt><dd>${esc(h.meet)}</dd><dt>Unit</dt><dd>${esc(h.unit)}</dd>${h.bring ? `<dt>Bring</dt><dd>${esc(h.bring)}</dd>` : ''}</dl>
    <div><div class="barlabel"><span>${h.have} of ${h.need} volunteers</span><span>${left} spots left</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>
    ${action}`;

  $('closeDetail').onclick = () => select(null);
  if ($('joinBtn')) $('joinBtn').onclick = () => { state.joining = true; renderDetail(); $('jName').focus(); };
  if ($('leaveBtn')) $('leaveBtn').onclick = () => act(() => state.api.leave(h.id), 'leaveBtn');
  if ($('cancelJoin')) $('cancelJoin').onclick = () => { state.joining = false; renderDetail(); };
  if ($('joinForm')) {
    const age = $('jAge');
    const syncConsent = () => { $('jConsentRow').hidden = age.value !== '15-17'; };
    age.onchange = syncConsent;
    syncConsent();
    $('joinForm').onsubmit = (e) => {
      e.preventDefault();
      const form = {
        name: $('jName').value.trim(),
        email: $('jEmail').value.trim(),
        ageGroup: age.value,
        parentConsent: $('jConsent').checked,
      };
      if (!form.name) return fail('Add your first name so the crew leader knows who to expect.', 'jName');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return fail('Add an email address like name@example.com.', 'jEmail');
      if (form.ageGroup === '15-17' && !form.parentConsent) return fail('Volunteers aged 15–17 need a parent or guardian to agree first. Tick the box once they have.', 'jConsent');
      return act(() => state.api.join(h.id, form), 'confirmJoin');
    };
  }
}

function fail(message, focusId) {
  const el = $('actionError');
  el.textContent = message;
  el.hidden = false;
  $(focusId)?.focus();
}

// Run a join/leave call and replace the hotspot with the server's version.
async function act(fn, buttonId) {
  const button = $(buttonId);
  button.disabled = true;
  $('actionError').hidden = true;
  try {
    const updated = await fn();
    if (updated) state.hotspots = state.hotspots.map((h) => (h.id === updated.id ? updated : h));
    state.joining = false;
    render();
  } catch (err) {
    button.disabled = false;
    fail(err.message, buttonId);
  }
}

function renderStats() {
  const free = state.hotspots.reduce((s, h) => s + Math.max(0, h.need - h.have), 0);
  const signed = state.hotspots.reduce((s, h) => s + h.have, 0);
  $('statOpen').textContent = state.hotspots.length;
  $('statSpots').textContent = free;
  $('statJoined').textContent = signed;
}

function renderCauses() {
  const el = $('causes');
  el.innerHTML = '';
  Object.entries(CATS).forEach(([k, c]) => {
    const n = state.hotspots.filter((h) => h.cat === k).length;
    const d = document.createElement('div');
    d.className = 'cause';
    d.innerHTML = `<span class="sq">${c.sq}</span><b>${c.en}</b><span class="count">${n}</span><p>${c.blurb}</p>`;
    el.appendChild(d);
  });
}

function renderChips() {
  const el = $('chips');
  el.innerHTML = '';
  [['all', 'All causes'], ...Object.entries(CATS).map(([k, c]) => [k, c.en])].forEach(([k, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(state.filterCat === k));
    b.onclick = () => {
      state.filterCat = k;
      dropHiddenSelection();
      render();
    };
    el.appendChild(b);
  });
}

const STATUS = { pending: 'Awaiting review', approved: 'Approved · now on the map', rejected: 'Not taken forward' };

function renderReports() {
  const ul = $('myreports');
  ul.innerHTML = '';
  state.reports.slice().reverse().forEach((r) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="status">${STATUS[r.status] || r.status} · ${esc(r.unit)}</div><div>${esc(r.desc)}</div>`;
    ul.appendChild(li);
  });
}

function renderMode() {
  const live = state.api.mode === 'live';
  $('mode').textContent = live ? 'Live' : 'Demo mode · sample data, saved in this browser only';
  $('mode').className = `modepill ${live ? 'live' : 'demo'}`;
}

function dropHiddenSelection() {
  if (state.selected && !visible().some((h) => h.id === state.selected)) state.selected = null;
}

function select(id) {
  state.selected = id;
  state.joining = false;
  render();
  if (id && window.matchMedia('(max-width:980px)').matches) $('detail').scrollIntoView({ block: 'nearest' });
}

function render() {
  renderChips();
  renderPins();
  renderList();
  renderDetail();
  renderStats();
  renderCauses();
  renderReports();
}

function setupReportForm() {
  const rUnit = $('rUnit');
  const rCat = $('rCat');
  UNITS.forEach((u) => rUnit.add(new Option(u.city ? 'Elbasan (city)' : u.name, u.name)));
  Object.entries(CATS).forEach(([k, c]) => rCat.add(new Option(c.en, k)));

  $('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('rMsg');
    const desc = $('rDesc').value.trim();
    if (desc.length < 10) {
      msg.textContent = 'Add a few more words so the youth office knows what and where exactly.';
      $('rDesc').focus();
      return;
    }
    const button = e.target.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      await state.api.report({ unit: rUnit.value, cat: rCat.value, desc, name: $('rName').value.trim() });
      state.reports = await state.api.myReports();
      e.target.reset();
      msg.textContent = state.api.mode === 'live'
        ? 'Report sent. It shows as a dashed pin on the map until the youth office reviews it.'
        : 'Report added. It shows as a dashed pin on the map (demo: stored in this browser only).';
      render();
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
}

async function start() {
  pinsEl = buildMap($('map'));
  $('urgency').addEventListener('change', (e) => {
    state.filterUrg = e.target.value;
    dropHiddenSelection();
    render();
  });
  setupReportForm();

  state.api = await connect();
  renderMode();
  try {
    state.hotspots = await state.api.listHotspots();
    state.reports = await state.api.myReports();
  } catch (err) {
    $('list').innerHTML = `<li class="empty">Couldn't load hotspots: ${esc(err.message)} Reload the page to try again.</li>`;
    return;
  }
  state.selected = state.hotspots.find((h) => h.urg === 'hi')?.id ?? null;
  render();
}

start();

import { CATS, URG } from './config.js';
import { request } from './api.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let token = '';
let hotspots = [];

function showError(message) {
  const el = $('adminError');
  el.textContent = message;
  el.hidden = !message;
}

function reportCard(r) {
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <div class="tags"><span class="pill">${esc(CATS[r.cat]?.en || r.cat)}</span><span class="pill">${esc(r.unit)}</span><span class="pill">${fmtDate(r.createdAt)}</span></div>
    <h3>${esc(r.desc)}</h3>
    ${r.name ? `<p class="meta">Reported by ${esc(r.name)}</p>` : ''}
    <form novalidate>
      <label class="wide">Title on the map<input name="title" required maxlength="100" placeholder="e.g. Clean-up behind Shirgjan school"></label>
      <label>When<input name="when" required maxlength="80" placeholder="Sat 17 Oct · 10:00–12:00"></label>
      <label>Meeting point<input name="meet" required maxlength="120"></label>
      <label>Volunteers needed<input name="need" type="number" min="1" max="500" value="10" required></label>
      <label>Urgency<select name="urg">${Object.entries(URG).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="wide">What to bring<input name="bring" maxlength="200"></label>
      <label class="wide">Description for volunteers<textarea name="desc" maxlength="600">${esc(r.desc)}</textarea></label>
      <p class="formerror wide" role="alert" hidden></p>
      <div class="formrow wide">
        <button class="btn sun" type="submit">Approve and publish</button>
        <button class="btn ghost small" type="button" data-reject>Reject</button>
      </div>
    </form>`;

  const form = card.querySelector('form');
  const err = card.querySelector('.formerror');
  const fail = (m) => { err.textContent = m; err.hidden = false; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.need = Number(body.need);
    try {
      await request(`api/admin/reports/${encodeURIComponent(r.id)}/approve`, { method: 'POST', body, token });
      await load();
    } catch (error) {
      fail(error.message);
    }
  });
  card.querySelector('[data-reject]').addEventListener('click', async () => {
    try {
      await request(`api/admin/reports/${encodeURIComponent(r.id)}/reject`, { method: 'POST', body: {}, token });
      await load();
    } catch (error) {
      fail(error.message);
    }
  });
  return card;
}

async function loadSignups() {
  const id = $('signupFilter').value;
  const { signups } = await request(`api/admin/signups${id ? `?hotspot=${encodeURIComponent(id)}` : ''}`, { token });
  const titles = Object.fromEntries(hotspots.map((h) => [h.id, h.title]));
  $('signups').innerHTML = signups.length
    ? signups.map((s) => `<tr><td>${esc(titles[s.hotspotId] || s.hotspotId)}</td><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${esc(s.ageGroup)}</td><td>${s.ageGroup === '15-17' ? (s.parentConsent ? 'Yes' : 'No') : '—'}</td><td>${fmtDate(s.createdAt)}</td></tr>`).join('')
    : '<tr><td colspan="6" class="wrap">No sign-ups through the platform yet.</td></tr>';
}

async function load() {
  const [{ reports }, list] = await Promise.all([
    request('api/admin/reports?status=pending', { token }),
    request('api/hotspots'),
  ]);
  hotspots = list.hotspots;

  $('pendingTitle').textContent = reports.length ? `${reports.length} waiting for review` : 'Nothing waiting for review';
  const box = $('reports');
  box.innerHTML = '';
  reports.forEach((r) => box.appendChild(reportCard(r)));

  const filter = $('signupFilter');
  const current = filter.value;
  filter.innerHTML = '<option value="">All actions</option>' + hotspots.map((h) => `<option value="${esc(h.id)}">${esc(h.title)}</option>`).join('');
  filter.value = current;
  await loadSignups();
  $('dashboard').hidden = false;
}

async function start() {
  let live = false;
  try {
    live = (await request('api/health')).mode === 'live';
  } catch {
    live = false;
  }
  $('mode').textContent = live ? 'Live' : 'Server not running. Start it with npm start to use the dashboard.';
  $('mode').className = `modepill ${live ? 'live' : 'demo'}`;
  if (!live) {
    $('tokenForm').hidden = true;
    return;
  }

  try {
    token = sessionStorage.getItem('ev-admin') || '';
  } catch {
    token = '';
  }
  $('token').value = token;

  $('tokenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    token = $('token').value.trim();
    try {
      await load();
      showError('');
      try { sessionStorage.setItem('ev-admin', token); } catch { /* storage blocked */ }
    } catch (error) {
      $('dashboard').hidden = true;
      showError(error.message);
    }
  });
  $('signupFilter').addEventListener('change', () => loadSignups().catch((error) => showError(error.message)));

  if (token) $('tokenForm').requestSubmit();
}

start();

import { ACTION_TYPES, AREAS, CATEGORIES, DEFAULT_SETTINGS, SOURCES } from '../config.js';
import { api, getConfig, session } from '../lib/api.js';
import { hotspotMarker, makeMap } from '../lib/map.js';
import {
  $, aiBox, ago, catTag, emptyState, fmtDate, html, icon, on, progress, raw, toast,
} from '../lib/ui.js';

const STAFF_KEY = 'greenelb-staff-token';
const root = document.getElementById('admin');
const SECTIONS = [
  ['overview', 'Overview', 'landmark'], ['review', 'Needs review', 'alert'], ['leaders', 'Leader confirmations', 'crown'],
  ['demand', 'Demand signals', 'users'], ['map', 'Map and hotspots', 'map'], ['news', 'News', 'message'], ['pickups', 'Pickup requests', 'trash'],
  ['indicators', 'Local Plan indicators', 'shield'], ['schools', 'Pilot schools', 'award'], ['surveys', 'Surveys', 'check'],
  ['rewards', 'Rewards', 'gift'], ['exports', 'Exports', 'download'], ['posters', 'QR posters', 'qr'], ['settings', 'Settings', 'refresh'],
];
let me = null;
let config = null;
let counts = {};

async function signIn() {
  root.innerHTML = html`<div class="signin">
    <span class="brand"><span class="mark">${icon('leaf', 18)}</span>GreenELB Admin</span>
    <h1>Municipality sign-in</h1>
    <form class="card" id="f"><label class="field"><span>Staff token</span><input type="password" id="token" autocomplete="current-password" required></label><p class="error" id="err" hidden></p><button class="btn" type="submit">Sign in</button></form>
    ${config?.demo ? html`<button class="btn light" type="button" id="demo">Demo: sign in as the Municipality</button>` : ''}
    <a href="/">Go to the youth app</a></div>`.toString();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/staff', { method: 'POST', body: { token: $('#token').value }, auth: false });
      session.token = r.token;
      start();
    } catch (ex) {
      $('#err').textContent = ex.message;
      $('#err').hidden = false;
    }
  };
  const demo = $('#demo');
  if (demo) {
    demo.onclick = async () => {
      const staff = config.demoUsers.find((u) => u.role === 'municipality');
      const r = await api('/api/auth/demo', { method: 'POST', body: { userId: staff.id }, auth: false });
      session.token = r.token;
      start();
    };
  }
}

function frame(active) {
  root.innerHTML = html`
    <nav class="side" aria-label="Admin sections">
      <span class="brand"><span class="mark">${icon('leaf', 18)}</span>GreenELB</span>
      ${SECTIONS.map(([k, label, ic]) => html`<a href="#${k}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 18)}${label}${counts[k] ? html`<span class="count">${counts[k]}</span>` : ''}</a>`)}
      <div class="foot">
        <span class="small">Demo · View as youth</span>
        ${config?.demo ? html`<select id="asYouth" aria-label="View as a demo youth account"><option value="">Choose a demo account…</option>${config.demoUsers.filter((u) => u.role === 'youth').map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select>` : html`<a href="/">Open the youth app</a>`}
        <button type="button" id="logout">Sign out</button>
      </div>
    </nav>
    <section class="content" id="content" tabindex="-1"></section>`.toString();
  const as = $('#asYouth');
  if (as) {
    as.onchange = async () => {
      if (!as.value) return;
      const r = await api('/api/auth/demo', { method: 'POST', body: { userId: as.value }, auth: false });
      try { localStorage.setItem(STAFF_KEY, session.token); } catch { /* ignore */ }
      session.token = r.token;
      location.href = '/';
    };
  }
  $('#logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    session.token = null;
    start();
  };
  return $('#content');
}

const bars = (obj, labels = {}) => {
  const max = Math.max(1, ...Object.values(obj));
  return html`<div class="stack">${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<div class="bar-row"><span>${labels[k] || k}</span>${progress(v, max)}<strong class="num">${v}</strong></div>`)}</div>`;
};
const catLabels = Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [k, c.label]));

// ---------------- sections ----------------

async function overview(el) {
  const d = await api('/api/admin/overview');
  const k = d.kpis;
  el.innerHTML = html`
    <div class="row between"><h1>Overview</h1><span class="tag ${d.ai.enabled ? 'ok' : 'alert'}">${icon('sparkles', 14)}${d.ai.enabled ? `AI on · ${d.ai.model}` : 'AI off · rule-based fallbacks'}</span></div>
    <div class="kpis">
      <div class="card"><span class="label">Active hotspots</span><b>${k.activeHotspots}</b></div>
      <div class="card"><span class="label">Sites discovered by youth</span><b>${k.newSitesByYouth}</b></div>
      <div class="card"><span class="label">Young people engaged</span><b>${k.youthEngaged}</b></div>
      <div class="card"><span class="label">Actions completed</span><b>${k.actionsCompleted}</b></div>
      <div class="card"><span class="label">Reports verified by AI</span><b>${k.aiVerifiedPct}%</b></div>
      <div class="card"><span class="label">kg collected</span><b>${k.kgCollected}</b></div>
    </div>
    <div class="cols">
      <div class="card"><h2>Hotspots</h2><div class="map" id="map"></div></div>
      <div class="stack lg"><div class="card"><h2>Hotspots by category</h2>${bars(d.byCategory, catLabels)}</div>
      <div class="card"><h2>Sign-ups by source</h2><p class="small muted">From ?src= on shared links and QR posters.</p>${bars(d.bySource)}</div></div>
    </div>
    <p class="small muted">All analytics are aggregated and anonymous.</p>`.toString();
  const m = makeMap($('#map', el), { zoom: 13 });
  d.hotspots.forEach((h) => hotspotMarker(h).bindPopup(`${h.title} · ${h.status}`).addTo(m));
}

async function review(el) {
  const d = await api('/api/admin/review');
  el.innerHTML = html`
    <h1>Needs review</h1>
    <div class="card"><h2>Reports waiting for confirmation (${d.reports.length})</h2>
      ${d.reports.length ? d.reports.map((h) => html`<div class="row" style="align-items:flex-start;gap:14px;border-top:1px solid #ECEAE2;padding-top:10px">
        <div class="thumb">${h.photoUrl ? html`<img src="${h.photoUrl}" alt="">` : ''}</div>
        <div class="stack" style="flex:1;gap:4px"><div class="row">${catTag(h.category)}<strong>${h.title}</strong></div><span class="small muted">${h.areaName} · reported by ${h.reporter} · ${ago(h.createdAt)} · ${h.confirmations} confirmations</span>
        ${h.aiReason ? aiBox(html`<p class="small">${h.aiConfidence}% · ${h.aiReason}</p>`) : ''}</div>
        <div class="row"><button class="btn sm" type="button" data-hotspot="${h.id}" data-ok="1">Approve</button><button class="btn sm light" type="button" data-hotspot="${h.id}" data-ok="0">Reject</button></div></div>`) : html`<p class="small muted">Nothing to review.</p>`}</div>
    <div class="card"><h2>Cleanups the AI could not confirm (${d.cleanups.length})</h2>
      ${d.cleanups.length ? d.cleanups.map((a) => html`<div class="row" style="align-items:flex-start;gap:14px;border-top:1px solid #ECEAE2;padding-top:10px">
        <div class="thumb">${a.beforeUrl ? html`<img src="${a.beforeUrl}" alt="Before">` : ''}</div><div class="thumb">${a.afterUrl ? html`<img src="${a.afterUrl}" alt="After">` : ''}</div>
        <div class="stack" style="flex:1;gap:4px"><strong>${a.title}</strong><span class="small muted">${a.areaName} · ${a.totalBags} bags · ${a.kgPlastic} kg plastic · ${a.kgOther} kg other</span>${a.cleanup ? aiBox(html`<p class="small">${a.cleanup.confidence}% · ${a.cleanup.reason}</p>`) : html`<p class="small muted">AI was unavailable.</p>`}</div>
        <div class="row"><button class="btn sm" type="button" data-cleanup="${a.id}" data-ok="1">Confirm clean</button><button class="btn sm light" type="button" data-cleanup="${a.id}" data-ok="0">Ask for a new photo</button></div></div>`) : html`<p class="small muted">Nothing to review.</p>`}</div>
    <div class="card"><h2>Data cards disputed or flagged (${d.dataCards.length})</h2>
      ${d.dataCards.length ? d.dataCards.map((c) => html`<div class="row" style="align-items:flex-start;gap:14px;border-top:1px solid #ECEAE2;padding-top:10px">
        <div class="thumb"><img src="${c.photoUrl}" alt=""></div>
        <div class="stack" style="flex:1;gap:4px"><strong>${c.name} · ${c.actionTitle}</strong><span class="small muted">${c.status}${c.aiCheck?.duplicate ? ' · possible duplicate photo' : ''}${c.aiCheck?.same_site === false ? ' · taken away from the site' : ''}${c.aiCheck?.same_time === false ? ' · taken before check-in' : ''}${c.leaderConfirmed === false ? ' · leader disagreed' : ''}</span></div>
        <div class="row"><button class="btn sm" type="button" data-card="${c.id}" data-ok="1">Accept</button><button class="btn sm light" type="button" data-card="${c.id}" data-ok="0">Reject</button></div></div>`) : html`<p class="small muted">Nothing to review.</p>`}</div>`.toString();
  const act = (sel, url) => on(el, 'click', sel, async (e, b) => {
    await api(url(b), { method: 'POST', body: { approve: b.dataset.ok === '1' } });
    toast('Saved.');
    route();
  });
  act('[data-hotspot]', (b) => `/api/admin/hotspots/${b.dataset.hotspot}/decision`);
  act('[data-cleanup]', (b) => `/api/admin/actions/${b.dataset.cleanup}/cleanup-decision`);
  act('[data-card]', (b) => `/api/admin/datacards/${b.dataset.card}/decision`);
}

async function leaders(el) {
  const d = await api('/api/admin/leaders');
  el.innerHTML = html`
    <h1>Leader confirmations</h1>
    <p class="muted">The AI ranks applicants by motivation, reliability, availability and distance, using anonymous ids. You confirm. If you don't respond within 24 hours of ranking, the top candidate is confirmed automatically. Rank 2 becomes the deputy.</p>
    ${d.actions.length ? d.actions.map((a) => html`<div class="card">
      <div class="row between wrap"><div class="row">${catTag(a.category)}<h2>${a.title}</h2></div><span class="small muted">${a.applicationsCloseAt ? `Applications close ${fmtDate(a.applicationsCloseAt)}` : ''}${a.autoConfirmAt ? ` · auto-confirm ${fmtDate(a.autoConfirmAt)}` : ''}</span></div>
      ${a.applications.length ? html`<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Applicant</th><th>AI score</th><th>Why</th><th>Motivation</th><th></th></tr></thead><tbody>
        ${a.applications.map((x) => html`<tr><td>${x.rank || '–'}</td><td><strong>${x.name}</strong><br><span class="small muted">${x.ageGroup} · ${x.area}</span></td><td class="num">${x.aiScore ?? '–'}</td><td style="max-width:280px">${x.aiReason || html`<span class="muted">Not ranked yet</span>`}${x.aiSource === 'rules' ? html`<br><span class="small muted">(rule-based)</span>` : ''}</td><td style="max-width:320px" class="small">${x.motivation}</td>
          <td>${x.rank ? html`<button class="btn sm ${x.rank === 1 ? '' : 'light'}" type="button" data-confirm="${a.id}" data-app="${x.id}">Confirm</button>` : ''}</td></tr>`)}
      </tbody></table></div>
      <button class="btn sm dark" type="button" data-rank="${a.id}" style="align-self:flex-start">${icon('sparkles', 16)} ${a.applications.some((x) => x.rank) ? 'Re-rank with AI' : 'Rank with AI now'}</button>` : html`<p class="small muted">No applications yet.</p>`}
    </div>`) : emptyState('crown', 'No actions are waiting for a leader.')}`.toString();
  on(el, 'click', '[data-rank]', async (e, b) => {
    b.disabled = true;
    b.textContent = 'Ranking…';
    try { await api(`/api/admin/actions/${b.dataset.rank}/rank`, { method: 'POST' }); } catch (ex) { toast(ex.message); }
    route();
  });
  on(el, 'click', '[data-confirm]', async (e, b) => {
    await api(`/api/admin/actions/${b.dataset.confirm}/confirm-leader`, { method: 'POST', body: { applicationId: b.dataset.app } });
    toast('Leader confirmed. Deputy assigned and everyone notified.');
    route();
  });
}

async function demand(el) {
  const d = await api('/api/admin/demand');
  el.innerHTML = html`<h1>Demand signals</h1><p class="muted">Young people who asked for an activity near them. You're alerted at ${d.threshold} requests.</p>
    ${d.demand.length ? html`<div class="table-wrap"><table><thead><tr><th>Area</th><th>Category</th><th>Requests</th><th></th></tr></thead><tbody>
      ${d.demand.map((x) => html`<tr><td>${x.area}</td><td>${catTag(x.category)}</td><td class="num"><strong>${x.count}</strong> ${x.count >= d.threshold ? html`<span class="tag alert">Threshold reached</span>` : ''}</td><td><a class="btn sm" href="#map?area=${encodeURIComponent(x.area)}&category=${x.category}">Create action</a></td></tr>`)}
    </tbody></table></div>` : emptyState('users', 'No requests yet.')}`.toString();
}

async function mapSection(el) {
  const [{ hotspots }, q] = [await api('/api/map', { auth: false }), new URLSearchParams(location.hash.split('?')[1] || '')];
  const areaOpts = (sel) => AREAS.map((a) => html`<option ${a.name === sel ? 'selected' : ''}>${a.name}</option>`);
  const catOpts = (sel) => Object.entries(CATEGORIES).map(([k, c]) => html`<option value="${k}" ${k === sel ? 'selected' : ''}>${c.label}</option>`);
  el.innerHTML = html`
    <h1>Map and hotspots</h1>
    <div class="cols">
      <div class="card"><p class="small muted">Click the map to set the location for a new hotspot or action.</p><div class="map" id="map"></div><p class="small" id="picked">No location picked: the area centre is used.</p></div>
      <div class="stack lg">
        <form class="card" id="actionForm"><h2>Create an action</h2><p class="small muted">It goes out as "Team leader wanted" to young people in that category and area.</p>
          <label class="field"><span>Hotspot (optional)</span><select name="hotspotId"><option value="">None</option>${hotspots.filter((h) => h.status !== 'cleaned' && !h.actionId).map((h) => html`<option value="${h.id}">${h.title}</option>`)}</select></label>
          <label class="field"><span>Title</span><input type="text" name="title" required maxlength="100"></label>
          <div class="grid2"><label class="field"><span>Category</span><select name="category">${catOpts(q.get('category'))}</select></label>
          <label class="field"><span>Type</span><select name="type">${Object.entries(ACTION_TYPES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
          <label class="field"><span>Area</span><select name="areaName">${areaOpts(q.get('area'))}</select></label>
          <label class="field"><span>Volunteers needed</span><input type="number" name="requiredVolunteers" value="10" min="2" max="100"></label>
          <label class="field"><span>Duration (hours)</span><input type="number" name="durationHours" value="3" min="0.5" step="0.5"></label>
          <label class="field"><span>Points</span><input type="number" name="pointsReward" value="50" min="0"></label></div>
          <label class="field"><span>Description</span><textarea name="description" required maxlength="800"></textarea></label>
          <label class="field"><span>Tools (comma separated)</span><input type="text" name="tools" value="Gloves, Bags"></label>
          <button class="btn" type="submit">Publish leader call</button></form>
        <form class="card" id="hotspotForm"><h2>Add a hotspot</h2>
          <label class="field"><span>Title</span><input type="text" name="title" required maxlength="100"></label>
          <div class="grid2"><label class="field"><span>Category</span><select name="category">${catOpts()}</select></label><label class="field"><span>Area</span><select name="areaName">${areaOpts()}</select></label>
          <label class="field"><span>Priority</span><select name="priority"><option>high</option><option selected>medium</option><option>low</option></select></label></div>
          <label class="field"><span>Description</span><textarea name="description" maxlength="400"></textarea></label>
          <button class="btn light" type="submit">Add hotspot</button></form>
      </div></div>`.toString();
  const m = makeMap($('#map', el), { zoom: 13 });
  hotspots.forEach((h) => hotspotMarker(h).bindPopup(h.title).addTo(m));
  let picked = null;
  let pin = null;
  m.on('click', (e) => {
    picked = { lat: e.latlng.lat, lng: e.latlng.lng };
    pin?.remove();
    pin = window.L.circleMarker(e.latlng, { radius: 9, color: '#E07A2E', weight: 3 }).addTo(m);
    $('#picked', el).textContent = `Location: ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`;
  });
  $('#actionForm', el).onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.tools = b.tools.split(',').map((s) => s.trim()).filter(Boolean);
    if (!b.hotspotId) delete b.hotspotId;
    try {
      await api('/api/admin/actions', { method: 'POST', body: { ...b, ...(picked || {}) } });
      toast('Leader call published.');
      e.target.reset();
    } catch (ex) { toast(ex.message); }
  };
  $('#hotspotForm', el).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/hotspots', { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), ...(picked || {}) } });
      toast('Hotspot added.');
      route();
    } catch (ex) { toast(ex.message); }
  };
}

async function news(el) {
  const { news: list } = await api('/api/admin/news');
  const pending = list.filter((n) => !n.approved);
  let cards = null;
  el.innerHTML = html`
    <h1>News</h1>
    <div class="cols">
      <form class="card" id="newsForm"><h2>Publish</h2>
        <div class="grid2"><label class="field"><span>Type</span><select name="type"><option value="info">Info</option><option value="initiative">Initiative</option><option value="opportunity">Opportunity</option></select></label>
        <label class="field"><span>Category</span><select name="category"><option value="">All</option>${Object.entries(CATEGORIES).map(([k, c]) => html`<option value="${k}">${c.label}</option>`)}</select></label></div>
        <label class="field"><span>Title</span><input type="text" name="title" required maxlength="120"></label>
        <label class="field"><span>Text</span><textarea name="body" required maxlength="2000"></textarea></label>
        <label class="check"><input type="checkbox" name="important"> Important: notify everyone (bypasses the daily limit)</label>
        <button class="btn" type="submit">Publish</button></form>
      <div class="stack lg">
        <div class="card"><h2>AI document summary</h2><p class="small muted">Upload a PDF (Albanian is fine). The AI turns it into 5 English cards for young people. Check them before publishing.</p>
          <input type="file" id="pdf" accept="application/pdf" aria-label="PDF document"><button class="btn sm dark" type="button" id="summarize">${icon('sparkles', 16)} Summarize</button><div id="cards"></div></div>
        <div class="card"><h2>Partner proposals (${pending.length})</h2>${pending.length ? pending.map((n) => html`<div class="stack" style="border-top:1px solid #ECEAE2;padding-top:10px;gap:4px"><strong>${n.title}</strong><span class="small muted">${n.authorOrg} · ${ago(n.createdAt)}</span><p class="small">${n.body}</p><div class="row"><button class="btn sm" type="button" data-approve="${n.id}" data-ok="1">Approve</button><button class="btn sm light" type="button" data-approve="${n.id}" data-ok="0">Decline</button></div></div>`) : html`<p class="small muted">None waiting.</p>`}
          <form class="row" id="partnerForm"><input type="text" name="org" placeholder="Partner organisation name" required aria-label="Partner organisation"><button class="btn sm light" type="submit">Create partner login</button></form><p class="small" id="partnerCode"></p></div>
      </div></div>
    <div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Title</th><th>By</th><th>Status</th></tr></thead><tbody>${list.map((n) => html`<tr><td>${ago(n.createdAt)}</td><td>${n.type}</td><td>${n.title}${n.important ? html` <span class="tag alert">Important</span>` : ''}</td><td>${n.authorOrg}</td><td>${n.approved ? 'Published' : 'Pending'}</td></tr>`)}</tbody></table></div>`.toString();
  $('#newsForm', el).onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.important = b.important === 'on';
    if (!b.category) delete b.category;
    await api('/api/admin/news', { method: 'POST', body: b });
    toast('Published.');
    route();
  };
  on(el, 'click', '[data-approve]', async (e, b) => {
    await api(`/api/admin/news/${b.dataset.approve}/approve`, { method: 'POST', body: { approve: b.dataset.ok === '1' } });
    route();
  });
  $('#partnerForm', el).onsubmit = async (e) => {
    e.preventDefault();
    const r = await api('/api/admin/partners', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    $('#partnerCode', el).innerHTML = html`Login code for <strong>${r.partner.org}</strong>: <strong>${r.code}</strong>. Send it to them privately; they sign in at ${location.origin}/welcome and can then propose news.`.toString();
  };
  $('#summarize', el).onclick = async () => {
    const file = $('#pdf', el).files[0];
    if (!file) return toast('Choose a PDF first.');
    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    $('#cards', el).innerHTML = '<p class="small muted">Reading the document…</p>';
    try {
      ({ cards } = await api('/api/admin/news/summarize', { method: 'POST', body: { pdf: dataUrl } }));
      $('#cards', el).innerHTML = html`<form class="stack" id="cardsForm"><label class="field"><span>Title</span><input type="text" name="title" value="${file.name.replace(/\.pdf$/i, '')} in 5 cards"></label>
        ${cards.map((c, i) => html`<div class="card soft"><input type="text" name="t${i}" value="${c.title}" aria-label="Card ${i + 1} title"><textarea name="b${i}" aria-label="Card ${i + 1} text">${c.body}</textarea></div>`)}
        <button class="btn" type="submit">Publish as AI summary</button></form>`.toString();
      $('#cardsForm', el).onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api('/api/admin/news', { method: 'POST', body: { type: 'ai_summary', title: fd.get('title'), body: 'Summarized by AI and checked by the municipality.', cards: cards.map((_, i) => ({ title: fd.get(`t${i}`), body: fd.get(`b${i}`) })) } });
        toast('Published.');
        route();
      };
    } catch (ex) { $('#cards', el).innerHTML = html`<p class="error">${ex.message}</p>`.toString(); }
  };
}

async function pickups(el) {
  const { pickups: list } = await api('/api/admin/pickups');
  el.innerHTML = html`<h1>Pickup requests</h1><p class="muted">Created automatically when a team finishes an action. Share with the cleaning company.</p>
    ${list.length ? html`<div class="table-wrap"><table><thead><tr><th>Requested</th><th>Action</th><th>Area</th><th>Location</th><th>Bags</th><th>kg</th><th>Status</th></tr></thead><tbody>
      ${list.map((p) => html`<tr><td>${fmtDate(p.requestedAt)}</td><td>${p.actionTitle}</td><td>${p.areaName}</td><td><a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}" target="_blank" rel="noopener">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</a></td><td class="num">${p.bags}</td><td class="num">${p.kg}</td>
        <td><select data-pickup="${p.id}" aria-label="Pickup status">${['requested', 'scheduled', 'collected'].map((s) => html`<option ${p.status === s ? 'selected' : ''}>${s}</option>`)}</select></td></tr>`)}</tbody></table></div>` : emptyState('trash', 'No pickups yet.')}`.toString();
  on(el, 'change', '[data-pickup]', async (e, s) => { await api(`/api/admin/pickups/${s.dataset.pickup}/status`, { method: 'POST', body: { status: s.value } }); toast('Updated.'); });
}

async function indicators(el) {
  const d = await api('/api/admin/indicators');
  el.innerHTML = html`<h1>Local Plan 2025–2030 indicators</h1>
    <div class="cols3">
      <div class="card"><span class="label">Territory cleanliness</span><b class="hero-num">${d.cleanliness.pct}%</b>${progress(d.cleanliness.cleaned, d.cleanliness.total, 'lg')}<p class="small muted">${d.cleanliness.cleaned} of ${d.cleanliness.total} hotspots cleaned</p></div>
      <div class="card"><span class="label">Public satisfaction</span><b class="hero-num">${d.satisfaction.average ?? '–'}<span class="small muted"> / 5</span></b><p class="small muted">${d.satisfaction.responses} survey responses</p></div>
      <div class="card"><span class="label">Quarterly assessment</span><p><strong>${d.quarterly}</strong></p><a class="small" href="#settings">Edit in settings</a></div>
    </div>`.toString();
}

async function schools(el) {
  const { schools: list } = await api('/api/admin/schools');
  el.innerHTML = html`<h1>Pilot schools leaderboard</h1><div class="table-wrap"><table><thead><tr><th>#</th><th>School</th><th>Students on GreenELB</th><th>Points</th></tr></thead><tbody>
    ${list.map((s, i) => html`<tr><td>${i + 1}</td><td><strong>${s.school}</strong></td><td class="num">${s.students}</td><td class="num"><strong>${s.points}</strong></td></tr>`)}</tbody></table></div>`.toString();
}

async function surveys(el) {
  const { surveys: list } = await api('/api/admin/surveys');
  const qs = [{ kind: 'rating', text: '' }];
  function draw() {
    el.innerHTML = html`<h1>Surveys</h1>
      <div class="cols">
        <form class="card" id="sf"><h2>New survey</h2>
          <label class="field"><span>Title</span><input type="text" id="stitle" required maxlength="120"></label>
          <label class="check"><input type="checkbox" id="ssat"> Counts toward "public satisfaction" (uses the first rating question)</label>
          ${qs.map((q, i) => html`<div class="card soft"><div class="grid2"><select data-kind="${i}" aria-label="Question type">${['rating', 'choice', 'text'].map((k) => html`<option ${q.kind === k ? 'selected' : ''}>${k}</option>`)}</select><button class="btn sm light" type="button" data-del="${i}">Remove</button></div>
            <input type="text" data-text="${i}" value="${q.text}" placeholder="Question" aria-label="Question ${i + 1}">
            ${q.kind === 'choice' ? html`<input type="text" data-opts="${i}" value="${(q.options || []).join(', ')}" placeholder="Options, comma separated" aria-label="Options">` : ''}</div>`)}
          <button class="btn sm light" type="button" id="addq">${icon('plus', 16)} Add question</button>
          <button class="btn" type="submit">Publish survey</button></form>
        <div class="stack lg">${list.map((s) => html`<div class="card"><div class="row between"><h2>${s.title}</h2><span class="small muted">${s.responses} responses${s.open ? '' : ' · closed'}</span></div>
          ${s.questions.map((q, i) => {
    const r = s.results[i];
    return html`<div class="stack" style="gap:4px"><strong class="small">${q.text}</strong>${q.kind === 'rating' ? html`<p>Average <strong>${r.average ?? '–'}</strong> / 5 (${r.count})</p>` : q.kind === 'choice' ? bars(r.counts) : html`<ul class="small">${r.answers.map((a) => html`<li>${a}</li>`)}</ul>`}</div>`;
  })}
          ${s.open ? html`<button class="btn sm light" type="button" data-close="${s.id}">Close survey</button>` : ''}</div>`)}</div></div>`.toString();
  }
  const sync = () => {
    el.querySelectorAll('[data-text]').forEach((i) => { qs[i.dataset.text].text = i.value; });
    el.querySelectorAll('[data-opts]').forEach((i) => { qs[i.dataset.opts].options = i.value.split(',').map((s) => s.trim()).filter(Boolean); });
  };
  on(el, 'change', '[data-kind]', (e, s) => { sync(); qs[s.dataset.kind].kind = s.value; draw(); });
  on(el, 'click', '[data-del]', (e, b) => { sync(); qs.splice(Number(b.dataset.del), 1); draw(); });
  on(el, 'click', '#addq', () => { sync(); qs.push({ kind: 'choice', text: '', options: [] }); draw(); });
  on(el, 'click', '[data-close]', async (e, b) => { await api(`/api/admin/surveys/${b.dataset.close}/close`, { method: 'POST' }); route(); });
  on(el, 'submit', '#sf', async (e) => {
    e.preventDefault();
    sync();
    try {
      await api('/api/admin/surveys', { method: 'POST', body: { title: $('#stitle', el).value, satisfaction: $('#ssat', el).checked, questions: qs } });
      toast('Survey published.');
      route();
    } catch (ex) { toast(ex.message); }
  });
  draw();
}

async function rewards(el) {
  const d = await api('/api/admin/rewards');
  el.innerHTML = html`<h1>Rewards · Green Fund</h1><p class="muted">Vouchers, not cash. Users can redeem up to ${d.monthlyCap} per month (change it in settings).</p>
    <div class="cols"><div class="table-wrap"><table><thead><tr><th>Reward</th><th>Cost</th><th>Redeemed</th><th>Enabled</th></tr></thead><tbody>
      ${d.rewards.map((r) => html`<tr><td><strong>${r.title}</strong><br><span class="small muted">${r.description}</span></td><td><input type="number" data-cost="${r.id}" value="${r.costPoints}" min="10" style="width:90px" aria-label="Cost in points"></td><td class="num">${r.redeemed}</td><td><input type="checkbox" data-enable="${r.id}" ${r.enabled ? 'checked' : ''} aria-label="Enabled"></td></tr>`)}</tbody></table></div>
      <div class="stack lg"><form class="card" id="rf"><h2>Add a reward</h2><label class="field"><span>Title</span><input type="text" name="title" required></label><label class="field"><span>Description</span><input type="text" name="description"></label><label class="field"><span>Cost (points)</span><input type="number" name="costPoints" value="100" min="10"></label><label class="check"><input type="checkbox" name="enabled"> Enabled</label><button class="btn" type="submit">Add</button></form>
      <div class="card"><h2>Recent redemptions</h2>${d.redemptions.length ? d.redemptions.map((x) => html`<p class="small">${x.name} · ${x.title} · <strong>${x.voucherCode}</strong> · ${ago(x.createdAt)}</p>`) : html`<p class="small muted">None yet.</p>`}</div></div></div>`.toString();
  on(el, 'change', '[data-enable]', async (e, i) => { await api(`/api/admin/rewards/${i.dataset.enable}`, { method: 'PATCH', body: { enabled: i.checked } }); toast('Saved.'); });
  on(el, 'change', '[data-cost]', async (e, i) => { await api(`/api/admin/rewards/${i.dataset.cost}`, { method: 'PATCH', body: { costPoints: Number(i.value) } }); toast('Saved.'); });
  $('#rf', el).onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.enabled = b.enabled === 'on';
    b.costPoints = Number(b.costPoints);
    await api('/api/admin/rewards', { method: 'POST', body: b });
    route();
  };
}

async function exportsSection(el) {
  el.innerHTML = html`<h1>Exports</h1><div class="card"><h2>Team data cards (CSV)</h2><p class="small muted">One row per completed action: date, location, participants, kg plastic and non-plastic, top items. Columns follow citizen-science cleanup reporting (REMEDIES / International Coastal Cleanup style).</p><button class="btn" type="button" id="csv">${icon('download', 18)} Download CSV</button></div>`.toString();
  $('#csv', el).onclick = async () => {
    const res = await fetch('/api/admin/export/datacards.csv', { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) return toast('Export failed.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = 'greenelb-team-data-cards.csv';
    a.click();
  };
}

async function posters(el) {
  const { actions } = await api('/api/actions', { auth: false });
  el.innerHTML = html`<h1>QR posters</h1><p class="muted no-print">For schools, partner cafés and hotspot signs. Each QR carries its source, so you can see sign-ups by source in the overview.</p>
    <form class="card no-print row wrap" id="pf" style="align-items:flex-end">
      <label class="field"><span>Place</span><select name="src">${SOURCES.filter((s) => ['school', 'cafe', 'hotspot', 'poster'].includes(s)).map((s) => html`<option>${s}</option>`)}</select></label>
      <label class="field" style="flex:1"><span>Links to</span><select name="target"><option value="/">Sign-up page</option>${actions.map((a) => html`<option value="/action/${a.id}">${a.title}</option>`)}</select></label>
      <button class="btn" type="submit">Make poster</button><button class="btn light" type="button" id="print">Print</button></form>
    <div id="poster"></div>`.toString();
  $('#pf', el).onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const url = new URL(fd.get('target'), location.origin);
    url.searchParams.set('src', fd.get('src'));
    const action = actions.find((a) => fd.get('target').endsWith(a.id));
    $('#poster', el).innerHTML = html`<div class="poster"><span class="brand"><span class="mark">${icon('leaf', 18)}</span>GreenELB</span>
      <h2>${fd.get('src') === 'hotspot' ? 'This spot needs you. Scan to help.' : action ? action.title : 'Clean up Elbasan. Get recognized for it.'}</h2>
      <div class="qrbox" id="posterQr"></div><p class="small">${url.toString()}</p><p class="small muted">Municipality of Elbasan · for young people aged 16–29</p></div>`.toString();
    // eslint-disable-next-line no-new
    new window.QRCode($('#posterQr', el), { text: url.toString(), width: 480, height: 480, colorDark: '#16231C', colorLight: '#FFFFFF' });
  };
  $('#print', el).onclick = () => window.print();
}

async function settingsSection(el) {
  const { settings } = await api('/api/admin/settings');
  const labels = {
    leader_min_age: 'Team leader minimum age (under this, an adult supervisor is required)', verify_high: 'AI confidence to publish a report immediately', verify_low: 'AI confidence below which a report is rejected',
    cleanup_confidence: 'AI confidence to accept a cleanup', duplicate_radius_m: 'Duplicate report radius (m)', confirm_radius_m: 'Confirmation radius (m)', confirmations_needed: 'Confirmations to verify a report',
    checkin_radius_m: 'Check-in radius (m)', required_volunteers: 'Default volunteers per action', application_window_h: 'Leader application window (hours)', auto_confirm_h: 'Auto-confirm top leader after (hours)',
    reporter_offer_h: 'Reporter leader offer (hours)', notification_daily_cap: 'Non-urgent notifications per user per day', notification_radius_km: 'Notification radius (km)', demand_threshold: 'Demand signal threshold',
    reward_monthly_cap: 'Rewards per user per month', quarterly_assessment: 'Quarterly assessment status',
  };
  el.innerHTML = html`<h1>Settings</h1><form class="card" id="sf"><div class="cols">${Object.keys(DEFAULT_SETTINGS).map((k) => html`<label class="field"><span>${labels[k] || k}</span><input type="${typeof DEFAULT_SETTINGS[k] === 'number' ? 'number' : 'text'}" name="${k}" value="${settings[k]}" ${typeof DEFAULT_SETTINGS[k] === 'number' ? raw('step="any"') : ''}></label>`)}</div><button class="btn" type="submit">Save settings</button></form>`.toString();
  $('#sf', el).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
      toast('Settings saved.');
    } catch (ex) { toast(ex.message); }
  };
}

const HANDLERS = {
  overview, review, leaders, demand, map: mapSection, news, pickups, indicators, schools, surveys, rewards, exports: exportsSection, posters, settings: settingsSection,
};

async function route() {
  const key = (location.hash.slice(1).split('?')[0]) || 'overview';
  const el = frame(HANDLERS[key] ? key : 'overview');
  el.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try {
    await (HANDLERS[key] || overview)(el);
  } catch (ex) {
    el.innerHTML = emptyState('alert', ex.message).toString();
  }
}

async function loadCounts() {
  try {
    const r = await api('/api/admin/review');
    counts = { review: r.reports.length + r.cleanups.length + r.dataCards.length };
    const l = await api('/api/admin/leaders');
    counts.leaders = l.actions.filter((a) => a.applications.some((x) => x.rank)).length || '';
  } catch { counts = {}; }
}

async function start() {
  config = await getConfig().catch(() => ({ demo: false, demoUsers: [] }));
  me = session.token ? (await api('/api/me').catch(() => null))?.user : null;
  if (!me || me.role !== 'municipality') return signIn();
  await loadCounts();
  route();
}

window.addEventListener('hashchange', route);
start();

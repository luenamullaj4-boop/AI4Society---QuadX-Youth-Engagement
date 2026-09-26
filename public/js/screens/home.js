import { CATEGORIES } from '../config.js';
import { api } from '../lib/api.js';
import { LEGEND, hotspotMarker, makeMap } from '../lib/map.js';
import {
  $, CAT_ICON, aiBox, ago, catTag, emptyState, html, icon, on, statusTag, toast,
} from '../lib/ui.js';
import { actionCard } from './common.js';

const NEWS_LABEL = { initiative: 'Initiative', opportunity: 'Opportunity', info: 'Info', ai_summary: 'AI summary', leader_call: 'Team leader wanted', volunteer_call: 'Volunteers wanted' };

function newsItem(n) {
  let button = '';
  if (n.type === 'leader_call' && n.actionId) button = html`<a class="btn sm" href="/action/${n.actionId}/apply-leader">${icon('crown', 16)} Apply as team leader</a>`;
  else if (n.type === 'volunteer_call' && n.actionId) button = html`<a class="btn sm" href="/action/${n.actionId}">${icon('users', 16)} Join as volunteer</a>`;
  else if (n.actionId) button = html`<a class="btn sm ghost" href="/action/${n.actionId}">See the action</a>`;
  return html`<article class="card">
    <div class="row between wrap"><span class="label">${NEWS_LABEL[n.type] || n.type}${n.important ? ' · Important' : ''}</span><span class="small muted">${ago(n.createdAt)}</span></div>
    <div class="row wrap">${n.category ? catTag(n.category) : ''}<span class="small muted">${n.authorOrg || ''}</span></div>
    <h3>${n.title}</h3>
    ${n.type === 'ai_summary' && n.cards ? html`${aiBox(html`<p class="small">${n.body}</p>`)}<div class="stack">${n.cards.map((c, i) => html`<div class="card soft" style="padding:12px"><p class="label">Card ${i + 1} of ${n.cards.length}</p><strong>${c.title}</strong><p class="small">${c.body}</p></div>`)}</div>` : html`<p>${n.body}</p>`}
    ${button}
  </article>`;
}

export async function home(view, { me, isCurrent }) {
  const data = await api('/api/me/home');
  if (!isCurrent()) return;
  let filter = 'all';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  function draw() {
    const pass = (n) => filter === 'all' || n.category === filter || (!n.category && filter === 'all');
    const recs = data.recommended.filter((a) => filter === 'all' || a.category === filter);
    const mine = data.news.filter(pass);
    const more = data.moreNews.filter(pass);
    view.innerHTML = html`
      <div class="row between"><div><p class="muted">${greeting},</p><h1>${me.showRealName && me.displayName ? me.displayName : me.nickname}</h1></div><a class="stat" href="/profile" style="text-align:right;text-decoration:none;color:inherit"><b class="num">${me.points}</b><span>points</span></a></div>
      <div class="card row" style="gap:12px"><span class="brand"><span class="mark">${icon('landmark', 18)}</span></span><div><strong>Municipality of Elbasan</strong><p class="small muted row" style="gap:4px">${icon('check', 14)} Official account</p></div></div>
      <a class="card dark link" href="/map">
        <div class="row between"><span class="label">Digital map</span>${icon('map', 22)}</div>
        <p class="hero-num" style="color:#fff">${data.counts.hotspots} hotspots</p>
        <p class="muted">${data.counts.near} near you in ${me.area}</p>
      </a>
      <div class="chips" role="group" aria-label="Filter by category">
        <button class="chip" type="button" data-f="all" aria-pressed="${filter === 'all'}">All</button>
        ${Object.entries(CATEGORIES).map(([k, c]) => html`<button class="chip" type="button" data-f="${k}" aria-pressed="${filter === k}">${icon(CAT_ICON[k], 16)}${c.label}</button>`)}
      </div>
      <div class="section-title"><h2>Recommended for you</h2></div>
      ${recs.length ? html`<div class="stack">${recs.map((a) => actionCard(a, { reason: a.reason, source: a.reasonSource }))}</div>` : html`<div class="card dashed">${emptyState('flag', 'No actions near you yet. Report a hotspot!', html`<a class="btn" href="/report">${icon('camera', 18)} Report a hotspot</a>`)}</div>`}
      ${data.demand && (filter === 'all' || filter === data.demand.category) ? html`<div class="card soft">
        <p>No ${CATEGORIES[data.demand.category].label} activity near you yet. Want to be notified?</p>
        <button class="btn sm" type="button" id="interest" ${data.demand.asked ? 'disabled' : ''}>${data.demand.asked ? "You'll be notified" : "I'm interested"}</button></div>` : ''}
      ${data.surveys.map((s) => html`<a class="card link soft" href="/profile#survey-${s.id}"><span class="label">Survey</span><strong>${s.title}</strong><span class="small">It takes 30 seconds.</span></a>`)}
      <div class="section-title"><h2>From the municipality</h2></div>
      ${mine.length ? html`<div class="stack">${mine.map(newsItem)}</div>` : html`<p class="muted">Nothing new in your categories.</p>`}
      ${more.length ? html`<div class="section-title"><h2>More initiatives</h2></div><div class="stack">${more.map(newsItem)}</div>` : ''}`.toString();
    const btn = $('#interest', view);
    if (btn) {
      btn.onclick = async () => {
        await api('/api/me/interest', { method: 'POST', body: { category: data.demand.category } });
        data.demand.asked = true;
        toast("Thanks! We'll let the municipality know.");
        draw();
      };
    }
  }
  on(view, 'click', '[data-f]', (e, b) => { filter = b.dataset.f; draw(); });
  draw();
}

export async function map(view, { me, isCurrent }) {
  const [{ hotspots }, home] = await Promise.all([api('/api/map', { auth: false }), me?.role === 'youth' ? api('/api/me/home').catch(() => null) : null]);
  if (!isCurrent()) return;
  let filter = 'all';
  view.innerHTML = html`
    <div class="row between"><h1>Digital map</h1><a class="btn sm" href="/report">${icon('camera', 16)} Report</a></div>
    <div class="chips" role="group" aria-label="Filter by category">
      <button class="chip" type="button" data-f="all" aria-pressed="true">All</button>
      ${Object.entries(CATEGORIES).map(([k, c]) => html`<button class="chip" type="button" data-f="${k}" aria-pressed="false">${icon(CAT_ICON[k], 16)}${c.label}</button>`)}
    </div>
    <div class="map" id="map" role="application" aria-label="Map of environmental hotspots in Elbasan"></div>
    <div class="legend">${LEGEND.map(([cls, label]) => html`<span><i class="pin ${cls}" style="display:inline-block;vertical-align:-3px"></i> ${label}</span>`)}</div>
    <div id="selected"></div>
    ${home?.recommended?.length ? html`<div class="section-title"><h2>Recommended for you</h2></div><div class="stack">${home.recommended.map((a) => actionCard(a, { reason: a.reason, source: a.reasonSource }))}</div>` : ''}`.toString();

  const m = makeMap($('#map', view));
  const layer = window.L.layerGroup().addTo(m);
  const selected = $('#selected', view);

  function showHotspot(h) {
    const canConfirm = h.status === 'needs_confirmation' && me?.role === 'youth';
    selected.innerHTML = html`<div class="card">
      ${h.photoUrl ? html`<div class="photo"><img src="${h.photoUrl}" alt="Photo of ${h.title}" loading="lazy"></div>` : ''}
      <div class="row between wrap">${catTag(h.category)}${statusTag(h.status)}</div>
      <h3>${h.title}</h3>
      <p class="small muted">${h.areaName} · ${h.source === 'youth' ? 'Reported by a young person' : 'Municipality hotspot'}${h.confirmations ? ` · ${h.confirmations} confirmation${h.confirmations === 1 ? '' : 's'}` : ''}</p>
      ${h.description ? html`<p>${h.description}</p>` : ''}
      ${h.aiReason ? aiBox(html`<p class="small">${h.aiReason}</p>`) : ''}
      <div class="row wrap">
        ${h.actionId ? html`<a class="btn sm" href="/action/${h.actionId}">See the action</a>` : ''}
        ${canConfirm ? html`<a class="btn sm orange" href="/report?confirm=${h.id}">${icon('camera', 16)} Confirm with a photo</a>` : ''}
      </div></div>`.toString();
    selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function drawPins() {
    layer.clearLayers();
    hotspots.filter((h) => filter === 'all' || h.category === filter).forEach((h) => {
      hotspotMarker(h).on('click', () => showHotspot(h)).addTo(layer);
    });
  }
  on(view, 'click', '[data-f]', (e, b) => {
    filter = b.dataset.f;
    view.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawPins();
  });
  drawPins();
  if (!hotspots.length) selected.innerHTML = emptyState('pin', 'No hotspots yet. Report the first one!').toString();
}

import { ACTION_TYPES } from '../config.js';
import { aiBox, catTag, fmtDate, html, icon, progress, statusTag } from '../lib/ui.js';

export function bestOption(a) {
  return a.options?.reduce((best, o) => (!best || o.count > best.count ? o : best), null) || null;
}

export function actionCard(a, { reason = null, source = null } = {}) {
  const opt = a.confirmedOptionId ? a.options.find((o) => o.id === a.confirmedOptionId) : bestOption(a);
  return html`<a class="card link" href="/action/${a.id}">
    <div class="row between wrap">${catTag(a.category)}${statusTag(a.status)}</div>
    <h3>${a.title}</h3>
    <div class="row wrap small muted" style="gap:12px">
      <span class="row" style="gap:4px">${icon('pin', 16)}${a.areaName || ''}</span>
      <span class="row" style="gap:4px">${icon('clock', 16)}${a.durationHours} h</span>
      <span>${ACTION_TYPES[a.type] || ''}</span>
    </div>
    ${opt ? html`<div class="stack" style="gap:4px"><div class="row between small"><span>${fmtDate(opt.startsAt)}</span><span class="num"><strong>${opt.count}/${a.requiredVolunteers}</strong> volunteers</span></div>${progress(opt.count, a.requiredVolunteers)}</div>` : ''}
    ${reason ? aiBox(html`<p class="small">${reason}</p>`, source) : ''}
  </a>`;
}

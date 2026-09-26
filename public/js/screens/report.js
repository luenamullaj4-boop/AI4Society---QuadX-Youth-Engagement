import { AREAS, CATEGORIES, PROBLEM_TYPES } from '../config.js';
import { api } from '../lib/api.js';
import { demoHere, takePhoto } from '../lib/device.js';
import {
  $, CAT_ICON, aiBox, catTag, html, icon, on, statusTag, toast,
} from '../lib/ui.js';

const STAGES = ['Reported', 'AI verification', 'Action', 'Cleaned'];
const stageOf = (status, actionStatus) => {
  if (status === 'cleaned') return 4;
  if (actionStatus) return 3;
  if (['ai_verified', 'verified'].includes(status)) return 3;
  if (status === 'needs_confirmation') return 2;
  return 1;
};
const statusLine = (n) => html`<div class="statusline">${STAGES.map((s, i) => html`<div class="${i < n ? 'on' : ''}">${s}</div>`)}</div>`;

export function demoLocationPicker(config, { label = 'Demo: pretend I am at' } = {}) {
  if (!config?.demo) return '';
  return html`<div class="card dashed small">
    <label class="check"><input type="checkbox" id="demoHere" ${demoHere.on ? 'checked' : ''}> Demo mode: use a location in Elbasan instead of my GPS</label>
    <label class="field"><span>${label}</span><select id="demoArea">${AREAS.map((a) => html`<option>${a.name}</option>`)}</select></label>
  </div>`;
}
export function bindDemoPicker(view) {
  const box = $('#demoHere', view);
  if (box) box.onchange = () => { demoHere.on = box.checked; };
  return () => {
    const sel = $('#demoArea', view);
    return sel ? AREAS.find((a) => a.name === sel.value) : null;
  };
}

export async function report(view, { me, config, go, isCurrent }) {
  const confirmId = new URLSearchParams(location.search).get('confirm');
  const hotspot = confirmId ? (await api(`/api/hotspots/${confirmId}`, { auth: false })).hotspot : null;
  const mine = (await api('/api/reports/mine')).reports;
  if (!isCurrent()) return;
  const f = { photo: null, category: hotspot?.category || me.categories[0] || 'waste', problemType: hotspot?.problemType || 'illegal_dump', description: '' };

  function draw() {
    view.innerHTML = html`
      <h1>${hotspot ? 'Confirm a report' : 'Report a hotspot'}</h1>
      ${statusLine(1)}
      ${hotspot ? html`<div class="card"><div class="row between">${catTag(hotspot.category)}${statusTag(hotspot.status)}</div><strong>${hotspot.title}</strong><p class="small muted">Go to the spot and take a photo. You need to be within 100 m.</p></div>` : ''}
      ${demoLocationPicker(config, { label: hotspot ? 'Demo: the spot is in' : 'Demo: pretend I am in' })}
      ${f.photo ? html`<div class="photo"><img src="${f.photo.dataUrl}" alt="Your photo"></div><button class="btn light" type="button" data-shoot>${icon('refresh', 18)} Retake photo</button>`
    : html`<button class="photo empty" type="button" data-shoot style="cursor:pointer;width:100%"><span class="stack" style="align-items:center">${icon('camera', 32)}<strong>Take a photo</strong><span class="small">In-app camera only. No people or plates.</span></span></button>`}
      ${hotspot ? '' : html`
        <p class="label">Category</p>
        <div class="chips wrap">${Object.entries(CATEGORIES).map(([k, c]) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${f.category === k}">${icon(CAT_ICON[k], 16)}${c.label}</button>`)}</div>
        <label class="field"><span>Problem type</span><select id="ptype">${Object.entries(PROBLEM_TYPES).map(([k, v]) => html`<option value="${k}" ${f.problemType === k ? 'selected' : ''}>${v}</option>`)}</select></label>
        <label class="field"><span>Short description</span><textarea id="desc" maxlength="400" placeholder="What do you see, and how big is it? No names or addresses.">${f.description}</textarea></label>`}
      <p class="error" id="err" hidden></p>
      <button class="btn lg" type="button" id="send" ${f.photo ? '' : 'disabled'}>${hotspot ? 'Send confirmation' : 'Send report'}</button>
      ${mine.length && !hotspot ? html`<div class="section-title"><h2>My reports</h2></div><div class="list">${mine.map((h) => html`<a href="${h.actionId ? `/action/${h.actionId}` : '/map'}" style="text-decoration:none;color:inherit" class="stack"><div class="row between"><strong>${h.title}</strong>${statusTag(h.status)}</div>${statusLine(stageOf(h.status, h.actionStatus))}</a>`)}</div>` : ''}`.toString();
    const pick = bindDemoPicker(view);
    const target = () => (hotspot && config?.demo ? { lat: hotspot.lat, lng: hotspot.lng } : pick());
    const desc = $('#desc', view);
    if (desc) desc.oninput = () => { f.description = desc.value; };
    const pt = $('#ptype', view);
    if (pt) pt.onchange = () => { f.problemType = pt.value; };
    view.querySelectorAll('[data-shoot]').forEach((b) => {
      b.onclick = async () => {
        const p = await takePhoto({ title: 'Photograph the problem', hint: 'Keep people and licence plates out of the frame.', target: target(), demo: config?.demo });
        if (p) { f.photo = p; draw(); }
      };
    });
    $('#send', view).onclick = send;
  }

  on(view, 'click', '[data-cat]', (e, b) => { f.category = b.dataset.cat; draw(); });

  async function send() {
    const btn = $('#send', view);
    const err = $('#err', view);
    btn.disabled = true;
    btn.innerHTML = html`${icon('sparkles', 18)} AI is checking your photo…`.toString();
    try {
      const r = hotspot
        ? await api(`/api/hotspots/${hotspot.id}/confirm`, { method: 'POST', body: { photo: f.photo } })
        : await api('/api/reports', { method: 'POST', body: { photo: f.photo, category: f.category, problemType: f.problemType, description: f.description } });
      showResult(r);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = hotspot ? 'Send confirmation' : 'Send report';
    }
  }

  function showResult(r) {
    let body;
    if (r.status === 'retake') {
      body = html`<div class="card warn">${icon('alert')}<strong>Please retake the photo</strong><p>${r.reason}</p></div><button class="btn lg" type="button" id="again">${icon('camera', 18)} Take a new photo</button>`;
    } else if (r.status === 'rejected') {
      body = html`<h1>Not accepted</h1>${statusLine(2)}<div class="card">${aiBox(html`<strong>The AI couldn't confirm an environmental problem</strong><p class="small">${r.reason}</p>`)}</div><button class="btn lg light" type="button" id="again">Try another photo</button>`;
    } else if (r.status === 'confirmed') {
      body = html`<h1>Thanks for confirming</h1>${statusLine(r.actionId ? 3 : 2)}<div class="card soft"><strong>+${r.points} points</strong><p>${r.actionId ? 'That was the confirmation it needed: the spot is verified and an action is open.' : 'Your photo counts as a confirmation for this spot.'}</p></div>${r.actionId ? html`<a class="btn lg" href="/action/${r.actionId}">See the action</a>` : html`<a class="btn lg" href="/map">Back to the map</a>`}`;
    } else if (r.status === 'ai_verified') {
      body = html`<h1>Verified by AI</h1>${statusLine(3)}
        ${r.hotspot.photoUrl ? html`<div class="photo"><img src="${r.hotspot.photoUrl}" alt="Your report photo"></div>` : ''}
        <div class="card">${aiBox(html`<strong>${r.ai.confidence}% confident · ${(r.ai.waste_types || []).join(', ')}</strong><p class="small">${r.reason}</p><p class="small muted">Suggested: ${r.ai.suggested_volunteers} volunteers · ${(r.ai.suggested_tools || []).join(', ')}</p>`)}</div>
        <div class="card soft"><strong>+20 points. Your spot is on the map.</strong></div>
        <div class="card dark"><h2 style="color:#fff">Your report was verified! Do you want to lead this action?</h2><p class="muted">As the reporter you get the first right to lead. The offer stays open for 24 hours.</p>
          <div class="row"><button class="btn" style="background:#BFE3CB;color:#16231C;border-color:#BFE3CB" type="button" data-offer="yes">${icon('crown', 18)} Yes, I'll lead</button><button class="btn ghost" style="color:#BFE3CB;border-color:#BFE3CB" type="button" data-offer="no">Not now</button></div></div>`;
    } else {
      body = html`<h1>Report received</h1>${statusLine(2)}
        ${r.hotspot?.photoUrl ? html`<div class="photo"><img src="${r.hotspot.photoUrl}" alt="Your report photo"></div>` : ''}
        <div class="card">${aiBox(html`<strong>${r.aiAvailable ? `${r.ai.confidence}% confident` : 'Waiting for confirmation'}</strong><p class="small">${r.reason}</p>`, r.aiAvailable ? null : 'rules')}</div>
        <div class="card dashed"><p>Your pin is on the map with a dashed outline. It becomes verified when 2 other people confirm it with a photo, or when the municipality approves it.</p></div>
        <a class="btn lg" href="/map">See it on the map</a>`;
    }
    view.innerHTML = body.toString();
    const again = $('#again', view);
    if (again) again.onclick = () => { f.photo = null; draw(); };
    view.querySelectorAll('[data-offer]').forEach((b) => {
      b.onclick = async () => {
        await api(`/api/actions/${r.actionId}/offer`, { method: 'POST', body: { accept: b.dataset.offer === 'yes' } });
        if (b.dataset.offer === 'yes') {
          toast("You're the team leader. Set 2–3 dates next.");
          go(`/action/${r.actionId}/manage`);
        } else {
          toast('No problem. We\'ll look for another leader.');
          go(`/action/${r.actionId}`);
        }
      };
    });
  }

  draw();
}

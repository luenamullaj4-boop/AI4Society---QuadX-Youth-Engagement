import { DATA_CARD_ITEMS } from '../config.js';
import { api } from '../lib/api.js';
import { getLocation, renderQr, scanQr, takePhoto } from '../lib/device.js';
import {
  $, aiBox, emptyState, fmtDate, html, icon, on, progress, statusTag, toast,
} from '../lib/ui.js';
import { bindMessages } from './actions.js';

const toLocalInput = (iso) => {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export async function manage(view, { params, me, config, go, refresh, isCurrent }) {
  const { action: a } = await api(`/api/actions/${params.id}`);
  const msgs = (await api(`/api/actions/${a.id}/messages`).catch(() => ({ messages: [] }))).messages;
  if (!isCurrent()) return;
  if (!a.me?.isLeader && !a.me?.isDeputy) {
    view.innerHTML = emptyState('lock', 'Only the team leader can manage this action.', html`<a class="btn" href="/action/${a.id}">Back to the action</a>`).toString();
    return;
  }
  const leader = a.me.isLeader;
  const minorLeader = me.ageGroup === '16-17';
  const cards = a.dataCards || [];
  const att = a.attendance || [];
  const confirmedOpt = a.options.find((o) => o.id === a.confirmedOptionId);

  view.innerHTML = html`
    <a class="linkbtn row" href="/action/${a.id}" style="gap:4px">${icon('left', 18)} Action page</a>
    <div class="row between wrap"><p class="label">${leader ? 'You lead this action' : 'You are the deputy'}</p>${statusTag(a.status)}</div>
    <h1>${a.title}</h1>

    ${leader && a.status === 'collecting' ? html`<div class="card"><h2>Date options</h2><p class="small muted">Set 2–3 options. Volunteers pick the ones that work; the first to reach ${a.requiredVolunteers} is confirmed.</p>
      ${[0, 1, 2].map((i) => html`<label class="field"><span>Option ${i + 1}${i === 2 ? ' (optional)' : ''}</span><input type="datetime-local" data-date="${i}" value="${a.options[i] ? toLocalInput(a.options[i].startsAt) : ''}"></label>`)}
      <button class="btn" type="button" id="saveDates">${a.options.length ? 'Update dates' : 'Publish volunteer call'}</button></div>` : ''}

    ${a.options.length ? html`<div class="card"><h2>Volunteers</h2>${a.options.map((o) => html`<div class="stack" style="gap:4px"><div class="row between small"><strong>${fmtDate(o.startsAt)}</strong><span class="num">${o.count}/${a.requiredVolunteers}</span></div>${progress(o.count, a.requiredVolunteers)}<p class="small muted">${(a.volunteers || []).filter((v) => v.optionId === o.id).map((v) => v.name).join(', ') || 'No one yet'}</p></div>`)}</div>` : ''}

    ${leader && (minorLeader || a.waitingForSupervisor) && ['collecting', 'confirmed'].includes(a.status) ? html`<div class="card warn"><strong>Adult supervisor</strong><p class="small">Because you're under ${config?.leaderMinAge || 18}, an adult supervisor must be named before the action can be confirmed.</p>
      <label class="field"><span>Supervisor's name</span><input type="text" id="supervisor" maxlength="60" value="${a.supervisorName || ''}"></label><button class="btn sm" type="button" id="saveSupervisor">Save</button></div>` : ''}

    ${leader && a.status === 'confirmed' ? html`<div class="card"><h2>Safety checklist</h2><p class="small muted">Before you start on ${confirmedOpt ? fmtDate(confirmedOpt.startsAt) : 'the day'}.</p>
      <label class="check"><input type="checkbox" data-safety="gloves" ${a.safety.gloves ? 'checked' : ''}> Gloves and bags ready</label>
      <label class="check"><input type="checkbox" data-safety="firstAid" ${a.safety.firstAid ? 'checked' : ''}> First aid kit</label>
      <label class="check"><input type="checkbox" data-safety="briefing" ${a.safety.briefing ? 'checked' : ''}> Briefing done: area, safety rules, respect for nature, meeting point for bags</label>
      ${minorLeader ? html`<label class="check"><input type="checkbox" data-safety="supervisor" ${a.safety.supervisor ? 'checked' : ''}> Adult supervisor present (${a.supervisorName || 'not named'})</label>` : ''}
      <button class="btn lg" type="button" id="start">${icon('check', 18)} Start the action</button></div>` : ''}

    ${leader && a.status === 'in_progress' ? html`
      <div class="card"><div class="row between"><h2>Check-in QR</h2><div class="chips"><button class="chip" type="button" data-qr="checkin" aria-pressed="true">Check-in</button><button class="chip" type="button" data-qr="checkout" aria-pressed="false">Check-out</button></div></div>
        <div class="qrbox" id="qr" aria-label="QR code for volunteers to scan"></div>
        <p class="small muted" id="qrNote">Members scan this with the GreenELB scanner. It changes every minute.</p>
        <p class="small"><strong>${att.filter((x) => x.checkinAt).length}</strong> checked in · <strong>${att.filter((x) => x.checkoutAt).length}</strong> checked out</p>
        <p class="small muted">${att.map((x) => `${x.name}${x.checkoutAt ? ' (out)' : ''}`).join(', ')}</p></div>
      <div class="card"><h2>Photos</h2><div class="grid3">${['before', 'after', 'bags'].map((k) => html`<button class="photo ${a[`${k}Url`] ? '' : 'empty'}" type="button" data-photo="${k}" style="cursor:pointer;aspect-ratio:1">${a[`${k}Url`] ? html`<img src="${a[`${k}Url`]}" alt="${k} photo">` : html`<span class="stack" style="align-items:center;gap:2px">${icon('camera')}<span class="small">${k === 'bags' ? 'Bags' : k === 'before' ? 'Before' : 'After'}</span></span>`}</button>`)}</div>
        <p class="small muted">Take the before photo at the start, the after photo and the bags at the end, from the same spot.</p></div>
      <div class="card"><h2>Data cards</h2>${cards.length ? html`<div class="stack">${cards.map((c) => html`<div class="card" style="padding:10px">
        <div class="row"><div class="photo" style="width:72px;flex:none;aspect-ratio:1"><img src="${c.photoUrl}" alt="Photo from ${c.name}"></div><div class="stack" style="gap:2px;flex:1"><strong>${c.name}</strong><span class="small">${c.bags} bags · ${c.items.map((i) => DATA_CARD_ITEMS[i]).join(', ') || 'no items'}</span>
        <span class="small muted">${c.aiCheck?.duplicate ? 'Photo looks like a duplicate · ' : ''}${c.aiCheck && c.aiCheck.same_site === false ? 'Taken away from the site · ' : ''}${c.estWeightKg ? `AI estimate ~${c.estWeightKg} kg` : ''}</span></div></div>
        ${c.status === 'awaiting_leader' || c.status === 'flagged' ? html`<div class="row"><button class="btn sm" type="button" data-card="${c.id}" data-agree="1">${icon('check', 16)} Attended and completed tasks</button><button class="btn sm ghost" type="button" data-card="${c.id}" data-agree="0">Disagree</button></div>` : html`<span class="small">${c.status === 'verified' ? 'Confirmed' : c.status}</span>`}</div>`)}</div>` : html`<p class="small muted">Cards appear here as members check out and fill them.</p>`}
        ${!a.me.dataCard ? html`<a class="btn sm light" href="/action/${a.id}/datacard">Fill my own data card</a>` : ''}</div>
      <div class="card"><h2>Finish the action</h2>
        <div class="grid2"><label class="field"><span>Total bags</span><input type="number" id="bags" min="0" max="500" inputmode="numeric" value="${a.totalBags ?? ''}"></label>
        ${a.category === 'planting' ? html`<label class="field"><span>Trees planted</span><input type="number" id="trees" min="0" max="1000" inputmode="numeric"></label>` : ''}
        <label class="field"><span>Plastic (kg)</span><input type="number" id="kgPlastic" min="0" step="0.1" inputmode="decimal"></label>
        <label class="field"><span>Non-plastic (kg)</span><input type="number" id="kgOther" min="0" step="0.1" inputmode="decimal"></label></div>
        <p class="error" id="finishErr" hidden></p>
        <button class="btn lg" type="button" id="finish" ${a.beforeUrl && a.afterUrl ? '' : 'disabled'}>${icon('sparkles', 18)} Finish and verify with AI</button>
        ${a.beforeUrl && a.afterUrl ? '' : html`<p class="small muted">Add the before and after photos first.</p>`}</div>` : ''}

    ${a.status === 'under_review' ? html`<div class="card warn">${aiBox(html`<strong>The AI could not confirm the site is clean</strong><p class="small">${a.cleanup?.reason || ''} The municipality will review it.</p>`)}</div>` : ''}
    ${a.status === 'done' ? html`<div class="card soft"><strong>Done and verified.</strong><a class="btn sm" href="/achievement/${a.id}">See your achievement</a></div>` : ''}

    ${html`<div class="card"><h2>Group messages</h2>
      <div class="stack">${msgs.length ? msgs.map((m) => html`<div class="msg ${m.mine ? 'mine' : ''}"><p class="small muted">${m.name}</p><p>${m.body}</p></div>`) : html`<p class="small muted">No messages yet.</p>`}</div>
      <form class="row" id="msgForm"><input type="text" id="msgText" maxlength="500" placeholder="Write to the group" aria-label="Message" required><button class="iconbtn" type="submit" aria-label="Send">${icon('send')}</button></form></div>`}

    ${leader && ['collecting', 'confirmed', 'in_progress'].includes(a.status) ? html`<button class="linkbtn" type="button" id="withdraw" style="color:#B3261E">Withdraw as leader${a.deputyName ? ` (${a.deputyName} takes over)` : ''}</button>` : ''}`.toString();

  const saveDates = $('#saveDates', view);
  if (saveDates) {
    saveDates.onclick = async () => {
      const dates = [...view.querySelectorAll('[data-date]')].map((i) => i.value).filter(Boolean).map((v) => new Date(v).toISOString());
      try {
        await api(`/api/actions/${a.id}/options`, { method: 'POST', body: { dates } });
        toast('Volunteer call published.');
        refresh();
      } catch (ex) { toast(ex.message); }
    };
  }
  const sup = $('#saveSupervisor', view);
  if (sup) sup.onclick = async () => { try { await api(`/api/actions/${a.id}/supervisor`, { method: 'POST', body: { name: $('#supervisor', view).value } }); toast('Supervisor saved.'); refresh(); } catch (ex) { toast(ex.message); } };

  on(view, 'change', '[data-safety]', async () => {
    const body = Object.fromEntries([...view.querySelectorAll('[data-safety]')].map((i) => [i.dataset.safety, i.checked]));
    await api(`/api/actions/${a.id}/safety`, { method: 'POST', body });
  });
  const start = $('#start', view);
  if (start) start.onclick = async () => { try { await api(`/api/actions/${a.id}/start`, { method: 'POST' }); refresh(); } catch (ex) { toast(ex.message); } };

  // Rotating QR
  const qrEl = $('#qr', view);
  let kind = 'checkin';
  let timer = null;
  async function showQr() {
    if (!qrEl || !document.body.contains(qrEl)) { clearTimeout(timer); return; }
    const r = await api(`/api/actions/${a.id}/qr?kind=${kind}`);
    renderQr(qrEl, r.payload);
    timer = setTimeout(showQr, Math.max(5, r.refreshInSeconds) * 1000);
  }
  if (qrEl) showQr();
  on(view, 'click', '[data-qr]', (e, b) => {
    kind = b.dataset.qr;
    view.querySelectorAll('[data-qr]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    clearTimeout(timer);
    showQr();
  });

  on(view, 'click', '[data-photo]', async (e, b) => {
    const photo = await takePhoto({ title: `${b.dataset.photo === 'bags' ? 'Collected bags' : b.dataset.photo === 'before' ? 'Before' : 'After'} photo`, hint: 'Same angle for before and after. No faces or plates.', target: { lat: a.lat, lng: a.lng }, demo: config?.demo });
    if (!photo) return;
    try {
      const r = await api(`/api/actions/${a.id}/photos`, { method: 'POST', body: { kind: b.dataset.photo, photo } });
      if (r.status === 'retake') toast(r.reason, 6000);
      refresh();
    } catch (ex) { toast(ex.message); }
  });

  on(view, 'click', '[data-card]', async (e, b) => {
    await api(`/api/actions/${a.id}/datacards/${b.dataset.card}/confirm`, { method: 'POST', body: { agree: b.dataset.agree === '1' } });
    refresh();
  });

  const finish = $('#finish', view);
  if (finish) {
    finish.onclick = async () => {
      finish.disabled = true;
      finish.innerHTML = html`${icon('sparkles', 18)} AI is comparing before and after…`.toString();
      try {
        const r = await api(`/api/actions/${a.id}/finish`, { method: 'POST', body: {
          totalBags: $('#bags', view).value || 0, kgPlastic: $('#kgPlastic', view).value || 0, kgOther: $('#kgOther', view).value || 0, treesPlanted: $('#trees', view)?.value || 0,
        } });
        if (r.verified) go(`/achievement/${a.id}`);
        else refresh();
      } catch (ex) {
        const err = $('#finishErr', view);
        err.textContent = ex.message;
        err.hidden = false;
        finish.disabled = false;
        finish.textContent = 'Finish and verify with AI';
      }
    };
  }
  const withdraw = $('#withdraw', view);
  if (withdraw) {
    withdraw.onclick = async () => {
      if (withdraw.dataset.sure !== '1') {
        withdraw.dataset.sure = '1';
        withdraw.textContent = 'Tap again to confirm you are withdrawing';
        return;
      }
      await api(`/api/actions/${a.id}/withdraw`, { method: 'POST' });
      toast('You withdrew. Thanks for letting the team know.');
      go(`/action/${a.id}`);
    };
  }
  bindMessages(view, a.id, refresh);
}

export async function checkin(view, { params, config, go, isCurrent }) {
  const { action: a } = await api(`/api/actions/${params.id}`);
  if (!isCurrent()) return;
  const att = a.me?.attendance;
  const kind = att?.checkinAt && !att?.checkoutAt ? 'check out' : 'check in';
  view.innerHTML = html`
    <a class="linkbtn row" href="/action/${a.id}" style="gap:4px">${icon('left', 18)} ${a.title}</a>
    <h1>${kind === 'check in' ? 'Check in' : 'Check out'}</h1>
    <p class="muted">Scan the QR code on the team leader's phone. You need to be within 200 m of the action.</p>
    ${config?.demo ? html`<p class="small muted">Demo mode: your location is set to the action spot if "use a location in Elbasan" is on.</p>` : ''}
    <p class="error" id="err" hidden></p>
    <button class="btn lg" type="button" id="scan">${icon('scan', 20)} Open the scanner</button>`.toString();
  $('#scan', view).onclick = async () => {
    const err = $('#err', view);
    err.hidden = true;
    const payload = await scanQr();
    if (!payload) return;
    try {
      const here = await getLocation({ target: { lat: a.lat, lng: a.lng }, demo: config?.demo });
      const r = await api(`/api/actions/${a.id}/scan`, { method: 'POST', body: { payload, lat: here.lat, lng: here.lng } });
      toast(r.kind === 'checkin' ? "You're checked in. Have a great action!" : 'Checked out. Now fill your data card.');
      go(r.kind === 'checkout' ? `/action/${a.id}/datacard` : `/action/${a.id}`);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  };
}

export async function datacard(view, { params, config, go, isCurrent }) {
  const { action: a } = await api(`/api/actions/${params.id}`);
  if (!isCurrent()) return;
  const att = a.me?.attendance;
  if (!att) {
    view.innerHTML = emptyState('scan', 'Check in at the action first.', html`<a class="btn" href="/action/${a.id}/checkin">Check in</a>`).toString();
    return;
  }
  if (a.me.dataCard) {
    const c = a.me.dataCard;
    view.innerHTML = html`<h1>My data card</h1><div class="card soft"><strong>${c.status === 'verified' ? 'Verified' : c.status === 'awaiting_leader' ? 'Waiting for your team leader' : 'Under review by the municipality'}</strong>${c.impact ? html`<p>${c.impact}</p>` : ''}</div><a class="btn" href="/action/${a.id}">Back to the action</a>`.toString();
    return;
  }
  const f = { bags: 1, items: [], photo: null };
  const mins = att.checkoutAt ? Math.round((Date.parse(att.checkoutAt) - Date.parse(att.checkinAt)) / 60000) : null;
  function draw() {
    view.innerHTML = html`
      <a class="linkbtn row" href="/action/${a.id}" style="gap:4px">${icon('left', 18)} ${a.title}</a>
      <h1>My data card</h1>
      <p class="muted">Under a minute. Most of it is filled in for you.</p>
      <div class="card"><dl class="kv">
        <dt>Action</dt><dd>${a.title}</dd><dt>Location</dt><dd>${a.areaName}</dd><dt>Role</dt><dd>${a.me.isLeader ? 'Team leader' : a.me.isDeputy ? 'Deputy' : 'Volunteer'}</dd>
        <dt>Check-in</dt><dd>${fmtDate(att.checkinAt)}</dd><dt>Check-out</dt><dd>${att.checkoutAt ? fmtDate(att.checkoutAt) : 'Not yet'}</dd>${mins !== null ? html`<dt>Duration</dt><dd>${mins} min</dd>` : ''}
      </dl></div>
      <div class="card"><div class="row between"><strong>Bags I filled</strong><div class="row"><button class="iconbtn" type="button" data-bags="-1" aria-label="One fewer">–</button><span class="hero-num num" style="font-size:26px">${f.bags}</span><button class="iconbtn" type="button" data-bags="1" aria-label="One more">${icon('plus')}</button></div></div></div>
      ${f.photo ? html`<div class="photo"><img src="${f.photo.dataUrl}" alt="Your photo"></div><button class="btn light" type="button" data-shoot>Retake</button>` : html`<button class="photo empty" type="button" data-shoot style="cursor:pointer;width:100%"><span class="stack" style="align-items:center">${icon('camera', 28)}<strong>Photo of your bag or work area</strong></span></button>`}
      <p class="label">Top items found</p>
      <div class="chips wrap">${Object.entries(DATA_CARD_ITEMS).map(([k, v]) => html`<button class="chip" type="button" data-item="${k}" aria-pressed="${f.items.includes(k)}">${v}</button>`)}</div>
      <label class="field"><span>Item of local concern (optional)</span><input type="text" id="concern" maxlength="120" placeholder="e.g. car tyres, construction rubble"></label>
      <p class="error" id="err" hidden></p>
      <button class="btn lg" type="button" id="send" ${f.photo ? '' : 'disabled'}>Submit data card</button>`.toString();
    view.querySelectorAll('[data-shoot]').forEach((b) => {
      b.onclick = async () => {
        const p = await takePhoto({ title: 'Your bag or work area', hint: 'No faces.', target: { lat: a.lat, lng: a.lng }, demo: config?.demo });
        if (p) { f.photo = p; draw(); }
      };
    });
    $('#send', view).onclick = async () => {
      const btn = $('#send', view);
      btn.disabled = true;
      btn.textContent = 'Checking your photo…';
      try {
        const r = await api(`/api/actions/${a.id}/datacard`, { method: 'POST', body: { bags: f.bags, items: f.items, photo: f.photo, localConcern: $('#concern', view).value } });
        if (r.status === 'retake') {
          toast(r.reason, 6000);
          f.photo = null;
          draw();
          return;
        }
        toast(r.card.status === 'verified' ? 'Data card verified.' : 'Sent. Your team leader confirms it next.');
        go(`/action/${a.id}`);
      } catch (ex) {
        const err = $('#err', view);
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Submit data card';
      }
    };
  }
  on(view, 'click', '[data-bags]', (e, b) => { f.bags = Math.max(0, Math.min(50, f.bags + Number(b.dataset.bags))); draw(); });
  on(view, 'click', '[data-item]', (e, b) => {
    const k = b.dataset.item;
    f.items = f.items.includes(k) ? f.items.filter((x) => x !== k) : [...f.items, k];
    draw();
  });
  draw();
}

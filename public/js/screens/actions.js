import { ACTION_TYPES, CATEGORIES } from '../config.js';
import { api } from '../lib/api.js';
import { shareLink, whatsappUrl } from '../lib/share.js';
import {
  $, CAT_ICON, aiBox, catTag, emptyState, fmtDate, html, icon, on, progress, statusTag, toast,
} from '../lib/ui.js';
import { actionCard } from './common.js';

export async function actions(view, { isCurrent }) {
  const [mine, open] = await Promise.all([api('/api/me/actions'), api('/api/actions')]);
  if (!isCurrent()) return;
  let filter = 'all';
  function draw() {
    const list = open.actions.filter((a) => filter === 'all' || a.category === filter);
    view.innerHTML = html`
      <h1>Actions</h1>
      <div class="section-title"><h2>Mine</h2></div>
      ${mine.actions.length ? html`<div class="stack">${mine.actions.map((a) => actionCard(a))}</div>` : html`<p class="muted">You haven't joined an action yet.</p>`}
      <div class="section-title"><h2>Open actions</h2></div>
      <div class="chips" role="group" aria-label="Filter by category">
        <button class="chip" type="button" data-f="all" aria-pressed="${filter === 'all'}">All</button>
        ${Object.entries(CATEGORIES).map(([k, c]) => html`<button class="chip" type="button" data-f="${k}" aria-pressed="${filter === k}">${icon(CAT_ICON[k], 16)}${c.label}</button>`)}
      </div>
      ${list.length ? html`<div class="stack">${list.map((a) => actionCard(a))}</div>` : emptyState('flag', 'No actions here yet. Report a hotspot!', html`<a class="btn" href="/report">Report a hotspot</a>`)}`.toString();
  }
  on(view, 'click', '[data-f]', (e, b) => { filter = b.dataset.f; draw(); });
  draw();
}

function messagesBlock(msgs) {
  return html`<div class="card"><h2>Group messages</h2>
    <div class="stack" id="msgs">${msgs.length ? msgs.map((m) => html`<div class="msg ${m.mine ? 'mine' : ''}"><p class="small muted">${m.name}</p><p>${m.body}</p></div>`) : html`<p class="small muted">No messages yet.</p>`}</div>
    <form class="row" id="msgForm"><input type="text" id="msgText" maxlength="500" placeholder="Write to the group" aria-label="Message" required><button class="iconbtn" type="submit" aria-label="Send">${icon('send')}</button></form></div>`;
}

export function bindMessages(view, actionId, refresh) {
  const form = $('#msgForm', view);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#msgText', view);
    try {
      await api(`/api/actions/${actionId}/messages`, { method: 'POST', body: { body: input.value } });
      input.value = '';
      refresh();
    } catch (ex) { toast(ex.message); }
  };
}

export async function action(view, { params, me, go, refresh, isCurrent }) {
  const { action: a } = await api(`/api/actions/${params.id}`, { auth: Boolean(me) });
  const my = a.me || {};
  const member = my.isLeader || my.isDeputy || my.optionIds?.length;
  const msgs = member ? (await api(`/api/actions/${a.id}/messages`).catch(() => ({ messages: [] }))).messages : [];
  if (!isCurrent()) return;
  const chosen = new Set(my.optionIds || []);
  const canJoin = me?.role === 'youth' && ['collecting', 'confirmed'].includes(a.status) && !my.isLeader && a.options.length;
  const invite = me ? shareLink(`/action/${a.id}`, { ref: me.referralCode, src: 'whatsapp' }) : null;

  view.innerHTML = html`
    <a class="linkbtn row" href="/actions" style="gap:4px">${icon('left', 18)} Actions</a>
    ${a.photoUrl ? html`<div class="photo"><img src="${a.photoUrl}" alt="Photo of the site"></div>` : ''}
    <div class="row between wrap">${catTag(a.category)}${statusTag(a.status)}</div>
    <h1>${a.title}</h1>
    <div class="row wrap small muted" style="gap:12px"><span class="row" style="gap:4px">${icon('pin', 16)}${a.areaName}</span><span class="row" style="gap:4px">${icon('clock', 16)}${a.durationHours} h</span><span>${ACTION_TYPES[a.type]}</span><span>+${a.pointsReward} points</span></div>
    <p>${a.description}</p>
    ${a.tools?.length ? html`<p class="small"><strong>Bring / provided:</strong> ${a.tools.join(', ')}</p>` : ''}
    ${a.whyFits ? html`<div class="card soft">${aiBox(html`<strong>Why it fits you</strong><p class="small">${a.whyFits}</p>`, a.whyFitsSource)}</div>` : ''}
    <div class="grid2">
      <div class="card"><span class="label">Team leader</span><strong>${a.leaderName || 'Wanted'}</strong></div>
      <div class="card"><span class="label">Deputy</span><strong>${a.deputyName || '—'}</strong></div>
    </div>

    ${my.offered ? html`<div class="card dark"><h2 style="color:#fff">Your report was verified! Do you want to lead this action?</h2>
      <p class="muted">Offer open until ${fmtDate(a.offerExpiresAt)}.</p>
      <div class="row"><button class="btn" style="background:#BFE3CB;color:#16231C;border-color:#BFE3CB" type="button" data-offer="yes">Yes, I'll lead</button><button class="btn ghost" style="color:#BFE3CB;border-color:#BFE3CB" type="button" data-offer="no">Not now</button></div></div>` : ''}

    ${a.status === 'leader_wanted' ? html`<div class="card warn"><strong>Team leader wanted</strong>
      <p class="small">${a.applicationCount} applied${a.applicationsCloseAt ? ` · applications close ${fmtDate(a.applicationsCloseAt)}` : ''}. The AI ranks applicants and the municipality confirms.</p>
      ${me?.role === 'youth' ? (my.applied ? html`<p class="small"><strong>You applied.</strong> We'll notify you when the leader is chosen.</p>` : html`<a class="btn" href="/action/${a.id}/apply-leader">${icon('crown', 18)} Apply as team leader</a>`) : ''}</div>` : ''}

    ${a.options.length ? html`<div class="card"><div class="row between"><h2>Dates</h2><span class="small muted">${a.requiredVolunteers} needed per date</span></div>
      <div class="stack">${a.options.map((o) => html`<label class="option" style="${a.confirmedOptionId === o.id ? 'border-color:#1E5A3F' : ''}">
        ${canJoin ? html`<input type="checkbox" data-opt="${o.id}" ${chosen.has(o.id) ? 'checked' : ''} ${a.status === 'confirmed' && a.confirmedOptionId !== o.id ? 'disabled' : ''} style="width:20px;height:20px;accent-color:#1E5A3F">` : icon('calendar')}
        <span class="stack" style="gap:4px;flex:1"><span class="row between"><strong>${fmtDate(o.startsAt)}</strong><span class="num small"><strong>${o.count}/${a.requiredVolunteers}</strong></span></span>${progress(o.count, a.requiredVolunteers)}${a.confirmedOptionId === o.id ? html`<span class="small" style="color:#1E5A3F;font-weight:700">Confirmed date</span>` : ''}</span></label>`)}</div>
      ${canJoin ? html`<button class="btn lg" type="button" id="join">${my.optionIds?.length ? 'Update my dates' : 'Join as volunteer'}</button>
        <div class="row"><a class="btn light" style="flex:1" href="${whatsappUrl('Join me for this cleanup in Elbasan:', invite)}" target="_blank" rel="noopener">${icon('users', 18)} Join with friends</a>${my.optionIds?.length ? html`<button class="btn ghost" type="button" id="leave">Leave</button>` : ''}</div>` : ''}
    </div>` : a.status === 'collecting' ? html`<div class="card dashed small">The team leader is choosing 2–3 dates. Check back soon.</div>` : ''}

    ${my.isLeader || my.isDeputy ? html`<a class="btn lg dark" href="/action/${a.id}/manage">${icon('crown', 18)} Manage this action</a>` : ''}
    ${a.status === 'in_progress' && member && !my.isLeader ? html`<a class="btn lg" href="/action/${a.id}/checkin">${icon('scan', 18)} ${my.attendance?.checkinAt && !my.attendance?.checkoutAt ? 'Check out' : 'Check in'}</a>` : ''}
    ${my.attendance?.checkinAt && !my.dataCard ? html`<a class="btn lg orange" href="/action/${a.id}/datacard">Fill my data card</a>` : ''}
    ${my.dataCard ? html`<div class="card soft"><span class="label">My data card</span><strong>${my.dataCard.status === 'verified' ? 'Verified' : my.dataCard.status === 'awaiting_leader' ? 'Waiting for the leader' : 'Under review'}</strong>${my.dataCard.impact ? html`<p>${my.dataCard.impact}</p>` : ''}</div>` : ''}

    ${member && ['confirmed', 'in_progress'].includes(a.status) && !my.quizDone ? html`<div class="card" id="quizCard"><h2>1-minute plastic quiz</h2><p class="small muted">+5 points. Know what you're picking up.</p>
      ${a.quiz.map((q) => html`<fieldset style="border:0;padding:0;margin:0" class="stack"><legend><strong>${q.q}</strong></legend><div class="chips wrap">${q.options.map((o) => html`<button class="chip" type="button" data-q="${q.id}" data-a="${o}" aria-pressed="false">${o}</button>`)}</div></fieldset>`)}
      <button class="btn" type="button" id="quizSend">Check my answers</button></div>` : ''}

    ${a.team ? html`<div class="card dark"><span class="label">Team data card</span>
      <div class="grid3"><div class="tile stat"><b>${a.team.participants}</b><span>people</span></div><div class="tile stat"><b>${a.team.kgPlastic ?? 0}</b><span>kg plastic</span></div><div class="tile stat"><b>${a.team.kgOther ?? 0}</b><span>kg other</span></div></div>
      ${a.team.topItems.length ? html`<p class="small">Top items: ${a.team.topItems.join(', ')}</p>` : ''}</div>
      ${a.beforeUrl && a.afterUrl ? html`<div class="grid2"><div><p class="label">Before</p><div class="photo"><img src="${a.beforeUrl}" alt="Before"></div></div><div><p class="label">After</p><div class="photo"><img src="${a.afterUrl}" alt="After"></div></div></div>` : ''}
      ${a.cleanup?.reason ? aiBox(html`<p class="small">${a.cleanup.reason}</p>`) : ''}` : ''}

    ${member ? messagesBlock(msgs) : ''}`.toString();

  view.querySelectorAll('[data-offer]').forEach((b) => {
    b.onclick = async () => {
      await api(`/api/actions/${a.id}/offer`, { method: 'POST', body: { accept: b.dataset.offer === 'yes' } });
      if (b.dataset.offer === 'yes') go(`/action/${a.id}/manage`);
      else refresh();
    };
  });
  const join = $('#join', view);
  if (join) {
    join.onclick = async () => {
      const optionIds = [...view.querySelectorAll('[data-opt]:checked')].map((x) => x.dataset.opt);
      if (!optionIds.length) return toast('Pick at least one date.');
      join.disabled = true;
      try {
        const r = await api(`/api/actions/${a.id}/join`, { method: 'POST', body: { optionIds } });
        toast(r.action.status === 'confirmed' ? 'The action is confirmed! See you there.' : "You're in. We'll tell you when a date is confirmed.");
        refresh();
      } catch (ex) { toast(ex.message); join.disabled = false; }
    };
  }
  const leave = $('#leave', view);
  if (leave) leave.onclick = async () => { await api(`/api/actions/${a.id}/join`, { method: 'DELETE' }); toast('You left this action.'); refresh(); };

  const answers = {};
  on(view, 'click', '[data-q]', (e, b) => {
    answers[b.dataset.q] = b.dataset.a;
    view.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  const quizSend = $('#quizSend', view);
  if (quizSend) {
    quizSend.onclick = async () => {
      const r = await api(`/api/actions/${a.id}/quiz`, { method: 'POST', body: { answers } });
      $('#quizCard', view).innerHTML = html`<h2>${r.correct} of ${r.total} right</h2><p>${r.points ? `+${r.points} points.` : ''} Answers: ${Object.values(r.key).join(' · ')}</p>`.toString();
    };
  }
  bindMessages(view, a.id, refresh);
}

export async function applyLeader(view, { params, go, isCurrent }) {
  const { action: a } = await api(`/api/actions/${params.id}`);
  if (!isCurrent()) return;
  if (a.status !== 'leader_wanted') {
    view.innerHTML = emptyState('crown', 'This action is not looking for a leader right now.', html`<a class="btn" href="/action/${a.id}">Back to the action</a>`).toString();
    return;
  }
  if (a.me?.applied) {
    view.innerHTML = emptyState('check', "You've already applied. We'll notify you when the leader is chosen.", html`<a class="btn" href="/action/${a.id}">Back to the action</a>`).toString();
    return;
  }
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  });
  view.innerHTML = html`
    <a class="linkbtn row" href="/action/${a.id}" style="gap:4px">${icon('left', 18)} Back</a>
    <p class="label">Apply as team leader</p>
    <h1>${a.title}</h1>
    <div class="card soft small">Leaders set 2–3 dates, recruit volunteers, run the safety checklist and confirm everyone's data card. You earn +100 points when the action is verified.</div>
    <label class="field"><span>Why do you want to lead this? <span class="num" id="count">0</span>/500</span><textarea id="motivation" maxlength="500" placeholder="Your experience, why this spot matters to you, who you could bring. No names or phone numbers."></textarea></label>
    <p class="label">When are you available?</p>
    ${a.options.length ? html`<div class="stack">${a.options.map((o) => html`<label class="check"><input type="checkbox" data-opt="${o.id}"> ${fmtDate(o.startsAt)}</label>`)}</div>`
    : html`<div class="chips wrap">${days.map((d) => html`<button class="chip" type="button" data-day="${d.toISOString()}" aria-pressed="false">${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</button>`)}</div>`}
    <p class="error" id="err" hidden></p>
    <button class="btn lg" type="button" id="send">Submit application</button>
    <p class="small muted">The AI ranks applicants by motivation, reliability, availability and distance. It never sees your name. The municipality confirms the leader.</p>`.toString();
  const ta = $('#motivation', view);
  ta.oninput = () => { $('#count', view).textContent = ta.value.length; };
  on(view, 'click', '[data-day]', (e, b) => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
  $('#send', view).onclick = async () => {
    const err = $('#err', view);
    try {
      await api(`/api/actions/${a.id}/apply`, { method: 'POST', body: {
        motivation: ta.value,
        availableOptionIds: [...view.querySelectorAll('[data-opt]:checked')].map((x) => x.dataset.opt),
        availableDates: [...view.querySelectorAll('[data-day][aria-pressed="true"]')].map((x) => x.dataset.day),
      } });
      toast('Application sent. Good luck!');
      go(`/action/${a.id}`);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  };
}

import { CATEGORIES, USER_TYPES, nextPhase } from '../config.js';
import { api, session } from '../lib/api.js';
import { renderQr } from '../lib/device.js';
import { hotspotMarker, makeMap } from '../lib/map.js';
import { drawStory, facebookUrl, shareCanvas, shareLink, whatsappUrl } from '../lib/share.js';
import {
  $, CAT_ICON, ago, catTag, emptyState, fmtDate, html, icon, on, progress, toast,
} from '../lib/ui.js';

export async function passport(view, { refreshMe, refresh, go, isCurrent }) {
  const [p, surveys] = await Promise.all([api('/api/me/passport'), api('/api/surveys', { auth: false })]);
  if (!isCurrent()) return;
  const u = p.user;
  const t = USER_TYPES[u.userType];
  const next = nextPhase(u.lifetimePoints);
  const open = surveys.surveys;
  const verifyUrl = `${location.origin}/verify/${u.verifyCode}`;
  view.innerHTML = html`
    <div class="card dark">
      <div class="row between"><div><p class="label">Green Passport</p><h1 style="color:#fff">${p.publicName}</h1><p class="muted">${t?.name || ''}${u.school ? ` · ${u.school}` : ''}</p></div><span class="brand"><span class="mark">${icon('leaf', 18)}</span></span></div>
      <div class="grid3"><div class="tile stat"><b class="num">${u.points}</b><span>points</span></div><div class="tile stat"><b class="num">${u.actionsCount}</b><span>actions</span></div><div class="tile stat"><b class="num">${u.hours}</b><span>hours</span></div></div>
      ${next ? html`<div class="stack" style="gap:4px"><div class="row between small"><span>${next.phase}: ${next.title}</span><span class="num">${u.lifetimePoints}/${next.points}</span></div>${progress(u.lifetimePoints, next.points, 'lg')}</div>` : html`<p class="small">All phases unlocked. Green Ambassador!</p>`}
    </div>

    <div class="card"><h2>Rewards path</h2>
      ${p.phases.map((ph) => {
    const got = u.certificates.find((c) => c.kind === ph.key);
    return html`<div class="row" style="align-items:flex-start"><span class="tag ${got ? 'ok' : 'status'}" style="flex:none">${got ? icon('check', 14) : icon('lock', 14)}${ph.points}</span><div class="stack" style="gap:0"><strong>${ph.title}</strong><span class="small muted">${ph.phase}${ph.needsLead ? ' · needs 1 action led' : ''}</span>${ph.perk ? html`<span class="small">${ph.perk}</span>` : ''}${got ? html`<a class="small" href="/verify/${got.verifyCode}">Certificate · ${got.verifyCode}</a>` : ''}</div></div>`;
  })}
    </div>

    <div class="card"><h2>My categories</h2>
      <div class="chips wrap">${Object.entries(CATEGORIES).map(([k, c]) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${u.categories.includes(k)}">${icon(CAT_ICON[k], 16)}${c.label}</button>`)}</div></div>

    <div class="card"><div class="row between"><h2>Rewards</h2><span class="small muted">${p.redeemedThisMonth}/${p.monthlyCap} this month</span></div>
      ${p.rewards.length ? html`<div class="stack">${p.rewards.map((r) => html`<div class="row between" style="align-items:flex-start"><div class="stack" style="gap:0"><strong>${r.title}</strong><span class="small muted">${r.description}</span></div><button class="btn sm ${u.points >= r.costPoints ? '' : 'light'}" type="button" data-redeem="${r.id}" ${u.points >= r.costPoints && p.redeemedThisMonth < p.monthlyCap ? '' : 'disabled'}>${r.costPoints} pts</button></div>`)}</div>` : html`<p class="small muted">The municipality hasn't enabled rewards yet.</p>`}
      ${p.redemptions.length ? html`<p class="label">My vouchers</p>${p.redemptions.map((r) => html`<p class="small">${r.title} · <strong>${r.voucherCode}</strong></p>`)}` : ''}
      <p class="small muted">Vouchers, not cash.</p></div>

    ${open.map((s) => html`<form class="card soft" id="survey-${s.id}" data-survey="${s.id}"><span class="label">Survey</span><h2>${s.title}</h2>
      ${s.questions.map((q) => html`<div class="stack" style="gap:6px"><strong class="small">${q.text}</strong>${q.kind === 'rating' ? html`<div class="chips">${[1, 2, 3, 4, 5].map((n) => html`<button class="chip" type="button" data-rate="${q.id}" data-v="${n}" aria-pressed="false">${n}</button>`)}</div>`
    : q.kind === 'choice' ? html`<select name="${q.id}"><option value="">Choose…</option>${q.options.map((o) => html`<option>${o}</option>`)}</select>` : html`<input type="text" name="${q.id}" maxlength="300">`}</div>`)}
      <button class="btn sm" type="submit">Send answers</button></form>`)}

    <div class="card"><h2>Data cards</h2>${p.dataCards.length ? html`<div class="stack">${p.dataCards.map((c) => html`<a class="row between" href="/action/${c.actionId}" style="text-decoration:none;color:inherit"><div class="stack" style="gap:0"><strong>${c.actionTitle}</strong><span class="small muted">${c.impact || `${c.bags} bags`}</span></div>${catTag(c.category)}</a>`)}</div>` : html`<p class="small muted">Your data cards from actions appear here.</p>`}</div>

    <div class="card"><h2>Points history</h2>${p.history.length ? html`<div class="stack" style="gap:6px">${p.history.map((e) => html`<div class="row between small"><span>${e.reason}</span><strong class="num" style="color:${e.amount < 0 ? '#9A4312' : '#1E5A3F'}">${e.amount > 0 ? '+' : ''}${e.amount}</strong></div>`)}</div>` : html`<p class="small muted">No points yet.</p>`}</div>

    <div class="card"><h2>My profile QR</h2><p class="small muted">Anyone can scan it to see your verified activity, only what you allow.</p><div class="qrbox" id="qr"></div><a class="small" href="/verify/${u.verifyCode}">${verifyUrl}</a></div>

    <div class="card"><h2>Invite friends</h2><p class="small">Your code <strong>${u.referralCode}</strong>. When 3 friends attend an action through your link, you get +30 points.</p>
      <a class="btn light" href="${whatsappUrl('Join me on GreenELB and help clean up Elbasan:', shareLink('/', { ref: u.referralCode, src: 'whatsapp' }))}" target="_blank" rel="noopener">${icon('share', 18)} Share on WhatsApp</a></div>

    <div class="list"><a href="/profile/privacy" class="row between" style="text-decoration:none;color:inherit">${icon('shield')}<span style="flex:1">Privacy settings</span>${icon('right')}</a>
      <a href="/impact" class="row between" style="text-decoration:none;color:inherit">${icon('leaf')}<span style="flex:1">Elbasan's Green Impact</span>${icon('right')}</a>
      <button type="button" id="logout" class="row" style="border:0;background:none;width:100%;text-align:left;cursor:pointer;min-height:48px">${icon('logout')}<span>Sign out</span></button></div>`.toString();

  renderQr($('#qr', view), verifyUrl);
  on(view, 'click', '[data-cat]', async (e, b) => {
    const k = b.dataset.cat;
    const cats = u.categories.includes(k) ? u.categories.filter((x) => x !== k) : [...u.categories, k];
    if (!cats.length) return toast('Keep at least one category.');
    await api('/api/me', { method: 'PATCH', body: { categories: cats } });
    await refreshMe();
    refresh();
  });
  on(view, 'click', '[data-redeem]', async (e, b) => {
    try {
      const r = await api(`/api/rewards/${b.dataset.redeem}/redeem`, { method: 'POST' });
      toast(`Redeemed! Voucher code ${r.redemption.voucherCode}`, 6000);
      await refreshMe();
      refresh();
    } catch (ex) { toast(ex.message); }
  });
  const ratings = {};
  on(view, 'click', '[data-rate]', (e, b) => {
    ratings[b.dataset.rate] = Number(b.dataset.v);
    b.parentElement.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  view.querySelectorAll('[data-survey]').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const answers = { ...Object.fromEntries(new FormData(form)), ...ratings };
      try {
        await api(`/api/surveys/${form.dataset.survey}/respond`, { method: 'POST', body: { answers } });
        form.innerHTML = '<strong>Thanks! Your answers help the municipality.</strong>';
      } catch (ex) { toast(ex.message); }
    };
  });
  $('#logout', view).onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    session.token = null;
    await refreshMe();
    go('/welcome');
  };
  if (location.hash.startsWith('#survey-')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

export async function privacy(view, { refreshMe, go, isCurrent }) {
  const { user: u } = await api('/api/me');
  if (!isCurrent()) return;
  const minor = u.ageGroup === '16-17';
  const vis = u.verifyVisibility || {};
  view.innerHTML = html`
    <a class="linkbtn row" href="/profile" style="gap:4px">${icon('left', 18)} Green Passport</a>
    <h1>Privacy</h1>
    ${minor ? html`<div class="card soft small">You're 16–17, so we keep your profile private and show your nickname by default.</div>` : ''}
    <div class="card">
      <label class="switch"><span>Show my display name${u.displayName ? ` (${u.displayName})` : ''} instead of my nickname on leaderboards and cards</span><input type="checkbox" id="showReal" ${u.showRealName ? 'checked' : ''} ${u.displayName ? '' : 'disabled'} style="width:22px;height:22px;accent-color:#1E5A3F"></label>
      <label class="switch"><span>Private profile</span><input type="checkbox" id="private" ${u.isPrivate ? 'checked' : ''} style="width:22px;height:22px;accent-color:#1E5A3F"></label>
    </div>
    <div class="card"><h2>Public verify page shows</h2>
      ${[['points', 'Points'], ['actions', 'Actions'], ['hours', 'Hours'], ['certificates', 'Certificates'], ['type', 'User type'], ['categories', 'Categories']].map(([k, label]) => html`<label class="check"><input type="checkbox" data-vis="${k}" ${vis[k] ? 'checked' : ''}> ${label}</label>`)}
      <a class="small" href="/verify/${u.verifyCode}">Preview my verify page</a></div>
    <button class="btn" type="button" id="save">Save privacy settings</button>
    <div class="card"><h2>My data</h2><p class="small muted">Everything we store about you, as a JSON file.</p><button class="btn light" type="button" id="export">${icon('download', 18)} Download my data</button></div>
    <div class="card"><h2>Delete my account</h2><p class="small muted">Deletes your profile, activity and photos. This cannot be undone.</p><button class="btn light" type="button" id="delete" style="color:#B3261E;border-color:#B3261E">Delete my account</button></div>
    <p class="small muted">We never track your location in the background. It's saved only when you take a report photo or check in. Photos with faces, plates or documents are never saved.</p>`.toString();
  $('#save', view).onclick = async () => {
    await api('/api/me', { method: 'PATCH', body: {
      showRealName: $('#showReal', view).checked,
      isPrivate: $('#private', view).checked,
      verifyVisibility: Object.fromEntries([...view.querySelectorAll('[data-vis]')].map((i) => [i.dataset.vis, i.checked])),
    } });
    await refreshMe();
    toast('Saved.');
  };
  $('#export', view).onclick = async () => {
    const data = await api('/api/me/export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'greenelb-my-data.json';
    a.click();
  };
  const del = $('#delete', view);
  del.onclick = async () => {
    if (del.dataset.sure !== '1') {
      del.dataset.sure = '1';
      del.textContent = 'Tap again to delete everything';
      return;
    }
    await api('/api/me', { method: 'DELETE' });
    session.token = null;
    await refreshMe();
    toast('Your account and data were deleted.');
    go('/welcome');
  };
}

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function notifications(view, { refreshMe, isCurrent }) {
  const [{ notifications: list }, key] = await Promise.all([api('/api/notifications'), api('/api/push/key', { auth: false })]);
  if (!isCurrent()) return;
  const canPush = key.enabled && 'PushManager' in window && 'serviceWorker' in navigator;
  view.innerHTML = html`
    <h1>Notifications</h1>
    ${canPush && Notification.permission !== 'granted' ? html`<div class="card soft"><p class="small">Get notified about actions near you, even when the app is closed. Max 3 a day.</p><button class="btn sm" type="button" id="push">${icon('bell', 16)} Turn on notifications</button></div>` : ''}
    ${list.length ? html`<div class="list">${list.map((n) => html`<a href="${n.link || '/'}" style="text-decoration:none;color:inherit;${n.read ? '' : 'background:#E3EEE6'}" class="stack"><div class="row between"><strong>${n.title}</strong><span class="small muted">${ago(n.createdAt)}</span></div><span class="small">${n.body}</span></a>`)}</div>` : emptyState('bell', 'No notifications yet.')}`.toString();
  if (list.some((n) => !n.read)) {
    await api('/api/notifications/read', { method: 'POST', body: {} });
    refreshMe();
  }
  const push = $('#push', view);
  if (push) {
    push.onclick = async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return toast('Notifications are blocked in your browser settings.');
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) });
        await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
        toast('Notifications are on.');
        push.parentElement.remove();
      } catch { toast("Couldn't turn on notifications on this device."); }
    };
  }
}

export async function achievement(view, { params, refreshMe, isCurrent }) {
  const [meData, passportData] = await Promise.all([api('/api/me'), api('/api/me/passport')]);
  const ach = meData.achievements.find((a) => a.id === params.id) || null;
  const actionId = ach?.actionId || (ach ? null : params.id);
  const act = actionId ? await api(`/api/actions/${actionId}`).then((r) => r.action).catch(() => null) : null;
  if (!isCurrent()) return;
  const u = meData.user;
  const earned = ach ? ach.points : passportData.history.filter((e) => e.refId === actionId && e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const title = ach?.title || act?.title || 'Achievement';
  const next = nextPhase(u.lifetimePoints);
  const card = act?.me?.dataCard;
  const open = (await api('/api/actions', { auth: false })).actions.find((a) => ['collecting', 'leader_wanted'].includes(a.status) && a.id !== act?.id);
  const link = shareLink(open ? `/action/${open.id}` : '/', { ref: u.referralCode, src: 'instagram' });
  const templates = [['points', 'My points'], ...(act?.beforeUrl && act?.afterUrl ? [['before_after', 'Before and after']] : []), ['type', 'My type'], ...(card?.impact ? [['datacard', 'My data card']] : [])];
  let tpl = templates[0][0];
  let blur = false;
  let showName = !u.isPrivate;

  view.innerHTML = html`
    <div class="card dark" style="text-align:center;align-items:center">
      <span class="brand"><span class="mark">${icon('award', 18)}</span></span>
      <p class="label">${title}</p>
      <p class="hero-num" style="color:#BFE3CB;font-size:56px">+${earned}</p>
      <p class="muted">points · ${u.lifetimePoints} total</p>
      ${next ? html`<div class="stack" style="width:100%;gap:4px"><div class="row between small"><span>Next: ${next.title}</span><span class="num">${u.lifetimePoints}/${next.points}</span></div>${progress(u.lifetimePoints, next.points, 'lg')}</div>` : ''}
    </div>
    <div class="chips" role="group" aria-label="Story template">${templates.map(([k, l]) => html`<button class="chip" type="button" data-tpl="${k}" aria-pressed="${k === tpl}">${l}</button>`)}</div>
    <div class="story"><canvas id="story" aria-label="Story card preview"></canvas></div>
    <label class="switch"><span>Blur photos</span><input type="checkbox" id="blur" style="width:22px;height:22px;accent-color:#1E5A3F"></label>
    <label class="switch"><span>Show my name</span><input type="checkbox" id="showName" ${showName ? 'checked' : ''} style="width:22px;height:22px;accent-color:#1E5A3F"></label>
    <button class="btn lg" type="button" id="share">${icon('share', 18)} Share</button>
    <div class="row"><a class="btn light" style="flex:1" href="${whatsappUrl('I just helped clean up Elbasan with GreenELB!', link)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn light" style="flex:1" href="${facebookUrl(link)}" target="_blank" rel="noopener">Facebook</a></div>
    <a class="btn ghost" href="/">Back to the Municipality Space</a>`.toString();

  const canvas = $('#story', view);
  const draw = () => drawStory(canvas, {
    template: tpl, name: showName ? (u.showRealName && u.displayName ? u.displayName : u.nickname) : null, points: earned, lifetimePoints: u.lifetimePoints, nextPhase: next,
    userType: u.userType, userTypeLine: u.userTypeLine, category: act?.category, actionTitle: act?.title || title, beforeUrl: act?.beforeUrl, afterUrl: act?.afterUrl, impact: card?.impact, link,
  }, { blur, showName });
  on(view, 'click', '[data-tpl]', (e, b) => {
    tpl = b.dataset.tpl;
    view.querySelectorAll('[data-tpl]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  $('#blur', view).onchange = (e) => { blur = e.target.checked; draw(); };
  $('#showName', view).onchange = (e) => { showName = e.target.checked; draw(); };
  $('#share', view).onclick = async () => {
    const r = await shareCanvas(canvas, { title: 'GreenELB', text: 'I just helped clean up Elbasan with GreenELB!', url: link });
    if (r === 'downloaded') toast('Image saved. Share it from your gallery.');
  };
  await draw();
  if (ach) {
    await api(`/api/achievements/${ach.id}/seen`, { method: 'POST' });
    refreshMe();
  }
}

export async function verify(view, { params, isCurrent }) {
  const r = await api(`/api/verify/${encodeURIComponent(params.code)}`, { auth: false }).catch((e) => ({ error: e.message }));
  if (!isCurrent()) return;
  if (r.error) {
    view.innerHTML = emptyState('shield', r.error).toString();
    return;
  }
  const p = r.profile;
  view.innerHTML = html`
    <div class="card dark">
      <p class="label">Verified by GreenELB · Municipality of Elbasan</p>
      <h1 style="color:#fff">${p.name}</h1>
      ${p.userType ? html`<p class="muted">${p.userType}</p>` : ''}
      ${p.certificate ? html`<div class="tile"><strong>${p.certificate.title}</strong><p class="small muted">${p.certificate.phase} · issued ${fmtDate(p.certificate.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>` : ''}
      <div class="grid3">${p.points !== undefined ? html`<div class="tile stat"><b>${p.points}</b><span>points</span></div>` : ''}${p.actions !== undefined ? html`<div class="tile stat"><b>${p.actions}</b><span>actions</span></div>` : ''}${p.hours !== undefined ? html`<div class="tile stat"><b>${p.hours}</b><span>hours</span></div>` : ''}</div>
    </div>
    ${p.certificates?.length ? html`<div class="card"><h2>Certificates</h2>${p.certificates.map((c) => html`<p>${c.title} <span class="small muted">· ${c.phase}</span></p>`)}</div>` : ''}
    ${p.categories?.length ? html`<div class="card"><h2>Works on</h2><p>${p.categories.join(', ')}</p></div>` : ''}
    <p class="small muted">This page shows only what the volunteer chose to make public.</p>
    <a class="btn light" href="/impact">Elbasan's Green Impact</a>`.toString();
}

export async function impact(view, { isCurrent }) {
  const [d, schools] = await Promise.all([api('/api/impact', { auth: false }), api('/api/schools', { auth: false })]);
  if (!isCurrent()) return;
  view.innerHTML = html`
    <p class="label">Public · updated live</p>
    <h1>Elbasan's Green Impact</h1>
    <div class="grid2">
      <div class="card stat"><b>${d.kgCollected}</b><span>kg collected</span></div>
      <div class="card stat"><b>${d.treesPlanted}</b><span>trees planted</span></div>
      <div class="card stat"><b>${d.actions}</b><span>actions completed</span></div>
      <div class="card stat"><b>${d.youthEngaged}</b><span>young people engaged</span></div>
    </div>
    ${d.topItems.length ? html`<div class="card"><h2>Top items found</h2>${d.topItems.map(([k, n]) => html`<div class="row between small"><span>${({ bottles: 'Plastic bottles', bags: 'Bags', cans: 'Cans', glass: 'Glass', paper: 'Paper', cigarettes: 'Cigarette butts', bulky: 'Bulky items', other: 'Other' })[k] || k}</span><strong class="num">${n}</strong></div>`)}</div>` : ''}
    <div class="card"><h2>Cleaned sites</h2><div class="map small" id="map"></div></div>
    <div class="card"><h2>Pilot schools</h2>${schools.schools.map((s, i) => html`<div class="row between small"><span>${i + 1}. ${s.school}</span><strong class="num">${s.points}</strong></div>`)}</div>
    <a class="btn lg" href="/welcome">Join GreenELB</a>`.toString();
  const m = makeMap($('#map', view), { zoom: 12 });
  d.cleanedSites.forEach((h) => hotspotMarker(h).bindPopup(h.title).addTo(m));
}

export async function partner(view, { me, go, isCurrent }) {
  if (me.role !== 'partner') return go('/', { replace: true });
  if (!isCurrent()) return;
  view.innerHTML = html`
    <p class="label">Partner · ${me.org || me.nickname}</p>
    <h1>Propose news or an opportunity</h1>
    <p class="muted">The municipality reviews every proposal before young people see it.</p>
    <form class="card" id="f">
      <label class="field"><span>Type</span><select name="type"><option value="opportunity">Opportunity</option><option value="initiative">Initiative</option><option value="info">Info</option></select></label>
      <label class="field"><span>Category</span><select name="category"><option value="">All categories</option>${Object.entries(CATEGORIES).map(([k, c]) => html`<option value="${k}">${c.label}</option>`)}</select></label>
      <label class="field"><span>Title</span><input type="text" name="title" maxlength="120" required></label>
      <label class="field"><span>Text</span><textarea name="body" maxlength="1500" required></textarea></label>
      <button class="btn" type="submit">Send for approval</button>
    </form>
    <button class="linkbtn" type="button" id="out">Sign out</button>`.toString();
  $('#f', view).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/partner/news', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      e.target.reset();
      toast('Sent. The municipality will review it.');
    } catch (ex) { toast(ex.message); }
  };
  $('#out', view).onclick = () => { session.token = null; location.href = '/welcome'; };
}

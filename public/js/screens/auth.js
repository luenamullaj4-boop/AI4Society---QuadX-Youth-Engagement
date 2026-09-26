import {
  AGE_GROUPS, AREAS, AVAILABLE_TIME, CATEGORIES, PILOT_SCHOOLS, QUIZ, SETTING_PREFS, USER_TYPES,
} from '../config.js';
import { api, storedSource } from '../lib/api.js';
import { drawStory, shareCanvas } from '../lib/share.js';
import { $, $$, CAT_ICON, aiBox, html, icon, on, toast } from '../lib/ui.js';

export async function welcome(view, { config, signedIn, go, me }) {
  if (me) return go(me.role === 'partner' ? '/partner' : '/', { replace: true });
  view.innerHTML = html`
    <section class="stack lg" style="padding-top:8px">
      <p class="label">Municipality of Elbasan · Youth 16–29</p>
      <h1 style="font-size:32px">Clean up Elbasan. Get recognized for it.</h1>
      <p class="muted">Report hotspots, join and lead cleanups, plant trees, and earn points, certificates and rewards from the municipality.</p>
      <a class="btn lg" href="/onboarding">Get started</a>
      <a class="btn lg light" href="/impact">See Elbasan's Green Impact</a>
    </section>
    <form class="card" id="codeForm">
      <h2>Already have an account?</h2>
      <label class="field"><span>Your login code</span><input type="text" id="code" autocomplete="one-time-code" autocapitalize="characters" placeholder="10 characters" required></label>
      <p class="error" id="codeErr" hidden></p>
      <button class="btn" type="submit">Sign in</button>
    </form>
    ${config?.demo ? html`<section class="card dashed">
      <h2>Demo accounts</h2>
      <p class="small muted">Made-up people for the live demo. Not real data.</p>
      <div class="stack">${config.demoUsers.map((u) => html`<button class="option" type="button" data-demo="${u.id}" data-role="${u.role}">${icon(u.role === 'municipality' ? 'landmark' : 'user')}<span class="stack" style="gap:0"><strong>${u.name}</strong><span class="small muted">${u.blurb || ''}</span></span></button>`)}</div>
    </section>` : ''}`.toString();

  $('#codeForm', view).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#codeErr', view);
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { code: $('#code', view).value }, auth: false });
      await signedIn(r.token);
      go('/');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  };
  on(view, 'click', '[data-demo]', async (e, b) => {
    const r = await api('/api/auth/demo', { method: 'POST', body: { userId: b.dataset.demo }, auth: false });
    await signedIn(r.token);
    if (b.dataset.role === 'municipality') location.href = '/admin';
    else go('/');
  });
}

export async function onboarding(view, { signedIn, go, me }) {
  if (me) return go('/', { replace: true });
  const f = { nickname: '', displayName: '', ageGroup: '', school: '', area: '', categories: [], settingPref: '', availableTime: '', answers: {}, showRealName: false, isPrivate: false };
  const TOTAL = 4 + QUIZ.length + 1;
  let step = 0;

  const header = (n, title, sub = '') => html`
    <div class="steps" aria-label="Step ${n + 1} of ${TOTAL}">${Array.from({ length: TOTAL }, (_, i) => html`<span class="${i <= n ? 'on' : ''}"></span>`)}</div>
    <div class="stack" style="gap:4px"><p class="label">Step ${n + 1} of ${TOTAL}</p><h1>${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>`;
  const footer = (canNext, label = 'Continue') => html`<div class="row" style="margin-top:auto">
    ${step > 0 ? html`<button class="btn light" type="button" data-back>Back</button>` : html`<a class="btn light" href="/welcome">Cancel</a>`}
    <button class="btn" style="flex:1" type="button" data-next ${canNext ? '' : 'disabled'}>${label}</button></div>`;

  function draw() {
    const minor = f.ageGroup === '16-17';
    let body;
    if (step === 0) {
      body = html`${header(0, 'About you', 'Only what we need. No phone number, no address.')}
        <label class="field"><span>Nickname (shown by default)</span><input type="text" id="nickname" maxlength="24" value="${f.nickname}" autocomplete="nickname" required></label>
        <label class="field"><span>Display name (optional)</span><input type="text" id="displayName" maxlength="40" value="${f.displayName}" placeholder="e.g. Arta K."></label>
        <fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Age group</legend>
          <div class="chips wrap">${Object.entries(AGE_GROUPS).map(([k, v]) => html`<button class="chip" type="button" data-age="${k}" aria-pressed="${f.ageGroup === k}">${v}</button>`)}</div></fieldset>
        <label class="field"><span>School (optional)</span><select id="school"><option value="">No school / prefer not to say</option>${PILOT_SCHOOLS.map((s) => html`<option ${f.school === s ? 'selected' : ''}>${s}</option>`)}<option value="Other school" ${f.school === 'Other school' ? 'selected' : ''}>Other school</option></select></label>
        <label class="field"><span>Your neighbourhood</span><select id="area"><option value="">Choose…</option>${AREAS.map((a) => html`<option ${f.area === a.name ? 'selected' : ''}>${a.name}</option>`)}</select></label>
        ${footer(f.nickname.trim().length >= 2 && f.ageGroup && f.area)}`;
    } else if (step === 1) {
      body = html`${header(1, 'What do you care about?', 'Pick one or more. You can change this anytime.')}
        <div class="stack">${Object.entries(CATEGORIES).map(([k, c]) => html`<button class="option" type="button" data-cat="${k}" aria-pressed="${f.categories.includes(k)}"><span class="tag ${k}">${icon(CAT_ICON[k], 16)}</span><span class="stack" style="gap:0"><strong>${c.label}</strong><span class="small muted">${c.blurb}</span></span></button>`)}</div>
        ${footer(f.categories.length > 0)}`;
    } else if (step === 2) {
      body = html`${header(2, 'How do you like to help?')}
        <p class="label">Preferred setting</p>
        <div class="chips wrap">${Object.entries(SETTING_PREFS).map(([k, v]) => html`<button class="chip" type="button" data-set="${k}" aria-pressed="${f.settingPref === k}">${v}</button>`)}</div>
        <p class="label">Available time</p>
        <div class="stack">${Object.entries(AVAILABLE_TIME).map(([k, v]) => html`<button class="option" type="button" data-time="${k}" aria-pressed="${f.availableTime === k}">${icon('clock')}${v}</button>`)}</div>
        ${footer(f.settingPref && f.availableTime)}`;
    } else if (step >= 3 && step < 3 + QUIZ.length) {
      const q = QUIZ[step - 3];
      body = html`${header(step, q.q, `Quiz · question ${step - 2} of ${QUIZ.length}`)}
        <div class="stack">${Object.entries(q.options).map(([k, v]) => html`<button class="option" type="button" data-answer="${k}" aria-pressed="${f.answers[q.id] === k}">${v}</button>`)}</div>
        ${footer(Boolean(f.answers[q.id]))}`;
    } else {
      body = html`${header(TOTAL - 1, 'Your privacy', 'You decide what others see. You can change it later in your profile.')}
        ${minor ? html`<div class="card soft small">Because you're 16–17, your profile is private and your nickname is shown. That keeps you safe.</div>` : ''}
        <label class="check"><input type="checkbox" id="showReal" ${f.showRealName && !minor ? 'checked' : ''} ${minor || !f.displayName ? 'disabled' : ''}> Show my display name instead of my nickname on leaderboards and cards</label>
        <label class="check"><input type="checkbox" id="private" ${f.isPrivate || minor ? 'checked' : ''} ${minor ? 'disabled' : ''}> Keep my profile private</label>
        <p class="small muted">We never store your location except when you take a report photo or check in. Photos with faces or plates are never saved.</p>
        <p class="error" id="err" hidden></p>
        ${footer(true, 'Create my account')}`;
    }
    view.innerHTML = body.toString();
  }

  // Step 1 text fields: keep the form state in sync while typing.
  const syncAboutYou = () => {
    const nick = $('#nickname', view);
    if (!nick) return;
    f.nickname = nick.value;
    f.displayName = $('#displayName', view).value;
    f.school = $('#school', view).value;
    f.area = $('#area', view).value;
    $('[data-next]', view).disabled = !(f.nickname.trim().length >= 2 && f.ageGroup && f.area);
  };
  view.addEventListener('input', syncAboutYou);
  view.addEventListener('change', syncAboutYou);

  on(view, 'click', '[data-age]', (e, b) => { f.ageGroup = b.dataset.age; draw(); });
  on(view, 'click', '[data-cat]', (e, b) => {
    const k = b.dataset.cat;
    f.categories = f.categories.includes(k) ? f.categories.filter((x) => x !== k) : [...f.categories, k];
    draw();
  });
  on(view, 'click', '[data-set]', (e, b) => { f.settingPref = b.dataset.set; draw(); });
  on(view, 'click', '[data-time]', (e, b) => { f.availableTime = b.dataset.time; draw(); });
  on(view, 'click', '[data-answer]', (e, b) => {
    f.answers[QUIZ[step - 3].id] = b.dataset.answer;
    step += 1;
    draw();
  });
  on(view, 'click', '[data-back]', () => { step -= 1; draw(); });
  on(view, 'click', '[data-next]', async (e, b) => {
    if (step < TOTAL - 1) {
      step += 1;
      draw();
      return;
    }
    f.showRealName = $('#showReal', view).checked;
    f.isPrivate = $('#private', view).checked;
    b.disabled = true;
    b.textContent = 'Finding your type…';
    try {
      const { ref, src } = storedSource();
      const r = await api('/api/auth/signup', { method: 'POST', auth: false, body: { ...f, school: f.school === 'Other school' ? 'Other school' : f.school, ref, src } });
      await signedIn(r.token);
      result(r);
    } catch (ex) {
      const err = $('#err', view);
      err.textContent = ex.message;
      err.hidden = false;
      b.disabled = false;
      b.textContent = 'Create my account';
    }
  });

  // Result card: user type (AI) + the login code to keep.
  function result({ user, loginCode }) {
    const t = USER_TYPES[user.userType];
    view.innerHTML = html`
      <div class="card dark">
        <p class="label">Your changemaker type</p>
        <h1 style="font-size:34px;color:#fff">${t?.name}</h1>
        ${aiBox(html`<p>${user.userTypeLine || t?.line}</p>`)}
      </div>
      <div class="story" hidden><canvas id="story"></canvas></div>
      <button class="btn light" type="button" id="shareType">${icon('share')} Share my type</button>
      <div class="card warn">
        <strong>Save your login code</strong>
        <p class="display" style="font-size:26px;letter-spacing:2px">${loginCode}</p>
        <p class="small">You need it to sign in on another phone. Take a screenshot or write it down.</p>
      </div>
      <button class="btn lg" type="button" id="done">Go to the Municipality Space</button>`.toString();
    $('#done', view).onclick = () => go('/');
    $('#shareType', view).onclick = async () => {
      const canvas = $('#story', view);
      await drawStory(canvas, { template: 'type', userType: user.userType, userTypeLine: user.userTypeLine, name: user.nickname, link: `${location.origin}/?ref=${user.referralCode}&src=instagram` }, { showName: true });
      $('.story', view).hidden = false;
      const outcome = await shareCanvas(canvas, { title: 'My GreenELB type', text: `I'm ${t?.name} on GreenELB.` });
      if (outcome === 'downloaded') toast('Image saved. Share it from your gallery.');
    };
  }

  draw();
}

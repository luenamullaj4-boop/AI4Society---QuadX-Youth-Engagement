import { api, getConfig, rememberSource, session } from './lib/api.js';
import { createRouter } from './lib/router.js';
import { $, emptyState, html, icon, toast } from './lib/ui.js';
import * as screens from './screens/index.js';

const STAFF_KEY = 'greenelb-staff-token';
const state = { me: null, unread: 0, config: null, achievements: [] };
const root = document.getElementById('app');

const routes = [
  { path: '/', screen: screens.home, auth: true, tab: 'home' },
  { path: '/welcome', screen: screens.welcome, nav: false },
  { path: '/onboarding', screen: screens.onboarding, nav: false },
  { path: '/map', screen: screens.map, tab: 'home' },
  { path: '/report', screen: screens.report, auth: true, tab: 'report' },
  { path: '/actions', screen: screens.actions, auth: true, tab: 'actions' },
  { path: '/action/:id', screen: screens.action, tab: 'actions' },
  { path: '/action/:id/apply-leader', screen: screens.applyLeader, auth: true, tab: 'actions' },
  { path: '/action/:id/manage', screen: screens.manage, auth: true, tab: 'actions' },
  { path: '/action/:id/checkin', screen: screens.checkin, auth: true, tab: 'actions' },
  { path: '/action/:id/datacard', screen: screens.datacard, auth: true, tab: 'actions' },
  { path: '/profile', screen: screens.passport, auth: true, tab: 'profile' },
  { path: '/profile/privacy', screen: screens.privacy, auth: true, tab: 'profile' },
  { path: '/achievement/:id', screen: screens.achievement, auth: true, nav: false },
  { path: '/notifications', screen: screens.notifications, auth: true },
  { path: '/verify/:code', screen: screens.verify, nav: false },
  { path: '/impact', screen: screens.impact, nav: false },
  { path: '/partner', screen: screens.partner, auth: true, nav: false },
  { path: '*', screen: async (view) => { view.innerHTML = emptyState('map', 'This page does not exist.', html`<a class="btn" href="/">Go home</a>`).toString(); } },
];

async function refreshMe() {
  if (!session.token) {
    state.me = null;
    return null;
  }
  try {
    const r = await api('/api/me');
    state.me = r.user;
    state.unread = r.unread;
    state.achievements = r.achievements;
  } catch {
    state.me = null;
  }
  return state.me;
}

function shell(route) {
  const nav = route.nav !== false && state.me && state.me.role === 'youth';
  const staffBack = (() => { try { return localStorage.getItem(STAFF_KEY); } catch { return null; } })();
  const tabs = [['home', '/', 'landmark', 'Municipality'], ['report', '/report', 'camera', 'Report'], ['actions', '/actions', 'flag', 'Actions'], ['profile', '/profile', 'user', 'Profile']];
  root.innerHTML = html`
    ${staffBack && state.me?.role === 'youth' ? html`<div class="demo-bar"><span>Demo · viewing as ${state.me.nickname}</span><button type="button" data-back-staff>View as Municipality</button></div>` : ''}
    ${state.me?.role === 'municipality' ? html`<div class="demo-bar"><span>Signed in as the Municipality</span><a href="/admin">View as Municipality</a></div>` : ''}
    <header class="topbar">
      <a class="brand" href="${state.me ? '/' : '/welcome'}"><span class="mark">${icon('leaf', 18)}</span>GreenELB</a>
      ${state.me ? html`<a class="iconbtn" href="/notifications" aria-label="Notifications${state.unread ? `, ${state.unread} unread` : ''}">${icon('bell', 22)}${state.unread ? html`<span class="badge num">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}</a>` : html`<a class="btn sm" href="/welcome">Sign in</a>`}
    </header>
    <main class="view ${nav ? '' : 'nonav'}" id="view" tabindex="-1"></main>
    ${nav ? html`<nav class="tabbar" aria-label="Main"><div class="inner">${tabs.map(([key, href, ic, label]) => html`<a class="tab" href="${href}" ${route.tab === key ? 'aria-current="page"' : ''}>${icon(ic, 22)}<span>${label}</span></a>`)}</div></nav>` : ''}`.toString();
  const back = $('[data-back-staff]', root);
  if (back) {
    back.onclick = () => {
      session.token = staffBack;
      try { localStorage.removeItem(STAFF_KEY); } catch { /* ignore */ }
      location.href = '/admin';
    };
  }
  return $('#view', root);
}

let renderSeq = 0;
async function render({ route, params }) {
  const seq = ++renderSeq;
  if (route.auth && !state.me) {
    router.go('/welcome', { replace: true });
    return;
  }
  // Show a pending achievement once, the next time the app opens.
  const pending = state.achievements.find((a) => !a.seen);
  if (pending && route.path === '/' && !sessionStorage.getItem(`ach-${pending.id}`)) {
    sessionStorage.setItem(`ach-${pending.id}`, '1');
    router.go(`/achievement/${pending.id}`, { replace: true });
    return;
  }
  const view = shell(route);
  view.innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:88px"></div>';
  try {
    await route.screen(view, {
      params,
      me: state.me,
      config: state.config,
      go: (to, opts) => router.go(to, opts),
      refresh: () => router.go(location.pathname + location.search, { replace: true }),
      refreshMe: async () => { await refreshMe(); },
      signedIn: async (token) => {
        session.token = token;
        await refreshMe();
      },
      isCurrent: () => seq === renderSeq,
    });
  } catch (err) {
    if (seq !== renderSeq) return;
    view.innerHTML = emptyState('alert', err.message || 'Something went wrong.', html`<button class="btn" type="button" onclick="location.reload()">Try again</button>`).toString();
  }
}

const router = createRouter(routes, render);

window.addEventListener('greenelb:signedout', () => {
  state.me = null;
  toast('Please sign in again.');
  router.go('/welcome', { replace: true });
});

async function start() {
  rememberSource();
  state.config = await getConfig().catch(() => ({ ai: false, demo: false, demoUsers: [] }));
  await refreshMe();
  if (state.me?.role === 'partner' && location.pathname === '/') history.replaceState({}, '', '/partner');
  router.start();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Keep the bell fresh.
  setInterval(async () => {
    if (!state.me || document.hidden) return;
    const before = state.unread;
    await refreshMe();
    if (state.unread !== before) {
      const badgeHost = $('.topbar a[href="/notifications"]', root);
      if (badgeHost) badgeHost.innerHTML = html`${icon('bell', 22)}${state.unread ? html`<span class="badge num">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}`.toString();
    }
  }, 30000);
}

start();


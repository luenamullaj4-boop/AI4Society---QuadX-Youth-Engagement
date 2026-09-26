// History-API router. Routes are '/action/:id/manage' style patterns.
export function createRouter(routes, render) {
  const compiled = routes.map((r) => ({ ...r, re: r.path === '*' ? /(?!)/ : new RegExp(`^${r.path.replace(/:(\w+)/g, '(?<$1>[\\w-]+)')}/?$`) }));

  function resolve(pathname) {
    for (const r of compiled) {
      const m = pathname.match(r.re);
      if (m) return { route: r, params: m.groups || {} };
    }
    return { route: compiled.find((r) => r.path === '*'), params: {} };
  }

  function go(to, { replace = false } = {}) {
    if (to === location.pathname + location.search) return render(resolve(location.pathname));
    if (replace) history.replaceState({}, '', to);
    else history.pushState({}, '', to);
    window.scrollTo(0, 0);
    return render(resolve(location.pathname));
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;
    e.preventDefault();
    go(url.pathname + url.search);
  });
  window.addEventListener('popstate', () => render(resolve(location.pathname)));

  return { go, start: () => render(resolve(location.pathname)) };
}

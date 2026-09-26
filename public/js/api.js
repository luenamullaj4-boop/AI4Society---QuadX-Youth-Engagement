// One interface, two backends:
//  - live: the Node server in /server is running, data is shared by everyone
//  - demo: static hosting (e.g. GitHub Pages), sample data, saved in this browser only

const KEYS = { joined: 'ev-joined', reports: 'ev-reports' };

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode): the page still works for this visit.
  }
}

export async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

async function isLive() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch('api/health', { signal: ctl.signal });
    return res.ok && (await res.json()).mode === 'live';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function connect() {
  return (await isLive()) ? liveApi() : demoApi();
}

function liveApi() {
  // hotspotId -> { signupId, cancelToken }
  const joined = load(KEYS.joined, {});
  const mine = load(KEYS.reports, []);
  const keep = () => { save(KEYS.joined, joined); save(KEYS.reports, mine); };

  return {
    mode: 'live',
    async listHotspots() {
      return (await request('api/hotspots')).hotspots;
    },
    isJoined: (id) => Boolean(joined[id]?.signupId),
    async join(id, form) {
      const { signup, hotspot } = await request(`api/hotspots/${encodeURIComponent(id)}/signups`, { method: 'POST', body: form });
      joined[id] = { signupId: signup.id, cancelToken: signup.cancelToken };
      keep();
      return hotspot;
    },
    async leave(id) {
      const s = joined[id];
      if (!s) return null;
      const { hotspot } = await request(`api/signups/${encodeURIComponent(s.signupId)}?token=${encodeURIComponent(s.cancelToken)}`, { method: 'DELETE' });
      delete joined[id];
      keep();
      return hotspot;
    },
    async report(data) {
      const { report } = await request('api/reports', { method: 'POST', body: data });
      mine.push({ ...report, desc: data.desc, dx: Math.round(Math.random() * 30 - 15), dy: Math.round(Math.random() * 20 + 12) });
      keep();
      return report;
    },
    async myReports() {
      await Promise.all(mine.map(async (r) => {
        try {
          const { report } = await request(`api/reports/${encodeURIComponent(r.id)}`);
          r.status = report.status;
        } catch {
          // Keep the last known status if the server can't be reached.
        }
      }));
      keep();
      return mine;
    },
  };
}

function demoApi() {
  // hotspotId -> true
  const joined = load(KEYS.joined, {});
  const mine = load(KEYS.reports, []);
  const keep = () => { save(KEYS.joined, joined); save(KEYS.reports, mine); };
  let hotspots = null;

  return {
    mode: 'demo',
    async listHotspots() {
      if (!hotspots) {
        const res = await fetch('data/hotspots.json');
        hotspots = (await res.json()).hotspots;
      }
      return hotspots.map((h) => ({ ...h, have: h.have + (joined[h.id] ? 1 : 0) }));
    },
    isJoined: (id) => Boolean(joined[id]),
    async join(id) {
      // Demo mode keeps no personal data: only the fact that you joined.
      joined[id] = true;
      keep();
      return (await this.listHotspots()).find((h) => h.id === id);
    },
    async leave(id) {
      delete joined[id];
      keep();
      return (await this.listHotspots()).find((h) => h.id === id);
    },
    async report(data) {
      const report = { id: `local-${Date.now()}`, unit: data.unit, cat: data.cat, desc: data.desc, status: 'pending', dx: Math.round(Math.random() * 30 - 15), dy: Math.round(Math.random() * 20 + 12) };
      mine.push(report);
      keep();
      return report;
    },
    async myReports() {
      return mine;
    },
  };
}

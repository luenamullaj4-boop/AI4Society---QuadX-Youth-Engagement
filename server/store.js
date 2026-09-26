import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A small JSON-file store. Good enough for a hackathon demo and a single
// server process; swap for SQLite or Postgres before real use.
export async function openStore(file, seedFile) {
  let db;
  let queue = Promise.resolve();

  async function persist() {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2));
    await rename(tmp, file);
  }

  // Serialize writes so two requests never interleave on disk.
  function save() {
    queue = queue.then(persist);
    return queue;
  }

  try {
    db = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const seed = JSON.parse(await readFile(seedFile, 'utf8'));
    db = { hotspots: seed.hotspots, signups: [], reports: [] };
    await mkdir(dirname(file), { recursive: true });
    await save();
  }

  const findHotspot = (id) => db.hotspots.find((h) => h.id === id);

  return {
    listHotspots({ cat, urg } = {}) {
      return db.hotspots.filter((h) => (!cat || h.cat === cat) && (!urg || h.urg === urg));
    },

    getHotspot(id) {
      const h = findHotspot(id);
      if (!h) throw new StoreError(404, 'No hotspot with that id.');
      return h;
    },

    async addSignup(hotspotId, data) {
      const h = this.getHotspot(hotspotId);
      if (h.have >= h.need) throw new StoreError(409, 'This crew is already full.');
      const duplicate = db.signups.some((s) => s.hotspotId === hotspotId && s.email === data.email && !s.cancelledAt);
      if (duplicate) throw new StoreError(409, 'This email is already signed up for this action.');
      const signup = {
        id: randomUUID(),
        cancelToken: randomBytes(16).toString('hex'),
        hotspotId,
        ...data,
        createdAt: new Date().toISOString(),
      };
      db.signups.push(signup);
      h.have += 1;
      await save();
      return { signup, hotspot: h };
    },

    async cancelSignup(id, token) {
      const s = db.signups.find((x) => x.id === id);
      if (!s || s.cancelToken !== token) throw new StoreError(404, 'No sign-up matches that id and token.');
      if (s.cancelledAt) return findHotspot(s.hotspotId);
      s.cancelledAt = new Date().toISOString();
      const h = findHotspot(s.hotspotId);
      if (h) h.have = Math.max(0, h.have - 1);
      await save();
      return h;
    },

    listSignups(hotspotId) {
      return db.signups.filter((s) => !s.cancelledAt && (!hotspotId || s.hotspotId === hotspotId));
    },

    async addReport(data) {
      const report = { id: randomUUID(), ...data, status: 'pending', createdAt: new Date().toISOString() };
      db.reports.push(report);
      await save();
      return report;
    },

    getReport(id) {
      const r = db.reports.find((x) => x.id === id);
      if (!r) throw new StoreError(404, 'No report with that id.');
      return r;
    },

    listReports(status) {
      return db.reports.filter((r) => !status || r.status === status);
    },

    async approveReport(id, fields) {
      const r = this.getReport(id);
      if (r.status !== 'pending') throw new StoreError(409, `This report is already ${r.status}.`);
      const hotspot = { id: `h-${randomBytes(4).toString('hex')}`, unit: r.unit, cat: r.cat, have: 0, fromReport: r.id, ...fields };
      db.hotspots.push(hotspot);
      Object.assign(r, { status: 'approved', hotspotId: hotspot.id, reviewedAt: new Date().toISOString() });
      await save();
      return { report: r, hotspot };
    },

    async rejectReport(id, reason) {
      const r = this.getReport(id);
      if (r.status !== 'pending') throw new StoreError(409, `This report is already ${r.status}.`);
      Object.assign(r, { status: 'rejected', reason: reason || '', reviewedAt: new Date().toISOString() });
      await save();
      return r;
    },

    stats() {
      const open = db.hotspots.length;
      const signedUp = db.hotspots.reduce((sum, h) => sum + h.have, 0);
      const freeSpots = db.hotspots.reduce((sum, h) => sum + Math.max(0, h.need - h.have), 0);
      const pendingReports = db.reports.filter((r) => r.status === 'pending').length;
      return { open, signedUp, freeSpots, pendingReports };
    },

    flush: () => queue,
  };
}

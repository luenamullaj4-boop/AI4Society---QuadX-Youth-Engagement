// JSON-file database with named collections (mirrors the spec's tables).
// Writes are serialized and atomic (temp file + rename). Fine for one server
// process at a hackathon; the collection layout maps 1:1 onto Postgres tables.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const COLLECTIONS = [
  'users', 'interestEvents', 'hotspots', 'confirmations', 'actions', 'leaderApplications', 'signups',
  'attendance', 'dataCards', 'pickups', 'news', 'notifications', 'interestRequests', 'pointEvents',
  'certificates', 'rewards', 'redemptions', 'surveys', 'surveyResponses', 'aiCache', 'messages',
  'achievements', 'photos', 'pushSubscriptions', 'demandAlerts', 'schoolPoints',
];

export async function openDb(file, seed) {
  let data;
  let queue = Promise.resolve();
  const uploadsDir = join(dirname(file), 'uploads');

  async function persist() {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, file);
  }

  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    data.settings = {};
    await mkdir(dirname(file), { recursive: true });
    await mkdir(uploadsDir, { recursive: true });
    if (seed) await seed({ data, uploadsDir, id: randomUUID });
    await persist();
  }
  COLLECTIONS.forEach((c) => { data[c] ||= []; });
  data.settings ||= {};
  await mkdir(uploadsDir, { recursive: true });

  return {
    data,
    uploadsDir,
    id: randomUUID,
    save() {
      queue = queue.then(persist);
      return queue;
    },
    find(collection, pred) {
      return data[collection].find(pred) || null;
    },
    filter(collection, pred = () => true) {
      return data[collection].filter(pred);
    },
    byId(collection, id) {
      return data[collection].find((x) => x.id === id) || null;
    },
    insert(collection, row) {
      const item = { id: randomUUID(), createdAt: new Date().toISOString(), ...row };
      data[collection].push(item);
      return item;
    },
    remove(collection, pred) {
      const before = data[collection].length;
      data[collection] = data[collection].filter((x) => !pred(x));
      return before - data[collection].length;
    },
  };
}

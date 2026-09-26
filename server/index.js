import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAi } from './ai.js';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { tick } from './logic.js';
import { createPush } from './push.js';
import { seed } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..');

try {
  process.loadEnvFile(join(rootDir, '.env'));
} catch {
  // No .env file: rely on real environment variables.
}

const port = Number(process.env.PORT) || 3000;
const dataFile = process.env.DATA_FILE || join(rootDir, 'data', 'db.json');
const demo = process.env.DEMO_MODE === 'true';

const db = await openDb(dataFile, seed);
// A stable secret for QR codes; generated once and kept in the database.
db.data.settings.qrSecret ||= process.env.QR_SECRET || randomBytes(32).toString('hex');
await db.save();

const ai = await createAi({ db });
const push = await createPush(db);
const app = createApp({
  db, ai, push, demo, publicDir: join(rootDir, 'public'), adminToken: process.env.ADMIN_TOKEN || '', secret: db.data.settings.qrSecret,
});

// Timed transitions: offers expiring, application windows, auto-confirm, reminders.
setInterval(() => tick(db, ai, push.send).catch((err) => console.error('tick failed', err)), 60 * 1000);

createServer(app).listen(port, () => {
  console.log(`GreenELB running at http://localhost:${port}`);
  console.log(`Admin:     http://localhost:${port}/admin ${process.env.ADMIN_TOKEN ? '' : '(set ADMIN_TOKEN to enable staff sign-in)'}`);
  console.log(`AI:        ${ai.enabled ? `Claude (${ai.model})` : 'off — set ANTHROPIC_API_KEY. Fallback rules are used.'}`);
  console.log(`Web push:  ${push.enabled ? 'on' : 'off (set VAPID keys to enable)'}`);
  console.log(`Demo mode: ${demo ? 'on (demo accounts + sample photos)' : 'off'}`);
});

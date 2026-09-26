import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';
import { openStore } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..');

// Load .env if present (Node 20.12+ / 22).
try {
  process.loadEnvFile(join(rootDir, '.env'));
} catch {
  // No .env file: rely on real environment variables.
}

const port = Number(process.env.PORT) || 3000;
const dataFile = process.env.DATA_FILE || join(rootDir, 'data', 'db.json');
const publicDir = join(rootDir, 'public');

const store = await openStore(dataFile, join(publicDir, 'data', 'hotspots.json'));
const app = createApp({ store, publicDir, adminToken: process.env.ADMIN_TOKEN || '' });

createServer(app).listen(port, () => {
  console.log(`Elbasani Vepron running at http://localhost:${port}`);
  console.log(`Admin panel: http://localhost:${port}/admin ${process.env.ADMIN_TOKEN ? '' : '(disabled: set ADMIN_TOKEN)'}`);
  console.log(`Data file: ${dataFile}`);
});

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '..', '..', '.env'), override: true });

const { sync } = await import('./index.js');

const result = await sync();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

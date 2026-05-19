import { sync } from './index.js';

const result = await sync();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

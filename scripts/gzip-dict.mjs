// Makes assets/dict/krdict.db.gz for the web build (see src/dict/compactSource.web.ts).
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip, constants } from 'node:zlib';

const src = new URL('../assets/dict/krdict.db', import.meta.url);
const dst = new URL('../assets/dict/krdict.db.gz', import.meta.url);
await pipeline(createReadStream(src), createGzip({ level: constants.Z_BEST_COMPRESSION }), createWriteStream(dst));
console.log(`krdict.db.gz: ${(statSync(dst).size / 1048576).toFixed(1)} MB`);

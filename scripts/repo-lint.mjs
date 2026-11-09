// Repo rules that Biome does not cover (doc 10 section 7). Quiet on success; one line per offence.
//   1. No U+2014 anywhere in tracked text.
//   2. No Math.random / Date.now / performance.now in packages/sim/src (determinism).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f !== '' && !/\.(png|jpg|bin|gz|ico|woff2?)$/.test(f) && f !== 'pnpm-lock.yaml');

const EM_DASH = String.fromCharCode(0x2014);
const NONDETERMINISTIC = /\b(Math\.random|Date\.now|performance\.now)\b/;
const offences = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') continue; // deleted but still in the index
    throw err;
  }
  const lines = text.split('\n');
  const simSource = file.startsWith('packages/sim/src/') && !file.endsWith('.test.ts');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(EM_DASH)) offences.push(`${file}:${i + 1}: em-dash (U+2014) is banned`);
    if (simSource) {
      const m = NONDETERMINISTIC.exec(lines[i]);
      if (m) offences.push(`${file}:${i + 1}: ${m[1]} is banned in packages/sim (determinism)`);
    }
  }
}
for (const o of offences) console.error(o);
process.exit(offences.length === 0 ? 0 : 1);

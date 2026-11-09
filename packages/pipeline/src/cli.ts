/**
 * Pipeline entry: `node src/cli.ts <stage>`, run through `pnpm data:build` (stage `build`: everything).
 * Each stage is its own process so a failure stops the chain with that stage's diagnostic.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { STAGES } from './index.ts';

const stage = process.argv[2];
if (stage === undefined) {
  console.error(`pipeline: missing stage argument (usage: node src/cli.ts <build|${STAGES.join('|')}>)`);
  process.exit(2);
}
const run = stage === 'build' ? STAGES : [stage];
for (const name of run) {
  if (!STAGES.includes(name)) {
    console.error(`pipeline: unknown stage "${name}" (known stages: build, ${STAGES.join(', ')})`);
    process.exit(2);
  }
  const result = spawnSync(process.execPath, [path.join(import.meta.dirname, name, 'cli.ts')], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`pipeline: stage "${name}" failed${result.signal ? ` (signal ${result.signal})` : ''}`);
    process.exit(result.status ?? 1);
  }
}

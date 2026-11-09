/** Pipeline entry: `node src/cli.ts <stage>`. Run through `pnpm data:build`. */
import { STAGES } from './index.ts';

const stage = process.argv[2];
if (stage === undefined) {
  console.error('pipeline: missing stage argument (usage: node src/cli.ts <stage>)');
  process.exit(2);
}
// M0: no stage is implemented yet. Fail loudly instead of pretending data was built.
console.error(`pipeline: stage "${stage}" is not implemented (known stages: ${STAGES.join(', ') || 'none yet'})`);
process.exit(1);

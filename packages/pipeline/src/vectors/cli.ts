/** Entry of `pnpm data:build:vectors`. Any failure exits 1 with a one-line diagnostic. */
import { buildVectors } from './build.ts';

try {
  await buildVectors();
} catch (err) {
  console.error(`VECTOR BUILD FAILED: ${(err as Error).message}`);
  process.exit(1);
}

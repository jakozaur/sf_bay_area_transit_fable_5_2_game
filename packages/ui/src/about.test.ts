/** The README repeats what the build took; it must say what the game says. */
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { BUILD_COST_LINE, BUILD_FACTS, GITHUB_URL } from './about.ts';

test('the README section on how the game was built carries the same figures as the game', () => {
  // The formatter pads table cells: compare with runs of spaces folded.
  const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8').replace(/ +/g, ' ');
  expect(readme).toContain(BUILD_COST_LINE);
  expect(readme).toContain(GITHUB_URL);
  for (const [what, value] of BUILD_FACTS) expect(readme, what).toContain(`| ${what} | ${value} |`);
});

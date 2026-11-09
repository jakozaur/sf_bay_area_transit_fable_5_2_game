// Runs `tsc --noEmit` for every workspace tsconfig in parallel. Quiet on success; prints compiler output on failure.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dirs = ['e2e'];
for (const group of ['packages', 'apps']) {
  for (const name of readdirSync(join(root, group))) dirs.push(join(group, name));
}
const projects = dirs.filter((d) => existsSync(join(root, d, 'tsconfig.json'))).sort();
const tsc = join(root, 'node_modules', '.bin', 'tsc');

const results = await Promise.all(
  projects.map(
    (dir) =>
      new Promise((resolve) => {
        const child = spawn(tsc, ['--noEmit', '--pretty', 'false', '-p', join(dir, 'tsconfig.json')], { cwd: root });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.on('error', (err) => resolve({ dir, code: 1, out: String(err) }));
        child.on('close', (code) => resolve({ dir, code, out }));
      }),
  ),
);
const failed = results.filter((r) => r.code !== 0);
for (const r of failed) process.stderr.write(`typecheck failed: ${r.dir}\n${r.out}`);
process.exit(failed.length === 0 ? 0 : 1);

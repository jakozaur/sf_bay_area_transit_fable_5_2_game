// Screenshot runner of the render demo: starts Vite on its own port, opens every view in headless Chromium
// (hardware GPU through ANGLE Metal, like the e2e gpu project) and writes one PNG per view.
// Usage, from the repo root: node packages/render/demo/shoot.mjs <output dir> [view ...]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (out === undefined) {
  console.error('shoot: usage: node packages/render/demo/shoot.mjs <output dir> [view ...]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const root = fileURLToPath(new URL('../../..', import.meta.url));
// Playwright is a dependency of the e2e package only.
const { chromium } = createRequire(`${root}e2e/package.json`)('@playwright/test');
const PORT = 5312;
const server = spawn('pnpm', ['exec', 'vite', '--config', 'packages/render/demo/vite.config.ts', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});
let failed = false;
try {
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`);
      up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!up) throw new Error(`shoot: Vite did not come up on port ${PORT}`);
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => {
    failed = true;
    console.error(`shoot: page error: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    failed = true;
    console.error(`shoot: console ${m.type()}: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate(() => window.__demo.ready);
  const all = await page.evaluate(() => window.__demo.views);
  const wanted = process.argv.length > 3 ? process.argv.slice(3) : all;
  const report = {};
  for (const name of wanted) {
    await page.evaluate((n) => window.__demo.view(n), name);
    await page.evaluate(() => window.__demo.tick(0.4));
    await page.screenshot({ path: `${out}/${name}.png` });
    report[name] = await page.evaluate(() => ({ ...window.__demo.stats(), meanMs: Number(window.__demo.bench(120).toFixed(3)) }));
  }
  if (wanted.includes('face')) {
    await page.evaluate(() => {
      window.__demo.view('face');
      window.__demo.flash();
      window.__demo.tick(0.25);
    });
    await page.screenshot({ path: `${out}/flash.png` });
  }
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} catch (err) {
  failed = true;
  console.error(err instanceof Error ? err.message : err);
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);

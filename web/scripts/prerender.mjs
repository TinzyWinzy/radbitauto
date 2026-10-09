import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(webDir, 'dist');
const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

const routes = [
  { route: '/', out: 'index.html', waitFor: 'main h1' },
  { route: '/help', out: 'help/index.html', waitFor: 'h1' },
  // The import catalogue loads supplier stock through a public callable, so
  // wait for that render to settle before capture; head/title/canonical are
  // already correct as soon as the route mounts.
  { route: '/imports', out: 'imports/index.html', waitFor: 'main h1', waitForGone: 'Loading BE FORWARD vehicles', settle: 10000 },
];

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ORIGIN, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Preview server did not start');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: webDir, shell: true, stdio: 'ignore' });
let exitCode = 0;
try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const r of routes) {
    try {
      await page.goto(`${ORIGIN}${r.route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(r.waitFor, { timeout: 15000 });
      if (r.waitForGone) {
        const deadline = Date.now() + (r.settle ?? 6000);
        while (Date.now() < deadline) {
          if ((await page.locator(`text=${r.waitForGone}`).count()) === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } else {
        await page.waitForTimeout(r.settle ?? 1500);
      }
    } catch (err) {
      console.warn(`Prerender warning for ${r.route}: ${err.message}`);
    }
    const html = (await page.content()).replace(/^<html/, '<!doctype html><html');
    const target = path.join(distDir, r.out);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
    console.log(`Prerendered ${r.route} -> dist/${r.out}`);
  }
  await browser.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  server.kill();
}
process.exit(exitCode);

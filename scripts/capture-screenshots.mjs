#!/usr/bin/env node
/**
 * Capture real Surgimate UI screenshots for the GitHub Pages demo.
 * Prerequisites: Angular (4200) + Rails (3000) running locally.
 *
 * Usage:
 *   npm install && npm run screenshots:install
 *   npm run screenshots
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'screenshots');
const RAILS = path.resolve(ROOT, '../../koala-rails');
const BASE = 'http://127.0.0.1:4200';
const EMAIL = process.env.SCREENSHOT_USER || 'green@surgimate.com';
const PASSWORD = process.env.SCREENSHOT_PASSWORD || 'ScreenshotDemo1!';

const VIEWPORT = { width: 1440, height: 900 };

function railsRunner(mode) {
  const cmd = `DISABLE_SPRING=1 bundle exec rails runner ${path.join(ROOT, 'scripts/screenshot-setup.rb')} ${mode}`;
  execSync(cmd, { cwd: RAILS, stdio: 'inherit', env: { ...process.env, SCREENSHOT_USER: EMAIL, SCREENSHOT_PASSWORD: PASSWORD } });
}

async function apiLogin(context, page, hash = '/home') {
  const res = await context.request.post('http://127.0.0.1:3000/authenticate', {
    data: { email: EMAIL, password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  if (!body.auth_token) {
    throw new Error(`Auth failed: ${JSON.stringify(body)}`);
  }

  await context.addCookies([
    {
      name: 'jwt-development',
      value: body.auth_token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
    },
  ]);

  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => localStorage.getItem('clientInfo') !== null,
    { timeout: 120_000 },
  );
  await dismissOverlays(page);
  await page.waitForTimeout(3000);
}

async function dismissOverlays(page) {
  const close = page.locator('button[aria-label="Close"], .p-dialog-header-close, [data-dismiss="modal"]').first();
  if (await close.isVisible({ timeout: 800 }).catch(() => false)) {
    await close.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function gotoAndShot(page, hash, filename, { waitMs = 3000, clip } = {}) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(waitMs);
  const outPath = path.join(OUT, filename);
  await page.screenshot({ path: outPath, fullPage: false, clip });
  console.log(`  ✓ ${filename}`);
  return outPath;
}

async function captureSet(page, prefix, routes) {
  for (const [hash, file, opts] of routes) {
    await gotoAndShot(page, hash, `${prefix}-${file}`, opts);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log('Setting demo password…');
  railsRunner('password');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // --- Modern UI ---
  await context.addInitScript(() => {
    localStorage.setItem('modernUiTheme', 'dark');
    document.documentElement.classList.add('dark');
  });

  console.log('\nModern UI screenshots…');
  railsRunner('modern');
  await apiLogin(context, page);

  await captureSet(page, 'modern', [
    ['/home', 'launch-pad.png', { waitMs: 5000 }],
    ['/analytics-dashboard', 'dashboards.png', { waitMs: 4000 }],
    ['/agenda', 'agenda.png', { waitMs: 4000 }],
  ]);

  // Navbar crop from home
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const nav = page.locator('.modern-ui nav, header.modern-toolbar, sd-toolbar nav, .toolbar-modern').first();
  if (await nav.count()) {
    await nav.screenshot({ path: path.join(OUT, 'modern-navbar.png') });
    console.log('  ✓ modern-navbar.png');
  } else {
    await page.screenshot({ path: path.join(OUT, 'modern-navbar.png'), clip: { x: 0, y: 0, width: 1440, height: 120 } });
    console.log('  ✓ modern-navbar.png (viewport crop)');
  }

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());

  // --- Classic UI ---
  console.log('\nClassic UI screenshots…');
  railsRunner('classic');
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await apiLogin(context, page, '/dashboard');

  await captureSet(page, 'classic', [
    ['/dashboard', 'overview.png', { waitMs: 5000 }],
    ['/agenda', 'agenda.png', { waitMs: 4000 }],
    ['/reports', 'reports.png', { waitMs: 4000 }],
    ['/default-home', 'home.png', { waitMs: 4000 }],
  ]);

  // Classic dashboards: analytics tab or superset embed if routed
  await gotoAndShot(page, '/analytics-dashboard', 'classic-dashboards.png', { waitMs: 5000 });

  await browser.close();

  // Restore modern flag for dev
  railsRunner('modern');
  console.log('\nDone. Screenshots in assets/screenshots/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

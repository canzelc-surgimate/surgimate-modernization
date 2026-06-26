#!/usr/bin/env node
/**
 * Capture Classic / Modern Light / Modern Dark screenshots for the company demo.
 * Prerequisites: Angular (4200) + Rails (3000) running locally.
 *
 * Credentials: reads USERNAME/PASSWORD from koala-rails/.env.development
 * Client: ZTESTATHENA (override with SCREENSHOT_CLIENT)
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'screenshots');
const RAILS = path.resolve(ROOT, '../../koala-rails');
const BASE = 'http://127.0.0.1:4200';
const CLIENT_UID = process.env.SCREENSHOT_CLIENT_UID || 'a86d4921fe846fa466ea';
const VIEWPORT = { width: 1440, height: 900 };

function loadDevEnv() {
  const envPath = path.join(RAILS, '.env.development');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDevEnv();

const EMAIL = process.env.SCREENSHOT_USER || process.env.USERNAME;
const PASSWORD = process.env.SCREENSHOT_PASSWORD || process.env.PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Missing USERNAME/PASSWORD in koala-rails/.env.development');
  process.exit(1);
}

function railsRunner(mode) {
  const script = path.join(ROOT, 'scripts/screenshot-setup.rb');
  const cmd = `DISABLE_SPRING=1 bundle exec rails runner ${script} ${mode}`;
  execSync(cmd, {
    cwd: RAILS,
    stdio: 'inherit',
    env: { ...process.env, SCREENSHOT_CLIENT: process.env.SCREENSHOT_CLIENT || 'ZTESTATHENA' },
  });
}

function shotPath(mode, name) {
  const dir = path.join(OUT, mode);
  return path.join(dir, `${name}.png`);
}

async function ensureDir(mode) {
  await mkdir(path.join(OUT, mode), { recursive: true });
}

async function dismissOverlays(page) {
  for (const sel of [
    'button[aria-label="Close"]',
    '.p-dialog-header-close',
    '[data-dismiss="modal"]',
    '.modal .close',
  ]) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function apiLogin(page, { theme = 'light', hash = '/home' } = {}) {
  const res = await page.request.post('http://127.0.0.1:3000/authenticate', {
    data: { email: EMAIL, password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  if (!body.auth_token) throw new Error(`Auth failed: ${JSON.stringify(body)}`);

  await page.context().addCookies([{
    name: 'jwt-development',
    value: body.auth_token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: false,
  }]);

  await page.addInitScript(({ uid, themeMode }) => {
    localStorage.setItem('currentClientUid', uid);
    localStorage.setItem('modernUiTheme', themeMode);
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, { uid: CLIENT_UID, themeMode: theme });

  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction((uid) => {
    const info = localStorage.getItem('clientInfo');
    if (!info) return false;
    try {
      const parsed = JSON.parse(info);
      return parsed.uid === uid || parsed.code === 'ZTESTATHENA';
    } catch { return false; }
  }, CLIENT_UID, { timeout: 120_000 }).catch(async () => {
    // Fallback: pick client from UI if bootstrap used a different default
    const picker = page.locator('#clients-dd input, .p-autocomplete-input').first();
    if (await picker.isVisible({ timeout: 3000 }).catch(() => false)) {
      await picker.fill('ZTESTATHENA');
      await page.waitForTimeout(800);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
    }
  });

  await page.waitForFunction(() => localStorage.getItem('clientInfo') !== null, { timeout: 120_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(2500);
}

async function saveShot(page, filePath, { clip, locator } = {}) {
  await ensureDir(path.basename(path.dirname(filePath)));
  if (locator) {
    const el = page.locator(locator).first();
    await el.waitFor({ state: 'visible', timeout: 30_000 });
    await el.screenshot({ path: filePath });
  } else {
    await page.screenshot({ path: filePath, fullPage: false, clip });
  }
  console.log(`  ✓ ${path.relative(OUT, filePath)}`);
}

async function captureNavbar(page, mode, isClassic) {
  if (isClassic) {
    await saveShot(page, shotPath(mode, 'navbar'), {
      clip: { x: 0, y: 0, width: 1440, height: 200 },
    });
  } else {
    const nav = page.locator('sd-toolbar header, .modern-ui nav, header.sticky').first();
    if (await nav.count()) {
      await saveShot(page, shotPath(mode, 'navbar'), { locator: 'sd-toolbar header, .modern-ui nav, header.sticky' });
    } else {
      await saveShot(page, shotPath(mode, 'navbar'), { clip: { x: 0, y: 0, width: 1440, height: 88 } });
    }
  }
}

async function captureProfileDropdown(page, mode, isClassic) {
  const toggle = isClassic
    ? '#user-dropdown'
    : '#user-menu-dropdown';
  await page.locator(toggle).click();
  await page.waitForTimeout(600);
  const menu = isClassic
    ? 'ul[aria-labelledby="user-dropdown"]'
    : 'ul[aria-labelledby="user-menu-dropdown"]';
  await saveShot(page, shotPath(mode, 'profile-dropdown'), { locator: menu });
  await page.keyboard.press('Escape');
}

async function captureHome(page, mode, isClassic) {
  const hash = isClassic ? '/default-home' : '/home';
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await page.waitForTimeout(isClassic ? 4000 : 5000);
  await saveShot(page, shotPath(mode, 'home'));
}

async function captureHomeManageWidgets(page, mode) {
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('.widgets-gear-btn').click();
  await page.waitForTimeout(400);
  await page.getByText('Add or remove widgets', { exact: true }).click();
  await page.waitForTimeout(800);
  await saveShot(page, shotPath(mode, 'home-manage-widgets'));
  await page.getByRole('button', { name: 'Done' }).click().catch(() => {});
}

async function captureHomeArrangeWidgets(page, mode) {
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('.widgets-gear-btn').click();
  await page.waitForTimeout(400);
  await page.getByText('Move & resize widgets', { exact: true }).click();
  await page.waitForTimeout(1000);
  await saveShot(page, shotPath(mode, 'home-arrange-widgets'));
}

async function captureDashboards(page, mode, isClassic) {
  // Close Surgi panel if left open from prior capture
  const surgiOpen = page.locator('.surgi-chat-host--open, sd-surgi-chat-panel.surgi-chat-host--open');
  if (await surgiOpen.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.locator('#surgi-link').click().catch(() => {});
    await page.waitForTimeout(500);
  }

  await page.goto(`${BASE}/#/analytics-dashboard`, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await page.waitForTimeout(isClassic ? 6000 : 4000);
  // If redirected to home (no permission), try clicking dashboards link
  if (!page.url().includes('analytics-dashboard')) {
    const link = page.locator('#analytics-dashboard-link, a.analytics-dashboard-link').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(5000);
    }
  }
  await saveShot(page, shotPath(mode, 'dashboards'));
}

async function captureSurgi(page, mode) {
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.locator('#surgi-link').click();
  await page.waitForTimeout(1500);
  const panel = page.locator('sd-surgi-chat-panel, .surgi-chat-host--open').first();
  if (await panel.isVisible({ timeout: 5000 }).catch(() => false)) {
    await saveShot(page, shotPath(mode, 'surgi'));
  } else {
    await saveShot(page, shotPath(mode, 'surgi'), { clip: { x: 900, y: 0, width: 540, height: 900 } });
  }
}

async function captureFeatureFlag(page, mode) {
  await page.goto(`${BASE}/#/admin?tab=clients`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const label = page.getByText('Modern UI/UX', { exact: false }).first();
  await label.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  // Crop around the Modern UI/UX + Analytics rows
  const box = await label.boundingBox().catch(() => null);
  if (box) {
    await saveShot(page, shotPath(mode, 'feature-flag'), {
      clip: {
        x: Math.max(0, box.x - 40),
        y: Math.max(0, box.y - 60),
        width: Math.min(900, 1440),
        height: 220,
      },
    });
  } else {
    await saveShot(page, shotPath(mode, 'feature-flag'));
  }
}

async function captureMode(browser, mode, { theme, isClassic }) {
  console.log(`\n=== ${mode} ===`);
  railsRunner(isClassic ? 'classic' : 'modern');

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  await apiLogin(page, { theme, hash: isClassic ? '/default-home' : '/home' });

  await captureNavbar(page, mode, isClassic);
  await captureProfileDropdown(page, mode, isClassic);
  await captureHome(page, mode, isClassic);

  if (!isClassic) {
    await captureHomeManageWidgets(page, mode);
    await captureHomeArrangeWidgets(page, mode);
  }

  await captureDashboards(page, mode, isClassic);

  if (!isClassic) {
    await captureSurgi(page, mode);
  }
  await captureFeatureFlag(page, mode);

  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  await captureMode(browser, 'classic', { theme: 'light', isClassic: true });
  await captureMode(browser, 'modern-light', { theme: 'light', isClassic: false });
  await captureMode(browser, 'modern-dark', { theme: 'dark', isClassic: false });

  await browser.close();
  railsRunner('modern');
  console.log('\nDone. Screenshots in assets/screenshots/{classic,modern-light,modern-dark}/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

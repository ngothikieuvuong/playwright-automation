#!/usr/bin/env node
/**
 * Archive the latest Allure + Playwright reports under reports/<TICKET>-<DATE>/.
 *
 *   npm run report:archive -- CT-14684
 *   npm run report:archive -- CT-14684 --no-zip
 *
 * What it does:
 *   1. Runs `allure generate allure-results --clean -o allure-report`.
 *   2. Moves allure-report/ + playwright-report/ into reports/<TICKET>-<DATE>/.
 *   3. Zips the target folder (skip with --no-zip).
 *   4. If reports/<TICKET>-<DATE>/ exists, appends -2, -3, ... to avoid overwrite.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const ticket = args.find((a) => !a.startsWith('--'));
const noZip = args.includes('--no-zip');

if (!ticket) {
  console.error('Usage: npm run report:archive -- <TICKET-KEY> [--no-zip]');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
let target = resolve(ROOT, 'reports', `${ticket}-${date}`);
let suffix = 2;
while (existsSync(target)) {
  target = resolve(ROOT, 'reports', `${ticket}-${date}-${suffix++}`);
}

mkdirSync(target, { recursive: true });

const allureResults = resolve(ROOT, 'allure-results');
const allureReport = resolve(ROOT, 'allure-report');
const pwReport = resolve(ROOT, 'playwright-report');

if (existsSync(allureResults) && readdirSync(allureResults).length > 0) {
  console.log('→ generating allure-report from allure-results');
  execSync('allure generate allure-results --clean -o allure-report', { stdio: 'inherit' });
  renameSync(allureReport, resolve(target, 'allure'));
  console.log(`  moved → ${resolve(target, 'allure')}`);
} else {
  console.warn('! allure-results is missing or empty — skipping allure step');
}

if (existsSync(pwReport)) {
  renameSync(pwReport, resolve(target, 'playwright'));
  console.log(`  moved → ${resolve(target, 'playwright')}`);
}

if (!noZip) {
  const zipPath = `${target}.zip`;
  execSync(`zip -rq "${zipPath}" "${target.split('/').pop()}"`, {
    stdio: 'inherit',
    cwd: resolve(ROOT, 'reports'),
  });
  console.log(`  zipped → ${zipPath}`);
}

console.log(`\nArchived: ${target}`);
console.log('Re-open with:');
console.log(`  allure open "${resolve(target, 'allure')}"`);
console.log(`  npx playwright show-report "${resolve(target, 'playwright')}"`);

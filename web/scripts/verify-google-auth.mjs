import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = 'https://studio-285787437-bc95b.web.app';
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const policyErrors = [];
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy/.test(message.text())) policyErrors.push(message.text());
  });
  const response = await page.goto(`${base}/login`);
  assert.match(response.headers()['content-security-policy'], /script-src[^;]*https:\/\/apis\.google\.com/);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const popup = await popupPromise;
  await popup.waitForURL(url => url.hostname === 'accounts.google.com', { timeout: 45000 });
  await popup.waitForLoadState('domcontentloaded');
  const body = await popup.locator('body').innerText();
  assert.doesNotMatch(body, /redirect_uri_mismatch|invalid_client|Error 400|Access blocked/i);
  assert.equal(policyErrors.length, 0, policyErrors.join('\n'));
  await mkdir('release-evidence', { recursive: true });
  await writeFile('release-evidence/google-auth-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), url: base, googleScriptAllowed: true, accountSelectionReached: true, policyErrors, scope: 'Unauthenticated OAuth handoff only; no Google credentials entered and no production account created.' }, null, 2));
  console.log('Google sign-in reaches Google account selection without CSP or OAuth configuration errors. No account was created.');
} finally {
  await browser.close();
}

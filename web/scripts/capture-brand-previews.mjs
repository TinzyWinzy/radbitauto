import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  for (const [name, width] of [['mobile', 390], ['desktop', 1440]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('http://localhost:5190/');
    await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
    await page.locator('.automotive-hero-art img').evaluate(image => image.decode());
    await page.screenshot({ path: `public/screenshots/radbit-auto-v2-${name}.png` });
    await context.close();
  }
} finally { await browser.close(); }


import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from '@playwright/test';

const source = await readFile(new URL('../src/lib/stockImage.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replace('export async function', 'async function'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: outputText });
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 3000;
    canvas.getContext('2d').fillRect(0, 0, 4000, 3000);
    const original = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const blob = await optimizeStockImage(new File([original], 'car.png', { type: 'image/png' }));
    const image = await createImageBitmap(blob);
    let rejected = false;
    try { await optimizeStockImage(new File(['invalid'], 'bad.jpg', { type: 'image/jpeg' })); }
    catch { rejected = true; }
    return { width: image.width, height: image.height, size: blob.size, type: blob.type, rejected };
  });
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1440);
  assert.equal(result.type, 'image/webp');
  assert.ok(result.size < 2 * 1024 * 1024);
  assert.equal(result.rejected, true);
  console.log('Stock photo resize, compression and invalid-image checks passed');
} finally {
  await browser.close();
}

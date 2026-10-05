import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Use the bundled image runtime, without adding a production dependency.
if (!process.env.BRAND_IMAGE_RUNTIME) throw new Error('Set BRAND_IMAGE_RUNTIME to the bundled node_modules directory.');
const sharp = createRequire(resolve(process.env.BRAND_IMAGE_RUNTIME, 'package.json'))('sharp');
const source = await readFile('public/icons/radbit-auto-v2.svg');
for (const size of [32, 180, 192, 512]) {
  await sharp(source).resize(size, size).png().toFile(`public/icons/radbit-auto-v2-${size}.png`);
}
// Foreground stays inside the central 80% safe zone; background fills every mask.
const maskable = source.toString().replace('rx="112"', 'rx="0"');
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/radbit-auto-v2-maskable.png');

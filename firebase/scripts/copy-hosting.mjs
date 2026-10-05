import { cp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const firebaseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.resolve(firebaseDirectory, '..', 'web', 'dist');
const targetDirectory = path.join(firebaseDirectory, '.hosting');

const sourceStats = await stat(sourceDirectory);
if (!sourceStats.isDirectory()) throw new Error(`Hosting source is not a directory: ${sourceDirectory}`);

await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true, force: false, errorOnExist: true });

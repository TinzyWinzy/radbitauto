import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('Storage authentication accepts valid metadata response headers', async () => {
  // Resolve the same metadata client Storage authentication actually uses.
  const require = createRequire(import.meta.url);
  const storageRequire = createRequire(require.resolve('@google-cloud/storage'));
  const authRequire = createRequire(storageRequire.resolve('google-auth-library'));
  const metadata = authRequire('gcp-metadata');
  const server = createServer((req, res) => {
    assert.equal(req.headers['metadata-flavor'], 'Google');
    res.setHeader('Metadata-Flavor', 'Google');
    res.end('demo-vehicle-import');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const previous = process.env.GCE_METADATA_HOST;
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  process.env.GCE_METADATA_HOST = `127.0.0.1:${address.port}`;
  try {
    assert.equal(await metadata.project('project-id'), 'demo-vehicle-import');
  } finally {
    if (previous === undefined) delete process.env.GCE_METADATA_HOST;
    else process.env.GCE_METADATA_HOST = previous;
    server.close();
  }
});

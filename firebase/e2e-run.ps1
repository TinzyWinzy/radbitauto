$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

& npm --prefix functions run build
if ($LASTEXITCODE -ne 0) { throw "functions build failed with exit code $LASTEXITCODE" }

& firebase emulators:exec --project demo-vehicle-import --only auth,firestore,functions,storage "node functions/e2e/seed.mjs && npm --prefix ../web run test:e2e"
if ($LASTEXITCODE -ne 0) { throw "e2e suite failed with exit code $LASTEXITCODE" }

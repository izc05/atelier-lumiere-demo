import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0026_custom_request_file_guards.sql",
  "apps/api/src/request-file-storage.mjs",
  "apps/api/src/custom-request-files-service.mjs",
  "apps/api/src/custom-request-files-api.mjs",
  "apps/api/src/server.mjs"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));
const migration = files[paths[0]];
const storage = files[paths[1]];
const service = files[paths[2]];
const api = files[paths[3]];
const server = files[paths[4]];

assert.match(migration, /REQUEST_FILE_LIMIT_EXCEEDED/);
assert.match(migration, /NEW\.uploaded_by IS DISTINCT FROM app\.current_user_id\(\)/);
assert.match(migration, /REQUEST_FILE_IDENTITY_IMMUTABLE/);
assert.match(migration, /OLD\.status <> 'READY'/);
assert.match(migration, /NEW\.status <> 'DELETED'/);
assert.match(migration, /custom_request_files_active_idx/);

assert.match(storage, /"application\/pdf": "pdf"/);
assert.match(storage, /%PDF-/);
assert.match(storage, /%%EOF/);
assert.match(storage, /createHash\("sha256"\)/);
assert.match(storage, /mode: 0o600/);
assert.match(storage, /safeAbsolute/);
assert.doesNotMatch(storage, /public\//);

assert.match(service, /MAX_FILE_BYTES = 12 \* 1024 \* 1024/);
assert.match(service, /MAX_FILES_PER_REQUEST = 20/);
assert.match(service, /WHERE id = \$1 AND uploaded_by = \$2 AND status = 'READY'/);
assert.match(service, /CUSTOM_REQUEST_FILE_DELETED/);
assert.match(service, /storage\.remove\(stored\.storageKey\)/);
assert.doesNotMatch(service, /storage_key:/);

assert.match(api, /\/api\\\/\(provider\|customer\)\\\/custom-requests/);
assert.match(api, /Content-Disposition/);
assert.match(api, /Accept-Ranges/);
assert.match(api, /private, no-store/);
assert.match(api, /X-Content-Type-Options/);
assert.match(api, /pipeline\(opened\.stream, response\)/);
assert.doesNotMatch(api, /storage_key|checksum_sha256/);

assert.match(server, /createCustomRequestFilesService/);
assert.match(server, /createCustomRequestFilesApiHandler/);
assert.match(server, /createRequestFileStorage/);

console.log("Archivos privados de encargos validados.");

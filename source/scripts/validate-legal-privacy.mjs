import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const detailPages = [
  "aviso-legal",
  "privacidad",
  "cookies",
  "condiciones-compra",
  "envios-devoluciones",
  "productos-personalizados",
  "proveedores",
  "licencias-contenido"
];
const paths = [
  "packages/database/migrations/0029_legal_documents_and_consents.sql",
  "packages/database/migrations/0030_legal_service_role.sql",
  "packages/database/src/schema-plan.mjs",
  "apps/api/src/database.mjs",
  "apps/api/src/legal-service.mjs",
  "apps/api/src/legal-api.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/legal-api.test.mjs",
  "apps/web/src/legal-privacy-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/tests/legal-privacy-proxy.test.mjs",
  "apps/web/public/legal/index.html",
  "apps/web/public/legal/index.js",
  "apps/web/public/legal/document.js",
  "apps/web/public/legal/privacy.js",
  "apps/web/public/privacidad/preferencias/index.html",
  "legal/README.md",
  ...detailPages.map((slug) => `apps/web/public/legal/${slug}/index.html`)
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const foundation = files[paths[0]];
const extension = files[paths[1]];
const schema = files[paths[2]];
const database = files[paths[3]];
const service = files[paths[4]];
const api = files[paths[5]];
const apiServer = files[paths[6]];
const apiTest = files[paths[7]];
const proxy = files[paths[8]];
const webServer = files[paths[9]];
const proxyTest = files[paths[10]];
const legalIndex = files[paths[11]];
const legalIndexJs = files[paths[12]];
const documentJs = files[paths[13]];
const privacyJs = files[paths[14]];
const privacyHtml = files[paths[15]];
const readme = files[paths[16]];

for (const table of ["legal_documents", "legal_consent_events", "checkout_legal_snapshots"]) {
  assert.match(foundation, new RegExp(`CREATE TABLE ${table}`));
  assert.match(foundation, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
}
assert.match(foundation, /LEGAL_CONSENT_EVENTS_ARE_IMMUTABLE/);
assert.match(foundation, /CHECKOUT_LEGAL_SNAPSHOTS_ARE_IMMUTABLE/);
assert.match(foundation, /review_status.*PROFESSIONAL_REVIEWED/s);

assert.match(extension, /CREATE TABLE privacy_preference_records/);
assert.match(extension, /ALTER TABLE privacy_preference_records FORCE ROW LEVEL SECURITY/);
assert.match(extension, /legal_documents_active_requires_professional_review/);
assert.match(extension, /ACTIVE_LEGAL_DOCUMENT_IMMUTABLE/);
assert.match(extension, /RETIRED_LEGAL_DOCUMENT_IMMUTABLE/);
assert.match(extension, /legal-service@atelier\.invalid/);
assert.match(extension, /encode\(digest\(draft\.content_markdown, 'sha256'\)/);
assert.match(extension, /\[NIF PENDIENTE\]/);
assert.match(extension, /No apto todavía para ventas reales/);
for (const type of [
  "LEGAL_NOTICE", "PRIVACY_POLICY", "COOKIE_POLICY", "PURCHASE_TERMS",
  "SHIPPING_RETURNS", "CUSTOM_PRODUCTS", "PROVIDER_AGREEMENT", "CONTENT_LICENSE"
]) {
  assert.match(extension, new RegExp(`'${type}'`));
}

assert.match(database, /"LEGAL_SERVICE"/);
assert.match(extension, /app\.current_role\(\) = 'LEGAL_SERVICE'/);
assert.match(extension, /legal_documents_service_select/);
assert.match(extension, /privacy_preferences_service_update/);
assert.match(extension, /legal_consent_events_service_insert/);
assert.match(schema, /"checkout_legal_snapshots"/);
assert.match(schema, /legalDocumentsAreVersionedAndHashed: true/);
assert.match(schema, /publishedLegalDocumentsAreImmutable: true/);
assert.match(schema, /privacyKeysAreStoredOnlyAsHashes: true/);
assert.match(schema, /consentEventsAreAppendOnly: true/);

assert.match(service, /environment === "production"/);
assert.match(service, /status = 'ACTIVE'/);
assert.match(service, /status = 'DRAFT'/);
assert.match(service, /createHash\("sha256"\)/);
assert.match(service, /anonymous_id_hash/);
assert.match(service, /COOKIE_PREFERENCES/);
assert.match(service, /optionalServicesConfigured: false/);
assert.match(service, /source: "privacy-center"/);
assert.doesNotMatch(service, /remoteAddress|fingerprint/i);
assert.match(api, /\/api\/legal\/privacy-preferences/);
assert.match(api, /x-privacy-key/);
assert.match(apiServer, /createLegalApiHandler/);
assert.match(apiServer, /createLegalService/);
assert.match(apiTest, /documents\.length, 8/);
assert.match(apiTest, /productionService\.listDocuments\(\), \[\]/);
assert.match(apiTest, /ACTIVE_LEGAL_DOCUMENT_IMMUTABLE|error\?\.code === "23514"/);
assert.match(apiTest, /RETIRED_LEGAL_DOCUMENT_IMMUTABLE|error\?\.code === "42501"/);

assert.match(proxy, /atelier_privacy_key/);
assert.match(proxy, /randomBytes\(32\)\.toString\("base64url"\)/);
assert.match(proxy, /HttpOnly/);
assert.match(proxy, /SameSite=Strict/);
assert.match(proxy, /Max-Age=31536000/);
assert.match(proxy, /CROSS_SITE_REQUEST/);
assert.doesNotMatch(proxy, /Authorization|Bearer|DEV_ADMIN_TOKEN/);
assert.match(webServer, /createLegalPrivacyWebHandler/);
assert.match(proxyTest, /Sec-Fetch-Site.*cross-site/s);
assert.match(proxyTest, /JSON\.stringify\(savedPayload\)\.includes\(rawKey\), false/);

for (const html of [
  legalIndex,
  privacyHtml,
  ...detailPages.map((slug) => files[`apps/web/public/legal/${slug}/index.html`])
]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
  assert.doesNotMatch(html, /googletagmanager|google-analytics|facebook\.net|doubleclick/i);
}
assert.match(legalIndex, /No apto todavía para ventas reales/);
assert.match(legalIndexJs, /\/internal\/legal\/documents/);
assert.doesNotMatch(legalIndexJs + documentJs + privacyJs, /innerHTML|Authorization|Bearer|localStorage|sessionStorage/);
assert.match(documentJs, /document\.createTextNode/);
assert.match(documentJs, /placeholder/);
assert.match(privacyHtml, /id="reject-optional" class="button outline equal"/);
assert.match(privacyHtml, /id="accept-optional" class="button outline equal"/);
assert.match(privacyHtml, /no hay servicios externos de analítica/i);
assert.match(privacyJs, /analytics: false/);
assert.match(privacyJs, /marketing: false/);

assert.match(readme, /borradores técnicos/i);
assert.match(readme, /Reglamento \(UE\) 2016\/679/);
assert.match(readme, /Ley Orgánica 3\/2018/);
assert.match(readme, /Ley 34\/2002/);
assert.match(readme, /AEPD/);
assert.match(readme, /revisión profesional/i);

console.log("Base legal y privacidad validada.");

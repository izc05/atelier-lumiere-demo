import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile(new URL("../apps/api/src/public-catalog-service.mjs", import.meta.url), "utf8");
const api = await readFile(new URL("../apps/api/src/public-catalog-api.mjs", import.meta.url), "utf8");
const provider = await readFile(new URL("../apps/web/public/taller/provider.js", import.meta.url), "utf8");

assert.match(service, /async list\(\{ query, category, event, provider, limit = 60 \}/);
assert.match(service, /selectedProvider = provider \? slug\(provider, "provider"\) : ""/);
assert.match(service, /provider\.slug = \$4/);
assert.match(service, /LIMIT \$5/);
assert.match(service, /featuredProductIds/);
assert.match(api, /provider: url\.searchParams\.get\("provider"\)/);
assert.match(provider, /URLSearchParams\(\{ provider: rawProviderSlug \}\)/);
assert.match(provider, /requestCatalog\(slug\)/);
assert.match(provider, /featuredFirst\(products, provider\.featuredProductIds\)/);
assert.doesNotMatch(provider, /products\.filter\(\(product\) => product\.provider\?\.slug === slug\)/);
assert.doesNotMatch(provider, /Authorization|Bearer|document\.cookie|localStorage|sessionStorage/);
assert.doesNotThrow(() => new Function(provider));

console.log("Escaparate por taller validado: filtro SQL dedicado y piezas destacadas conservadas.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, js, css, catalogService] = await Promise.all([
  readFile(new URL("../apps/web/public/taller/index.html", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/taller/provider.js", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/public/taller/provider-operations.css", import.meta.url), "utf8"),
  readFile(new URL("../apps/api/src/public-catalog-service.mjs", import.meta.url), "utf8")
]);

for (const id of [
  "provider-operations",
  "provider-preparation-card",
  "provider-preparation-note",
  "provider-shipping-card",
  "provider-shipping-note",
  "provider-custom-card",
  "provider-custom-note"
]) assert.match(html, new RegExp(`id="${id}"`));

assert.match(html, /provider-operations\.css/);
assert.match(js, /provider\.preparationNote/);
assert.match(js, /provider\.shippingNote/);
assert.match(js, /provider\.acceptsCustomRequests/);
assert.match(js, /provider-operations/);
assert.match(js, /hidden = !\(preparationVisible \|\| shippingVisible \|\| customVisible\)/);
assert.doesNotMatch(js, /collection-note[^\n]*preparationNote/);
assert.doesNotMatch(js, /innerHTML|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/);
assert.match(catalogService, /preparationNote: profile\.preparationNote/);
assert.match(catalogService, /shippingNote: profile\.shippingNote/);
assert.match(catalogService, /acceptsCustomRequests: Boolean\(profile\.acceptsCustomRequests\)/);
assert.match(css, /\.provider-operations/);
assert.match(css, /\.provider-operations-grid/);
assert.match(css, /@media\(max-width:700px\)/);
assert.doesNotThrow(() => new Function(js));

console.log("Información operativa pública validada: preparación, envío y encargos solo desde el perfil publicado.");

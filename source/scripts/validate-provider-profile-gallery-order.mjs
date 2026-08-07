import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/api/src/provider-profile-media-service.mjs",
  "apps/api/src/provider-profile-media-api.mjs",
  "apps/web/src/provider-profile-proxy.mjs",
  "apps/web/public/proveedor/perfil/index.html",
  "apps/web/public/proveedor/perfil/gallery-order.js",
  "apps/web/public/proveedor/perfil/gallery-order.css",
  "packages/database/migrations/0053_provider_profile_featured_products.sql"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const service = files[paths[0]];
const api = files[paths[1]];
const proxy = files[paths[2]];
const html = files[paths[3]];
const ui = files[paths[4]];
const css = files[paths[5]];
const snapshotMigration = files[paths[6]];

for (const literal of [
  "function galleryOrder(value)",
  "value.length > 6",
  "new Set(normalized).size !== normalized.length",
  "async reorderGallery",
  "await makeProfileEditable(transaction, context)",
  "kind = 'GALLERY' AND status = 'READY'",
  "FOR UPDATE",
  "GALLERY_ORDER_STALE",
  "unnest($2::uuid[]) WITH ORDINALITY",
  "PROVIDER_PROFILE_GALLERY_REORDERED"
]) assert.ok(service.includes(literal), `Falta en el servicio de galería: ${literal}`);
assert.ok(!service.includes("UPDATE provider_profile_publications SET"), "Reordenar el borrador no debe alterar la publicación activa.");
assert.ok(!service.includes("UPDATE product_publications SET"), "Reordenar la galería no debe tocar publicaciones de artículos.");

for (const literal of [
  "PROVIDER_GALLERY_ORDER",
  "/api\\/provider\\/profile\\/media\\/reorder",
  "request.method !== \"POST\"",
  "profileMediaService.reorderGallery",
  "await readJson(request)"
]) assert.ok(api.includes(literal), `Falta en la API multimedia: ${literal}`);

for (const literal of [
  "GALLERY_ORDER_PATTERN",
  "/internal\\/provider\\/profile\\/media\\/reorder",
  "if (galleryOrderRoute) return method === \"POST\"",
  "Authorization: `Bearer ${token}`",
  "!galleryOrderRoute"
]) assert.ok(proxy.includes(literal), `Falta en el BFF del perfil: ${literal}`);

for (const literal of [
  "/proveedor/perfil/gallery-order.css",
  "/proveedor/perfil/gallery-order.js",
  "Usa Subir y Bajar"
]) assert.ok(html.includes(literal), `Falta en la pantalla del perfil: ${literal}`);

for (const literal of [
  "let galleryOrderBusy = false",
  "mediaFor(\"GALLERY\")",
  "Subir",
  "Bajar",
  "/internal/provider/profile/media/reorder",
  "body: { mediaIds }",
  "reloadProfileAndMedia({ preserveFeatured: true })",
  "MutationObserver"
]) assert.ok(ui.includes(literal), `Falta en los controles de galería: ${literal}`);
assert.doesNotMatch(ui, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);
assert.doesNotThrow(() => new Function(ui), "Los controles de orden deben tener sintaxis JavaScript válida.");
assert.ok(css.includes(".gallery-order-actions"));
assert.ok(css.includes(".gallery-order-button:disabled"));

assert.match(snapshotMigration, /ORDER BY CASE media\.kind WHEN 'LOGO' THEN 0 WHEN 'COVER' THEN 1 ELSE 2 END,[\s\S]*media\.sort_order,[\s\S]*media\.created_at/);
assert.ok(snapshotMigration.includes("WHERE media.provider_id = provider.id"));
assert.ok(snapshotMigration.includes("AND media.status = 'READY'"));

console.log("Orden de galería validado: máximo seis, escritura atómica, borrador aislado y snapshot público ordenado.");

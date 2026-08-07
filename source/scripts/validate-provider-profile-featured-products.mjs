import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0053_provider_profile_featured_products.sql",
  "apps/api/src/provider-profile-service.mjs",
  "apps/api/src/public-catalog-service.mjs",
  "apps/web/public/proveedor/perfil/index.html",
  "apps/web/public/proveedor/perfil/profile.js",
  "apps/web/public/proveedor/perfil/profile-featured.css",
  "apps/web/public/admin/talleres/index.html",
  "apps/web/public/admin/talleres/profiles.js",
  "apps/web/public/admin/talleres/profiles-featured.css",
  "apps/web/public/taller/provider.js"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
const profileService = files[paths[1]];
const catalogService = files[paths[2]];
const editorHtml = files[paths[3]];
const editorJs = files[paths[4]];
const editorCss = files[paths[5]];
const adminHtml = files[paths[6]];
const adminJs = files[paths[7]];
const adminCss = files[paths[8]];
const storefrontJs = files[paths[9]];

for (const literal of [
  "CREATE TABLE provider_profile_featured_products",
  "sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 3)",
  "UNIQUE (provider_id, sort_order)",
  "FOREIGN KEY (product_id, provider_id)",
  "REFERENCES products(id, provider_id) ON DELETE CASCADE",
  "SECURITY DEFINER",
  "app.provider_featured_product_choices",
  "publication.provider_id = target_provider_id",
  "publication.visible = true",
  "app.has_visible_product_publication(NEW.product_id)",
  "NEW.status IN ('IN_REVIEW','APPROVED','PUBLISHED')",
  "'featuredProductIds'",
  "ALTER TABLE provider_profile_featured_products ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE provider_profile_featured_products FORCE ROW LEVEL SECURITY",
  "provider_profile_featured_products_delete_policy"
]) assert.ok(migration.includes(literal), `Falta en 0053: ${literal}`);
assert.ok(!migration.includes("UPDATE product_publications"), "La selección no debe modificar publicaciones de artículos.");
assert.ok(!migration.includes("UPDATE products SET"), "La selección no debe modificar artículos.");

for (const literal of [
  "featuredProductIds(value)",
  "value.length > 4",
  "featuredProductChoices",
  "app.provider_featured_product_choices(profile.provider_id)",
  "DELETE FROM provider_profile_featured_products",
  "INSERT INTO provider_profile_featured_products",
  "FEATURED_PRODUCT_NOT_AVAILABLE",
  "isFeaturedUnavailableDatabaseError",
  "featuredProductCount"
]) assert.ok(profileService.includes(literal), `Falta en provider-profile-service: ${literal}`);
assert.ok(!profileService.includes("/api/catalog/products"), "El servicio del perfil no debe depender del catálogo público por HTTP.");

assert.ok(catalogService.includes("profile.featuredProductIds"));
assert.ok(catalogService.includes("featuredProductIds,"));
assert.ok(!catalogService.includes("provider_profile_featured_products"), "El catálogo público solo debe leer destacados desde el snapshot publicado.");
assert.ok(!catalogService.includes("provider_featured_product_choices"), "El catálogo público no debe consultar elecciones privadas.");

for (const literal of [
  "/proveedor/perfil/profile-featured.css",
  "id=\"featured-count\"",
  "id=\"featured-selection\"",
  "id=\"featured-choices\"",
  "id=\"featured-message\""
]) assert.ok(editorHtml.includes(literal), `Falta en el editor: ${literal}`);
for (const literal of [
  "selectedFeaturedIds",
  "featuredProductIds: [...selectedFeaturedIds]",
  "selectedFeaturedIds.length >= 4",
  "function moveFeatured",
  "function addFeatured",
  "function removeFeatured",
  "featuredProductChoices"
]) assert.ok(editorJs.includes(literal), `Falta en el editor JS: ${literal}`);
assert.ok(editorCss.includes(".featured-columns"));
assert.ok(editorCss.includes(".featured-selected-card"));

assert.ok(adminHtml.includes("/admin/talleres/profiles-featured.css"));
for (const literal of [
  "function hasUnavailableFeatured",
  "Piezas destacadas",
  "invalidFeatured",
  "approve.disabled",
  "publishButton.disabled"
]) assert.ok(adminJs.includes(literal), `Falta en revisión administrativa: ${literal}`);
assert.ok(adminCss.includes(".profile-featured-list"));
assert.ok(adminCss.includes(".unavailable"));

for (const literal of [
  "function featuredFirst",
  "product.id",
  "provider.featuredProductIds",
  "Number.POSITIVE_INFINITY",
  "providerProducts = featuredFirst"
]) assert.ok(storefrontJs.includes(literal), `Falta en escaparate público: ${literal}`);
assert.ok(!storefrontJs.includes("provider_profile_featured_products"));
assert.ok(!storefrontJs.includes("/internal/provider/profile"));

for (const [name, script] of [
  ["editor de destacados", editorJs],
  ["revisión administrativa", adminJs],
  ["escaparate del taller", storefrontJs]
]) {
  assert.doesNotThrow(() => new Function(script), `${name} debe tener sintaxis JavaScript válida`);
  assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);
}

console.log("Piezas destacadas validadas: máximo cuatro, publicación visible, revisión editorial y snapshot público aislado.");
